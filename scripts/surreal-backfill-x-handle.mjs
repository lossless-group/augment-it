#!/usr/bin/env node
// ============================================================================
// surreal-backfill-x-handle.mjs
//
// Writes has_x_handle observations (object = the x.com URL) for persons
// already resolved from a CSV whose "Social Profiles" column held X/Twitter
// handles. Same re-match-by-identifier + dry-run/apply/idempotent shape as
// the other surreal-backfill-*.mjs scripts — see
// surreal-backfill-bio-observations.mjs's header for why the match happens
// this way.
//
// Usage:
//   node scripts/surreal-backfill-x-handle.mjs \
//     --json scripts/tmp-aspen-x-rows.json \
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
  console.error('usage: node surreal-backfill-x-handle.mjs --json <path> --client <slug> [--event-slug <slug>] [--apply]');
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
let written = 0, skipped = 0;

for (const row of rows) {
  const name = norm(row.name);
  if (!row.x_url) { report.push({ name, status: 'skip — no X handle in row' }); continue; }

  const { person, method, candidates } = findPerson(row);
  if (!person) {
    report.push({ name, status: `NO MATCH (${method}${candidates ? `, ${candidates} name collisions` : ''})` });
    continue;
  }

  const existing = await db.query(
    `SELECT VALUE id FROM observations WHERE subject = $subject AND predicate = 'has_x_handle' AND object = $url AND client = $client LIMIT 1;`,
    { subject: person.id, url: row.x_url, client: CLIENT },
  );
  const dup = Boolean(existing?.[0]?.[0]);

  report.push({ name, matched_by: method, status: dup ? 'already logged' : APPLY ? 'writing…' : 'would write' });

  if (!dup && APPLY) {
    await db.query(
      `CREATE observations SET
          id = rand::uuid::v7(), subject = $subject, predicate = 'has_x_handle', object = $url,
          source = 'surreal-backfill-x-handle.mjs', observed_at = time::now(), client = $client
          ${eventId ? ', related_event = $eventId' : ''};`,
      { subject: person.id, url: row.x_url, client: CLIENT, eventId },
    );
  }
  if (!dup) written++; else skipped++;
}

console.log('row                                  | matched_by      | status');
console.log('-'.repeat(90));
for (const r of report) {
  console.log(`${(r.name || '').padEnd(37).slice(0, 37)}| ${(r.matched_by || '').padEnd(15).slice(0, 15)}| ${r.status}`);
}
const noMatch = report.filter((r) => r.status.startsWith('NO MATCH'));
console.log('');
console.log(`total rows: ${rows.length}`);
console.log(`  ${written} ${APPLY ? 'written' : 'would be written'}, ${skipped} already logged, ${noMatch.length} no match`);
if (noMatch.length) for (const r of noMatch) console.log(`  unmatched: ${r.name}`);
if (!APPLY && written) console.log('\ndry run only — re-run with --apply to write.');

await db.close();
process.exit(0);
