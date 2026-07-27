#!/usr/bin/env node
// prove-org-relations.mjs — acceptance proof for the org-relations feature
// (context-v/plans/Org-Relations-Parent-Child-Peer-Plus-Org-Tags.md, gh #51).
//
// Capability checks ride NATS like every prove-* script; the final
// client-tagging audit + zero-residue cleanup talk to SurrealDB directly
// (the surreal-backfill-* precedent), because there is deliberately no
// org-delete verb on the wire.
//
// Everything is minted under a throwaway client slug, so even mid-run the
// test rows are invisible to every real workspace read.
//
// Prereqs: docker compose up -d nats record-surrealdb-resolver
// Usage:   set -a; source ./.env; set +a
//          node scripts/prove-org-relations.mjs

import { createRequire } from 'node:module';
import { Surreal } from 'surrealdb';
const require = createRequire(new URL('../services/social-search/package.json', import.meta.url));
const { connect } = require('@nats-io/transport-node');

const NATS_URL = process.env.NATS_URL ?? 'nats://localhost:4222';
const CLIENT = 'proof-org-relations';
const STAMP = process.pid; // uniquify slugs across runs without Date.now()
const A = `proof-child-org-${STAMP}`;
const B = `proof-parent-org-${STAMP}`;
const C = `proof-peer-org-${STAMP}`;

const nc = await connect({ servers: NATS_URL });
const req = async (subject, body, timeout = 30_000) =>
  JSON.parse(new TextDecoder().decode((await nc.request(subject, JSON.stringify(body), { timeout })).data));
let failed = 0;
const check = (label, ok, extra = '') => { console.log(`${ok ? '✅' : '❌'} ${label} ${extra}`); if (!ok) failed++; };

// --- mint three throwaway orgs (org-only person.affiliate, the documented
// no-person path: creates the org row, no edge) ------------------------------
for (const slug of [A, B, C]) {
  const r = await req('person.affiliate.requested', {
    org_action: 'create', org_name: slug, client: CLIENT, source: 'prove-org-relations',
  });
  check(`mint ${slug}`, r.ok && r.org_created && r.org_slug === slug, r.ok ? '' : r.error);
}

// (a) relate parent — from A's perspective, B is the parent
const rel1 = await req('organization.relate.requested', {
  org_slug: A, other_slug: B, rel: 'parent', kind: 'initiative_of',
  description: 'proof: A is an initiative of B', client: CLIENT,
});
check('relate A→parent B', rel1.ok && rel1.created === true && rel1.rel === 'parent', rel1.ok ? '' : rel1.error);

// (b) trichotomy from BOTH perspectives + kind/description round-trip
const relA = await req('organization.relations.requested', { org_slug: A, client: CLIENT });
check('A.parents = [B] w/ kind+description',
  relA.ok && relA.parents.length === 1 && relA.parents[0].slug === B
    && relA.parents[0].kind === 'initiative_of' && /initiative of B/.test(relA.parents[0].description ?? ''),
  relA.ok ? JSON.stringify(relA.parents) : relA.error);
const relB = await req('organization.relations.requested', { org_slug: B, client: CLIENT });
check('B.children = [A]', relB.ok && relB.children.length === 1 && relB.children[0].slug === A
  && relB.parents.length === 0 && relB.peers.length === 0);

// (c) duplicate-pair rejection → created:false, not an error, not a second edge
const dup = await req('organization.relate.requested', {
  org_slug: B, other_slug: A, rel: 'child', client: CLIENT,
});
check('duplicate pair → created:false', dup.ok && dup.created === false);

// (d) peer relation, visible from both sides
const rel2 = await req('organization.relate.requested', {
  org_slug: A, other_slug: C, rel: 'peer', kind: 'partners_with', client: CLIENT,
});
check('relate A—peer—C', rel2.ok && rel2.created === true);
const relA2 = await req('organization.relations.requested', { org_slug: A, client: CLIENT });
const relC = await req('organization.relations.requested', { org_slug: C, client: CLIENT });
check('peer from both perspectives',
  relA2.ok && relA2.peers.length === 1 && relA2.peers[0].slug === C
    && relC.ok && relC.peers.length === 1 && relC.peers[0].slug === A);

// (e) relation.update — flip A/B (B becomes A's child) + patch description
const upd = await req('organization.relation.update.requested', {
  org_slug: A, other_slug: B, rel: 'child', description: 'proof: flipped', client: CLIENT,
});
check('relation.update flip → rel:child', upd.ok && upd.rel === 'child', upd.ok ? '' : upd.error);
const relA3 = await req('organization.relations.requested', { org_slug: A, client: CLIENT });
check('post-flip: A.children = [B], A.parents = []',
  relA3.ok && relA3.children.length === 1 && relA3.children[0].slug === B
    && relA3.parents.length === 0 && /flipped/.test(relA3.children[0].description ?? ''));

// (f) zero contamination — the People Reveal read sees no org→org edges
const aff = await req('organization.affiliations.requested', { org_slug: A, client: CLIENT });
check('organization.affiliations sees 0 people (no org_org bleed)',
  aff.ok && Array.isArray(aff.people) && aff.people.length === 0);

// (g) unrelate → gone
const unrel = await req('organization.unrelate.requested', { org_slug: A, other_slug: B, client: CLIENT });
check('unrelate A↔B removed=1', unrel.ok && unrel.removed === 1);
const relA4 = await req('organization.relations.requested', { org_slug: A, client: CLIENT });
check('post-unrelate: only the peer remains',
  relA4.ok && relA4.children.length === 0 && relA4.parents.length === 0 && relA4.peers.length === 1);

// (h) tags — add (toDashed: dashes-not-spaces, casing preserved), dedup, detail, remove
const tag1 = await req('organization.tag.add.requested', { org_slug: A, tag: 'Proof Initiative', client: CLIENT });
check("tag.add 'Proof Initiative' → 'Proof-Initiative'", tag1.ok && tag1.tag === 'Proof-Initiative' && tag1.created === true);
const tag2 = await req('organization.tag.add.requested', { org_slug: A, tag: 'Proof-Initiative', client: CLIENT });
check('tag.add duplicate → created:false', tag2.ok && tag2.created === false);
const det = await req('organization.detail.requested', { org_slug: A, client: CLIENT });
check('detail.org.tags = [Proof-Initiative]', det.ok && det.org.tags.length === 1 && det.org.tags[0] === 'Proof-Initiative');
const tagRm = await req('organization.tag.remove.requested', { org_slug: A, tag: 'Proof-Initiative', client: CLIENT });
const det2 = await req('organization.detail.requested', { org_slug: A, client: CLIENT });
check('tag.remove → detail.org.tags = []', tagRm.ok && tagRm.removed === true && det2.ok && det2.org.tags.length === 0);

await nc.drain();

// --- client-tagging audit (per the surrealdb-canonical-layer discipline:
// re-query WITHOUT the client filter, inspect the field on every row) — then
// zero-residue cleanup ---------------------------------------------------------
const db = new Surreal();
await db.connect(process.env.SURREAL_URL);
await db.signin({ username: process.env.SURREAL_USER, password: process.env.SURREAL_PASS });
await db.use({ namespace: process.env.SURREAL_NS, database: process.env.SURREAL_DB });

const orgs = (await db.query(
  `SELECT id, slug, client_access FROM organizations WHERE slug IN [$a, $b, $c];`,
  { a: A, b: B, c: C },
))?.[0] ?? [];
check('audit: 3 proof orgs, each client_access == [proof client]',
  orgs.length === 3 && orgs.every((o) => Array.isArray(o.client_access) && o.client_access.length === 1 && o.client_access[0] === CLIENT),
  JSON.stringify(orgs.map((o) => ({ slug: o.slug, client_access: o.client_access }))));

const orgIds = orgs.map((o) => o.id);
const edges = (await db.query(
  `SELECT id, rel, client_access FROM affiliations WHERE edge_type = 'org_org' AND (in IN $ids OR out IN $ids);`,
  { ids: orgIds },
))?.[0] ?? [];
check('audit: surviving edge (the peer) carries client_access == [proof client]',
  edges.length === 1 && edges[0].client_access?.length === 1 && edges[0].client_access[0] === CLIENT,
  `edges=${edges.length}`);

const obs = (await db.query(
  `SELECT id, predicate, client FROM observations WHERE subject IN $ids;`,
  { ids: orgIds },
))?.[0] ?? [];
check('audit: every proof observation carries client (singular) == proof client',
  obs.length > 0 && obs.every((o) => o.client === CLIENT), `n=${obs.length}`);

// cleanup — edges first, then observations, then the rows
await db.query(`DELETE affiliations WHERE edge_type = 'org_org' AND (in IN $ids OR out IN $ids);`, { ids: orgIds });
await db.query(`DELETE observations WHERE subject IN $ids OR object IN $ids;`, { ids: orgIds });
await db.query(`DELETE organizations WHERE slug IN [$a, $b, $c];`, { a: A, b: B, c: C });
const leftover = (await db.query(
  `SELECT id FROM organizations WHERE slug IN [$a, $b, $c];`, { a: A, b: B, c: C },
))?.[0] ?? [];
check('cleanup: zero residue', leftover.length === 0);
await db.close();

console.log(failed ? `\n${failed} check(s) failed` : '\nall green');
process.exit(failed ? 1 : 0);
