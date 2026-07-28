#!/usr/bin/env node
// ============================================================================
// ingest-mega-gifts-by-topic.mjs
//
// Files the mega-gifts-by-topic CSV (operator ask 2026-07-28) into the
// canonical layer, three guarantees per row:
//   1. the funder EXISTS as an organization (alias-aware match first — the
//      bhef/donorstrust lesson — mint only on a true miss, long-form slug)
//   2. the source article is registered on the funder's org corpus
//      (organization.corpus.add — dedup-by-URL server-side)
//   3. the source article is registered on each strategy corpus named in
//      strategy_slugs (source.add — slugs VALIDATED against the live
//      domain list, never fabricated)
//
// DB-side only, deliberately: another session captured the article bodies
// into the inbox; the disk merge into folders is the triage lane's job
// (and merged sources must never be source.fetch'd — registry gotcha).
//
// Usage:
//   set -a; source ./.env; set +a
//   node scripts/ingest-mega-gifts-by-topic.mjs [--csv <path>] [--live]
// ============================================================================

import { createRequire } from 'node:module';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const requireScripts = createRequire(new URL('./package.json', import.meta.url));
const requireServices = createRequire(new URL('../services/social-search/package.json', import.meta.url));
const { Surreal } = requireScripts('surrealdb');
const { connect } = requireServices('@nats-io/transport-node');

const args = { csv: 'clients/reach-edu/outputs/2026-07-28_mega-gifts-by-topic/mega-gifts-by-topic.csv', client: 'reach-edu', live: false };
for (let i = 2; i < process.argv.length; i += 1) {
  const k = process.argv[i];
  if (k === '--csv') args.csv = process.argv[++i];
  else if (k === '--client') args.client = process.argv[++i];
  else if (k === '--live') args.live = true;
}

// ---- csv parse ----------------------------------------------------------------
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
  if (row.length > 1) rows.push(row);
  const [h, ...data] = rows;
  return data.filter((r) => r.length > 1).map((r) => Object.fromEntries(h.map((c, i) => [c, (r[i] ?? '').trim()])));
}
const rows = parseCsv(resolve(args.csv));
console.log(`rows: ${rows.length}`);

// ---- org matching (the export script's alias-aware family) --------------------
const normName = (s) => String(s ?? '').replace(/\(.*?\)/g, ' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const db = new Surreal();
await db.connect(process.env.SURREAL_URL);
await db.signin({ username: process.env.SURREAL_USER, password: process.env.SURREAL_PASS });
await db.use({ namespace: process.env.SURREAL_NS, database: process.env.SURREAL_DB });
const orgs = (await db.query(
  `SELECT slug, complete_name, conventional_name, aliases FROM organizations WHERE client_access CONTAINS $client;`,
  { client: args.client },
))?.[0] ?? [];
await db.close();

const byNorm = new Map();
for (const o of orgs) {
  for (const cand of [o.complete_name, o.conventional_name, o.slug.replace(/-/g, ' '), ...(o.aliases ?? [])]) {
    const n = normName(cand);
    if (n && !byNorm.has(n)) byNorm.set(n, o.slug);
  }
}
const orgNorms = Array.from(byNorm.keys());
function matchOrg(name) {
  const variants = new Set([normName(name)]);
  for (const part of String(name).split('/')) variants.add(normName(part));
  for (const v of Array.from(variants)) {
    const toks = v.split(' ');
    for (let d = 1; d <= 4 && toks.length - d >= 1; d += 1) variants.add(toks.slice(0, toks.length - d).join(' '));
  }
  for (const v of variants) if (byNorm.has(v)) return byNorm.get(v);
  for (const v of variants) {
    const minLen = v.includes(' ') ? 5 : 8;
    if (v.length < minLen) continue;
    const hits = orgNorms.filter((n) => n.startsWith(v + ' '));
    if (hits.length === 1) return byNorm.get(hits[0]);
  }
  return null;
}

// ---- NATS ---------------------------------------------------------------------
const nc = await connect({ servers: process.env.NATS_URL ?? 'nats://localhost:4222' });
const req = async (s, b, t = 30_000) =>
  JSON.parse(new TextDecoder().decode((await nc.request(s, JSON.stringify(b), { timeout: t })).data));

// ---- strategy validation (never fabricate a domain slug) ----------------------
const dl = await req('domain.list.requested', { client_slug: args.client });
const liveStrategies = new Set((dl.domains ?? []).filter((d) => (d.domain_type ?? d.type) === 'strategy').map((d) => d.domain_slug ?? d.slug));

// ---- overrides — operator-ruled resolutions for every tricky cell (multi-
// funder consortia split to components; person-anchored giving mapped to
// the ruled vehicle orgs; false-match traps pinned). Reviewed 2026-07-28.
const OVERRIDES = {
  'New York State': [{ mint: 'New York State' }], // the new-york-times prefix trap
  'U.S. Department of Labor': [{ slug: 'us-department-of-labor' }],
  'Bill & Melinda Gates Foundation': [{ slug: 'the-gates-foundation' }],
  'Carnegie Foundation for the Advancement of Teaching and College Board': [
    { slug: 'carnegie-foundation-for-the-advancement-of-teaching' }, { slug: 'college-board' }],
  'Connect Humanity / Microsoft / Appalachian Community Capital': [
    { mint: 'Connect Humanity' }, { slug: 'microsoft' }, { mint: 'Appalachian Community Capital' }],
  'Microsoft, OpenAI, Anthropic': [{ slug: 'microsoft' }, { mint: 'OpenAI' }, { mint: 'Anthropic' }],
  'Ballmer Group, Gates Foundation, Stand Together, Valhalla Foundation, John Overdeck': [
    { slug: 'ballmer-group' }, { slug: 'the-gates-foundation' }, { mint: 'Stand Together' },
    { mint: 'Valhalla Foundation' }, { skip: 'John Overdeck — person, no ruled vehicle yet' }],
  'Ford, MacArthur, Mellon, Omidyar, Lumina, Doris Duke, Kapor, Mozilla, Packard, Siegel Family Endowment': [
    { mint: 'Ford Foundation' }, { mint: 'MacArthur Foundation' }, { mint: 'Mellon Foundation' },
    { mint: 'Omidyar Network' }, { slug: 'lumina-foundation' }, { mint: 'Doris Duke Foundation' },
    { mint: 'Kapor Foundation' }, { mint: 'Mozilla Foundation' }, { mint: 'Packard Foundation' },
    { mint: 'Siegel Family Endowment' }],
  'ADQ + Gates Foundation': [{ mint: 'ADQ' }, { slug: 'the-gates-foundation' }],
  'Wells Fargo / Wells Fargo Foundation': [{ mint: 'Wells Fargo Foundation' }],
  'David M. Rubenstein / Library of Congress': [{ slug: 'declaration-partners' }],
  'Ballmer Group and Ralph C. Wilson Jr. Foundation': [
    { slug: 'ballmer-group' }, { mint: 'Ralph C. Wilson Jr. Foundation' }],
  'Commonwealth of Pennsylvania (Shapiro Administration)': [{ mint: 'Commonwealth of Pennsylvania' }],
  'ProLiteracy (Nora Roberts Foundation-backed)': [{ mint: 'ProLiteracy' }],
  'Goldman Sachs (10,000 Small Businesses)': [{ mint: 'Goldman Sachs' }],
  'Invest Appalachia (multiple foundation LPs)': [{ mint: 'Invest Appalachia' }],
};

// ---- census -------------------------------------------------------------------
const knownSlugs = new Set(orgs.map((o) => o.slug));
const funders = new Map(); // funder cell -> { targets: [{slug}|{mint}|{skip}], rows: [] }
const badStrategies = new Set();
const badOverrideSlugs = new Set();
for (const r of rows) {
  let f = funders.get(r.funder);
  if (!f) {
    let targets;
    if (OVERRIDES[r.funder]) {
      targets = OVERRIDES[r.funder];
      for (const t of targets) if (t.slug && !knownSlugs.has(t.slug)) badOverrideSlugs.add(t.slug);
    } else {
      const m = matchOrg(r.funder);
      targets = m ? [{ slug: m }] : [{ mint: r.funder }];
    }
    f = { targets, rows: [] };
    funders.set(r.funder, f);
  }
  f.rows.push(r);
  for (const s of r.strategy_slugs.split(/[|;,]/).map((x) => x.trim()).filter(Boolean)) {
    if (!liveStrategies.has(s)) badStrategies.add(s);
  }
}
if (badOverrideSlugs.size) {
  console.log(`✗ override references unknown slugs (aborting): ${[...badOverrideSlugs].join(', ')}`);
  await nc.drain();
  process.exit(1);
}
const mintNames = new Set();
let matchedCount = 0, overrideCount = 0, skipCount = 0;
for (const [name, f] of funders) {
  const via = OVERRIDES[name] ? 'override' : 'match';
  if (OVERRIDES[name]) overrideCount += 1;
  for (const t of f.targets) {
    if (t.mint) mintNames.add(t.mint);
    else if (t.skip) skipCount += 1;
    else matchedCount += 1;
  }
  console.log(`  ${via === 'override' ? '⊙' : '='} ${name} → ${f.targets.map((t) => t.slug ?? (t.mint ? 'MINT:' + t.mint : 'SKIP')).join(' + ')}`);
}
console.log(`funders: ${funders.size} distinct cells — ${matchedCount} slug targets, ${mintNames.size} distinct mints, ${skipCount} skips, ${overrideCount} override cells`);
if (badStrategies.size) {
  console.log(`✗ UNKNOWN strategy slugs (aborting — never fabricate): ${[...badStrategies].join(', ')}`);
  await nc.drain();
  process.exit(1);
}
console.log(`strategies referenced: all valid (${[...new Set(rows.flatMap((r) => r.strategy_slugs.split(/[|;,]/).map((x) => x.trim()).filter(Boolean)))].join(', ')})`);
console.log(`distinct source urls: ${new Set(rows.map((r) => r.source_url)).size}`);

if (!args.live) {
  console.log('\nDRY-RUN — nothing written. Re-run with --live.');
  await nc.drain();
  process.exit(0);
}

// ---- execute ------------------------------------------------------------------
// 1. Mint missing funders once each (deduped across cells).
const mintedSlug = new Map();
for (const name of mintNames) {
  const r = await req('person.affiliate.requested', { org_action: 'create', org_name: name, client: args.client, source: 'mega-gifts-by-topic' });
  if (r.ok) { mintedSlug.set(name, r.org_slug); console.log(`  minted ${name} → ${r.org_slug}`); }
  else console.log(`  ✗ mint ${name}: ${r.error}`);
}
const slugsFor = (cell) =>
  (funders.get(cell)?.targets ?? [])
    .map((t) => t.slug ?? (t.mint ? mintedSlug.get(t.mint) : null))
    .filter(Boolean);

// Inbox index — the other session captured article bodies here; after
// registering, the Surreal uuids get stamped into each file's frontmatter
// (operator ask 2026-07-28) so the triage merge becomes a lookup.
const INBOX = resolve(`clients/${args.client}/corpus/inbox`);
const normUrl = (u) => String(u ?? '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '').replace(/#.*$/, '');
const inboxByUrl = new Map();
for (const dir of [INBOX, join(INBOX, 'gated')]) {
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.md')) continue;
    const path = join(dir, f);
    const head = readFileSync(path, 'utf8').slice(0, 2000);
    const url = /^(?:exact_url|url): *"?([^"\n]+)"?/m.exec(head)?.[1];
    if (url) inboxByUrl.set(normUrl(url), path);
  }
}
console.log(`inbox files indexed by url: ${inboxByUrl.size}`);
function stampFrontmatter(path, sets) {
  let text = readFileSync(path, 'utf8');
  const end = text.indexOf('\n---', 4);
  if (!text.startsWith('---') || end === -1) return false;
  let fm = text.slice(0, end + 1);
  const body = text.slice(end + 1);
  for (const [key, value] of Object.entries(sets)) {
    if (value === undefined || value === null || value === '') continue;
    const line = `${key}: ${JSON.stringify(String(value))}`;
    const re = new RegExp(`^${key}: .*$`, 'm');
    fm = re.test(fm) ? fm.replace(re, line) : fm + line + '\n';
  }
  writeFileSync(path, fm + body);
  return true;
}

// 2 + 3. Per row: org corpus + strategy corpora, then frontmatter stamps.
let orgAdds = 0, stratAdds = 0, fails = 0, stamped = 0, noFile = 0;
const stampsByUrl = new Map(); // url -> { source_uuid, org_slugs: [], content_uuid }
for (const r of rows) {
  const stamp = stampsByUrl.get(r.source_url) ?? { org_slugs: [] };
  for (const slug of slugsFor(r.funder)) {
    if (!r.source_url) continue;
    const a = await req('organization.corpus.add.requested', { org_slug: slug, url: r.source_url, client: args.client });
    if (a.ok) {
      orgAdds += 1;
      stamp.org_slugs.push(slug);
      const cid = /u"([0-9a-f-]+)"/.exec(String(a.entry?.content_id ?? ''))?.[1];
      if (cid && !stamp.content_uuid) stamp.content_uuid = cid;
    } else { fails += 1; console.log(`  ✗ corpus ${slug} ← ${r.source_url.slice(0, 60)}: ${a.error}`); }
  }
  for (const s of r.strategy_slugs.split(/[|;,]/).map((x) => x.trim()).filter(Boolean)) {
    const sa = await req('source.add.requested', { url: r.source_url, domain_type: 'strategy', domain_slug: s, client_slug: args.client });
    if (sa.ok) {
      stratAdds += 1;
      if (sa.source?.source_uuid && !stamp.source_uuid) stamp.source_uuid = sa.source.source_uuid;
    } else { fails += 1; console.log(`  ✗ source.add ${s} ← ${r.source_url.slice(0, 60)}: ${sa.error}`); }
  }
  stampsByUrl.set(r.source_url, stamp);
}
for (const [url, s] of stampsByUrl) {
  const file = inboxByUrl.get(normUrl(url));
  if (!file) { noFile += 1; continue; }
  const ok = stampFrontmatter(file, {
    source_uuid: s.source_uuid,
    content_uuid: s.content_uuid,
    org_slugs: s.org_slugs.length ? [...new Set(s.org_slugs)].join(', ') : undefined,
  });
  if (ok) stamped += 1;
}
console.log(`\norg corpus adds: ${orgAdds} · strategy source adds: ${stratAdds} · failures: ${fails}`);
console.log(`frontmatter stamped: ${stamped} inbox files · ${noFile} urls with no inbox capture (gated or never fetched)`);
console.log('NOTE: DB registration + uuid stamps only. The disk merge into folders is the triage lane (and merged sources must NOT be re-fetched).');
await nc.drain();
