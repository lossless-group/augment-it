#!/usr/bin/env node
// Write has_tag observations on an org row — the direct-write stopgap until an
// organization.add_observation capability exists (see context-v/issues/
// Capability-Gaps-Surfaced-by-First-Triage-Run.md). Subject MUST be the
// uuid-typed record id (organizations:u"...") — string-typed subjects silently
// fail to join (the typing hazard documented in that issue).
// usage: SURREAL_* env set (source the repo .env), then:
//   node org-tag.mjs <org-uuid> <client_slug> <Tag-One> [Tag-Two ...]
import { createRequire } from 'node:module';
const require = createRequire(
  '/Users/mpstaton/code/lossless-monorepo/ai-labs/augment-it/services/record-surrealdb-resolver/package.json',
);
const { Surreal } = require('surrealdb');
const [uuid, client, ...tags] = process.argv.slice(2);
if (!uuid || !client || !tags.length) {
  console.error('usage: node org-tag.mjs <org-uuid> <client_slug> <Tag-One> [Tag-Two ...]');
  process.exit(1);
}
const db = new Surreal();
await db.connect(process.env.SURREAL_URL);
await db.signin({ username: process.env.SURREAL_USER, password: process.env.SURREAL_PASS });
await db.use({ namespace: process.env.SURREAL_NS, database: process.env.SURREAL_DB });
for (const tag of tags) {
  const [ex] = await db.query(
    `SELECT id FROM observations WHERE subject = organizations:u"${uuid}" AND predicate = 'has_tag' AND object = $tag`, { tag });
  if (ex.length) { console.log(`skip (exists): ${tag}`); continue; }
  await db.query(
    `CREATE observations SET id = rand::uuid::v7(), subject = organizations:u"${uuid}", predicate = 'has_tag',
       object = $tag, source = 'triage-inbox-w-suggestions', observed_at = time::now(), client = $client;`,
    { tag, client });
  console.log(`tagged: ${tag}`);
}
const [check] = await db.query(`SELECT object FROM observations WHERE subject = organizations:u"${uuid}" AND predicate = 'has_tag'`);
console.log('now:', JSON.stringify(check));
await db.close();
