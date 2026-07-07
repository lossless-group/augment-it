#!/usr/bin/env node
// ============================================================================
// export-affiliation-ratings-csv.mjs
//
// One row per AFFILIATION EDGE (not per person) for one event — the export
// half of the "Augment from Affiliations" rating loop. See
// context-v/specs/Augment-From-Affiliations.md.
//
// Why affiliation-per-row and not person-per-row (the shape
// export-event-attendees-csv.mjs uses): relevance is rated per (person, org)
// pairing, not per person — someone with two affiliations can be very
// relevant via one org and irrelevant via the other. A person-per-row export
// can't represent that without squashing affiliations into one cell.
//
// The `person_uuid` + `org_slug` columns exist for REIMPORT, not editing —
// together they're the wire-safe key affiliation-rating-resolver uses to
// find the live `affiliations` edge fresh (RecordIds don't survive a CSV
// round-trip any better than they survive JSON/NATS — see
// person-resolver.ts's header comment for the same lesson learned there).
//
// Usage:
//   node scripts/export-affiliation-ratings-csv.mjs \
//     --event-slug freedomfest-2026 \
//     --client     reach-edu \
//     --out-dir    clients/reach-edu/outputs/2026-07-07_freedomfest-ratings/
//     [--out-file  affiliation-ratings.csv]
// ============================================================================

import { Surreal } from 'surrealdb';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function parseArgs(argv) {
  const out = { outFile: 'affiliation-ratings.csv' };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i], v = argv[i + 1];
    if (a === '--event-slug') { out.eventSlug = v; i += 1; }
    else if (a === '--client') { out.client = v; i += 1; }
    else if (a === '--out-dir') { out.outDir = v; i += 1; }
    else if (a === '--out-file') { out.outFile = v; i += 1; }
  }
  return out;
}

const args = parseArgs(process.argv);
if (!args.eventSlug || !args.client || !args.outDir) {
  console.error('usage: --event-slug <slug> --client <slug> --out-dir <path> [--out-file affiliation-ratings.csv]');
  process.exit(1);
}
for (const k of ['SURREAL_URL', 'SURREAL_NS', 'SURREAL_DB', 'SURREAL_USER', 'SURREAL_PASS']) {
  if (!process.env[k]) { console.error(`missing env: ${k}`); process.exit(1); }
}

const db = new Surreal();
await db.connect(process.env.SURREAL_URL);
await db.signin({ username: process.env.SURREAL_USER, password: process.env.SURREAL_PASS });
await db.use({ namespace: process.env.SURREAL_NS, database: process.env.SURREAL_DB });

// ---- Pull -------------------------------------------------------------------

const evResult = await db.query(`SELECT * FROM events WHERE slug = $slug LIMIT 1;`, { slug: args.eventSlug });
const event = (evResult?.[0])?.[0];
if (!event) { console.error(`event not found: ${args.eventSlug}`); process.exit(1); }

// No hardcoded predicate allowlist — ANY observation whose object is this
// event is an attendance/participation signal (speaker_at, sponsor_of,
// exhibitor_at, attended, partner_of, invited_to, visited_event_page, ...).
// Other predicates never use an event as their object, so this is safe
// without enumerating every event-tie verb that exists today or gets added
// later.
const affResult = await db.query(
  `LET $pids = (SELECT VALUE subject FROM observations WHERE object = $ev);
   SELECT
       in                       AS person_id,
       in.person_uuid           AS person_uuid,
       in.name                  AS person_name,
       in.personal_links        AS person_links,
       in.personal_corpus       AS person_corpus,
       kind                     AS role,
       relevance,
       relevance_note,
       out.slug                 AS org_slug,
       out.complete_name        AS org_name,
       out.org_links            AS org_links,
       out.org_corpus           AS org_corpus
     FROM affiliations
     WHERE in IN $pids AND client_access CONTAINS $client
     ORDER BY in.name ASC, out.complete_name ASC;`,
  { ev: event.id, client: args.client },
);
const rows = affResult?.[affResult.length - 1] ?? [];

await db.close();

// ---- Reshape ----------------------------------------------------------------

const countLinks = (arr) => (Array.isArray(arr) ? arr.length : 0);

function rowFor(a) {
  return {
    person_name:        a.person_name ?? '',
    org_name:            a.org_name ?? '',
    role:                a.role ?? '',
    relevance:           a.relevance ?? '',
    relevance_note:      a.relevance_note ?? '',
    person_links_count:  countLinks(a.person_links),
    person_corpus_count: countLinks(a.person_corpus),
    org_links_count:     countLinks(a.org_links),
    org_corpus_count:    countLinks(a.org_corpus),
    person_uuid:         a.person_uuid ?? '',
    org_slug:            a.org_slug ?? '',
  };
}

// person_uuid / org_slug placed LAST and documented as reimport-only in the
// header row's own values isn't possible in plain CSV — the usage comment
// at the top of this file, and the resolver's column-mapping step, carry
// that instruction instead.
const COLUMNS = [
  'person_name', 'org_name', 'role', 'relevance', 'relevance_note',
  'person_links_count', 'person_corpus_count', 'org_links_count', 'org_corpus_count',
  'person_uuid', 'org_slug',
];

// ---- Render CSV (RFC 4180) --------------------------------------------------

function csvCell(value) {
  const s = String(value ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function csvRow(values) {
  return values.map(csvCell).join(',');
}

const shaped = rows.map(rowFor);
const lines = [csvRow(COLUMNS), ...shaped.map((r) => csvRow(COLUMNS.map((c) => r[c])))];
// Excel/Sheets read UTF-8 cleanly with a BOM; without it, accented names mojibake.
const csv = '﻿' + lines.join('\r\n') + '\r\n';

const outPath = resolve(args.outDir, args.outFile);
await mkdir(args.outDir, { recursive: true });
await writeFile(outPath, csv, 'utf8');

const alreadyRated = shaped.filter((r) => r.relevance).length;
console.log(`wrote: ${outPath}`);
console.log(`rows: ${shaped.length} affiliations · ${alreadyRated} already rated · ${shaped.length - alreadyRated} awaiting a rating`);
