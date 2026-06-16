#!/usr/bin/env node
// ============================================================================
// surreal-write-locations.mjs
//
// Pulls every distinct non-empty `location` string from the `persons`
// table and writes one record per unique string to the `locations` table.
//
// Field on `locations`: `name` (the location string). UUID v7 id.
// UNIQUE INDEX on `locations.name` so re-running is idempotent.
//
// Usage:
//   set -a; . ./.env; set +a
//   node scripts/surreal-write-locations.mjs
// ============================================================================

import { Surreal } from 'surrealdb';

const clientArgIdx = process.argv.indexOf('--client');
const client = clientArgIdx >= 0 ? process.argv[clientArgIdx + 1] : process.env.SURREAL_CLIENT;
if (!client) {
  console.error('missing --client <slug> (or SURREAL_CLIENT env). Required so writes are tagged with the originating workspace.');
  process.exit(1);
}

for (const k of ['SURREAL_URL', 'SURREAL_NS', 'SURREAL_DB', 'SURREAL_USER', 'SURREAL_PASS']) {
  if (!process.env[k]) { console.error(`missing env: ${k}`); process.exit(1); }
}

const db = new Surreal();
await db.connect(process.env.SURREAL_URL);
await db.signin({ username: process.env.SURREAL_USER, password: process.env.SURREAL_PASS });
await db.use({ namespace: process.env.SURREAL_NS, database: process.env.SURREAL_DB });
console.log(`connected: ${process.env.SURREAL_NS}/${process.env.SURREAL_DB}`);

await db.query(
  'DEFINE INDEX IF NOT EXISTS name ON locations FIELDS name UNIQUE',
);
console.log('index:     locations.name UNIQUE');

// Distinct, non-empty location strings from persons, server-side dedup.
const result = await db.query(
  'SELECT location FROM persons WHERE location != "" GROUP BY location',
);
const names = (result?.[0] || []).map((r) => r.location).filter(Boolean);
console.log(`distinct locations on persons: ${names.length}`);
console.log('');

let created = 0, skipped = 0, errored = 0;
const errors = [];
const t0 = Date.now();

for (let i = 0; i < names.length; i += 1) {
  const name = names[i];
  try {
    // CREATE will fail on UNIQUE violation; treat that as "already exists, skip".
    await db.query(
      `CREATE locations SET
          id = rand::uuid::v7(),
          name = $name,
          client_access = [$client],
          first_touched_by = $client,
          last_touched_by = $client,
          last_touched_at = time::now(),
          first_seen_at = time::now()`,
      { name, client },
    );
    created += 1;
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    if (/already contains|already exists|already covered/i.test(msg)) {
      skipped += 1;
    } else {
      errored += 1;
      errors.push(`"${name}": ${msg}`);
    }
  }

  if ((i + 1) % 50 === 0) {
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    process.stdout.write(`  ${i + 1}/${names.length} (created ${created}, skipped ${skipped}, err ${errored}) ${elapsed}s\n`);
  }
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log('');
console.log(`done in ${elapsed}s`);
console.log(`  created: ${created}`);
console.log(`  skipped: ${skipped}  (already in locations)`);
console.log(`  errored: ${errored}`);
if (errors.length) {
  console.log('first 5 errors:');
  for (const e of errors.slice(0, 5)) console.log(`  - ${e}`);
}

await db.close();
process.exit(errored ? 1 : 0);
