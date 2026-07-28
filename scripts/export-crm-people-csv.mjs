#!/usr/bin/env node
// ============================================================================
// export-crm-people-csv.mjs
//
// Phase 2 of context-v/plans/CRM-Starter-Export-Orgs-Then-People.md:
// one row per PERSON (deliberately NOT per affiliation edge — a person with
// two affiliations must not become two CRM contacts; the inversion of
// export-affiliation-ratings-csv.mjs's shape, reasoned in the plan).
//
// The strongest affiliation (relevance-ranked) supplies the org attach
// (org_external_id = the org slug, matching orgs.csv's external_id); the
// remaining edges ride in additional_orgs. Persons with zero affiliations
// still export with blank org columns — the CRM decides about orphans.
//
// Usage:
//   set -a; source ./.env; set +a
//   node scripts/export-crm-people-csv.mjs \
//     [--client reach-edu] \
//     [--out-dir clients/<client>/outputs/<YYYY-MM-DD>_crm-starter/]
// ============================================================================

import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const requireScripts = createRequire(new URL('./package.json', import.meta.url));
const { Surreal } = requireScripts('surrealdb');

const args = { client: 'reach-edu' };
for (let i = 2; i < process.argv.length; i += 1) {
  const k = process.argv[i];
  if (k === '--client') args.client = process.argv[++i];
  else if (k === '--out-dir') args.outDir = process.argv[++i];
  // Scope people to the orgs actually being imported (operator ruling
  // 2026-07-27: pipeline orgs only; event-based creations are kept noise).
  // Reads the external_id column of a Phase-1 orgs.csv; only persons with
  // at least one edge to an included org export, and their PRIMARY attach
  // is always an included org. Omit for the all-persons export.
  else if (k === '--orgs-csv') args.orgsCsv = process.argv[++i];
}
const today = new Date().toISOString().slice(0, 10);
const OUT_DIR = resolve(args.outDir ?? `clients/${args.client}/outputs/${today}_crm-starter`);

const csvEscape = (s) => {
  const v = String(s ?? '');
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

// Relevance ranking — the operator's labels outrank unrated; skip/irrelevant
// sink below unrated so a person's "best" org is never one they were rated
// irrelevant for when an unrated alternative exists.
const RELEVANCE_RANK = {
  very_relevant: 5,
  highly_relevant: 4,
  relevant: 3,
  '': 2,
  skip: 1,
  irrelevant: 0,
};
const rankOf = (r) => RELEVANCE_RANK[r ?? ''] ?? 2;

// Minimal CSV parse (quoted multiline cells) — only to pull external_id.
let includedSlugs = null;
if (args.orgsCsv) {
  const { readFileSync } = await import('node:fs');
  const text = readFileSync(resolve(args.orgsCsv), 'utf8');
  const rows = [];
  let row = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (c === '"') inQ = false;
      else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  const [h, ...data] = rows;
  const col = h.indexOf('external_id');
  includedSlugs = new Set(data.map((r) => r[col]).filter(Boolean));
  console.log(`scoping to ${includedSlugs.size} orgs from ${args.orgsCsv}`);
}

const db = new Surreal();
await db.connect(process.env.SURREAL_URL);
await db.signin({ username: process.env.SURREAL_USER, password: process.env.SURREAL_PASS });
await db.use({ namespace: process.env.SURREAL_NS, database: process.env.SURREAL_DB });

// 1. Persons visible to the client.
const persons = (await db.query(
  `SELECT id, person_uuid, name, full_name, first_name, surname, email,
          linkedin_profile_url, headline, personal_links
     FROM persons WHERE client_access CONTAINS $client;`,
  { client: args.client },
))?.[0] ?? [];
console.log(`persons: ${persons.length}`);

// 2. Person→org edges in one pass (org_org edges excluded by shape: their
//    `in` is an organizations row, so in.person_uuid is absent — the same
//    guard the People Reveal relies on).
const edges = (await db.query(
  `SELECT in.person_uuid AS person_uuid, out.slug AS org_slug,
          out.complete_name AS org_complete, out.conventional_name AS org_conventional,
          kind, relevance
     FROM affiliations WHERE in.person_uuid != NONE;`,
))?.[0] ?? [];
const edgesByPerson = new Map();
for (const e of edges) {
  const k = String(e.person_uuid);
  edgesByPerson.set(k, [...(edgesByPerson.get(k) ?? []), e]);
}
console.log(`person→org edges: ${edges.length}`);

// 3. Shape one row per person.
const exported_at = new Date().toISOString();
const rows = persons.flatMap((p) => {
  const my = (edgesByPerson.get(String(p.person_uuid)) ?? [])
    .slice()
    // Included-org edges outrank everything (the primary attach must be an
    // org that exists in the import), then relevance.
    .sort((a, b) =>
      (includedSlugs ? includedSlugs.has(b.org_slug) - includedSlugs.has(a.org_slug) : 0) ||
      rankOf(b.relevance) - rankOf(a.relevance));
  // Scoped run: skip persons with no edge into the included org set.
  if (includedSlugs && !my.some((e) => includedSlugs.has(e.org_slug))) return [];
  const primary = my[0];
  const extras = my.slice(1);
  const links = p.personal_links ?? [];
  const linkedin =
    p.linkedin_profile_url ??
    links.find((l) => /linkedin\.com\/in\//i.test(l.url ?? ''))?.url ??
    '';
  const other = links
    .filter((l) => (l.url ?? '') !== linkedin)
    .map((l) => `${l.kind ?? 'other'}: ${l.url}`);
  return {
    external_id: p.person_uuid,
    name: p.name ?? p.full_name ?? '',
    first_name: p.first_name ?? '',
    surname: p.surname ?? '',
    email: p.email ?? '',
    linkedin,
    headline: p.headline ?? '',
    org_external_id: primary?.org_slug ?? '',
    org_name: primary ? (primary.org_complete ?? primary.org_conventional ?? primary.org_slug) : '',
    role: primary?.kind ?? '',
    relevance: primary?.relevance ?? '',
    additional_orgs: extras.map((e) => `${e.org_slug} — ${e.kind ?? '-'}${e.relevance ? ` (${e.relevance})` : ''}`).join('\n'),
    other_links: other.join('\n'),
    exported_at,
  };
});

// Attached-and-rated first, then attached, then orphans; alphabetical within.
rows.sort((a, b) =>
  (a.org_external_id === '') - (b.org_external_id === '') ||
  rankOf(b.relevance) - rankOf(a.relevance) ||
  a.name.localeCompare(b.name));

const HEADERS = [
  'external_id', 'name', 'first_name', 'surname', 'email', 'linkedin', 'headline',
  'org_external_id', 'org_name', 'role', 'relevance', 'additional_orgs',
  'other_links', 'exported_at',
];
await mkdir(OUT_DIR, { recursive: true });
const lines = [HEADERS.join(',')];
for (const r of rows) lines.push(HEADERS.map((h) => csvEscape(r[h])).join(','));
await writeFile(join(OUT_DIR, 'people.csv'), lines.join('\n') + '\n', 'utf8');

const orphans = rows.filter((r) => !r.org_external_id).length;
const multi = rows.filter((r) => r.additional_orgs).length;
console.log(`wrote ${rows.length} rows → ${join(OUT_DIR, 'people.csv')}`);
console.log(`attached: ${rows.length - orphans} · orphans (no affiliation): ${orphans} · multi-affiliation: ${multi}`);
await db.close();
