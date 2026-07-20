#!/usr/bin/env node
// ============================================================================
// surreal-backfill-tags-relevance.mjs
//
// Writes has_tag (one observation per tag) and has_relevance_assessment
// observations for persons already resolved from a CSV. Same shape and same
// re-match-by-identifier approach as surreal-backfill-bio-observations.mjs
// (see that script's header for why — nothing in this pipeline writes
// person_uuid back onto a CSV row).
//
// Tags are free-text predicates, Train-Case per the consulting group's
// Obsidian tagging convention (content/lost-in-public/blueprints/
// Maintain-a-Clickable-Tag-System.md at the anchor monorepo root) — this
// script does not reformat tags, it trusts the input CSV already has them
// correct.
//
// Match priority per row: exact email (case-insensitive) > exact LinkedIn
// URL > exact name. Idempotent — skips any (predicate, object) pair already
// on file for that person.
//
// Default is DRY RUN. Pass --apply to actually write.
//
// Input is pre-parsed JSON (see surreal-backfill-bio-observations.mjs's
// header for the csv->json conversion recipe; this one also needs "tags"
// as an array and "relevance" as a string per row).
//
// Usage:
//   node scripts/surreal-backfill-tags-relevance.mjs \
//     --json scripts/tmp-aspen-tags-rows.json \
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
  console.error('usage: node surreal-backfill-tags-relevance.mjs --json <path> --client <slug> [--event-slug <slug>] [--apply]');
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
  if (!eventId) console.warn(`  ! event slug "${EVENT_SLUG}" not found — writing without related_event`);
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

async function alreadyLogged(subject, predicate, object) {
  const existing = await db.query(
    `SELECT VALUE id FROM observations
       WHERE subject = $subject AND predicate = $predicate AND object = $object AND client = $client LIMIT 1;`,
    { subject, predicate, object, client: CLIENT },
  );
  return Boolean(existing?.[0]?.[0]);
}

async function writeObservation(subject, predicate, object) {
  await db.query(
    `CREATE observations SET
        id = rand::uuid::v7(), subject = $subject, predicate = $predicate, object = $object,
        source = 'surreal-backfill-tags-relevance.mjs', observed_at = time::now(), client = $client
        ${eventId ? ', related_event = $eventId' : ''};`,
    { subject, predicate, object, client: CLIENT, eventId },
  );
}

const report = [];
let tagsWritten = 0, tagsSkipped = 0, relevanceWritten = 0, relevanceSkipped = 0;

for (const row of rows) {
  const name = norm(row.name);
  const tags = Array.isArray(row.tags) ? row.tags.filter(Boolean) : [];
  const relevance = norm(row.relevance);

  if (!tags.length && !relevance) {
    report.push({ name, status: 'skip — no tags or relevance in row' });
    continue;
  }

  const { person, method, candidates } = findPerson(row);
  if (!person) {
    report.push({ name, status: `NO MATCH (${method}${candidates ? `, ${candidates} name collisions` : ''})` });
    continue;
  }

  const written = [];
  const skipped = [];

  for (const tag of tags) {
    const dup = await alreadyLogged(person.id, 'has_tag', tag);
    if (dup) { tagsSkipped++; skipped.push(tag); continue; }
    if (APPLY) await writeObservation(person.id, 'has_tag', tag);
    tagsWritten++;
    written.push(tag);
  }

  let relevanceStatus = '';
  if (relevance) {
    const dup = await alreadyLogged(person.id, 'has_relevance_assessment', relevance);
    if (dup) {
      relevanceSkipped++;
      relevanceStatus = 'relevance already logged';
    } else {
      if (APPLY) await writeObservation(person.id, 'has_relevance_assessment', relevance);
      relevanceWritten++;
      relevanceStatus = `relevance=${relevance}`;
    }
  }

  report.push({
    name,
    matched_by: method,
    status: `${APPLY ? 'wrote' : 'would write'} ${written.length}/${tags.length} tags${skipped.length ? ` (${skipped.length} dup)` : ''}, ${relevanceStatus}`,
  });
}

console.log('row                                  | matched_by      | status');
console.log('-'.repeat(100));
for (const r of report) {
  const name = (r.name || '').padEnd(37).slice(0, 37);
  const matchedBy = (r.matched_by || '').padEnd(15).slice(0, 15);
  console.log(`${name}| ${matchedBy}| ${r.status}`);
}

const noMatch = report.filter((r) => r.status.startsWith('NO MATCH'));
console.log('');
console.log(`total rows: ${rows.length}`);
console.log(`  tags: ${tagsWritten} ${APPLY ? 'written' : 'would be written'}, ${tagsSkipped} already logged`);
console.log(`  relevance: ${relevanceWritten} ${APPLY ? 'written' : 'would be written'}, ${relevanceSkipped} already logged`);
console.log(`  ${noMatch.length} no canonical person match`);
if (noMatch.length) {
  console.log('');
  console.log('unmatched:');
  for (const r of noMatch) console.log(`  - ${r.name}`);
}
if (!APPLY && tagsWritten + relevanceWritten > 0) {
  console.log('');
  console.log('dry run only — re-run with --apply to write.');
}

await db.close();
process.exit(0);
