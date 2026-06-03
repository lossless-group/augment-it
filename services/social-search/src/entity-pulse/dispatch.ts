// Entity Pulse dispatch shim — bridges list-shaped Entity Pulse packs into
// the single-result response-store path so they triage in Response Reviewer
// the same way Profile Builder packs do.
//
// Per Entity Pulse pack the handler returns N items; this shim publishes
// one `response.create.requested` per item with the standard ResponseRecord
// shape (url + display_name + confidence + snippet) so the existing by-record
// UI renders them with no changes. Each ResponseRecord carries the pack's
// content_type in source_metadata so the Pulse Curation Layer (when it
// lands) can re-group them by category.

import { JSONCodec, type NatsConnection } from 'nats';
import {
  runOfficialBlogPack,
  OFFICIAL_BLOG_PACK_ID,
} from './packs/official-blog-pack';
import {
  runOfficialPressreleasePack,
  OFFICIAL_PRESSRELEASE_PACK_ID,
} from './packs/official-pressrelease-pack';
import {
  runOfficialSocialPostsPack,
  OFFICIAL_SOCIAL_POSTS_PACK_ID,
} from './packs/official-social-posts-pack';
import type { OfficialUpdateItem } from './types';

const jc = JSONCodec();

export const ENTITY_PULSE_PACK_IDS = new Set<string>([
  OFFICIAL_BLOG_PACK_ID,
  OFFICIAL_PRESSRELEASE_PACK_ID,
  OFFICIAL_SOCIAL_POSTS_PACK_ID,
]);

export function isEntityPulsePack(pack_id: string): boolean {
  return ENTITY_PULSE_PACK_IDS.has(pack_id);
}

type RowGetReply = {
  row: { row_id: string; fields: Record<string, unknown> } | null;
};

type SocialEntry = string | { url?: string };

async function fetchRow(
  nc: NatsConnection,
  row_id: string,
): Promise<{ row_id: string; fields: Record<string, unknown> } | null> {
  const reply = await nc.request('row.get.requested', jc.encode({ row_id }), {
    timeout: 5_000,
  });
  return (jc.decode(reply.data) as RowGetReply).row;
}

// Best-effort column lookup for the entity's website URL. The Entity Pulse
// blog pack needs this; if the row doesn't carry a URL, the pack returns
// not_found gracefully.
function pickRowUrl(fields: Record<string, unknown>): string | undefined {
  const candidates = [
    'url', 'URL', 'Url',
    'website', 'Website',
    'site', 'Site',
    'domain', 'Domain',
    'homepage', 'Homepage',
  ];
  for (const key of candidates) {
    const v = fields[key];
    if (typeof v === 'string' && v.trim().length > 0) {
      const trimmed = v.trim();
      return trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
    }
  }
  return undefined;
}

function pickEntityName(
  fields: Record<string, unknown>,
  preferred_field?: string,
): string | undefined {
  if (preferred_field) {
    const v = fields[preferred_field];
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  const candidates = [
    'Prospect / Organization', 'Organization', 'organization',
    'Company', 'company', 'Name', 'name', 'entity_name', 'Entity Name',
  ];
  for (const key of candidates) {
    const v = fields[key];
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return undefined;
}

function pickSocialUrls(fields: Record<string, unknown>): string[] {
  const raw = fields.socials;
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const entry of raw as SocialEntry[]) {
    if (typeof entry === 'string' && entry.trim().length > 0) out.push(entry.trim());
    else if (entry && typeof entry === 'object' && typeof entry.url === 'string' && entry.url.trim().length > 0) {
      out.push(entry.url.trim());
    }
  }
  return out;
}

function publishItem(
  nc: NatsConnection,
  args: {
    pack_id: string;
    row_id: string;
    record_set_id: string;
    bundle_id?: string;
    entity_name?: string;
  },
  item: OfficialUpdateItem,
  itemIndex: number,
): void {
  // Build the same structured shape the existing by-record UI knows how to
  // render: { url, display_name, confidence, snippet, source_metadata }.
  // Confidence comes from item.confidence when present (later phases score
  // it via LLM), or a baseline 80 for found items so the pill renders.
  const confidence = typeof item.confidence === 'number' ? item.confidence : 80;
  nc.publish(
    'response.create.requested',
    jc.encode({
      run_id: `entity_pulse_${Date.now().toString(36)}_${itemIndex}`,
      prompt_id: `synthetic_pack_${args.pack_id}`,
      row_id: args.row_id,
      record_set_id: args.record_set_id,
      // Entity Pulse items land in their category column. The accept handler
      // doesn't yet route to this column (curation layer is migration step 4);
      // for now the value is informational and the response shows up in the
      // by-record card as a candidate alongside Profile Builder responses.
      output_column: 'official_updates_pulse',
      model: 'entity-pulse',
      request_body: {
        pack_id: args.pack_id,
        entity_name: args.entity_name,
      },
      response_text: item.title || item.url,
      outcome: 'found',
      structured: {
        url: item.url,
        display_name: item.title || item.url,
        confidence,
        snippet: item.snippet || undefined,
        source_metadata: {
          provider: 'entity-pulse',
          raw_url: item.url,
          content_type: item.content_type,
          published_date: item.published_date ?? undefined,
          age_days: item.age_days ?? undefined,
          source_index_url: item.source_index_url,
          wire_service: item.wire_service,
          platform: item.platform,
        },
      },
      pack_id: args.pack_id,
      bundle_id: args.bundle_id ?? null,
      pass: null,
    }),
  );
}

// Publish a single "no items found" sentinel ResponseRecord so the UI shows
// the pack as fired (not silently missing) when the pack returns zero items.
function publishNotFound(
  nc: NatsConnection,
  args: {
    pack_id: string;
    row_id: string;
    record_set_id: string;
    bundle_id?: string;
    entity_name?: string;
  },
  reason: string,
): void {
  nc.publish(
    'response.create.requested',
    jc.encode({
      run_id: `entity_pulse_${Date.now().toString(36)}`,
      prompt_id: `synthetic_pack_${args.pack_id}`,
      row_id: args.row_id,
      record_set_id: args.record_set_id,
      output_column: 'official_updates_pulse',
      model: 'entity-pulse',
      request_body: { pack_id: args.pack_id, entity_name: args.entity_name },
      response_text: reason,
      outcome: 'not_found',
      structured: null,
      pack_id: args.pack_id,
      bundle_id: args.bundle_id ?? null,
      pass: null,
    }),
  );
}

function publishError(
  nc: NatsConnection,
  args: {
    pack_id: string;
    row_id: string;
    record_set_id: string;
    bundle_id?: string;
    entity_name?: string;
  },
  message: string,
): void {
  nc.publish(
    'response.create.requested',
    jc.encode({
      run_id: `entity_pulse_${Date.now().toString(36)}`,
      prompt_id: `synthetic_pack_${args.pack_id}`,
      row_id: args.row_id,
      record_set_id: args.record_set_id,
      output_column: 'official_updates_pulse',
      model: 'entity-pulse',
      request_body: { pack_id: args.pack_id, entity_name: args.entity_name },
      response_text: message,
      outcome: 'error',
      structured: null,
      pack_id: args.pack_id,
      bundle_id: args.bundle_id ?? null,
      pass: null,
    }),
  );
}

export type EntityPulseDispatchInput = {
  pack_id: string;
  row_id: string;
  record_set_id: string;
  entity_name_field?: string;
  bundle_id?: string;
};

export type EntityPulseDispatchResult = {
  outcome: 'found' | 'not_found' | 'error';
  pack_id: string;
  row_id: string;
  items_published: number;
};

export async function runOneEntityPulsePack(
  nc: NatsConnection,
  args: EntityPulseDispatchInput,
): Promise<EntityPulseDispatchResult> {
  // Fetch row once. All three Entity Pulse packs need fields off it.
  let row;
  try {
    row = await fetchRow(nc, args.row_id);
  } catch (err) {
    const msg = `row.get failed: ${err instanceof Error ? err.message : String(err)}`;
    publishError(nc, args, msg);
    return { outcome: 'error', pack_id: args.pack_id, row_id: args.row_id, items_published: 1 };
  }
  if (!row) {
    publishError(nc, args, 'row not found');
    return { outcome: 'error', pack_id: args.pack_id, row_id: args.row_id, items_published: 1 };
  }
  const entityName = pickEntityName(row.fields, args.entity_name_field);

  try {
    if (args.pack_id === OFFICIAL_BLOG_PACK_ID) {
      const row_url = pickRowUrl(row.fields);
      if (!row_url) {
        publishNotFound(nc, { ...args, entity_name: entityName }, 'no website URL on this row');
        return { outcome: 'not_found', pack_id: args.pack_id, row_id: args.row_id, items_published: 1 };
      }
      const response = await runOfficialBlogPack({ row_id: args.row_id, row_url });
      if (response.items.length === 0) {
        publishNotFound(nc, { ...args, entity_name: entityName }, 'no blog/news index discovered');
        return { outcome: 'not_found', pack_id: args.pack_id, row_id: args.row_id, items_published: 1 };
      }
      response.items.forEach((item, i) =>
        publishItem(nc, { ...args, entity_name: entityName }, item, i),
      );
      return {
        outcome: 'found',
        pack_id: args.pack_id,
        row_id: args.row_id,
        items_published: response.items.length,
      };
    }

    if (args.pack_id === OFFICIAL_PRESSRELEASE_PACK_ID) {
      if (!entityName) {
        publishNotFound(nc, args, 'no entity name on this row');
        return { outcome: 'not_found', pack_id: args.pack_id, row_id: args.row_id, items_published: 1 };
      }
      const row_url = pickRowUrl(row.fields);
      const response = await runOfficialPressreleasePack({
        row_id: args.row_id,
        entity_name: entityName,
        row_url,
      });
      if (response.items.length === 0) {
        publishNotFound(nc, { ...args, entity_name: entityName }, 'no press releases found across wire services');
        return { outcome: 'not_found', pack_id: args.pack_id, row_id: args.row_id, items_published: 1 };
      }
      response.items.forEach((item, i) =>
        publishItem(nc, { ...args, entity_name: entityName }, item, i),
      );
      return {
        outcome: 'found',
        pack_id: args.pack_id,
        row_id: args.row_id,
        items_published: response.items.length,
      };
    }

    if (args.pack_id === OFFICIAL_SOCIAL_POSTS_PACK_ID) {
      const socials = pickSocialUrls(row.fields);
      if (socials.length === 0) {
        publishNotFound(
          nc,
          { ...args, entity_name: entityName },
          'no socials on this row (run Profile Builder first)',
        );
        return { outcome: 'not_found', pack_id: args.pack_id, row_id: args.row_id, items_published: 1 };
      }
      const response = await runOfficialSocialPostsPack({ row_id: args.row_id, socials });
      if (response.items.length === 0) {
        publishNotFound(
          nc,
          { ...args, entity_name: entityName },
          response.meta.source_indexes?.join(' · ') ?? 'no posts surfaced',
        );
        return { outcome: 'not_found', pack_id: args.pack_id, row_id: args.row_id, items_published: 1 };
      }
      response.items.forEach((item, i) =>
        publishItem(nc, { ...args, entity_name: entityName }, item, i),
      );
      return {
        outcome: 'found',
        pack_id: args.pack_id,
        row_id: args.row_id,
        items_published: response.items.length,
      };
    }

    publishError(nc, { ...args, entity_name: entityName }, `unknown entity-pulse pack: ${args.pack_id}`);
    return { outcome: 'error', pack_id: args.pack_id, row_id: args.row_id, items_published: 1 };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    publishError(nc, { ...args, entity_name: entityName }, msg);
    return { outcome: 'error', pack_id: args.pack_id, row_id: args.row_id, items_published: 1 };
  }
}
