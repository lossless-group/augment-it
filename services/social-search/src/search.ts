// One pack search end-to-end: get entity_name from the row, call Tavily,
// pick + score a candidate, publish to response-store. Pure orchestration —
// reusable from both the pack.search NATS handler (one row × one pack) and
// the pack.fan_out NATS handler (M rows × N packs).

import { JSONCodec, type NatsConnection } from 'nats';
import { getPack, type PackConfig } from './packs';
import { searchTavily } from './tavily';
import { verifyUrl } from './verification';
import { pickCandidate, scoreCandidate } from './scoring';

const jc = JSONCodec();

export type SearchInput = {
  pack_id: string;
  row_id: string;
  record_set_id: string;
  // The entity name to search. If omitted, the service fetches the row and
  // reads `row.fields[entity_name_field]`.
  entity_name?: string;
  entity_name_field?: string;
  // Optional — for response-store correlation. Pack fires need not be
  // associated with a prompt template; for now we accept whatever the caller
  // passes and fall back to a synthetic id.
  prompt_id?: string;
};

export type SearchResult = {
  response_id: string | null; // null if the publish was dropped (response-store down)
  outcome: 'found' | 'not_found' | 'error';
  pack_id: string;
  row_id: string;
};

type RowGetReply = {
  row: { row_id: string; fields: Record<string, unknown> } | null;
};

async function fetchEntityName(
  nc: NatsConnection,
  row_id: string,
  entity_name_field: string,
): Promise<string> {
  const reply = await nc.request('row.get.requested', jc.encode({ row_id }), { timeout: 5_000 });
  const decoded = jc.decode(reply.data) as RowGetReply;
  if (!decoded.row) throw new Error(`row not found: ${row_id}`);
  const value = decoded.row.fields[entity_name_field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`row ${row_id} has no usable value at field "${entity_name_field}"`);
  }
  return value.trim();
}

/**
 * Run one pack against one row end-to-end. Publishes a ResponseRecord via
 * response-store's existing `response.create.requested` subject — the
 * pack-aware fields (pack_id, outcome, structured) ride on the same
 * createResponse signature thanks to the schema extension that shipped in
 * 288ecec.
 */
export async function runOnePackSearch(
  nc: NatsConnection,
  args: SearchInput,
): Promise<SearchResult> {
  const pack: PackConfig | undefined = getPack(args.pack_id);
  if (!pack) {
    return {
      response_id: null,
      outcome: 'error',
      pack_id: args.pack_id,
      row_id: args.row_id,
    };
  }

  let entityName: string;
  try {
    entityName =
      args.entity_name?.trim() ||
      (await fetchEntityName(nc, args.row_id, args.entity_name_field ?? 'name'));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    publishResponse(nc, {
      ...args,
      pack_id: pack.pack_id,
      outcome: 'error',
      response_text: `Could not resolve entity name: ${message}`,
      structured: null,
    });
    return { response_id: null, outcome: 'error', pack_id: pack.pack_id, row_id: args.row_id };
  }

  // The Tavily call. Network errors land as outcome='error'.
  let tavilyResp;
  try {
    tavilyResp = await searchTavily(pack, entityName);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    publishResponse(nc, {
      ...args,
      pack_id: pack.pack_id,
      outcome: 'error',
      response_text: message,
      structured: null,
    });
    return { response_id: null, outcome: 'error', pack_id: pack.pack_id, row_id: args.row_id };
  }

  const picked = pickCandidate(tavilyResp.results, pack.domain_whitelist);
  if (!picked) {
    publishResponse(nc, {
      ...args,
      pack_id: pack.pack_id,
      outcome: 'not_found',
      response_text: '',
      structured: null,
    });
    return { response_id: null, outcome: 'not_found', pack_id: pack.pack_id, row_id: args.row_id };
  }

  const { chosen, siblings_from_same_domain } = picked;
  const verification = verifyUrl(pack, chosen.url);
  const confidence = scoreCandidate({
    tier_1_match: verification.tier_1_match,
    entity_name: entityName,
    candidate_title: chosen.title,
    candidate_published_date: chosen.published_date,
    siblings_from_same_domain,
  });

  publishResponse(nc, {
    ...args,
    pack_id: pack.pack_id,
    outcome: 'found',
    response_text: chosen.content || chosen.title,
    structured: {
      url: verification.normalized_url,
      display_name: chosen.title,
      confidence,
      snippet: chosen.content || undefined,
      source_metadata: {
        tavily_raw_url: chosen.url,
        tavily_score: chosen.score,
        siblings_from_same_domain,
        ...(chosen.published_date ? { published_date: chosen.published_date } : {}),
      },
    },
  });

  return { response_id: null, outcome: 'found', pack_id: pack.pack_id, row_id: args.row_id };
}

function publishResponse(
  nc: NatsConnection,
  args: SearchInput & {
    pack_id: string;
    outcome: 'found' | 'not_found' | 'error';
    response_text: string;
    structured: unknown;
  },
): void {
  nc.publish(
    'response.create.requested',
    jc.encode({
      run_id: `pack_run_${Date.now().toString(36)}`,
      prompt_id: args.prompt_id ?? `synthetic_pack_${args.pack_id}`,
      row_id: args.row_id,
      record_set_id: args.record_set_id,
      // Packs don't write to a column (yet — that's the promote-to-canonical
      // session). For now: a per-pack placeholder column.
      output_column: `profiles.${args.pack_id.replace(/-pack$/, '')}`,
      model: 'tavily',
      request_body: { pack_id: args.pack_id, entity_name: args.entity_name },
      response_text: args.response_text,
      outcome: args.outcome,
      structured: args.structured,
      pack_id: args.pack_id,
      bundle_id: null,
      pass: null,
    }),
  );
}
