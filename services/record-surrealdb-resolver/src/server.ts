import { connect } from '@nats-io/transport-node';
import { registerHandlers } from './handlers';
import { registerDomainHandlers } from './domains';

// record-surrealdb-resolver — the SurrealDB-specific backend behind the
// generic record-db-resolver UI. It is the FIRST augment-it service to talk
// SurrealDB server-side (the browser apps + scripts do; services historically
// don't). It owns candidate-finding (slug / domain / fuzzy-name) against the
// canonical `organizations` table and the additive, dedup-by-URL writes that
// land web-presence facts onto an org. See
// context-v/specs/Record-DB-Resolver.md.

const NATS_URL = process.env.NATS_URL ?? 'nats://localhost:4222';

async function main(): Promise<void> {
  for (const k of ['SURREAL_URL', 'SURREAL_NS', 'SURREAL_DB', 'SURREAL_USER', 'SURREAL_PASS']) {
    if (!process.env[k]) {
      console.error(`record-surrealdb-resolver: missing env ${k} — refusing to boot`);
      process.exit(1);
    }
  }
  const nc = await connect({ servers: NATS_URL, name: 'record-surrealdb-resolver-service' });
  console.log(JSON.stringify({ level: 'info', msg: 'nats connected', url: NATS_URL }));
  registerHandlers(nc);
  registerDomainHandlers(nc);
  console.log(JSON.stringify({ level: 'info', msg: 'record-surrealdb-resolver-service ready' }));
}

main().catch((err) => {
  console.error('record-surrealdb-resolver-service failed to boot', err);
  process.exit(1);
});
