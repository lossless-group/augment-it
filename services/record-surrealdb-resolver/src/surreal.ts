// SurrealDB connection for the resolver service. Same connect → signin → use
// handshake as scripts/surreal-*.mjs and apps/person-enrichment/src/lib/surreal.ts,
// with the defensive single-retry on the "Anonymous access not allowed" failure
// the WebSocket can land in after an idle-reconnect.

import { Surreal } from 'surrealdb';
import { withDeadline } from './nats-loop';

const URL = process.env.SURREAL_URL as string;
const NS = process.env.SURREAL_NS as string;
const DB = process.env.SURREAL_DB as string;
const USER = process.env.SURREAL_USER as string;
const PASS = process.env.SURREAL_PASS as string;

// Ceiling for the connect → signin → use handshake. Measured at ~1.1s against
// Surreal Cloud from inside the container, so 10s is a wide margin that still
// fails fast enough for a caller's 30s capability timeout to report an error
// rather than time out.
const CONNECT_TIMEOUT_MS = Number(process.env.SURREAL_CONNECT_TIMEOUT_MS ?? 10_000);

let db: Surreal | null = null;
// In-flight handshake, shared so a burst of concurrent requests opens ONE
// connection instead of racing N of them. Cleared on failure so the next
// caller retries rather than awaiting a promise that already rejected.
let connecting: Promise<Surreal> | null = null;

async function signinAndUse(instance: Surreal): Promise<void> {
  await instance.signin({ username: USER, password: PASS });
  await instance.use({ namespace: NS, database: DB });
}

export async function getDb(): Promise<Surreal> {
  if (db) return db;
  if (connecting) return connecting;
  connecting = openConnection().finally(() => { connecting = null; });
  return connecting;
}

// The unbounded version of this is what took `domain.list` down for a whole
// process lifetime: surrealdb's connect() against a WSS endpoint has no
// deadline, so a stalled handshake never settles, `db` is never assigned, and
// the sequential handler loop awaiting it stops forever with nothing logged.
// See context-v/issues/One-Stuck-Message-Kills-A-NATS-Subject-Until-Restart.md
async function openConnection(): Promise<Surreal> {
  const instance = new Surreal();
  await withDeadline(instance.connect(URL), CONNECT_TIMEOUT_MS, 'surreal connect');
  await withDeadline(signinAndUse(instance), CONNECT_TIMEOUT_MS, 'surreal signin/use');

  // Wrap .query so an idle-reconnect that dropped the auth state retries ONCE
  // after a fresh signin/use, then bubbles real errors. Same `as any` shape
  // as apps/person-enrichment/src/lib/surreal.ts — the SDK's overloaded query
  // signature doesn't accept a plain async replacement under strict typing.
  const originalQuery = instance.query.bind(instance);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (instance as any).query = async (sql: string, vars?: Record<string, unknown>) => {
    try {
      return await originalQuery(sql, vars);
    } catch (e: unknown) {
      const msg = String((e as { message?: string })?.message ?? '');
      const name = (e as { name?: string })?.name ?? '';
      if (name === 'NotAllowedError' || /Anonymous access not allowed/i.test(msg)) {
        await signinAndUse(instance);
        return await originalQuery(sql, vars);
      }
      throw e;
    }
  };

  db = instance;
  return db;
}
