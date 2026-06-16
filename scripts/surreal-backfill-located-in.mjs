#!/usr/bin/env node
// ============================================================================
// surreal-backfill-located-in.mjs
//
// Creates the `observations` table (SCHEMALESS) + a (subject, predicate,
// observed_at) index, then backfills one `located_in` observation per
// person whose `location` field matches a `locations` record by name.
//
// Predicate: "located_in"
// Object:    record link → locations:<id>
// observed_at: 2026-06-14T00:00:00Z (the CSV's implied capture date)
// source:    "linkedin-network-walker"
//
// Idempotent on the table + index. NOT idempotent on the observations
// themselves — re-running adds a second observation per person at the
// same observed_at. Skip the script if you've already run it (or use the
// idempotency guard `--once` which checks for an existing observation
// per (subject, predicate, observed_at) tuple).
//
// Usage:
//   set -a; . ./.env; set +a
//   node scripts/surreal-backfill-located-in.mjs [--once]
// ============================================================================

import { Surreal } from 'surrealdb';

for (const k of ['SURREAL_URL', 'SURREAL_NS', 'SURREAL_DB', 'SURREAL_USER', 'SURREAL_PASS']) {
  if (!process.env[k]) { console.error(`missing env: ${k}`); process.exit(1); }
}

const ONCE = process.argv.includes('--once');
const clientArgIdx = process.argv.indexOf('--client');
const client = clientArgIdx >= 0 ? process.argv[clientArgIdx + 1] : process.env.SURREAL_CLIENT;
if (!client) {
  console.error('missing --client <slug> (or SURREAL_CLIENT env). Required so writes are tagged with the originating workspace.');
  process.exit(1);
}

const db = new Surreal();
await db.connect(process.env.SURREAL_URL);
await db.signin({ username: process.env.SURREAL_USER, password: process.env.SURREAL_PASS });
await db.use({ namespace: process.env.SURREAL_NS, database: process.env.SURREAL_DB });
console.log(`connected: ${process.env.SURREAL_NS}/${process.env.SURREAL_DB}`);

// 1. Ensure the observations table + index exist.
await db.query(`
  DEFINE TABLE IF NOT EXISTS observations SCHEMALESS;
  DEFINE INDEX IF NOT EXISTS subject_predicate_time
    ON observations FIELDS subject, predicate, observed_at;
`);
console.log('table:     observations SCHEMALESS');
console.log('index:     observations(subject, predicate, observed_at)');
console.log('');

// 2. Build a name → locations:<id> map.
const locResult = await db.query('SELECT id, name FROM locations');
const locByName = new Map();
for (const row of (locResult?.[0] || [])) {
  if (row?.name && row?.id) locByName.set(row.name, row.id);
}
console.log(`locations indexed by name: ${locByName.size}`);

// 3. Get persons with a non-empty location string.
const personsResult = await db.query('SELECT id, location FROM persons WHERE location != ""');
const persons = personsResult?.[0] || [];
console.log(`persons with a location:   ${persons.length}`);
console.log('');

const observedAt = new Date('2026-06-14T00:00:00Z');
const source = 'linkedin-network-walker';

let created = 0, skipped_dup = 0, skipped_no_loc = 0, errored = 0;
const errors = [];
const t0 = Date.now();

for (let i = 0; i < persons.length; i += 1) {
  const p = persons[i];
  const locId = locByName.get(p.location);
  if (!locId) { skipped_no_loc += 1; continue; }

  try {
    if (ONCE) {
      const existing = await db.query(
        `SELECT id FROM observations
           WHERE subject = $subject AND predicate = "located_in" AND observed_at = $observed_at
           LIMIT 1`,
        { subject: p.id, observed_at: observedAt },
      );
      if ((existing?.[0] || []).length > 0) { skipped_dup += 1; continue; }
    }

    await db.query(
      `CREATE observations SET
          id          = rand::uuid::v7(),
          subject     = $subject,
          predicate   = "located_in",
          object      = $object,
          observed_at = $observed_at,
          source      = $source,
          client      = $client;
       UPDATE $subject SET
          client_access   = array::union(client_access ?? [], [$client]),
          last_touched_by = $client,
          last_touched_at = time::now();`,
      { subject: p.id, object: locId, observed_at: observedAt, source, client },
    );
    created += 1;
  } catch (err) {
    errored += 1;
    errors.push(`${p.id}: ${err && err.message ? err.message : err}`);
  }

  if ((i + 1) % 100 === 0) {
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    process.stdout.write(`  ${i + 1}/${persons.length} (created ${created}, dup ${skipped_dup}, no-loc ${skipped_no_loc}, err ${errored}) ${elapsed}s\n`);
  }
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log('');
console.log(`done in ${elapsed}s`);
console.log(`  created:           ${created}`);
console.log(`  skipped (dup):     ${skipped_dup}`);
console.log(`  skipped (no loc):  ${skipped_no_loc}`);
console.log(`  errored:           ${errored}`);
if (errors.length) {
  console.log('first 5 errors:');
  for (const e of errors.slice(0, 5)) console.log(`  - ${e}`);
}

await db.close();
process.exit(errored ? 1 : 0);
