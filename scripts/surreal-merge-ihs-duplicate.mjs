#!/usr/bin/env node
// ============================================================================
// surreal-merge-ihs-duplicate.mjs
//
// One-shot consolidation of the duplicate "The Institute for Humane Studies"
// org row into the canonical "Institute for Humane Studies" row. Both rows
// existed because the slugifier preserved the leading "The" — that bug is
// being patched separately; this script cleans up the data that already
// has the dup.
//
// Plan:
//   1. Look both rows up by slug. Pull their RecordId objects out of the
//      SDK response and pass them back as bound parameters — that's the
//      shape SurrealQL is happiest with for UPDATE / DELETE / RELATE.
//   2. Copy the duplicate's org_links + org_corpus + domains arrays into
//      the canonical org via array::concat.
//   3. Re-RELATE every affiliations edge that points at the duplicate so
//      it points at the canonical instead. Preserves kind, added_at,
//      client. Stamps `merged_from_dup` for audit.
//   4. DELETE the now-orphan affiliations edges, then the duplicate row.
//
// Idempotent: re-running after a successful merge no-ops cleanly.
// ============================================================================

import { Surreal } from 'surrealdb';

const CANONICAL_SLUG = 'institute-for-humane-studies';
const DUPLICATE_SLUG = 'the-institute-for-humane-studies';

for (const k of ['SURREAL_URL', 'SURREAL_NS', 'SURREAL_DB', 'SURREAL_USER', 'SURREAL_PASS']) {
  if (!process.env[k]) { console.error(`missing env: ${k}`); process.exit(1); }
}

const db = new Surreal();
await db.connect(process.env.SURREAL_URL);
await db.signin({ username: process.env.SURREAL_USER, password: process.env.SURREAL_PASS });
await db.use({ namespace: process.env.SURREAL_NS, database: process.env.SURREAL_DB });
console.log(`connected: ${process.env.SURREAL_NS}/${process.env.SURREAL_DB}\n`);

// 1. Look up both rows by slug — slug has UNIQUE index, so this is safe.
async function findBySlug(slug) {
  const r = await db.query(
    `SELECT id, complete_name, slug,
            array::len(org_links  ?? []) AS link_count,
            array::len(org_corpus ?? []) AS corpus_count,
            array::len(domains    ?? []) AS domain_count
       FROM organizations WHERE slug = $slug LIMIT 1;`,
    { slug },
  );
  return (r?.[0] ?? [])[0] ?? null;
}

const canon = await findBySlug(CANONICAL_SLUG);
const dup   = await findBySlug(DUPLICATE_SLUG);

if (!canon) { console.error(`canonical row not found (slug=${CANONICAL_SLUG})`); process.exit(1); }
if (!dup)   { console.log(`duplicate row not found (slug=${DUPLICATE_SLUG}) — already merged. nothing to do.`); process.exit(0); }

console.log('current state:');
console.log(`  canonical → ${canon.id} · "${canon.complete_name}" · links=${canon.link_count} corpus=${canon.corpus_count} domains=${canon.domain_count}`);
console.log(`  duplicate → ${dup.id}   · "${dup.complete_name}" · links=${dup.link_count} corpus=${dup.corpus_count} domains=${dup.domain_count}\n`);

// 2. Pull the SDK RecordId objects directly off the rows we just fetched —
//    passing the RecordId straight back as a parameter beats stringifying.
const canonId = canon.id;
const dupId   = dup.id;

// 3. List affiliation edges that point at the duplicate
const edgesPre = await db.query(
  `SELECT id, in, kind, added_at, client FROM affiliations WHERE out = $dupId;`,
  { dupId },
);
const edges = (edgesPre?.[0] ?? []);
console.log(`affiliations pointing at duplicate: ${edges.length}`);
for (const e of edges) console.log(`  ${e.id} · in=${e.in} · kind="${e.kind}"`);
console.log('');

// 4. Copy the duplicate's arrays into the canonical
console.log('step 1/3: copying org_links / org_corpus / domains from duplicate → canonical…');
await db.query(
  `LET $dup_data = (SELECT org_links, org_corpus, domains FROM $dupId)[0];
   UPDATE $canonId SET
     org_links       = array::concat(org_links  ?? [], $dup_data.org_links  ?? []),
     org_corpus      = array::concat(org_corpus ?? [], $dup_data.org_corpus ?? []),
     domains         = array::concat(domains    ?? [], $dup_data.domains    ?? []),
     last_touched_at = time::now();`,
  { canonId, dupId },
);
console.log('  ✓ arrays merged');

// 5. Re-RELATE each affiliation edge from duplicate to canonical
console.log(`step 2/3: re-RELATE-ing ${edges.length} affiliation edge(s)…`);
for (const e of edges) {
  await db.query(
    `RELATE $person -> affiliations -> $canonId SET
       kind            = $kind,
       added_at        = $added_at,
       client          = $client,
       merged_from_dup = $dupId;`,
    {
      person:   e.in,
      canonId,
      dupId,
      kind:     e.kind,
      added_at: e.added_at,
      client:   e.client,
    },
  );
  console.log(`  ✓ re-related edge for ${e.in} (kind="${e.kind}")`);
}

// 6. Delete the old edges, then the duplicate row itself
console.log('step 3/3: deleting old edges + duplicate org row…');
await db.query(`DELETE affiliations WHERE out = $dupId;`, { dupId });
console.log('  ✓ old affiliation edges removed');
await db.query(`DELETE $dupId;`, { dupId });
console.log('  ✓ duplicate org row removed\n');

// 7. Verify post-state
const finalRow = await findBySlug(CANONICAL_SLUG);
console.log('post-merge canonical:');
console.log(`  ${finalRow.id} · "${finalRow.complete_name}" · links=${finalRow.link_count} corpus=${finalRow.corpus_count} domains=${finalRow.domain_count}`);

const postEdges = await db.query(
  `SELECT VALUE { person: in, kind: kind, added_at: added_at }
     FROM affiliations WHERE out = $canonId;`,
  { canonId },
);
const finalEdges = (postEdges?.[0] ?? []);
console.log(`affiliations now pointing at canonical: ${finalEdges.length}`);
for (const e of finalEdges) console.log(`  ${e.person} · kind="${e.kind}"`);

await db.close();
console.log('\n✓ merge complete.');
