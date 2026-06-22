// SurrealDB connection for the resolver service. Same connect → signin → use
// handshake as scripts/surreal-*.mjs and apps/person-enrichment/src/lib/surreal.ts,
// with the defensive single-retry on the "Anonymous access not allowed" failure
// the WebSocket can land in after an idle-reconnect.

import { Surreal } from 'surrealdb';

const URL = process.env.SURREAL_URL as string;
const NS = process.env.SURREAL_NS as string;
const DB = process.env.SURREAL_DB as string;
const USER = process.env.SURREAL_USER as string;
const PASS = process.env.SURREAL_PASS as string;

let db: Surreal | null = null;

async function signinAndUse(instance: Surreal): Promise<void> {
  await instance.signin({ username: USER, password: PASS });
  await instance.use({ namespace: NS, database: DB });
}

export async function getDb(): Promise<Surreal> {
  if (db) return db;
  const instance = new Surreal();
  await instance.connect(URL);
  await signinAndUse(instance);

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
