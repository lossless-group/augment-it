#!/usr/bin/env node
// ============================================================================
// surreal-write-event.mjs
//
// Creates the `events` table (SCHEMALESS) + a UNIQUE index on `slug`, then
// upserts one event record. Idempotent — re-running with the same slug
// updates the row's fields and refreshes last_seen_at.
//
// Event details are hardcoded as a constant at the top — copy-modify this
// script for each new event, or refactor to take CLI args later if events
// start arriving regularly.
// ============================================================================

import { Surreal } from 'surrealdb';

const EVENT = {
  slug: '2026-05-21-turning-jobs-into-degrees',
  name: 'Turning Jobs into Degrees: a Conversation on the Next Frontier of Higher Ed and Workforce',
  starts_at: new Date('2026-05-21T21:30:00Z'),  // 5:30 PM EDT = 21:30 UTC
  ends_at: null,
  venue_text: 'Stand Together, Inc., 4201 Wilson Blvd, Arlington, Virginia, 22203',
  host_text: 'Stand Together, Inc.',
  source: 'gatsby.events',
  source_url: 'https://gatsby.events/public-table-tab/reachuniversity/rNyU5vd8fYZsr4UVtsXXt1',
  total_attendees: 177,
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

// 1. Ensure the events table + slug index exist.
await db.query(`
  DEFINE TABLE IF NOT EXISTS events SCHEMALESS;
  DEFINE INDEX IF NOT EXISTS slug ON events FIELDS slug UNIQUE;
`);
console.log('table:    events SCHEMALESS');
console.log('index:    events.slug UNIQUE');
console.log('');

// 2. Upsert by slug.
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

// 3. Echo the result.
const result = await db.query('SELECT * FROM events WHERE slug = $slug', { slug: EVENT.slug });
console.log('');
console.log('event row:');
console.log(JSON.stringify(result?.[0]?.[0] || null, null, 2));

await db.close();
process.exit(0);
