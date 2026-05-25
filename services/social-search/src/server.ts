// social-search-service — fans out to Tavily for the common-six social packs.
//
// Subjects:
//   pack.search.requested    — one pack × one row → one ResponseRecord
//   pack.fan_out.requested   — N packs × M rows  → N×M ResponseRecords,
//                              concurrency-bounded; reply when all done
//
// Refuses to start without TAVILY_API_KEY.
//
// Spec: context-v/prompts/Common-Six-Social-Packs.md

import { connect, JSONCodec } from 'nats';
import { PACK_IDS } from './packs';
import { runOnePackSearch, type SearchInput } from './search';

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
  const hasTavilyKey = Boolean(process.env.TAVILY_API_KEY);
  if (!hasTavilyKey) {
    // Start anyway so `pnpm stack up` works without the key. The pack.search
    // and pack.fan_out handlers will reject requests with a clear error
    // message until the key lands in .env. Different from prompt-runner,
    // which fast-exits because every prompt.run needs the key; pack search
    // is a single opt-in feature in the stack.
    console.warn(
      'social-search: TAVILY_API_KEY is not set — handlers will reject pack requests until it lands in .env',
    );
  }

  const nc = await connect({ servers: NATS_URL, name: 'social-search-service' });
  console.log(JSON.stringify({ level: 'info', msg: 'nats connected', url: NATS_URL }));
  console.log(JSON.stringify({ level: 'info', msg: 'packs registered', packs: PACK_IDS }));

  // pack.search.requested — one pack × one row
  (async () => {
    const sub = nc.subscribe('pack.search.requested');
    for await (const msg of sub) {
      const args = jc.decode(msg.data) as SearchInput;
      if (!hasTavilyKey) {
        if (msg.reply) {
          msg.respond(
            jc.encode({ ok: false, error: 'TAVILY_API_KEY is not set on social-search-service' }),
          );
        }
        continue;
      }
      try {
        const result = await runOnePackSearch(nc, args);
        if (msg.reply) msg.respond(jc.encode({ ok: true, ...result }));
        console.log(JSON.stringify({
          level: 'info',
          msg: 'pack.search',
          pack_id: result.pack_id,
          row_id: result.row_id,
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
      };
      if (!hasTavilyKey) {
        if (msg.reply) {
          msg.respond(
            jc.encode({ ok: false, error: 'TAVILY_API_KEY is not set on social-search-service' }),
          );
        }
        continue;
      }
      console.log(JSON.stringify({
        level: 'info',
        msg: 'fan_out started',
        packs: args.pack_ids.length,
        rows: args.row_ids.length,
        record_set_id: args.record_set_id,
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

  console.log(JSON.stringify({ level: 'info', msg: 'social-search-service ready' }));
}

main().catch((err) => {
  console.error('social-search-service failed to boot', err);
  process.exit(1);
});
