#!/usr/bin/env node
// ============================================================================
// import-crm-starter-to-twenty.mjs
//
// Phase 3 of context-v/plans/CRM-Starter-Export-Orgs-Then-People.md: batch
// insertion of the CRM starter CSVs into reach-edu's self-hosted Twenty.
//
// Discipline (house import rules): idempotent + additive + dry-run-first.
//   - External ids ride custom fields (companies.augmentItSlug,
//     people.augmentItPersonUuid) so re-runs UPDATE-nothing/CREATE-missing
//     instead of duplicating. v1 is create-missing only — existing records
//     are reported, never patched (additive enrichment; no clobber).
//   - --dry-run (the default) writes NOTHING. With a valid key it also
//     diffs against the live instance; without one it prints the offline
//     mapping so the operator can review before the key exists.
//   - Opportunities (pipeline Stage/commitments as Twenty opportunity
//     records) are PRINTED as a proposal in dry-run; creation is gated
//     behind --with-opportunities pending the operator's ruling.
//
// Usage:
//   node scripts/import-crm-starter-to-twenty.mjs \
//     [--dir clients/reach-edu/outputs/<date>_crm-starter] \
//     [--env-file <path to twenty/.env with TWENTY_MCP_API_KEY>] \
//     [--base-url https://twenty-server-production-7c98.up.railway.app] \
//     [--live]                (default: dry-run)
//     [--with-opportunities]  (only with --live, after the ruling)
// ============================================================================

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// ---- args -------------------------------------------------------------------
const args = {
  dir: 'clients/reach-edu/outputs/2026-07-28_crm-starter',
  envFile: '/Users/mpstaton/code/lossless-monorepo/self-host-stack/client-stacks/reach-edu/twenty/.env',
  baseUrl: 'https://twenty-server-production-7c98.up.railway.app',
  live: false,
  withOpportunities: false,
};
for (let i = 2; i < process.argv.length; i += 1) {
  const k = process.argv[i];
  if (k === '--dir') args.dir = process.argv[++i];
  else if (k === '--env-file') args.envFile = process.argv[++i];
  else if (k === '--base-url') args.baseUrl = process.argv[++i];
  else if (k === '--live') args.live = true;
  else if (k === '--with-opportunities') args.withOpportunities = true;
  else if (k === '--dry-run') args.live = false;
}

// ---- key --------------------------------------------------------------------
function readKey() {
  if (process.env.TWENTY_MCP_API_KEY) return process.env.TWENTY_MCP_API_KEY;
  if (existsSync(args.envFile)) {
    const m = /^TWENTY_MCP_API_KEY=(.+)$/m.exec(readFileSync(args.envFile, 'utf8'));
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}
const KEY = readKey();

async function api(method, path, body) {
  const res = await fetch(`${args.baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* leave null */ }
  return { status: res.status, json, text };
}

// ---- csv --------------------------------------------------------------------
function parseCsv(path) {
  const text = readFileSync(path, 'utf8');
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
  return data
    .filter((r) => r.length > 1)
    .map((r) => Object.fromEntries(h.map((c, i) => [c, r[i] ?? ''])));
}

const DIR = resolve(args.dir);
const orgRows = parseCsv(`${DIR}/orgs.csv`);
const peopleRows = parseCsv(`${DIR}/people.csv`);

// ---- shape companies (dedupe by external_id — multi-deal rows share one org)
const companiesBySlug = new Map();
for (const r of orgRows) {
  if (!r.external_id || companiesBySlug.has(r.external_id)) continue;
  // Guard: the canonical layer contains at least one literal "unknown"
  // website value — bad URLs surface as blank domains, never crashes.
  let domain = (r.domains || '').split(' | ')[0];
  if (!domain && r.website) {
    try { domain = new URL(r.website).hostname.replace(/^www\./, ''); } catch { /* blank */ }
  }
  companiesBySlug.set(r.external_id, {
    name: r.name || r.external_id,
    domainName: domain ? { primaryLinkUrl: `https://${domain}` } : undefined,
    linkedinLink: r.linkedin ? { primaryLinkUrl: r.linkedin } : undefined,
    xLink: r.x ? { primaryLinkUrl: r.x } : undefined,
    augmentItSlug: r.external_id,
  });
}

// ---- shape people ------------------------------------------------------------
const people = peopleRows.map((r) => {
  const nameParts = (r.name || '').split(' ');
  return {
    name: {
      firstName: r.first_name || nameParts[0] || '',
      lastName: r.surname || nameParts.slice(1).join(' ') || '',
    },
    emails: r.email ? { primaryEmail: r.email } : undefined,
    linkedinLink: r.linkedin ? { primaryLinkUrl: r.linkedin } : undefined,
    jobTitle: r.role || undefined,
    augmentItPersonUuid: r.external_id,
    _org_slug: r.org_external_id || null, // resolved to companyId at import
    _org_name: r.org_name || null,
  };
});

// ---- opportunity proposal (per pipeline row with deal columns) ---------------
const opportunities = orgRows
  .filter((r) => r.Stage || r['Total Commitment ($)'])
  .map((r) => ({
    name: r.pipeline_org_name || r.name,
    stage: r.Stage,
    amount: r['Total Commitment ($)'],
    company_slug: r.external_id || null,
    person_uuid: r.person_external_id || null,
    owner: r.Owner,
  }));

// ---- stage census — Twenty's opportunity.stage is a SELECT: every distinct
// tracker stage must exist as an option BEFORE an opportunity can carry it
// (operator requirement 2026-07-28). Options are ensured in the live
// opportunities pass, ahead of record creation.
const stageCensus = new Map();
for (const o of opportunities) {
  if (o.stage) stageCensus.set(o.stage, (stageCensus.get(o.stage) ?? 0) + 1);
}

// ---- report ------------------------------------------------------------------
console.log(`\n=== CRM starter import ${args.live ? 'LIVE' : 'DRY-RUN'} ===`);
console.log(`source: ${DIR}`);
console.log(`companies to consider: ${companiesBySlug.size} (deduped from ${orgRows.length} org rows)`);
console.log(`people to consider:    ${people.length}`);
console.log(`opportunity rows (proposal${args.withOpportunities ? ', ENABLED' : ' only — gated behind --with-opportunities'}): ${opportunities.length}`);
console.log('\nfield mapping (companies): name, domainName←domains/website, linkedinLink, xLink, augmentItSlug←external_id (custom TEXT)');
console.log('field mapping (people):    name←first/surname, emails←email, linkedinLink, jobTitle←role, augmentItPersonUuid←external_id (custom TEXT), company←org_external_id');
console.log('NOT imported (stays in augment-it): streams, tags, relations, corpus, other_links — candidates for attached notes in a later pass.');
console.log(`\ntracker stages (${stageCensus.size} distinct — must exist as opportunity.stage SELECT options before opportunities import):`);
for (const [s, n] of [...stageCensus.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)} · ${s}`);
}

const sample = [...companiesBySlug.values()][0];
console.log('\nsample company:', JSON.stringify(sample));
console.log('sample person: ', JSON.stringify({ ...people[0], _org_slug: people[0]?._org_slug }));
console.log('sample opportunity proposal:', JSON.stringify(opportunities[0]));

// ---- online half -------------------------------------------------------------
if (!KEY) {
  console.log('\n⚠ no TWENTY_MCP_API_KEY found — offline dry-run only.');
  process.exit(0);
}
const probe = await api('GET', '/rest/companies?limit=1');
if (probe.status === 401) {
  console.log(`\n⚠ API key rejected (401${probe.json?.messages ? ': ' + probe.json.messages.join('; ') : ''}) — offline dry-run only.`);
  console.log('  Mint a durable key: reach-edu Twenty → Settings → APIs (NOT the playground), then update TWENTY_MCP_API_KEY in');
  console.log(`  ${args.envFile}`);
  process.exit(args.live ? 1 : 0);
}
console.log('\n✓ API key valid — inspecting instance…');

// 1. Custom fields.
const meta = await api('GET', '/rest/metadata/objects');
const objects = meta.json?.data?.objects ?? meta.json?.data ?? [];
const findObj = (n) => objects.find((o) => (o.nameSingular ?? o.name) === n);
const companyObj = findObj('company');
const personObj = findObj('person');
if (!companyObj || !personObj) {
  console.log('⚠ could not read object metadata; raw status', meta.status, '— aborting before any write.');
  process.exit(1);
}
const hasField = (obj, name) => (obj.fields ?? []).some((f) => f.name === name);
const wantFields = [
  [companyObj, 'augmentItSlug', 'Augment-It Slug'],
  [personObj, 'augmentItPersonUuid', 'Augment-It Person UUID'],
];
for (const [obj, name, label] of wantFields) {
  if (hasField(obj, name)) {
    console.log(`  custom field ${name}: exists`);
  } else if (args.live) {
    const r = await api('POST', '/rest/metadata/fields', {
      objectMetadataId: obj.id, name, label, type: 'TEXT',
    });
    console.log(`  custom field ${name}: ${r.status < 300 ? 'CREATED' : 'FAILED ' + r.status + ' ' + r.text.slice(0, 120)}`);
    if (r.status >= 300) process.exit(1);
  } else {
    console.log(`  custom field ${name}: MISSING — would create (TEXT) on ${obj.nameSingular ?? obj.name}`);
  }
}

// 1b. Opportunity stage options — diff the census against the live SELECT.
const oppObj = findObj('opportunity');
if (oppObj) {
  const stageField = (oppObj.fields ?? []).find((f) => f.name === 'stage');
  const liveOptions = (stageField?.options ?? []).map((o) => o.label ?? o.value);
  const missing = [...stageCensus.keys()].filter(
    (s) => !liveOptions.some((o) => String(o).toLowerCase() === s.toLowerCase()),
  );
  console.log(`  opportunity.stage options live: [${liveOptions.join(', ')}]`);
  if (missing.length) {
    console.log(`  MISSING stage options (created ahead of opportunities when --live --with-opportunities): ${missing.join(' · ')}`);
  } else {
    console.log('  all tracker stages present as options');
  }
}

// 2. Existing records, indexed by external id (fallback: name).
async function fetchAll(object) {
  const out = [];
  let after = '';
  for (let page = 0; page < 50; page += 1) {
    const r = await api('GET', `/rest/${object}?limit=60${after}`);
    const arr = r.json?.data?.[object] ?? [];
    out.push(...arr);
    const cursor = r.json?.pageInfo?.endCursor;
    if (!cursor || arr.length < 60) break;
    after = `&starting_after=${encodeURIComponent(cursor)}`;
  }
  return out;
}
const liveCompanies = await fetchAll('companies');
const livePeople = await fetchAll('people');
console.log(`  live instance: ${liveCompanies.length} companies, ${livePeople.length} people`);
const liveCompanyBySlug = new Map(liveCompanies.filter((c) => c.augmentItSlug).map((c) => [c.augmentItSlug, c]));
const liveCompanyByName = new Map(liveCompanies.map((c) => [String(c.name ?? '').toLowerCase(), c]));
const livePersonByUuid = new Map(livePeople.filter((p) => p.augmentItPersonUuid).map((p) => [p.augmentItPersonUuid, p]));

const newCompanies = [...companiesBySlug.values()].filter(
  (c) => !liveCompanyBySlug.has(c.augmentItSlug) && !liveCompanyByName.has(c.name.toLowerCase()),
);
const newPeople = people.filter((p) => !livePersonByUuid.has(p.augmentItPersonUuid));
console.log(`  to create: ${newCompanies.length} companies, ${newPeople.length} people (rest already present — skipped, never patched)`);

if (!args.live) {
  console.log('\nDRY-RUN complete — nothing written. Re-run with --live to import.');
  process.exit(0);
}

// 3. Create companies.
const slugToId = new Map([...liveCompanyBySlug.entries()].map(([s, c]) => [s, c.id]));
let created = 0, failed = 0;
for (const c of newCompanies) {
  const body = Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined));
  const r = await api('POST', '/rest/companies', body);
  const rec = r.json?.data?.createCompany ?? r.json?.data ?? null;
  if (r.status < 300 && rec?.id) {
    slugToId.set(c.augmentItSlug, rec.id);
    created += 1;
  } else {
    failed += 1;
    console.log(`  ✗ company ${c.augmentItSlug}: ${r.status} ${r.text.slice(0, 140)}`);
  }
}
console.log(`companies: created ${created}, failed ${failed}, pre-existing ${companiesBySlug.size - newCompanies.length}`);

// 4. Create people (company attach by slug, fallback name).
let pCreated = 0, pFailed = 0, pUnattached = 0;
for (const p of newPeople) {
  const companyId = p._org_slug
    ? (slugToId.get(p._org_slug) ?? liveCompanyByName.get((p._org_name ?? '').toLowerCase())?.id ?? null)
    : null;
  if (p._org_slug && !companyId) pUnattached += 1;
  const body = Object.fromEntries(
    Object.entries({ ...p, companyId: companyId ?? undefined, _org_slug: undefined, _org_name: undefined })
      .filter(([, v]) => v !== undefined),
  );
  const r = await api('POST', '/rest/people', body);
  if (r.status < 300) pCreated += 1;
  else {
    pFailed += 1;
    console.log(`  ✗ person ${p.name.firstName} ${p.name.lastName}: ${r.status} ${r.text.slice(0, 140)}`);
  }
}
console.log(`people: created ${pCreated}, failed ${pFailed}, pre-existing ${people.length - newPeople.length}, attach-misses ${pUnattached}`);
console.log('\nVERIFY: spot-check five companies for link fidelity, three multi-affiliation people, then re-run this script — it should report 0 to create (the external-id round-trip proof).');
if (args.withOpportunities) {
  console.log('⚠ --with-opportunities: NOT implemented until the operator rules opportunities-vs-company-fields at dry-run review.');
}
