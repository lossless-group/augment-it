// A throwaway in-memory SurrealDB for canonical-CRUD tests.
//
// Spawns `surreal start … memory` (the CLI already on the box) on a random
// local port, connects the repo's own surrealdb SDK, applies the resolver's
// schema DDL, and returns the db handle plus a stop(). The process is
// in-memory and killed in teardown — ZERO persistent data, and it never
// touches the shared cloud instance (the harness only ever dials
// 127.0.0.1). Verified 2026-07-30: the installed v3 server and the repo's
// v2.0.4 SDK interoperate, including the array::union semantics createDomain
// relies on — no SurrealDB upgrade required.
//
// The schema DDL below mirrors ensureDomainSchema() in
// services/record-surrealdb-resolver/src/domains.ts (which is module-private
// and process-flag-guarded, so it can't be reused directly against a second
// fresh DB in one worker). If that DDL changes, mirror it here.

import { spawn, type ChildProcess } from 'node:child_process';
import { Surreal } from 'surrealdb';

const SCHEMA_DDL = `
  DEFINE TABLE IF NOT EXISTS domains SCHEMALESS;
  DEFINE INDEX IF NOT EXISTS domain_type_slug ON domains FIELDS type, slug UNIQUE;
  DEFINE TABLE IF NOT EXISTS sources SCHEMALESS;
  DEFINE INDEX IF NOT EXISTS source_norm_url ON sources FIELDS normalized_url UNIQUE;
  DEFINE TABLE IF NOT EXISTS source_usages SCHEMALESS;
  DEFINE INDEX IF NOT EXISTS usage_lookup ON source_usages FIELDS client_slug, domain_type, domain_slug;
  DEFINE TABLE IF NOT EXISTS tag_vocab SCHEMALESS;
  DEFINE INDEX IF NOT EXISTS tag_vocab_uq ON tag_vocab FIELDS client_slug, tag UNIQUE;
`;

export type EphemeralSurreal = { db: Surreal; stop: () => Promise<void> };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Pick a pseudo-random high port. Collisions are rare and surface as a
 *  failed health poll, which the caller retries by spawning again. */
function randomPort(): number {
  return 18000 + Math.floor((process.pid * 7 + Date.now()) % 20000);
}

async function waitForHealth(port: number, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1_000) });
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await sleep(150);
  }
  throw new Error(`ephemeral surreal never became healthy on :${port}`);
}

export async function startEphemeralSurreal(): Promise<EphemeralSurreal> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const port = randomPort() + attempt;
    const proc: ChildProcess = spawn(
      'surreal',
      ['start', '--user', 'root', '--pass', 'root', '--bind', `127.0.0.1:${port}`, 'memory'],
      { stdio: 'ignore' },
    );
    try {
      await waitForHealth(port);
      const db = new Surreal();
      await db.connect(`ws://127.0.0.1:${port}/rpc`);
      await db.signin({ username: 'root', password: 'root' });
      await db.use({ namespace: 'test', database: `t${port}` });
      await db.query(SCHEMA_DDL);
      const stop = async () => {
        try {
          await db.close();
        } catch {
          // ignore
        }
        proc.kill('SIGKILL');
      };
      return { db, stop };
    } catch (err) {
      lastErr = err;
      proc.kill('SIGKILL');
      await sleep(100);
    }
  }
  throw new Error(`could not start ephemeral surreal after 3 attempts: ${String(lastErr)}`);
}
