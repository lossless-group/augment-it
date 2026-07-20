#!/usr/bin/env node
// ============================================================================
// surreal-set-person-bio.mjs
//
// One-off operator-supplied bio for a person — e.g. filling in a row that
// had no bio in the original CSV. Additive, not destructive: writes a NEW
// has_bio observation; any prior bio stays in history (observations are
// append-only). The report generator always reads the latest by
// observed_at, so this is all that's needed for the report to pick it up.
//
// Usage:
//   node scripts/surreal-set-person-bio.mjs \
//     --name "Heather Conley" --bio "$(cat bio.txt)" \
//     --client reach-edu --event-slug aspen-institute-summer-socrates-seminars
// ============================================================================

import { Surreal } from 'surrealdb';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = arr[i + 1];
      acc.push([key, next && !next.startsWith('--') ? next : true]);
    }
    return acc;
  }, []),
);

const { name, bio, client, ['event-slug']: eventSlug } = args;

if (!name || !bio || !client) {
  console.error('usage: node surreal-set-person-bio.mjs --name "<name>" --bio "<text>" --client <slug> [--event-slug <slug>]');
  process.exit(1);
}

for (const k of ['SURREAL_URL', 'SURREAL_NS', 'SURREAL_DB', 'SURREAL_USER', 'SURREAL_PASS']) {
  if (!process.env[k]) { console.error(`missing env: ${k}`); process.exit(1); }
}

const db = new Surreal();
await db.connect(process.env.SURREAL_URL);
await db.signin({ username: process.env.SURREAL_USER, password: process.env.SURREAL_PASS });
await db.use({ namespace: process.env.SURREAL_NS, database: process.env.SURREAL_DB });

const personRes = await db.query(
  `SELECT id, name FROM persons WHERE name = $name AND client_access CONTAINS $client;`,
  { name, client },
);
const matches = personRes?.[0] ?? [];
if (matches.length === 0) { console.error(`no person found named "${name}"`); process.exit(1); }
if (matches.length > 1) { console.error(`ambiguous — ${matches.length} people named "${name}"`); process.exit(1); }
const person = matches[0];

let eventId = null;
if (eventSlug) {
  const r = await db.query('SELECT id FROM events WHERE slug = $slug LIMIT 1;', { slug: eventSlug });
  eventId = r?.[0]?.[0]?.id ?? null;
}

await db.query(
  `CREATE observations SET
      id = rand::uuid::v7(), subject = $subject, predicate = 'has_bio', object = $bio,
      source = 'operator-correction', observed_at = time::now(), client = $client
      ${eventId ? ', related_event = $eventId' : ''};`,
  { subject: person.id, bio: bio.trim(), client, eventId },
);

console.log(`${name} -> bio set (${bio.trim().length} chars)`);

await db.close();
process.exit(0);
