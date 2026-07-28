#!/usr/bin/env node
// ============================================================================
// tag-funder-strategies-from-mega-gifts.mjs
//
// Backfills strategy tags onto funder orgs from the mega-gifts CSV
// (operator ask 2026-07-28): each funder gets the Train-Case form of every
// strategy its gift rows referenced (ballmer-group ← Workforce-Development).
//
// Resolution is derived from what the ingest ACTUALLY wrote — an org is a
// row's funder iff the row's source_url sits on that org's corpus — so no
// name re-matching and no drift from the reviewed OVERRIDES table.
// organization.tag.add is idempotent (created:false on repeats); re-runs
// are free. Tags land in tag_vocab, the workbench card, and the CRM
// export's tags column.
//
// Usage:  set -a; source ./.env; set +a
//         node scripts/tag-funder-strategies-from-mega-gifts.mjs [--live]
// ============================================================================

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const requireScripts = createRequire(new URL('./package.json', import.meta.url));
const requireServices = createRequire(new URL('../services/social-search/package.json', import.meta.url));
const { Surreal } = requireScripts('surrealdb');
const { connect } = requireServices('@nats-io/transport-node');

const args = { csv: 'clients/reach-edu/outputs/2026-07-28_mega-gifts-by-topic/mega-gifts-by-topic.csv', client: 'reach-edu', live: false };
for (let i = 2; i < process.argv.length; i += 1) {
  if (process.argv[i] === '--live') args.live = true;
  else if (process.argv[i] === '--csv') args.csv = process.argv[++i];
}

// slug → Train-Case tag (acronyms uppercase per the house tagging rule).
const ACRONYMS = new Set(['ncad', 'ai']);
const trainCase = (slug) =>
  slug.split('-').map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join('-');

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

// url → org slugs, from the live corpus (what the ingest wrote).
const db = new Surreal();
await db.connect(process.env.SURREAL_URL);
await db.signin({ username: process.env.SURREAL_USER, password: process.env.SURREAL_PASS });
await db.use({ namespace: process.env.SURREAL_NS, database: process.env.SURREAL_DB });
const orgs = (await db.query(
  `SELECT slug, org_corpus FROM organizations WHERE client_access CONTAINS $client;`,
  { client: args.client },
))?.[0] ?? [];
await db.close();
const slugsByUrl = new Map();
for (const o of orgs) {
  for (const e of o.org_corpus ?? []) {
    if (!e.url) continue;
    slugsByUrl.set(e.url, [...(slugsByUrl.get(e.url) ?? []), o.slug]);
  }
}

// funder slug → set of strategy tags.
const tagsBySlug = new Map();
for (const r of rows) {
  const slugs = slugsByUrl.get(r.source_url) ?? [];
  const tags = r.strategy_slugs.split(/[|;,]/).map((x) => x.trim()).filter(Boolean).map(trainCase);
  for (const slug of slugs) {
    const set = tagsBySlug.get(slug) ?? new Set();
    for (const t of tags) set.add(t);
    tagsBySlug.set(slug, set);
  }
}
console.log(`funders to tag: ${tagsBySlug.size}`);
for (const [slug, tags] of [...tagsBySlug.entries()].sort()) console.log(`  ${slug} ← ${[...tags].join(', ')}`);

if (!args.live) { console.log('\nDRY-RUN — nothing written. Re-run with --live.'); process.exit(0); }

const nc = await connect({ servers: process.env.NATS_URL ?? 'nats://localhost:4222' });
const req = async (s, b) => JSON.parse(new TextDecoder().decode((await nc.request(s, JSON.stringify(b), { timeout: 20_000 })).data));
let added = 0, existed = 0, failed = 0;
for (const [slug, tags] of tagsBySlug) {
  for (const tag of tags) {
    const r = await req('organization.tag.add.requested', { org_slug: slug, tag, client: args.client });
    if (r.ok && r.created) added += 1;
    else if (r.ok) existed += 1;
    else { failed += 1; console.log(`  ✗ ${slug} ← ${tag}: ${r.error}`); }
  }
}
console.log(`\ntags added: ${added} · already present: ${existed} · failures: ${failed}`);
await nc.drain();
