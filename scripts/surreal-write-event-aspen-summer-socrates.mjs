#!/usr/bin/env node
// ============================================================================
// surreal-write-event-aspen-summer-socrates.mjs
//
// Creates the `events` table (SCHEMALESS) + a UNIQUE index on `slug`, then
// upserts one event record. Idempotent — re-running with the same slug
// updates the row's fields and refreshes last_seen_at.
//
// Slug MUST match what person-resolver.ts's ensureEvent() would derive via
// slugify(name) — "Aspen Institute: Summer Socrates Seminars" →
// "aspen-institute-summer-socrates-seminars" — so that the per-row
// person.apply calls made via the shell's "Resolve People to Canonical DB"
// flow (which parses the Observation column's "attendee at <event name>"
// free text) find this pre-seeded row instead of creating a dateless one.
//
// Copy-modify convention per scripts/surreal-write-event.mjs.
// ============================================================================

import { Surreal } from 'surrealdb';

const EVENT = {
  slug: 'aspen-institute-summer-socrates-seminars',
  name: 'Aspen Institute: Summer Socrates Seminars',
  starts_at: new Date('2026-07-17T00:00:00Z'),
  ends_at: new Date('2026-07-20T23:59:59Z'),
  venue_text: null,
  host_text: 'Aspen Institute',
  source: 'operator-provided',
  source_url: null,
  total_attendees: 109,
  client: 'reach-edu',
};

for (const k of ['SURREAL_URL', 'SURREAL_NS', 'SURREAL_DB', 'SURREAL_USER', 'SURREAL_PASS']) {
  if (!process.env[k]) { console.error(`missing env: ${k}`); process.exit(1); }
}

const db = new Surreal();
await db.connect(process.env.SURREAL_URL);
await db.signin({ username: process.env.SURREAL_USER, password: process.env.SURREAL_PASS });
await db.use({ namespace: process.env.SURREAL_NS, database: process.env.SURREAL_DB });
console.log(`connected: ${process.env.SURREAL_NS}/${process.env.SURREAL_DB}`);

await db.query(`
  DEFINE TABLE IF NOT EXISTS events SCHEMALESS;
  DEFINE INDEX IF NOT EXISTS slug ON events FIELDS slug UNIQUE;
`);
console.log('table:    events SCHEMALESS');
console.log('index:    events.slug UNIQUE');
console.log('');

const existing = await db.query(
  'SELECT id FROM events WHERE slug = $slug LIMIT 1',
  { slug: EVENT.slug },
);
const hit = existing?.[0]?.[0];

if (hit?.id) {
  await db.query(
    `UPDATE $id MERGE $fields SET
        last_seen_at = time::now(),
        client_access = array::union(client_access ?? [], [$client]),
        last_touched_by = $client,
        last_touched_at = time::now()`,
    { id: hit.id, fields: EVENT, client: EVENT.client },
  );
  console.log(`updated: ${hit.id}`);
} else {
  await db.query(
    `CREATE events SET
        id = rand::uuid::v7(),
        slug = $slug,
        name = $name,
        starts_at = $starts_at,
        ends_at = $ends_at,
        venue_text = $venue_text,
        host_text = $host_text,
        source = $source,
        source_url = $source_url,
        total_attendees = $total_attendees,
        client = $client,
        client_access = [$client],
        first_touched_by = $client,
        last_touched_by = $client,
        last_touched_at = time::now(),
        first_seen_at = time::now(),
        last_seen_at = time::now()`,
    EVENT,
  );
  console.log(`created: events:<...>`);
}

const result = await db.query('SELECT * FROM events WHERE slug = $slug', { slug: EVENT.slug });
console.log('');
console.log('event row:');
console.log(JSON.stringify(result?.[0]?.[0] || null, null, 2));

await db.close();
process.exit(0);
