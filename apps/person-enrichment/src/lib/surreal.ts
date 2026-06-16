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
  await instance.signin({ username: USER, password: PASS });
  await instance.use({ namespace: NS, database: DB });
  db = instance;
  return db;
}

export async function disconnect(): Promise<void> {
  if (db) {
    await db.close();
    db = null;
  }
}
