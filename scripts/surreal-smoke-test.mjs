#!/usr/bin/env node
// ============================================================================
// surreal-smoke-test.mjs
//
// One-shot connectivity check for SurrealDB Cloud. Reads SURREAL_URL,
// SURREAL_NS, SURREAL_DB, SURREAL_USER, SURREAL_PASS from process.env
// (source `.env` into the shell before running, or use the
// `set -a; . ./.env; set +a` pattern).
//
// Runs three checks:
//   1. connect()         — handshake + auth via WebSocket
//   2. query("RETURN 42") — round-trip a trivial query
//   3. INFO FOR DB        — confirm we can see the live schema
//
// Exit code: 0 on success, 1 on any failure.
// ============================================================================

import { Surreal } from 'surrealdb';

const required = ['SURREAL_URL', 'SURREAL_NS', 'SURREAL_DB', 'SURREAL_USER', 'SURREAL_PASS'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`missing env vars: ${missing.join(', ')}`);
  process.exit(1);
}

const db = new Surreal();
try {
  console.log(`url: ${process.env.SURREAL_URL}`);
  console.log(`ns:  ${process.env.SURREAL_NS}`);
  console.log(`db:  ${process.env.SURREAL_DB}`);
  console.log('');

  console.log('1. connect + signin + use…');
  await db.connect(process.env.SURREAL_URL);
  await db.signin({
    username: process.env.SURREAL_USER,
    password: process.env.SURREAL_PASS,
  });
  await db.use({
    namespace: process.env.SURREAL_NS,
    database: process.env.SURREAL_DB,
  });
  console.log('   ok');

  console.log('2. RETURN 42…');
  const r = await db.query('RETURN 42;');
  console.log(`   ok — got ${JSON.stringify(r)}`);

  console.log('3. INFO FOR DB…');
  const info = await db.query('INFO FOR DB;');
  const tables = info?.[0]?.tables ?? info?.[0]?.result?.tables ?? {};
  const names = Object.keys(tables);
  console.log(`   ok — tables: ${names.length ? names.join(', ') : '(none)'}`);

  await db.close();
  console.log('');
  console.log('smoke test passed.');
  process.exit(0);
} catch (err) {
  console.error('');
  console.error('smoke test FAILED:', err && err.message ? err.message : err);
  if (err && err.stack) console.error(err.stack);
  try { await db.close(); } catch {}
  process.exit(1);
}
