// social-search-service — runs the common-seven social packs through their
// configured search provider (SearXNG by default; Tavily as a peer).
//
// Subjects:
//   pack.search.requested        — one pack × one row → one ResponseRecord
//   pack.fan_out.requested       — N packs × M rows  → N×M ResponseRecords,
//                                  concurrency-bounded; reply when all done
//   pack.entity_pulse.requested  — list-shaped Entity Pulse pack run (Phase 1).
//                                  Step-1 scope: official-blog-pack only;
//                                  reply with EntityPulseListResponse JSON, no
//                                  response-store write yet (curation layer +
//                                  rollup come in later phases). See
//                                  context-v/specs/Entity-Pulse-Bundle.md.
//   connectors.inventory.requested — read-only registry inventory: returns
//                                  every registered ConnectorRegistration with
//                                  status. Powers the per-record palette UI's
//                                  menu (cost tiers, needs-env affordances)
//                                  per context-v/specs/Connector-Inventory-
//                                  and-Per-Record-Palette.md.
//
// Starts regardless of keys: SearXNG (the default) needs none. A pack routed
// to Tavily without TAVILY_API_KEY records a localized outcome:'error' for that
// cell — it never blocks the rest of the run.
//
// Spec: context-v/prompts/Common-Six-Social-Packs.md
//       context-v/issues/Search-Providers-as-First-Class-SearXNG-Default.md

import { connect } from '@nats-io/transport-node';
import { PACK_IDS } from './packs';
import { runOnePackSearch, type SearchInput } from './search';
import type { ProviderId } from './connectors';
import {
  runOfficialBlogPack,
  OFFICIAL_BLOG_PACK_ID,
  type OfficialBlogPackInput,
} from './entity-pulse/packs/official-blog-pack';
import {
  runOfficialPressreleasePack,
  OFFICIAL_PRESSRELEASE_PACK_ID,
  type OfficialPressreleasePackInput,
} from './entity-pulse/packs/official-pressrelease-pack';
import {
  runOfficialSocialPostsPack,
  OFFICIAL_SOCIAL_POSTS_PACK_ID,
  type OfficialSocialPostsPackInput,
} from './entity-pulse/packs/official-social-posts-pack';
import {
  isEntityPulsePack,
  runOneEntityPulsePack,
} from './entity-pulse/dispatch';
import {
  fireConnector as runRecordsSurfaceConnector,
  type ConnectorId as RecordsSurfaceConnectorId,
} from './records-surface/connectors';
import { getRegistry } from './registry/registry';
import { registerExistingConnectors } from './registry/register-connectors';
import type { Capability } from './registry/capabilities';
import { fireSearch, type SearchFireInput } from './search-fire';

const NATS_URL = process.env.NATS_URL ?? 'nats://localhost:4222';
const MAX_CONCURRENT = Number.parseInt(process.env.SOCIAL_SEARCH_CONCURRENCY ?? '4', 10);

// Bounded-concurrency runner. The Tavily free tier is rate-limited; bursting
// 30 calls at once gets us 429s. Four concurrent is a reasonable default.
async function withLimit<T>(
  limit: number,
  tasks: Array<() => Promise<T>>,
): Promise<T[]> {
  const results: T[] = [];
  let cursor = 0;
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(limit, tasks.length); i++) {
    workers.push(
      (async () => {
        while (cursor < tasks.length) {
          const my = cursor++;
          results[my] = await tasks[my]();
        }
      })(),
    );
  }
  await Promise.all(workers);
  return results;
}

async function main(): Promise<void> {
  if (!process.env.TAVILY_API_KEY) {
    // Not fatal: SearXNG (the default provider for every social pack) needs no
    // key. Only packs explicitly routed to Tavily will error without it, and
    // that error is localized to the affected cell.
    console.warn(
      'social-search: TAVILY_API_KEY is not set — Tavily-routed packs will error; SearXNG packs run fine',
    );
  }
  console.log(
    JSON.stringify({ level: 'info', msg: 'searxng url', url: process.env.SEARXNG_URL ?? 'http://searxng:8080' }),
  );

  const nc = await connect({ servers: NATS_URL, name: 'social-search-service' });
  console.log(JSON.stringify({ level: 'info', msg: 'nats connected', url: NATS_URL }));
  console.log(JSON.stringify({ level: 'info', msg: 'packs registered', packs: PACK_IDS }));

  // Connector registry — parallel infrastructure for the per-record palette.
  // No dispatcher rewiring yet; the existing pack.search path keeps using
  // ./connectors/index.ts directly.
  const registry = getRegistry();
  registerExistingConnectors(registry);
  console.log(JSON.stringify({
    level: 'info',
    msg: 'connector registry initialized',
    connectors: registry.all().map((r) => ({
      id: r.id,
      status: r.status,
      capabilities: r.capabilities.length,
    })),
  }));

  // pack.search.requested — one pack × one row. Entity Pulse packs route
  // to runOneEntityPulsePack (publishes N ResponseRecords, one per item);
  // legacy packs continue through runOnePackSearch.
  (async () => {
    const sub = nc.subscribe('pack.search.requested');
    for await (const msg of sub) {
      const args = msg.json() as SearchInput;
      try {
        if (isEntityPulsePack(args.pack_id)) {
          const fire_id = `fire_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
          const result = await runOneEntityPulsePack(nc, {
            pack_id: args.pack_id,
            row_id: args.row_id,
            record_set_id: args.record_set_id,
            entity_name_field: args.entity_name_field,
            bundle_id: args.bundle_id,
            fire_id,
          });
          if (msg.reply) msg.respond(JSON.stringify({ ok: true, ...result }));
          console.log(JSON.stringify({
            level: 'info',
            msg: 'pack.search.entity_pulse',
            pack_id: result.pack_id,
            row_id: result.row_id,
            outcome: result.outcome,
            items_published: result.items_published,
          }));
          continue;
        }
        const result = await runOnePackSearch(nc, args);
        if (msg.reply) msg.respond(JSON.stringify({ ok: true, ...result }));
        console.log(JSON.stringify({
          level: 'info',
          msg: 'pack.search',
          pack_id: result.pack_id,
          row_id: result.row_id,
          provider: result.provider,
          outcome: result.outcome,
        }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        console.error(JSON.stringify({ level: 'error', msg: 'pack.search failed', error }));
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // pack.fan_out.requested — N packs × M rows, bounded concurrency, single reply
  (async () => {
    const sub = nc.subscribe('pack.fan_out.requested');
    for await (const msg of sub) {
      const args = msg.json() as {
        pack_ids: string[];
        row_ids: string[];
        record_set_id: string;
        entity_name_field?: string;
        // Optional — override every pack's default provider for this fan-out.
        provider_override?: ProviderId;
        // Optional — the bundle this fan-out belongs to. Rides on every
        // ResponseRecord produced by this run; lets Response Reviewer group
        // results by bundle.
        bundle_id?: string;
      };
      // One fire_id per pack.fan_out invocation. Every response produced
      // by this run (across all packs × rows) gets this stamp so review
      // surfaces can default to "latest fire only" and the operator can
      // tell new data from yesterday's old data. Per Rule 8 of
      // context-v/specs/Funder-Content-Corpus-Workflow.md.
      const fire_id = `fire_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      console.log(JSON.stringify({
        level: 'info',
        msg: 'fan_out started',
        packs: args.pack_ids.length,
        rows: args.row_ids.length,
        record_set_id: args.record_set_id,
        provider_override: args.provider_override ?? null,
        bundle_id: args.bundle_id ?? null,
        fire_id,
      }));

      const tasks: Array<() => Promise<unknown>> = [];
      for (const row_id of args.row_ids) {
        for (const pack_id of args.pack_ids) {
          tasks.push(() => {
            const run = isEntityPulsePack(pack_id)
              ? runOneEntityPulsePack(nc, {
                  pack_id,
                  row_id,
                  record_set_id: args.record_set_id,
                  entity_name_field: args.entity_name_field,
                  bundle_id: args.bundle_id,
                  fire_id,
                })
              : runOnePackSearch(nc, {
                  pack_id,
                  row_id,
                  record_set_id: args.record_set_id,
                  entity_name_field: args.entity_name_field,
                  provider_override: args.provider_override,
                  bundle_id: args.bundle_id,
                });
            return run.catch((err) => {
              // Per-cell failures don't abort the run. Log and continue.
              console.error(JSON.stringify({
                level: 'error',
                msg: 'cell failed',
                pack_id,
                row_id,
                error: err instanceof Error ? err.message : String(err),
              }));
              return null;
            });
          });
        }
      }

      try {
        await withLimit(MAX_CONCURRENT, tasks);
        if (msg.reply) {
          msg.respond(
            JSON.stringify({ ok: true, cells_fired: tasks.length, record_set_id: args.record_set_id }),
          );
        }
        nc.publish(
          'pack.fan_out.completed',
          JSON.stringify({
            record_set_id: args.record_set_id,
            cells_fired: tasks.length,
            packs: args.pack_ids.length,
            rows: args.row_ids.length,
          }),
        );
        console.log(JSON.stringify({
          level: 'info',
          msg: 'fan_out completed',
          cells_fired: tasks.length,
        }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        console.error(JSON.stringify({ level: 'error', msg: 'fan_out failed', error }));
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // pack.entity_pulse.requested — list-shaped Entity Pulse pack run.
  // Step-2 scope (per Entity-Pulse-Bundle migration step 2): three Phase-1
  // OfficialUpdates packs wired here — blog, press-release, social-posts.
  // Dispatcher switches on pack_id; each handler has its own input shape
  // (the blog pack wants row_url, press-release wants entity_name, social-
  // posts wants socials[]). The reply carries the full
  // EntityPulseListResponse JSON; no response-store write yet — the
  // curation layer + rollup-agent land in later phases.
  (async () => {
    const sub = nc.subscribe('pack.entity_pulse.requested');
    for await (const msg of sub) {
      const args = msg.json() as {
        pack_id: string;
      } & Partial<
        OfficialBlogPackInput &
        OfficialPressreleasePackInput &
        OfficialSocialPostsPackInput
      >;
      try {
        let response;
        switch (args.pack_id) {
          case OFFICIAL_BLOG_PACK_ID:
            if (!args.row_url) throw new Error('official-blog-pack: row_url required');
            response = await runOfficialBlogPack({
              row_id: args.row_id ?? 'nats-fire',
              row_url: args.row_url,
              relevance_context: args.relevance_context ?? null,
              max_index_candidates: args.max_index_candidates,
              max_posts_per_index: args.max_posts_per_index,
              max_posts_total: args.max_posts_total,
            });
            break;
          case OFFICIAL_PRESSRELEASE_PACK_ID:
            if (!args.entity_name) throw new Error('official-pressrelease-pack: entity_name required');
            response = await runOfficialPressreleasePack({
              row_id: args.row_id ?? 'nats-fire',
              entity_name: args.entity_name,
              row_url: args.row_url,
              relevance_context: args.relevance_context ?? null,
              max_per_wire: args.max_per_wire,
            });
            break;
          case OFFICIAL_SOCIAL_POSTS_PACK_ID:
            if (!args.socials || !Array.isArray(args.socials)) {
              throw new Error('official-social-posts-pack: socials[] required');
            }
            response = await runOfficialSocialPostsPack({
              row_id: args.row_id ?? 'nats-fire',
              socials: args.socials,
              relevance_context: args.relevance_context ?? null,
              max_posts_per_platform: args.max_posts_per_platform,
            });
            break;
          default:
            throw new Error(
              `entity_pulse: unknown pack_id "${args.pack_id}"; supported: ${OFFICIAL_BLOG_PACK_ID}, ${OFFICIAL_PRESSRELEASE_PACK_ID}, ${OFFICIAL_SOCIAL_POSTS_PACK_ID}`,
            );
        }
        console.log(JSON.stringify({
          level: 'info',
          msg: 'pack.entity_pulse',
          pack_id: args.pack_id,
          row_id: args.row_id,
          items_found: response.items.length,
        }));
        if (msg.reply) {
          msg.respond(JSON.stringify({ ok: true, outcome: 'found', response }));
        }
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        console.error(JSON.stringify({
          level: 'error',
          msg: 'pack.entity_pulse failed',
          pack_id: args.pack_id,
          row_id: args.row_id,
          error,
        }));
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // connector.fire.requested — Records Surface per-record fire. One
  // connector, one row's URL, returns a list of candidate URLs. No
  // response-store write; reply rides on NATS.
  (async () => {
    const sub = nc.subscribe('connector.fire.requested');
    for await (const msg of sub) {
      const args = msg.json() as {
        row_id: string;
        row_url: string;
        connector_id: RecordsSurfaceConnectorId;
      };
      try {
        const candidates = await runRecordsSurfaceConnector(args.connector_id, args.row_url);
        if (msg.reply) {
          msg.respond(JSON.stringify({
            ok: true,
            result: {
              connector_id: args.connector_id,
              candidates,
              fired_at: new Date().toISOString(),
            },
          }));
        }
        console.log(JSON.stringify({
          level: 'info',
          msg: 'connector.fire',
          connector_id: args.connector_id,
          row_id: args.row_id,
          candidates: candidates.length,
        }));
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error(JSON.stringify({
          level: 'error',
          msg: 'connector.fire failed',
          connector_id: args.connector_id,
          row_id: args.row_id,
          error,
        }));
        if (msg.reply) {
          msg.respond(JSON.stringify({
            ok: true,
            result: {
              connector_id: args.connector_id,
              candidates: [],
              fired_at: new Date().toISOString(),
              error,
            },
          }));
        }
      }
    }
  })();

  // connectors.inventory.requested — read-only registry snapshot. Optional
  // `intent` arg filters to connectors that serve a specific capability
  // (powers the per-record palette's per-chip connector menu); omit for the
  // full inventory view. The `fire` function isn't serializable so we strip
  // it from the wire payload.
  (async () => {
    const sub = nc.subscribe('connectors.inventory.requested');
    for await (const msg of sub) {
      const args = (msg.data.length > 0
        ? (msg.json() as { intent?: Capability })
        : {}) as { intent?: Capability };
      const all = args.intent
        ? registry.availableFor(args.intent)
        : registry.all();
      const sanitized = all.map(({ fire: _omit, ...rest }) => rest);
      if (msg.reply) {
        msg.respond(JSON.stringify({ ok: true, connectors: sanitized }));
      }
    }
  })();

  // search.fire.requested — Augment-from-DB generic query fire. Unlike
  // connector.fire (which localizes errors inside an ok:true result for the
  // per-row triage loop), this replies ok:false on failure — the search-and-
  // add UI needs to distinguish "provider failed" from "zero results". See
  // context-v/specs/Augment-From-DB-Flow.md §Capability contract.
  (async () => {
    const sub = nc.subscribe('search.fire.requested');
    for await (const msg of sub) {
      const args = msg.json() as SearchFireInput;
      try {
        const { provider, results } = await fireSearch(args);
        if (msg.reply) {
          msg.respond(JSON.stringify({
            ok: true,
            provider,
            results,
            fired_at: new Date().toISOString(),
          }));
        }
        console.log(JSON.stringify({
          level: 'info',
          msg: 'search.fire',
          provider,
          results: results.length,
        }));
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error(JSON.stringify({ level: 'error', msg: 'search.fire failed', error }));
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  console.log(JSON.stringify({ level: 'info', msg: 'social-search-service ready' }));
}

main().catch((err) => {
  console.error('social-search-service failed to boot', err);
  process.exit(1);
});
