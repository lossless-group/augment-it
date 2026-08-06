// One pack search end-to-end: get entity_name from the row, run the pack's
// search provider, pick + score a candidate, publish to response-store. Pure
// orchestration — reusable from both the pack.search NATS handler (one row ×
// one pack) and the pack.fan_out NATS handler (M rows × N packs).
//
// Provider is resolved per-fire: provider_override (if the caller passed one)
// wins over the pack's default connector. That single seam is what lets the
// per-row iteration loop re-fire a pack through a different provider without
// touching the pack definition.

import { type NatsConnection } from '@nats-io/transport-node';
import { getPack, buildQuery, type PackConfig } from './packs';
import { getConnector, type ProviderId } from './connectors';
import { verifyUrl } from './verification';
import { pickCandidate, scoreCandidate } from './scoring';
const MAX_RESULTS = 3;

export type SearchInput = {
  pack_id: string;
  row_id: string;
  record_set_id: string;
  // The entity name to search. If omitted, the service fetches the row and
  // reads `row.fields[entity_name_field]`.
  entity_name?: string;
  entity_name_field?: string;
  // Override the pack's default search provider for this fire. Lets the
  // iteration-loop surfaces (re-search a row through a different engine) reuse
  // this path without a second refactor.
  provider_override?: ProviderId;
  // Optional — for response-store correlation. Pack fires need not be
  // associated with a prompt template; for now we accept whatever the caller
  // passes and fall back to a synthetic id.
  prompt_id?: string;
  // Optional — the bundle this fan-out belongs to. Lands on every
  // ResponseRecord produced by this run so Response Reviewer can group by
  // bundle when it shows results. Bundle definitions live with the consumer
  // (apps/pack-runner/src/bundles.ts); this service only carries the id.
  bundle_id?: string;
};

export type SearchResult = {
  response_id: string | null; // null if the publish was dropped (response-store down)
  outcome: 'found' | 'not_found' | 'error';
  pack_id: string;
  row_id: string;
  provider: ProviderId;
};

type RowGetReply = {
  row: { row_id: string; fields: Record<string, unknown> } | null;
};

async function fetchEntityName(
  nc: NatsConnection,
  row_id: string,
  entity_name_field: string,
): Promise<string> {
  const reply = await nc.request('row.get.requested', JSON.stringify({ row_id }), { timeout: 5_000 });
  const decoded = reply.json() as RowGetReply;
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
 * 288ecec. This NEVER writes to row.fields; the response only becomes row data
 * when a human accepts it in the triage cockpit.
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
      provider: args.provider_override ?? 'searxng',
    };
  }

  const provider: ProviderId = args.provider_override ?? pack.connector;

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
      provider,
      entity_name: args.entity_name,
      outcome: 'error',
      response_text: `Could not resolve entity name: ${message}`,
      structured: null,
    });
    return { response_id: null, outcome: 'error', pack_id: pack.pack_id, row_id: args.row_id, provider };
  }

  // The provider call. Network errors / missing keys land as outcome='error'.
  let results;
  try {
    const connector = getConnector(provider);
    results = await connector(buildQuery(pack, entityName), {
      include_domains: pack.include_domains,
      max_results: MAX_RESULTS,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    publishResponse(nc, {
      ...args,
      pack_id: pack.pack_id,
      provider,
      entity_name: entityName,
      outcome: 'error',
      response_text: message,
      structured: null,
    });
    return { response_id: null, outcome: 'error', pack_id: pack.pack_id, row_id: args.row_id, provider };
  }

  const picked = pickCandidate(results, pack.domain_whitelist);
  if (!picked) {
    publishResponse(nc, {
      ...args,
      pack_id: pack.pack_id,
      provider,
      entity_name: entityName,
      outcome: 'not_found',
      response_text: '',
      structured: null,
    });
    return { response_id: null, outcome: 'not_found', pack_id: pack.pack_id, row_id: args.row_id, provider };
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
    provider,
    entity_name: entityName,
    outcome: 'found',
    response_text: chosen.content || chosen.title,
    structured: {
      url: verification.normalized_url,
      display_name: chosen.title,
      confidence,
      snippet: chosen.content || undefined,
      source_metadata: {
        provider,
        raw_url: chosen.url,
        provider_score: chosen.score,
        siblings_from_same_domain,
        ...(chosen.published_date ? { published_date: chosen.published_date } : {}),
      },
    },
  });

  return { response_id: null, outcome: 'found', pack_id: pack.pack_id, row_id: args.row_id, provider };
}

function publishResponse(
  nc: NatsConnection,
  args: SearchInput & {
    pack_id: string;
    provider: ProviderId;
    entity_name?: string;
    outcome: 'found' | 'not_found' | 'error';
    response_text: string;
    structured: unknown;
  },
): void {
  nc.publish(
    'response.create.requested',
    JSON.stringify({
      run_id: `pack_run_${Date.now().toString(36)}`,
      prompt_id: args.prompt_id ?? `synthetic_pack_${args.pack_id}`,
      row_id: args.row_id,
      record_set_id: args.record_set_id,
      // Per the 2026-05-25 design pivot, all pack responses target the single
      // row-level `socials` JSON column. The accept handler forks on pack_id to
      // route into row.socials.add (not row.update). output_column is
      // informational; nothing here writes to the row — only human accept does.
      // Spec: context-v/blueprints/Packs-and-Bundles-Pattern.md §Row write-back
      output_column: 'socials',
      // The provider that produced this result — surfaced in the triage UI's
      // "Model" line and recorded in source_metadata for per-row provider history.
      model: args.provider,
      request_body: { pack_id: args.pack_id, entity_name: args.entity_name, provider: args.provider },
      response_text: args.response_text,
      outcome: args.outcome,
      structured: args.structured,
      pack_id: args.pack_id,
      bundle_id: args.bundle_id ?? null,
      pass: null,
    }),
  );
}
