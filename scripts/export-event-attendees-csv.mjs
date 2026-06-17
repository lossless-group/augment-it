#!/usr/bin/env node
// ============================================================================
// export-event-attendees-csv.mjs
//
// Flat, spreadsheet-friendly export of EVERY attendee of one event, pulled
// from the canonical SurrealDB layer. One row per person — name, emails,
// affiliations (org + role), LinkedIn, other links, corpus URLs — so a
// client can sort / filter / import it in Sheets or Excel.
//
// Unlike export-event-briefing.mjs (operator-facing coverage report, honest
// about gaps), this is the raw roster: ALL attendees including unnamed /
// unfindable rows, no triage narrative. Blank cells are blank cells.
//
// Usage:
//   node scripts/export-event-attendees-csv.mjs \
//     --event-slug 2026-05-21-turning-jobs-into-degrees \
//     --client     reach-edu \
//     --out-dir    clients/reach-edu/outputs/2026-06-16_turning-jobs-attendees/
//     [--out-file  attendees.csv]
// ============================================================================

import { Surreal } from 'surrealdb';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function parseArgs(argv) {
  const out = { outFile: 'attendees.csv' };
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
  console.error('usage: --event-slug <slug> --client <slug> --out-dir <path> [--out-file attendees.csv]');
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

const evResult = await db.query(
  `SELECT * FROM events WHERE slug = $slug LIMIT 1;`,
  { slug: args.eventSlug },
);
const event = (evResult?.[0])?.[0];
if (!event) { console.error(`event not found: ${args.eventSlug}`); process.exit(1); }

const peopleResult = await db.query(
  `LET $aids = (SELECT VALUE subject FROM observations
                WHERE object = $ev AND predicate IN ['invited_to', 'visited_event_page', 'email_bounced']);
   SELECT id, email, full_name, first_name, surname, emails,
          personal_links, personal_corpus, warnings, location, source,
          triage_status
     FROM persons WHERE id IN $aids
     ORDER BY full_name ASC, email ASC;`,
  { ev: event.id },
);
const persons = peopleResult?.[peopleResult.length - 1] ?? [];

const affResult = await db.query(
  `LET $aids = (SELECT VALUE subject FROM observations
                WHERE object = $ev AND predicate IN ['invited_to', 'visited_event_page', 'email_bounced']);
   SELECT in              AS person_id,
          kind            AS role,
          out.complete_name     AS complete_name,
          out.conventional_name AS conventional_name
     FROM affiliations WHERE in IN $aids;`,
  { ev: event.id },
);
const affiliations = affResult?.[affResult.length - 1] ?? [];

await db.close();

// ---- Reshape ----------------------------------------------------------------

const affByPerson = new Map();   // person id-string → [{role, complete_name, conventional_name}]
for (const a of affiliations) {
  const pid = String(a.person_id);
  if (!affByPerson.has(pid)) affByPerson.set(pid, []);
  affByPerson.get(pid).push(a);
}

const urls = (arr) => (Array.isArray(arr) ? arr : []).map((x) => x?.url).filter(Boolean);

function rowFor(p) {
  const affs = affByPerson.get(String(p.id)) ?? [];
  const links = Array.isArray(p.personal_links) ? p.personal_links : [];
  const linkedin = links.find((l) => l?.kind === 'linkedin_profile')?.url ?? '';
  const otherLinks = links.filter((l) => l?.kind !== 'linkedin_profile').map((l) => l?.url).filter(Boolean);
  const corpusUrls = urls(p.personal_corpus);

  return {
    full_name:         p.full_name ?? '',
    first_name:        p.first_name ?? '',
    surname:           p.surname ?? '',
    email:             p.email ?? '',
    additional_emails: (Array.isArray(p.emails) ? p.emails : []).join('; '),
    primary_org:       affs[0]?.complete_name ?? '',
    primary_role:      affs[0]?.role ?? '',
    all_affiliations:  affs.map((a) => `${a.complete_name ?? '(unnamed)'}${a.role ? ` (${a.role})` : ''}`).join('; '),
    location:          p.location ?? '',
    linkedin,
    other_links:       otherLinks.join('; '),
    corpus_count:      corpusUrls.length,
    corpus_urls:       corpusUrls.join('; '),
    triage_status:     p.triage_status ?? '',
    source:            p.source ?? '',
  };
}

const COLUMNS = [
  'full_name', 'first_name', 'surname', 'email', 'additional_emails',
  'primary_org', 'primary_role', 'all_affiliations', 'location',
  'linkedin', 'other_links', 'corpus_count', 'corpus_urls',
  'triage_status', 'source',
];

// ---- Render CSV (RFC 4180) --------------------------------------------------

function csvCell(value) {
  const s = String(value ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function csvRow(values) {
  return values.map(csvCell).join(',');
}

const rows = persons.map(rowFor);
const lines = [csvRow(COLUMNS), ...rows.map((r) => csvRow(COLUMNS.map((c) => r[c])))];
// Excel/Sheets read UTF-8 cleanly with a BOM; without it, accented names mojibake.
const csv = '﻿' + lines.join('\r\n') + '\r\n';

const outPath = resolve(args.outDir, args.outFile);
await mkdir(args.outDir, { recursive: true });
await writeFile(outPath, csv, 'utf8');

const named = rows.filter((r) => r.full_name).length;
const affiliated = rows.filter((r) => r.primary_org).length;
const withLinkedin = rows.filter((r) => r.linkedin).length;
console.log(`wrote: ${outPath}`);
console.log(`rows: ${rows.length} attendees · ${named} named · ${affiliated} affiliated · ${withLinkedin} with LinkedIn`);
