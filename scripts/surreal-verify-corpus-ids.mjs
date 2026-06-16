#!/usr/bin/env node
// ============================================================================
// surreal-verify-corpus-ids.mjs
//
// Walks every content_items row and confirms that the persons +
// organizations that reference its URL via personal_corpus / org_corpus
// arrays all carry the SAME content_id (the UUID v7 on the
// content_items row). This is the cross-doc consistency contract the
// person-enrichment surface relies on: same URL → same UUID →
// canonical-layer entities can find each other through the corpus.
//
// Exits 0 if everything matches; exits 1 with a diff report on any
// mismatch.
//
// Usage:
//   set -a; . ./.env; set +a
//   node scripts/surreal-verify-corpus-ids.mjs
// ============================================================================

import { Surreal } from 'surrealdb';

for (const k of ['SURREAL_URL', 'SURREAL_NS', 'SURREAL_DB', 'SURREAL_USER', 'SURREAL_PASS']) {
  if (!process.env[k]) { console.error(`missing env: ${k}`); process.exit(1); }
}

const db = new Surreal();
await db.connect(process.env.SURREAL_URL);
await db.signin({ username: process.env.SURREAL_USER, password: process.env.SURREAL_PASS });
await db.use({ namespace: process.env.SURREAL_NS, database: process.env.SURREAL_DB });
console.log(`connected: ${process.env.SURREAL_NS}/${process.env.SURREAL_DB}`);
console.log('');

// Ensure table + UNIQUE-on-url index exist. Idempotent — safe to run
// before any save has happened. Also guarantees the unique-by-URL
// invariant the cross-doc UUID contract relies on.
await db.query(`
  DEFINE TABLE IF NOT EXISTS content_items SCHEMALESS;
  DEFINE INDEX IF NOT EXISTS url ON content_items FIELDS url UNIQUE;
`);
console.log('table:  content_items SCHEMALESS');
console.log('index:  content_items.url UNIQUE');
console.log('');

// ----------------------------------------------------------------------------
// 1. Fetch every content_items row + every entity that references it.
// ----------------------------------------------------------------------------
const contentResult = await db.query('SELECT id, url, reference_count FROM content_items;');
const contents = (contentResult?.[0] || []);
console.log(`content_items rows: ${contents.length}`);

if (contents.length === 0) {
  console.log('no content_items yet — nothing to verify.');
  await db.close();
  process.exit(0);
}

// ----------------------------------------------------------------------------
// 2. For every content row, find every entity referring to its URL via
//    personal_corpus or org_corpus arrays, and compare ids.
// ----------------------------------------------------------------------------
let mismatches = 0;
const reports = [];

for (const c of contents) {
  const expectedId = String(c.id);
  const url = c.url;

  const personsRefs = await db.query(
    `SELECT id, full_name, personal_corpus[WHERE url = $url] AS refs
       FROM persons
       WHERE personal_corpus.*.url CONTAINS $url`,
    { url },
  );
  const orgsRefs = await db.query(
    `SELECT id, complete_name, org_corpus[WHERE url = $url] AS refs
       FROM organizations
       WHERE org_corpus.*.url CONTAINS $url`,
    { url },
  );

  const personRows = (personsRefs?.[0] || []);
  const orgRows    = (orgsRefs?.[0] || []);

  const referrerCount = personRows.reduce((n, r) => n + (r.refs?.length ?? 0), 0)
                      + orgRows.reduce((n, r) => n + (r.refs?.length ?? 0), 0);

  // Check every individual entry's content_id matches expectedId
  const bad = [];
  for (const p of personRows) {
    for (const e of (p.refs ?? [])) {
      if (String(e.content_id) !== expectedId) {
        bad.push({ holder: `persons:${p.id}`, full_name: p.full_name, entry_content_id: String(e.content_id) });
      }
    }
  }
  for (const o of orgRows) {
    for (const e of (o.refs ?? [])) {
      if (String(e.content_id) !== expectedId) {
        bad.push({ holder: `organizations:${o.id}`, complete_name: o.complete_name, entry_content_id: String(e.content_id) });
      }
    }
  }

  reports.push({
    content_id: expectedId,
    url,
    reference_count_field: c.reference_count,
    actual_referrers: referrerCount,
    mismatches: bad,
  });
  if (bad.length) mismatches += bad.length;
}

// ----------------------------------------------------------------------------
// 3. Report
// ----------------------------------------------------------------------------
console.log('');
console.log('per-content summary:');
for (const r of reports) {
  console.log(`  ${r.content_id}`);
  console.log(`    url: ${r.url}`);
  console.log(`    reference_count field: ${r.reference_count_field}`);
  console.log(`    actual_referrers: ${r.actual_referrers}`);
  if (r.mismatches.length === 0) {
    console.log(`    ✓ all referrers carry matching content_id`);
  } else {
    console.log(`    ✗ ${r.mismatches.length} mismatch(es):`);
    for (const m of r.mismatches) {
      console.log(`        - ${m.holder} (${m.full_name ?? m.complete_name ?? '—'}) carried content_id=${m.entry_content_id}`);
    }
  }
}

console.log('');
if (mismatches === 0) {
  console.log(`✓ all good — every personal_corpus + org_corpus entry shares the same UUID as its content_items row.`);
  await db.close();
  process.exit(0);
} else {
  console.log(`✗ ${mismatches} mismatch(es) found across ${reports.filter((r) => r.mismatches.length).length} content rows.`);
  await db.close();
  process.exit(1);
}
