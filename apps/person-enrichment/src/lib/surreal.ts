// SurrealDB connection + query helpers for the browser. Credentials are
// embedded at build time from process.env via rsbuild's `source.define`
// (see rsbuild.config.ts). v0 dev-only — a proxy service replaces this
// when a second operator joins.

import { Surreal } from 'surrealdb';

const URL     = import.meta.env.SURREAL_URL;
const NS      = import.meta.env.SURREAL_NS;
const DB      = import.meta.env.SURREAL_DB;
const USER    = import.meta.env.SURREAL_USER;
const PASS    = import.meta.env.SURREAL_PASS;
export const CLIENT  = import.meta.env.SURREAL_CLIENT;
export const SURREAL_NS = NS;
export const SURREAL_DB = DB;

let db: Surreal | null = null;

async function signinAndUse(instance: Surreal): Promise<void> {
  await instance.signin({ username: USER, password: PASS });
  await instance.use({ namespace: NS, database: DB });
}

export async function getDb(): Promise<Surreal> {
  if (db) return db;
  if (!URL || !USER || !PASS || !NS || !DB) {
    const missing = ['URL', 'NS', 'DB', 'USER', 'PASS']
      .filter((k) => !import.meta.env[`SURREAL_${k}` as keyof ImportMetaEnv])
      .map((k) => `SURREAL_${k}`)
      .join(', ');
    throw new Error(
      `SurrealDB env not configured (missing: ${missing}). The augment-it/.env at the repo root is auto-loaded at build time — make sure those keys are present there, then restart \`pnpm dev\`.`,
    );
  }
  const instance = new Surreal();
  await instance.connect(URL);
  await signinAndUse(instance);

  // Defensive auth retry: the WebSocket can drop on idle timeout / network
  // blip and the SDK auto-reconnects WITHOUT re-signing in — the next
  // query then comes back with "Anonymous access not allowed". Wrap
  // .query so it catches that one specific failure mode and retries
  // ONCE after a fresh signin/use. Real auth errors (wrong creds) still
  // bubble up after the retry.
  const originalQuery = instance.query.bind(instance);
  (instance as any).query = async (sql: string, vars?: Record<string, unknown>) => {
    try {
      return await originalQuery(sql, vars);
    } catch (e: any) {
      const msg = String(e?.message ?? '');
      if (e?.name === 'NotAllowedError' || /Anonymous access not allowed/i.test(msg)) {
        try {
          await signinAndUse(instance);
          return await originalQuery(sql, vars);
        } catch (e2) {
          throw e2;
        }
      }
      throw e;
    }
  };
  db = instance;
  return db;
}

export async function disconnect(): Promise<void> {
  if (db) {
    await db.close();
    db = null;
  }
}
