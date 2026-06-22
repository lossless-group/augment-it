#!/usr/bin/env node
// ============================================================================
// surreal-define-content-items-schema.mjs
//
// Amends the content_items table with the publisher-vs-about model.
//
// content_items stays SCHEMALESS — these DEFINEs are ADDITIVE, IDEMPOTENT, and
// NON-DESTRUCTIVE. New fields are option<> so the existing rows (which don't
// carry them) stay valid. Safe to re-run.
//
// THE MODEL — a content item relates to orgs in TWO different ways:
//
//   published_by / published_by_slug   ONE org — WHO published it.
//                                       Derived from the URL's domain
//                                       (e.g. ecmcfoundation.org → the ECMC org).
//
//   about[]                            ONE OR MANY — WHO / WHAT it is about.
//                                       The PRIMARY subject(s). Array of
//                                       { funder_slug, org_slug }. funder_slug
//                                       is always present (the existing
//                                       "aboutness" tag); org_slug fills in when
//                                       it resolves to a canonical organizations.slug.
//
//   mentions[]                         A LAUNDRY LIST — every organization OR
//                                       person named anywhere in the content,
//                                       not just the subject. Heterogeneous,
//                                       flexible entries:
//                                         { kind: "organization", org_slug?, funder_slug? }
//                                         { kind: "person",       person?,   name? }
//                                       Broader than about[] (an org can be
//                                       mentioned without the piece being about
//                                       it); powers co-occurrence / graph queries.
//
// First-party content (an org's own blog post about its own work) is the
// DEGENERATE case: published_by == the single about org. Third-party media
// content (a post on one outlet that references funders) is where the two
// diverge — published_by = the outlet, about = the funders named in it.
//
// Usage:
//   set -a; . ./.env; set +a
//   node scripts/surreal-define-content-items-schema.mjs
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

try {
  await db.query(`
    -- table stays schemaless; one row per URL
    DEFINE TABLE IF NOT EXISTS content_items SCHEMALESS;
    DEFINE INDEX IF NOT EXISTS url ON content_items FIELDS url UNIQUE;

    -- PUBLISHER (one) — who put it out, derived from the URL domain
    DEFINE FIELD IF NOT EXISTS published_by_slug ON content_items TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS published_by      ON content_items TYPE option<record<organizations>>;

    -- ABOUT (one or many) — the primary subject(s); [{ funder_slug, org_slug }]
    DEFINE FIELD IF NOT EXISTS about ON content_items TYPE option<array>;

    -- MENTIONS (laundry list) — every org OR person named; heterogeneous entries
    DEFINE FIELD IF NOT EXISTS mentions ON content_items TYPE option<array>;

    -- fast lookups
    DEFINE INDEX IF NOT EXISTS published_by_slug ON content_items FIELDS published_by_slug;
  `);
  console.log('✓ schema amended (additive, idempotent):');
  console.log('    published_by_slug : option<string>');
  console.log('    published_by      : option<record<organizations>>');
  console.log('    about             : option<array>  ([{ funder_slug, org_slug }])');
  console.log('    mentions          : option<array>  ([{ kind, org_slug?/funder_slug?/person?/name? }])');
  console.log('    index             : content_items.published_by_slug');
  console.log('');

  // Show the resulting definition so we can eyeball it.
  const info = await db.query('INFO FOR TABLE content_items;');
  const fields = info?.[0]?.fields ?? info?.[0]?.result?.fields ?? {};
  console.log('content_items fields now defined:');
  for (const [name, def] of Object.entries(fields)) console.log(`    ${name}: ${def}`);

  await db.close();
  process.exit(0);
} catch (err) {
  console.error('schema amend FAILED:', err && err.message ? err.message : err);
  try { await db.close(); } catch {}
  process.exit(1);
}
