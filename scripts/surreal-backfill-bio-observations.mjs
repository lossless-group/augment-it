#!/usr/bin/env node
// ============================================================================
// surreal-backfill-bio-observations.mjs
//
// Backfills has_bio observations for persons already resolved from a CSV
// BEFORE person.apply supported bio capture. The CSV never got a
// person_uuid written back onto it (see
// context-v/issues/How-People-Orgs-And-Relationships-Actually-Enter-SurrealDB.md
// — nothing in this pipeline writes results back onto the row), so this
// re-matches each CSV row to its already-created persons row by identifier,
// not by any stored linkage.
//
// Match priority per row: exact email (case-insensitive) > exact LinkedIn
// URL > exact name. Anything that doesn't resolve by one of those gets
// reported, not guessed. Skips rows that already have an identical has_bio
// observation on file (idempotent — safe to re-run).
//
// Default is DRY RUN — prints the full match table, writes nothing. Pass
// --apply to actually create the observations.
//
// Input is pre-parsed JSON, not a raw CSV — no csv-parse dependency in this
// repo, and a hand-rolled parser is too risky against multi-paragraph bio
// text (embedded commas/quotes). Convert first with:
//   python3 -c "
//   import csv, json
//   with open('<csv path>', newline='', encoding='utf-8') as f:
//       rows = list(csv.DictReader(f))
//   out = [{'name': r['Full Name'], 'email': r['Email'],
//           'linkedin_url': r['LinkedIn Profile'], 'bio': r['Bio']} for r in rows]
//   json.dump(out, open('<json path>', 'w'), indent=2)
//   "
//
// Usage:
//   node scripts/surreal-backfill-bio-observations.mjs \
//     --json scripts/tmp-aspen-bio-rows.json \
//     --client reach-edu \
//     --event-slug aspen-institute-summer-socrates-seminars \
//     [--apply]
// ============================================================================

import { readFile } from 'node:fs/promises';
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

const JSON_PATH = args.json;
const CLIENT = args.client;
const EVENT_SLUG = args['event-slug'] || null;
const APPLY = Boolean(args.apply);

if (!JSON_PATH || !CLIENT) {
  console.error('usage: node surreal-backfill-bio-observations.mjs --json <path> --client <slug> [--event-slug <slug>] [--apply]');
  process.exit(1);
}

for (const k of ['SURREAL_URL', 'SURREAL_NS', 'SURREAL_DB', 'SURREAL_USER', 'SURREAL_PASS']) {
  if (!process.env[k]) { console.error(`missing env: ${k}`); process.exit(1); }
}

const db = new Surreal();
await db.connect(process.env.SURREAL_URL);
await db.signin({ username: process.env.SURREAL_USER, password: process.env.SURREAL_PASS });
await db.use({ namespace: process.env.SURREAL_NS, database: process.env.SURREAL_DB });
console.log(`connected: ${process.env.SURREAL_NS}/${process.env.SURREAL_DB}${APPLY ? ' — APPLY MODE' : ' — dry run'}`);
console.log('');

let eventId = null;
if (EVENT_SLUG) {
  const r = await db.query('SELECT id FROM events WHERE slug = $slug LIMIT 1;', { slug: EVENT_SLUG });
  eventId = r?.[0]?.[0]?.id ?? null;
  if (!eventId) console.warn(`  ! event slug "${EVENT_SLUG}" not found — bios will be written without related_event`);
}

const rows = JSON.parse(await readFile(JSON_PATH, 'utf8'));

const persons = (await db.query(
  'SELECT id, person_uuid, name, email, linkedin_profile_url FROM persons WHERE client_access CONTAINS $client;',
  { client: CLIENT },
))?.[0] ?? [];

function norm(v) { return (v ?? '').toString().trim(); }
function normLower(v) { return norm(v).toLowerCase(); }

function findPerson(row) {
  const email = normLower(row.email);
  const linkedin = norm(row.linkedin_url);
  const name = norm(row.name);

  if (email) {
    const hit = persons.find((p) => normLower(p.email) === email);
    if (hit) return { person: hit, method: 'email' };
  }
  if (linkedin) {
    const hit = persons.find((p) => norm(p.linkedin_profile_url) === linkedin);
    if (hit) return { person: hit, method: 'linkedin_url' };
  }
  if (name) {
    const matches = persons.filter((p) => norm(p.name) === name);
    if (matches.length === 1) return { person: matches[0], method: 'name' };
    if (matches.length > 1) return { person: null, method: 'name_ambiguous', candidates: matches.length };
  }
  return { person: null, method: 'no_match' };
}

const report = [];
for (const row of rows) {
  const bio = norm(row.bio);
  const name = norm(row.name);
  if (!bio) {
    report.push({ name, status: 'skip — no bio in row' });
    continue;
  }
  const { person, method, candidates } = findPerson(row);
  if (!person) {
    report.push({ name, status: `NO MATCH (${method}${candidates ? `, ${candidates} name collisions` : ''})` });
    continue;
  }

  // Idempotency check — has this exact bio already been logged for this person?
  const existing = await db.query(
    `SELECT VALUE id FROM observations
       WHERE subject = $subject AND predicate = 'has_bio' AND object = $bio AND client = $client LIMIT 1;`,
    { subject: person.id, bio, client: CLIENT },
  );
  const alreadyLogged = Boolean(existing?.[0]?.[0]);

  report.push({
    name,
    person_uuid: person.person_uuid,
    matched_by: method,
    bio_len: bio.length,
    status: alreadyLogged ? 'already logged — skip' : APPLY ? 'writing…' : 'would write',
  });

  if (!alreadyLogged && APPLY) {
    await db.query(
      `CREATE observations SET
          id = rand::uuid::v7(), subject = $subject, predicate = 'has_bio', object = $bio,
          source = 'surreal-backfill-bio-observations.mjs', observed_at = time::now(), client = $client
          ${eventId ? ', related_event = $eventId' : ''};`,
      { subject: person.id, bio, client: CLIENT, eventId },
    );
  }
}

console.log('row                                  | matched_by      | status');
console.log('-'.repeat(90));
for (const r of report) {
  const name = (r.name || '').padEnd(37).slice(0, 37);
  const matchedBy = (r.matched_by || '').padEnd(15).slice(0, 15);
  console.log(`${name}| ${matchedBy}| ${r.status}`);
}

const noMatch = report.filter((r) => r.status.startsWith('NO MATCH'));
const willWrite = report.filter((r) => r.status === 'would write' || r.status === 'writing…');
const already = report.filter((r) => r.status === 'already logged — skip');
const noBio = report.filter((r) => r.status.startsWith('skip'));

console.log('');
console.log(`total rows: ${rows.length}`);
console.log(`  ${willWrite.length} ${APPLY ? 'written' : 'would be written'}`);
console.log(`  ${already.length} already logged (idempotent skip)`);
console.log(`  ${noMatch.length} no canonical person match`);
console.log(`  ${noBio.length} no bio in source row`);
if (noMatch.length) {
  console.log('');
  console.log('unmatched:');
  for (const r of noMatch) console.log(`  - ${r.name}`);
}
if (!APPLY && willWrite.length) {
  console.log('');
  console.log(`dry run only — re-run with --apply to write ${willWrite.length} observation(s).`);
}

await db.close();
process.exit(0);
