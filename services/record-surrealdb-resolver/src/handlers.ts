// NATS handlers for the record ↔ SurrealDB resolver. Three capabilities,
// all request/reply (no broadcast events in v0):
//
//   resolver.candidates  { record, client } → { ok, candidates }
//   resolver.search      { q, client }      → { ok, candidates }
//   resolver.apply       { action, org_slug?, record, client, source } → ApplyResult
//
// Contract is DB-agnostic (see context-v/specs/Record-DB-Resolver.md); this
// implementation is SurrealDB-specific.

import { JSONCodec, type NatsConnection } from 'nats';
import { getDb } from './surreal';
import {
  findCandidates,
  searchOrgs,
  applyResolution,
  type NormRecord,
  type ApplyInput,
} from './resolver';

const jc = JSONCodec();

export function registerHandlers(nc: NatsConnection): void {
  // resolver.candidates
  (async () => {
    const sub = nc.subscribe('resolver.candidates.requested');
    for await (const msg of sub) {
      const args = jc.decode(msg.data) as { record: NormRecord; client: string };
      try {
        const db = await getDb();
        const { candidates } = await findCandidates(db, args.record, args.client);
        if (msg.reply) msg.respond(jc.encode({ ok: true, candidates }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(jc.encode({ ok: false, error }));
      }
    }
  })();

  // resolver.search
  (async () => {
    const sub = nc.subscribe('resolver.search.requested');
    for await (const msg of sub) {
      const args = jc.decode(msg.data) as { q: string; client: string };
      try {
        const db = await getDb();
        const { candidates } = await searchOrgs(db, args.q, args.client);
        if (msg.reply) msg.respond(jc.encode({ ok: true, candidates }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(jc.encode({ ok: false, error }));
      }
    }
  })();

  // resolver.apply
  (async () => {
    const sub = nc.subscribe('resolver.apply.requested');
    for await (const msg of sub) {
      const args = jc.decode(msg.data) as ApplyInput;
      try {
        const db = await getDb();
        const result = await applyResolution(db, args);
        if (msg.reply) msg.respond(jc.encode(result));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(jc.encode({ ok: false, error }));
      }
    }
  })();
}
