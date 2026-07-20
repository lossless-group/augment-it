#!/usr/bin/env node
// ============================================================================
// surreal-add-person-tags.mjs
//
// Additive tag correction — adds one or more has_tag observations for a
// person on top of whatever they already have (doesn't remove/replace
// existing tags). Idempotent per tag.
//
// Usage:
//   node scripts/surreal-add-person-tags.mjs \
//     --name "Heather Conley" --tags "Government-Leaders,Authors,Media,Nonprofit-Leaders" \
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

const { name, tags, client, ['event-slug']: eventSlug } = args;

if (!name || !tags || !client) {
  console.error('usage: node surreal-add-person-tags.mjs --name "<name>" --tags "Tag-One,Tag-Two" --client <slug> [--event-slug <slug>]');
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

const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean);
for (const tag of tagList) {
  const existing = await db.query(
    `SELECT VALUE id FROM observations WHERE subject = $subject AND predicate = 'has_tag' AND object = $tag AND client = $client LIMIT 1;`,
    { subject: person.id, tag, client },
  );
  if (existing?.[0]?.[0]) { console.log(`${name}: ${tag} already present, skipping`); continue; }
  await db.query(
    `CREATE observations SET
        id = rand::uuid::v7(), subject = $subject, predicate = 'has_tag', object = $tag,
        source = 'operator-correction', observed_at = time::now(), client = $client
        ${eventId ? ', related_event = $eventId' : ''};`,
    { subject: person.id, tag, client, eventId },
  );
  console.log(`${name}: +${tag}`);
}

await db.close();
process.exit(0);
