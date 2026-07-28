#!/usr/bin/env node
// ============================================================================
// export-crm-orgs-csv.mjs
//
// Phase 1 of context-v/plans/CRM-Starter-Export-Orgs-Then-People.md:
// one row per canonical organization visible to the client, carrying
//   - identity (slug as external_id, names, aliases, domains, bucket, tags)
//   - identity links flattened by kind (website/linkedin/x/… + other_links)
//   - pulse streams (one long-text column — multi-valued by nature)
//   - org↔org relations summary
//   - the Master Pipeline Tracker's human columns, joined exact-first via
//     the pipeline row's corpus_funder_slug, then by name/alias matching
//   - NO corpora (plan invariant 2)
//
// Unmatched pipeline rows are reported to a sidecar CSV, never dropped —
// they may name orgs never captured (themselves a to-capture list).
//
// Reads: SurrealDB direct (orgs/tags/relations — SURREAL_* env) + NATS
// row-store (the pipeline record set). Writes CSVs; touches nothing.
//
// Usage:
//   set -a; source ./.env; set +a
//   node scripts/export-crm-orgs-csv.mjs \
//     [--client reach-edu] \
//     [--record-set-name-match Master-Pipeline-Tracker] \
//     [--out-dir clients/<client>/outputs/<YYYY-MM-DD>_crm-starter/]
// ============================================================================

import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const requireScripts = createRequire(new URL('./package.json', import.meta.url));
const requireServices = createRequire(new URL('../services/social-search/package.json', import.meta.url));
const { Surreal } = requireScripts('surrealdb');
const { connect } = requireServices('@nats-io/transport-node');

// ---- args -------------------------------------------------------------------
const args = { client: 'reach-edu', match: 'Master-Pipeline-Tracker', scope: 'pipeline' };
for (let i = 2; i < process.argv.length; i += 1) {
  const k = process.argv[i];
  if (k === '--client') args.client = process.argv[++i];
  else if (k === '--record-set-name-match') args.match = process.argv[++i];
  else if (k === '--out-dir') args.outDir = process.argv[++i];
  // 'pipeline' (default, operator ruling 2026-07-27): one row per PIPELINE
  // row — the tracker's shape, enriched. Multi-deal orgs stay multi-row.
  // 'all': one row per canonical org (the event-based long tail included).
  else if (k === '--scope') args.scope = process.argv[++i];
  // Operator-directed additions: canonical org slugs appended as rows even
  // though no pipeline row names them (pipeline_matched: 'manual'). First
  // use: raise-us — the org behind the person-anchored "Blair Miller" deal
  // row (operator ruling 2026-07-28, in lieu of a person-name org alias).
  else if (k === '--include') args.include = process.argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
}
const today = new Date().toISOString().slice(0, 10);
const OUT_DIR = resolve(args.outDir ?? `clients/${args.client}/outputs/${today}_crm-starter`);

// ---- csv helpers --------------------------------------------------------------
const csvEscape = (s) => {
  const v = String(s ?? '');
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};
const writeCsv = async (path, headers, rows) => {
  const lines = [headers.join(',')];
  for (const r of rows) lines.push(headers.map((h) => csvEscape(r[h])).join(','));
  await writeFile(path, lines.join('\n') + '\n', 'utf8');
};

// ---- link-kind flattening map --------------------------------------------------
// First URL of each promoted kind gets its own column; the rest spill into
// other_links. Kinds observed live 2026-07-27 (19 in use).
const PROMOTED_KINDS = {
  website: 'website',
  linkedin_company: 'linkedin',
  x_profile: 'x',
  facebook_profile: 'facebook',
  instagram_profile: 'instagram',
  youtube: 'youtube',
  wikipedia: 'wikipedia',
  bluesky_profile: 'bluesky',
  substack: 'substack',
  team_page: 'team_page',
};

// ---- pipeline columns replicated (the plan's enumerated human set) -------------
const PIPELINE_COLS = [
  'Type', 'Owner', 'Stage', 'Total Commitment ($)', 'FY26 Revenue ($)',
  'FY27 Revenue ($)', 'Probability (auto)', 'Weighted FY26 (auto)',
  'Weighted FY27 (auto)', 'Last Contact/Update', 'Notes/Context', 'Next Step',
  'Next Step Due', 'Next Step Owner', 'Next Step Status', 'Upcoming Event',
  'RSVP Status',
];

// ---- name normalization for the fuzzy join --------------------------------------
const normName = (s) =>
  String(s ?? '')
    .replace(/\(.*?\)/g, ' ') // strip parentheticals: "Accelerate the Future (ACH, GW Match)"
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// ---- main -----------------------------------------------------------------------
const db = new Surreal();
await db.connect(process.env.SURREAL_URL);
await db.signin({ username: process.env.SURREAL_USER, password: process.env.SURREAL_PASS });
await db.use({ namespace: process.env.SURREAL_NS, database: process.env.SURREAL_DB });

// 1. Canonical orgs.
const orgs = (await db.query(
  `SELECT id, slug, complete_name, conventional_name, aliases, domains,
          org_links, media_streams
     FROM organizations WHERE client_access CONTAINS $client;`,
  { client: args.client },
))?.[0] ?? [];
console.log(`orgs: ${orgs.length}`);

// 2. Org tags (per-client has_tag observations), grouped by subject id.
const tagRows = (await db.query(
  `SELECT subject, object FROM observations
     WHERE predicate = 'has_tag' AND client = $client
       AND record::tb(subject) = 'organizations';`,
  { client: args.client },
))?.[0] ?? [];
const tagsByOrg = new Map();
for (const t of tagRows) {
  const k = String(t.subject);
  tagsByOrg.set(k, [...(tagsByOrg.get(k) ?? []), String(t.object)]);
}

// 3. Org↔org relations, projected per org (same semantics as
//    organization.relations: inbound child_of = child, outbound = parent).
const relRows = (await db.query(
  `SELECT rel, kind, in.slug AS in_slug, out.slug AS out_slug FROM affiliations
     WHERE edge_type = 'org_org' AND client_access CONTAINS $client;`,
  { client: args.client },
))?.[0] ?? [];
const relsByOrg = new Map();
const addRel = (slug, line) => relsByOrg.set(slug, [...(relsByOrg.get(slug) ?? []), line]);
for (const r of relRows) {
  const kind = r.kind ? ` (${r.kind})` : '';
  if (r.rel === 'peer') {
    addRel(r.in_slug, `peer: ${r.out_slug}${kind}`);
    addRel(r.out_slug, `peer: ${r.in_slug}${kind}`);
  } else {
    addRel(r.in_slug, `parent: ${r.out_slug}${kind}`);
    addRel(r.out_slug, `child: ${r.in_slug}${kind}`);
  }
}

// 4. Bucket derivation from the client corpus's disk folders.
const BUCKETS = ['funders', 'gov-entities', 'think-tanks', 'associations-networks', 'academic-institutions', 'data-services'];
const CORPUS_ROOT = resolve(`clients/${args.client}/corpus`);
const bucketOf = (slug) => BUCKETS.find((b) => existsSync(join(CORPUS_ROOT, b, slug))) ?? '';

// 4b. Persons — pipeline prospects are allowed to BE people (operator
// ruling 2026-07-28: "sometimes there are people who have several things
// going on" — a Major Gift row attaches to the person, not a forced org).
// Exact-normalized name match only; person names are too risky to fuzz.
const persons = (await db.query(
  `SELECT person_uuid, name, full_name FROM persons WHERE client_access CONTAINS $client;`,
  { client: args.client },
))?.[0] ?? [];
const personByNorm = new Map();
const personsBySurname = new Map(); // surname → persons[] (unique-only rule below)
for (const p of persons) {
  for (const cand of [p.name, p.full_name]) {
    const n = normName(cand);
    if (n && !personByNorm.has(n)) personByNorm.set(n, p);
  }
  const surname = normName((p.name ?? p.full_name ?? '').split(' ').slice(-1)[0]);
  if (surname) personsBySurname.set(surname, [...(personsBySurname.get(surname) ?? []), p]);
}
const personMatch = (name) => {
  const direct = personByNorm.get(normName(name));
  if (direct) return direct;
  // "Toolbox Family Fund (Joshua Biber)" — the parenthetical often names
  // the person the deal actually anchors to.
  const paren = /\(([^)]+)\)/.exec(String(name))?.[1];
  if (paren) {
    const p = personByNorm.get(normName(paren));
    if (p) return p;
  }
  // "James Patterson Philanthropy Advisor" — trailing role words after a
  // person's full name. Progressive right-trim, EXACT full-name match only,
  // never below two tokens (the first-name-prefix lesson from the org
  // matcher applies double for people).
  const toks = normName(name).split(' ');
  for (let drop = 1; drop <= 3 && toks.length - drop >= 2; drop += 1) {
    const p = personByNorm.get(toks.slice(0, toks.length - drop).join(' '));
    if (p) return p;
  }
  // Bare-surname row ("Haslam") → the person, ONLY when the whole row name
  // is one token, ≥5 chars, and exactly one person carries that surname.
  if (toks.length === 1 && toks[0].length >= 5) {
    const bySurname = personsBySurname.get(toks[0]) ?? [];
    if (bySurname.length === 1) return bySurname[0];
  }
  return null;
};

// 5. Pipeline record set over NATS — newest record set whose name matches.
const nc = await connect({ servers: process.env.NATS_URL ?? 'nats://localhost:4222' });
const req = async (s, b, t = 30_000) =>
  JSON.parse(new TextDecoder().decode((await nc.request(s, JSON.stringify(b), { timeout: t })).data));
const list = await req('record_set.list.requested', {});
const candidates = (list.record_sets ?? []).filter((s) => (s.name ?? '').includes(args.match));
candidates.sort((a, b) => String(b.name).localeCompare(String(a.name)));
const chosen = candidates[0];
if (!chosen) throw new Error(`no record set matching "${args.match}"`);
console.log(`pipeline record set: ${chosen.name}`);
const got = await req('record_set.get.requested', { record_set_id: chosen.record_set_id ?? chosen.id });
const pipelineRows = (got.rows ?? []).map((r) => r.fields ?? r);
await nc.drain();
console.log(`pipeline rows: ${pipelineRows.length}`);

// 6. Join pipeline → orgs: exact by corpus_funder_slug, then name/alias.
const orgBySlug = new Map(orgs.map((o) => [o.slug, o]));
const byNorm = new Map(); // normalized name/alias → slug (first wins)
for (const o of orgs) {
  for (const cand of [o.complete_name, o.conventional_name, o.slug.replace(/-/g, ' '), ...(o.aliases ?? [])]) {
    const n = normName(cand);
    if (n && !byNorm.has(n)) byNorm.set(n, o.slug);
  }
}
// Deal-decoration-tolerant fuzzy match. Tracker rows name DEALS, not orgs
// ("Ballmer Group II", "ECMC-2", "Colorado League of Charter Schools:
// 12/31/25", "Stand Together Foundation-catalyst grant"). Candidates tried
// in order of confidence; everything found here is flagged 'fuzzy' for
// operator review — false negatives beat false positives, so trimmed
// variants must EXACT-match, and the last-resort prefix rule only fires
// when it is unambiguous (exactly one org).
const orgNorms = Array.from(byNorm.keys());
const fuzzyMatch = (name) => {
  const variants = new Set();
  const base = normName(name);
  if (base) variants.add(base);
  for (const part of String(name).split('/')) {
    const n = normName(part);
    if (n) variants.add(n);
  }
  variants.add(normName(String(name).replace(/:.*$/, ''))); // ": 12/31/25"
  // Progressive right-trim (up to 4 trailing tokens): "stand together
  // foundation catalyst grant" → … → "stand together foundation";
  // "ecmc 3 ncad rtc investment" → "ecmc". Safe because trimmed variants
  // must EXACT-match an org name/alias — depth only widens the search.
  for (const v of Array.from(variants)) {
    const toks = v.split(' ');
    for (let drop = 1; drop <= 4 && toks.length - drop >= 1; drop += 1) {
      variants.add(toks.slice(0, toks.length - drop).join(' '));
    }
  }
  for (const v of variants) {
    if (byNorm.has(v)) return byNorm.get(v);
  }
  // Unique-prefix rescue: "bloomberg" → "bloomberg philanthropies" (only if
  // exactly one org starts with the variant). Single-token variants need
  // brand-length distinctiveness (≥8 chars) — a bare first name like
  // "james" (5) prefix-matched james-and-judith-k-dimon-foundation on the
  // first run (caught in the 2026-07-28 fuzzy audit); multi-token variants
  // need ≥5 chars.
  for (const v of variants) {
    const minLen = v.includes(' ') ? 5 : 8;
    if (v.length < minLen) continue;
    const hits = orgNorms.filter((n) => n.startsWith(v + ' '));
    if (hits.length === 1) return byNorm.get(hits[0]);
  }
  return null;
};

// Per-PIPELINE-row resolution — multiple rows may share one org (multi-deal
// orgs like Accelerate the Future); each keeps its own row, tracker-style.
const resolved = pipelineRows.map((row) => {
  const name = row['Prospect / Organization'] ?? '';
  const exact = row.corpus_funder_slug && orgBySlug.has(row.corpus_funder_slug) ? row.corpus_funder_slug : null;
  const fuzzy = exact ? null : fuzzyMatch(name);
  const person = exact || fuzzy ? null : personMatch(name);
  return {
    row,
    slug: exact ?? fuzzy ?? null,
    person,
    matched: exact ? 'exact' : fuzzy ? 'fuzzy' : person ? 'person' : 'none',
  };
});
const matchedCount = resolved.filter((r) => r.slug).length;
const personCount = resolved.filter((r) => r.person).length;
console.log(`pipeline rows matched: ${matchedCount} org + ${personCount} person / ${resolved.length}`);

// 7. Shape rows — canonical-enrichment column block for one org.
const exported_at = new Date().toISOString();
const enrichmentFor = (o) => {
  if (!o) {
    return {
      external_id: '', name: '', conventional_name: '', aliases: '', domains: '',
      bucket: '', tags: '',
      ...Object.fromEntries(Object.values(PROMOTED_KINDS).map((c) => [c, ''])),
      other_links: '', streams: '', stream_count: '', related_orgs: '',
    };
  }
  const flat = {};
  const other = [];
  for (const l of o.org_links ?? []) {
    const col = PROMOTED_KINDS[l.kind];
    if (col && !flat[col]) flat[col] = l.url;
    else other.push(`${l.kind ?? 'other'}: ${l.url}`);
  }
  const streams = (o.media_streams ?? []).map((s) => `${s.name ? s.name + ' — ' : ''}${s.url}${s.kind ? ` (${s.kind})` : ''}`);
  return {
    external_id: o.slug,
    name: o.complete_name ?? o.conventional_name ?? o.slug,
    conventional_name: o.conventional_name ?? '',
    aliases: (o.aliases ?? []).join(' | '),
    domains: (o.domains ?? []).map((d) => d.domain).filter(Boolean).join(' | '),
    bucket: bucketOf(o.slug),
    tags: (tagsByOrg.get(String(o.id)) ?? []).join(' | '),
    ...Object.fromEntries(Object.values(PROMOTED_KINDS).map((c) => [c, flat[c] ?? ''])),
    other_links: other.join('\n'),
    streams: streams.join('\n'),
    stream_count: streams.length,
    related_orgs: (relsByOrg.get(o.slug) ?? []).join('\n'),
  };
};

let outRows;
let unmatched = [];
if (args.scope === 'pipeline') {
  // The tracker's shape: one row per pipeline row, in tracker order,
  // enrichment blank where no canonical org matched. Rows with no match
  // ALSO land in the sidecar as the to-capture list.
  outRows = resolved.map(({ row, slug, person, matched }) => ({
    ...enrichmentFor(slug ? orgBySlug.get(slug) : null),
    person_external_id: person?.person_uuid ?? '',
    person_name: person ? (person.name ?? person.full_name ?? '') : '',
    pipeline_org_name: row['Prospect / Organization'] ?? '',
    pipeline_matched: matched,
    ...Object.fromEntries(PIPELINE_COLS.map((c) => [c, row[c] ?? ''])),
    exported_at,
  }));
  // Sidecar = rows matching NEITHER an org nor a person.
  unmatched = resolved.filter((r) => !r.slug && !r.person).map((r) => r.row);
  // Operator-directed inclusions land after the pipeline rows.
  const already = new Set(outRows.map((r) => r.external_id).filter(Boolean));
  for (const slug of args.include ?? []) {
    if (already.has(slug)) continue;
    const o = orgBySlug.get(slug);
    if (!o) {
      console.warn(`  ⚠ --include ${slug}: no canonical org with that slug — skipped`);
      continue;
    }
    outRows.push({
      ...enrichmentFor(o),
      person_external_id: '',
      person_name: '',
      pipeline_org_name: '',
      pipeline_matched: 'manual',
      ...Object.fromEntries(PIPELINE_COLS.map((c) => [c, ''])),
      exported_at,
    });
    console.log(`  + included ${slug} (manual)`);
  }
} else {
  // --scope all: one row per canonical org (first matching pipeline row
  // attached), the event-based long tail included.
  const pipelineByOrg = new Map();
  for (const r of resolved) {
    if (r.slug && !pipelineByOrg.has(r.slug)) pipelineByOrg.set(r.slug, r);
  }
  outRows = orgs.map((o) => {
    const p = pipelineByOrg.get(o.slug);
    return {
      ...enrichmentFor(o),
      person_external_id: '',
      person_name: '',
      pipeline_org_name: p?.row['Prospect / Organization'] ?? '',
      pipeline_matched: p?.matched ?? 'none',
      ...Object.fromEntries(PIPELINE_COLS.map((c) => [c, p?.row[c] ?? ''])),
      exported_at,
    };
  });
  outRows.sort((a, b) =>
    (a.pipeline_matched === 'none') - (b.pipeline_matched === 'none') || a.name.localeCompare(b.name));
  unmatched = resolved.filter((r) => !r.slug).map((r) => r.row);
}

const HEADERS = [
  'external_id', 'name', 'conventional_name', 'aliases', 'domains', 'bucket', 'tags',
  ...Object.values(PROMOTED_KINDS), 'other_links', 'streams', 'stream_count', 'related_orgs',
  'person_external_id', 'person_name',
  'pipeline_org_name', 'pipeline_matched', ...PIPELINE_COLS, 'exported_at',
];

await mkdir(OUT_DIR, { recursive: true });
await writeCsv(join(OUT_DIR, 'orgs.csv'), HEADERS, outRows);
console.log(`wrote ${outRows.length} rows → ${join(OUT_DIR, 'orgs.csv')}`);

if (unmatched.length > 0) {
  const uHeaders = Object.keys(unmatched[0]);
  await writeCsv(join(OUT_DIR, 'unmatched-pipeline-rows.csv'), uHeaders, unmatched);
  console.log(`wrote ${unmatched.length} unmatched pipeline rows → ${join(OUT_DIR, 'unmatched-pipeline-rows.csv')}`);
}

const fuzzyCount = outRows.filter((r) => r.pipeline_matched === 'fuzzy').length;
console.log(`review: ${fuzzyCount} fuzzy pipeline matches flagged in pipeline_matched`);
await db.close();
