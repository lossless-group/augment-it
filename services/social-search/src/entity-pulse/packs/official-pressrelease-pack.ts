// official-pressrelease-pack — Phase 1 of the Entity Pulse bundle.
//
// Spec: [[../../../../../context-v/specs/Entity-Pulse-Bundle]] §"Pass-1 pack
// details" → official-pressrelease-pack.
//
// Returns the entity's verbatim releases on wire services (PRNewswire,
// BusinessWire, GlobeNewswire, PRWeb, EINPresswire), NOT third-party
// coverage. The output shares the OfficialUpdates shape used by
// official-blog-pack — same EntityPulseListResponse<OfficialUpdateItem>
// wrapper, content_type 'official_press_release', plus a `wire_service`
// discriminator derived from the URL pattern.
//
// Mechanic: query Google News RSS + GDELT in parallel, each site-restricted
// per wire service, aggregate, dedupe by URL, tag wire_service.
//
// Step-2 scope (per spec migration step 2): no LLM byline verification yet
// (the wire-service URL pattern is the filter — we ASSUME items on those
// domains are verbatim releases). The curation layer is the human gate
// for false positives.

import { getConnector } from '../../connectors';
import { toIso, ageDaysFromIso } from '../../lib/helpers/iso-helper';
import type {
  EntityPulseListResponse,
  OfficialUpdateItem,
} from '../types';

export const OFFICIAL_PRESSRELEASE_PACK_ID = 'official-pressrelease-pack';

export type OfficialPressreleasePackInput = {
  pack_id?: string;
  row_id: string;
  // Required — the entity name to search for, quoted in the query.
  entity_name: string;
  // Optional — entity's primary website. Not used for query construction
  // (releases live on wire-service domains, not the entity's), but carried
  // through so the rollup-agent can disambiguate same-name entities later.
  row_url?: string;
  relevance_context?: string | null;
  max_per_wire?: number;
  signal?: AbortSignal;
};

// Wire-service registry. Each entry: domain regex + display name. Used to
// both build site-restricted queries AND tag returned items with the
// originating wire service. Order matters for ergonomic display, not
// ranking.
const WIRES = [
  { id: 'prnewswire', domain: 'prnewswire.com', display_name: 'PRNewswire' },
  { id: 'businesswire', domain: 'businesswire.com', display_name: 'BusinessWire' },
  { id: 'globenewswire', domain: 'globenewswire.com', display_name: 'GlobeNewswire' },
  { id: 'prweb', domain: 'prweb.com', display_name: 'PRWeb' },
  { id: 'einpresswire', domain: 'einpresswire.com', display_name: 'EIN Presswire' },
] as const;

const DEFAULT_PER_WIRE = 5;

// Strip the trailing " - Publication" Google News RSS appends to titles.
// Helpful for dedup comparisons + cleaner display.
function cleanTitle(title: string): string {
  return title.replace(/\s+-\s+[^-]+$/, '').trim();
}

export async function runOfficialPressreleasePack(
  args: OfficialPressreleasePackInput,
): Promise<EntityPulseListResponse<OfficialUpdateItem>> {
  const now = new Date();
  const packId = args.pack_id ?? OFFICIAL_PRESSRELEASE_PACK_ID;
  const perWire = args.max_per_wire ?? DEFAULT_PER_WIRE;

  const byProvider: Record<string, number> = {
    'google-news-rss': 0,
    gdelt: 0,
  };

  // Fire all queries in parallel. Each (wire × provider) pair is one query.
  // Per-pair errors are isolated — one wire blocking us doesn't tank the
  // pack. The wire_id rides on the bucket so we can tag returned items
  // with the wire we queried for — Google News RSS returns redirect URLs
  // (news.google.com/rss/articles/…) that don't expose the canonical wire
  // domain, so post-hoc URL-pattern detection misses everything. Trusting
  // the query's `site:` operator is the right move.
  const tasks: Array<Promise<{
    provider: string;
    wire_id: string;
    items: { url: string; title: string; content: string; published_date?: string }[];
  } | null>> = [];

  for (const wire of WIRES) {
    const quotedName = `"${args.entity_name}"`;
    // Google News RSS with site-restrict — most reliable for wire content.
    tasks.push(
      (async () => {
        try {
          const gn = getConnector('google-news-rss');
          const results = await gn(
            `${quotedName} site:${wire.domain}`,
            { max_results: perWire, signal: args.signal },
          );
          byProvider['google-news-rss'] += results.length;
          return { provider: 'google-news-rss', wire_id: wire.id, items: results };
        } catch (err) {
          console.warn(JSON.stringify({
            level: 'warn',
            msg: 'official-pressrelease-pack: google-news-rss failed',
            wire: wire.id,
            reason: err instanceof Error ? err.message : String(err),
          }));
          return null;
        }
      })(),
    );

    // GDELT with domain filter — the immediate free peer.
    tasks.push(
      (async () => {
        try {
          const gdelt = getConnector('gdelt');
          const results = await gdelt(
            `${quotedName} domain:${wire.domain}`,
            { max_results: perWire, signal: args.signal },
          );
          byProvider.gdelt += results.length;
          return { provider: 'gdelt', wire_id: wire.id, items: results };
        } catch (err) {
          console.warn(JSON.stringify({
            level: 'warn',
            msg: 'official-pressrelease-pack: gdelt failed',
            wire: wire.id,
            reason: err instanceof Error ? err.message : String(err),
          }));
          return null;
        }
      })(),
    );
  }

  const settled = await Promise.all(tasks);
  const seen = new Set<string>();
  const items: OfficialUpdateItem[] = [];

  for (const bucket of settled) {
    if (!bucket) continue;
    for (const r of bucket.items) {
      if (!r.url) continue;
      if (seen.has(r.url)) continue;
      seen.add(r.url);

      const publishedDate = toIso(r.published_date);
      items.push({
        url: r.url,
        title: cleanTitle(r.title || r.url),
        snippet: r.content,
        published_date: publishedDate,
        age_days: ageDaysFromIso(publishedDate, now),
        confidence: null,
        relevance: null,
        content_type: 'official_press_release',
        wire_service: bucket.wire_id,
      });
    }
  }

  return {
    items,
    meta: {
      relevance_context: args.relevance_context ?? null,
      total_found: items.length,
      dropped_low_confidence: 0,
      by_provider: byProvider,
      pack_id: packId,
      generated_at: now.toISOString(),
    },
  };
}
