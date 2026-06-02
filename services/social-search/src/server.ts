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
//
// Starts regardless of keys: SearXNG (the default) needs none. A pack routed
// to Tavily without TAVILY_API_KEY records a localized outcome:'error' for that
// cell — it never blocks the rest of the run.
//
// Spec: context-v/prompts/Common-Six-Social-Packs.md
//       context-v/issues/Search-Providers-as-First-Class-SearXNG-Default.md

import { connect, JSONCodec } from 'nats';
import { PACK_IDS } from './packs';
import { runOnePackSearch, type SearchInput } from './search';
import type { ProviderId } from './connectors';
import {
  runOfficialBlogPack,
  OFFICIAL_BLOG_PACK_ID,
  type OfficialBlogPackInput,
} from './entity-pulse/packs/official-blog-pack';

const NATS_URL = process.env.NATS_URL ?? 'nats://localhost:4222';
const MAX_CONCURRENT = Number.parseInt(process.env.SOCIAL_SEARCH_CONCURRENCY ?? '4', 10);

const jc = JSONCodec();

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

  // pack.search.requested — one pack × one row
  (async () => {
    const sub = nc.subscribe('pack.search.requested');
    for await (const msg of sub) {
      const args = jc.decode(msg.data) as SearchInput;
      try {
        const result = await runOnePackSearch(nc, args);
        if (msg.reply) msg.respond(jc.encode({ ok: true, ...result }));
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
        if (msg.reply) msg.respond(jc.encode({ ok: false, error }));
      }
    }
  })();

  // pack.fan_out.requested — N packs × M rows, bounded concurrency, single reply
  (async () => {
    const sub = nc.subscribe('pack.fan_out.requested');
    for await (const msg of sub) {
      const args = jc.decode(msg.data) as {
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
      console.log(JSON.stringify({
        level: 'info',
        msg: 'fan_out started',
        packs: args.pack_ids.length,
        rows: args.row_ids.length,
        record_set_id: args.record_set_id,
        provider_override: args.provider_override ?? null,
        bundle_id: args.bundle_id ?? null,
      }));

      const tasks: Array<() => Promise<unknown>> = [];
      for (const row_id of args.row_ids) {
        for (const pack_id of args.pack_ids) {
          tasks.push(() =>
            runOnePackSearch(nc, {
              pack_id,
              row_id,
              record_set_id: args.record_set_id,
              entity_name_field: args.entity_name_field,
              provider_override: args.provider_override,
              bundle_id: args.bundle_id,
            }).catch((err) => {
              // Per-cell failures don't abort the run. Log and continue.
              console.error(JSON.stringify({
                level: 'error',
                msg: 'cell failed',
                pack_id,
                row_id,
                error: err instanceof Error ? err.message : String(err),
              }));
              return null;
            }),
          );
        }
      }

      try {
        await withLimit(MAX_CONCURRENT, tasks);
        if (msg.reply) {
          msg.respond(
            jc.encode({ ok: true, cells_fired: tasks.length, record_set_id: args.record_set_id }),
          );
        }
        nc.publish(
          'pack.fan_out.completed',
          jc.encode({
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
        if (msg.reply) msg.respond(jc.encode({ ok: false, error }));
      }
    }
  })();

  // pack.entity_pulse.requested — list-shaped Entity Pulse pack run.
  // Step-1 scope (per Entity-Pulse-Bundle migration step 1): only
  // official-blog-pack is wired here. The reply carries the full
  // EntityPulseListResponse JSON; no response-store write yet — the
  // curation layer + rollup-agent land in later phases.
  (async () => {
    const sub = nc.subscribe('pack.entity_pulse.requested');
    for await (const msg of sub) {
      const args = jc.decode(msg.data) as OfficialBlogPackInput & {
        pack_id: string;
      };
      try {
        if (args.pack_id !== OFFICIAL_BLOG_PACK_ID) {
          throw new Error(
            `entity_pulse: unknown pack_id "${args.pack_id}"; step-1 supports only "${OFFICIAL_BLOG_PACK_ID}"`,
          );
        }
        const response = await runOfficialBlogPack(args);
        console.log(JSON.stringify({
          level: 'info',
          msg: 'pack.entity_pulse',
          pack_id: args.pack_id,
          row_id: args.row_id,
          items_found: response.items.length,
          source_indexes: response.meta.source_indexes?.length ?? 0,
        }));
        if (msg.reply) {
          msg.respond(jc.encode({ ok: true, outcome: 'found', response }));
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
        if (msg.reply) msg.respond(jc.encode({ ok: false, error }));
      }
    }
  })();

  console.log(JSON.stringify({ level: 'info', msg: 'social-search-service ready' }));
}

main().catch((err) => {
  console.error('social-search-service failed to boot', err);
  process.exit(1);
});
