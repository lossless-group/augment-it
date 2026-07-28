#!/usr/bin/env node
// ============================================================================
// push-mega-gift-targets-to-twenty.mjs
//
// Operator ask 2026-07-28: every funder created by the mega-gifts ingest
// becomes a Twenty OPPORTUNITY at stage "Target". Selector: SurrealDB orgs
// with source = 'mega-gifts-by-topic' (the ingest's stamp — mints + the
// ruled vehicle orgs). Companies are created first (idempotent by
// augmentItSlug), then one opportunity per funder, named "Mega Gifts July
// 2026", keyed augmentItRowName = "mega-gifts:<slug>". The "Target" stage
// option is created on opportunity.stage if absent.
//
// Usage:  set -a; source ./.env; set +a
//         node scripts/push-mega-gift-targets-to-twenty.mjs [--live]
// ============================================================================

import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';

const requireScripts = createRequire(new URL('./package.json', import.meta.url));
const { Surreal } = requireScripts('surrealdb');

const args = { live: false, envFile: '/Users/mpstaton/code/lossless-monorepo/self-host-stack/client-stacks/reach-edu/twenty/.env', baseUrl: 'https://twenty-server-production-7c98.up.railway.app' };
for (let i = 2; i < process.argv.length; i += 1) {
  if (process.argv[i] === '--live') args.live = true;
}

function readKey() {
  if (process.env.TWENTY_MCP_API_KEY) return process.env.TWENTY_MCP_API_KEY;
  if (existsSync(args.envFile)) {
    const m = /^TWENTY_MCP_API_KEY=(.+)$/m.exec(readFileSync(args.envFile, 'utf8'));
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}
const KEY = readKey();
const PACE_MS = 650;
let lastCall = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(method, path, body) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const wait = lastCall + PACE_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    const res = await fetch(`${args.baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* */ }
    if (res.status === 429 && attempt < 3) { await sleep(61_000); continue; }
    return { status: res.status, json, text };
  }
}
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

// ---- 1. The funder set from SurrealDB ----------------------------------------
const db = new Surreal();
await db.connect(process.env.SURREAL_URL);
await db.signin({ username: process.env.SURREAL_USER, password: process.env.SURREAL_PASS });
await db.use({ namespace: process.env.SURREAL_NS, database: process.env.SURREAL_DB });
const funders = (await db.query(
  `SELECT slug, complete_name, conventional_name, domains, org_links FROM organizations
     WHERE source = 'mega-gifts-by-topic' AND client_access CONTAINS 'reach-edu';`,
))?.[0] ?? [];
await db.close();
console.log(`mega-gifts funders in SurrealDB: ${funders.length}`);
for (const f of funders) console.log('  -', f.slug);

// ---- 2. Twenty state ---------------------------------------------------------
const probe = await api('GET', '/rest/companies?limit=1');
if (probe.status === 401) { console.log('✗ API key rejected — mint/update the key first.'); process.exit(1); }

const meta = await api('GET', '/rest/metadata/objects');
const objects = meta.json?.data?.objects ?? meta.json?.data ?? [];
const oppObj = objects.find((o) => (o.nameSingular ?? o.name) === 'opportunity');
const stageField = (oppObj?.fields ?? []).find((f) => f.name === 'stage');
let target = (stageField?.options ?? []).find((o) => /^target$/i.test(String(o.label ?? o.value)));
console.log(`stage options: [${(stageField?.options ?? []).map((o) => o.label ?? o.value).join(', ')}]`);
if (!target) {
  console.log('  "Target" option missing — will create it on opportunity.stage');
  if (args.live) {
    const maxPos = Math.max(0, ...(stageField.options ?? []).map((o) => o.position ?? 0));
    const newOptions = [
      ...(stageField.options ?? []),
      { value: 'TARGET', label: 'Target', position: maxPos + 1, color: 'blue' },
    ];
    const r = await api('PATCH', `/rest/metadata/fields/${stageField.id}`, { options: newOptions });
    if (r.status >= 300) { console.log(`✗ could not add stage option: ${r.status} ${r.text.slice(0, 200)}\n  → add "Target" in Settings → Data model → Opportunity → Stage, then re-run.`); process.exit(1); }
    target = { value: 'TARGET', label: 'Target' };
    console.log('  created stage option Target');
  }
}

const liveCompanies = await fetchAll('companies');
const companyBySlug = new Map(liveCompanies.filter((c) => c.augmentItSlug).map((c) => [c.augmentItSlug, c]));
const liveOpps = await fetchAll('opportunities');
const oppKeys = new Set(liveOpps.map((o) => o.augmentItRowName).filter(Boolean));

const missingCompanies = funders.filter((f) => !companyBySlug.has(f.slug));
const missingOpps = funders.filter((f) => !oppKeys.has(`mega-gifts:${f.slug}`));
console.log(`companies to create: ${missingCompanies.length} · opportunities to create: ${missingOpps.length}`);

if (!args.live) { console.log('\nDRY-RUN — nothing written. Re-run with --live.'); process.exit(0); }

// ---- 3. Companies ------------------------------------------------------------
let cCreated = 0;
for (const f of missingCompanies) {
  const website = (f.org_links ?? []).find((l) => l.kind === 'website')?.url;
  const domain = (f.domains ?? []).map((d) => d.domain).filter(Boolean)[0]
    ?? (website ? (() => { try { return new URL(website).hostname.replace(/^www\./, ''); } catch { return null; } })() : null);
  const linkedin = (f.org_links ?? []).find((l) => l.kind === 'linkedin_company')?.url;
  const body = {
    name: f.complete_name ?? f.conventional_name ?? f.slug,
    augmentItSlug: f.slug,
    ...(domain ? { domainName: { primaryLinkUrl: `https://${domain}` } } : {}),
    ...(linkedin ? { linkedinLink: { primaryLinkUrl: linkedin } } : {}),
  };
  let r = await api('POST', '/rest/companies', body);
  if (r.status === 400 && /duplicate/i.test(r.text) && body.domainName) {
    const { domainName, ...noDomain } = body;
    r = await api('POST', '/rest/companies', noDomain);
  }
  const rec = r.json?.data?.createCompany ?? r.json?.data ?? null;
  if (r.status < 300 && rec?.id) { companyBySlug.set(f.slug, rec); cCreated += 1; }
  else console.log(`  ✗ company ${f.slug}: ${r.status} ${r.text.slice(0, 120)}`);
}
console.log(`companies: created ${cCreated}, pre-existing ${funders.length - missingCompanies.length}`);

// ---- 4. Opportunities at Target ----------------------------------------------
let oCreated = 0, oFailed = 0;
for (const f of missingOpps) {
  const companyId = companyBySlug.get(f.slug)?.id;
  const r = await api('POST', '/rest/opportunities', {
    name: 'Mega Gifts July 2026',
    stage: target.value,
    ...(companyId ? { companyId } : {}),
    augmentItRowName: `mega-gifts:${f.slug}`,
  });
  if (r.status < 300) oCreated += 1;
  else { oFailed += 1; console.log(`  ✗ opportunity ${f.slug}: ${r.status} ${r.text.slice(0, 120)}`); }
}
console.log(`opportunities: created ${oCreated}, failed ${oFailed}, pre-existing ${funders.length - missingOpps.length}`);
