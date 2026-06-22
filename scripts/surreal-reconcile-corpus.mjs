#!/usr/bin/env node
// ============================================================================
// surreal-reconcile-corpus.mjs  —  Phase 0 of the Funder-Fit Engine
//
// Reconciles the on-disk fetched corpus with the SurrealDB canonical layer,
// and connects each fetched piece of content to its organization.
//
// Two stores partially overlap and drift (the "Venn" problem from
// context-v/explorations/Funder-Fit-Engine-Org-Corpora-and-the-Story-Unlock-Cycle.md):
//
//   ① ON DISK   clients/<client>/corpus/<funder_slug>/*.md   — fetches that HAPPENED
//                 frontmatter: exact_url, fetched_at, funder_slug, record_id,
//                 response_id, client_id, pack_id
//   ② IN SURREAL  content_items (URL ledger, UNIQUE on url)   — fetch-status mirror
//                 organizations (slug, org_corpus[] = intentions-to-fetch)
//
// JOIN KEYS
//   corpus.exact_url   ?= content_items.url          (the content ledger)
//   corpus.funder_slug ?= organizations.slug         (the org connection)
//
// WHAT IT DOES
//   - Walks every corpus markdown file, parses top-level frontmatter.
//   - Matches each file's funder_slug to an organizations.slug (EXACT, no fuzzy).
//   - Reports the Venn:
//       matched              — fetched file whose funder_slug has a canonical org
//       corpus-without-org   — funder_slug on disk with NO matching org row
//       org-link-without-corpus — org_corpus URL the operator added but never fetched
//       ledger-gap           — fetched URL with no content_items row yet (--write fills)
//   - With --write: upserts a content_items row per fetched URL (same field shape
//     the person-enrichment app uses), stamps fetch provenance + the org connection
//     (org RecordId + org_slug), and client-tags every write per the
//     Client-Tagging-on-Canonical-Writes spec.
//
// SAFE BY DEFAULT: dry-run (report only). Pass --write to mutate SurrealDB.
// Does NOT mutate corpus files in v0 (frontmatter back-stamp is a later pass).
//
// Usage:
//   set -a; . ./.env; set +a
//   node scripts/surreal-reconcile-corpus.mjs                      # dry-run report
//   node scripts/surreal-reconcile-corpus.mjs --write              # apply to SurrealDB
//   node scripts/surreal-reconcile-corpus.mjs --client reach-edu --corpus-root clients/reach-edu/corpus
//   node scripts/surreal-reconcile-corpus.mjs --json               # machine-readable Venn
// ============================================================================

import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { Surreal } from 'surrealdb';

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const out = { write: false, json: false, corpusRoot: null, client: null, limit: 0 };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--write') out.write = true;
    else if (a === '--json') out.json = true;
    else if (a === '--corpus-root') { out.corpusRoot = argv[i + 1]; i += 1; }
    else if (a === '--client') { out.client = argv[i + 1]; i += 1; }
    else if (a === '--limit') { out.limit = parseInt(argv[i + 1], 10) || 0; i += 1; }
    else if (a === '--help' || a === '-h') { out.help = true; }
  }
  return out;
}

const args = parseArgs(process.argv);
if (args.help) {
  console.log('node scripts/surreal-reconcile-corpus.mjs [--write] [--json] [--client <slug>] [--corpus-root <dir>] [--limit N]');
  process.exit(0);
}

// Default client + corpus root. The corpus is laid out as
// clients/<client>/corpus/<funder_slug>/*.md, so the client implies the root.
const CLIENT = args.client || process.env.SURREAL_CLIENT || 'reach-edu';
const CORPUS_ROOT = args.corpusRoot || `clients/${CLIENT}/corpus`;

for (const k of ['SURREAL_URL', 'SURREAL_NS', 'SURREAL_DB', 'SURREAL_USER', 'SURREAL_PASS']) {
  if (!process.env[k]) { console.error(`missing env: ${k}`); process.exit(1); }
}

// ---------------------------------------------------------------------------
// Frontmatter: parse ONLY the top-level scalar block. Nested keys (the
// indented `extra_metadata:` map, `tags:` list) are intentionally skipped —
// reconcile needs the flat identity fields, nothing deeper.
// ---------------------------------------------------------------------------
function parseFrontmatter(text) {
  if (!text.startsWith('---')) return null;
  const end = text.indexOf('\n---', 3);
  if (end === -1) return null;
  const block = text.slice(text.indexOf('\n') + 1, end);
  const fm = {};
  for (const line of block.split('\n')) {
    // top-level only: key starts at column 0 (no leading whitespace)
    const m = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    fm[m[1]] = v;
  }
  return fm;
}

function urlDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return ''; }
}

// ---------------------------------------------------------------------------
// Walk the corpus tree → one record per fetched file.
// ---------------------------------------------------------------------------
async function walkCorpus(root) {
  const files = [];
  async function recurse(dir) {
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) await recurse(p);
      else if (e.isFile() && e.name.endsWith('.md')) files.push(p);
    }
  }
  await recurse(root);

  const out = [];
  for (const path of files) {
    const text = await readFile(path, 'utf8');
    const fm = parseFrontmatter(text);
    const rel = relative('.', path);
    if (!fm || !fm.exact_url) {
      out.push({ path: rel, url: null, skip: 'no exact_url in frontmatter' });
      continue;
    }
    // funder_slug from frontmatter; fall back to the parent directory name
    const dirSlug = rel.split('/').slice(-2, -1)[0] || '';
    out.push({
      path: rel,
      url: fm.exact_url,
      url_domain: urlDomain(fm.exact_url),
      funder_slug: fm.funder_slug || dirSlug,
      fetched_at: fm.fetched_at || null,
      record_id: fm.record_id || null,
      response_id: fm.response_id || null,
      pack_id: fm.pack_id || null,
      client: fm.client_id || CLIENT,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  // Verify the corpus root exists before touching the network.
  try { await stat(CORPUS_ROOT); }
  catch { console.error(`corpus root not found: ${CORPUS_ROOT}`); process.exit(1); }

  let disk = await walkCorpus(CORPUS_ROOT);
  if (args.limit > 0) disk = disk.slice(0, args.limit);

  const usable = disk.filter((d) => d.url);
  const skipped = disk.filter((d) => !d.url);

  // Dedup disk records by URL — the ledger is unique-by-url. Keep the most
  // recently fetched file as the representative; count the rest as dupes.
  const byUrl = new Map();
  let dupes = 0;
  for (const d of usable) {
    const prev = byUrl.get(d.url);
    if (!prev) { byUrl.set(d.url, d); continue; }
    dupes += 1;
    if ((d.fetched_at || '') > (prev.fetched_at || '')) byUrl.set(d.url, d);
  }
  const diskUrls = [...byUrl.values()];

  const db = new Surreal();
  await db.connect(process.env.SURREAL_URL);
  await db.signin({ username: process.env.SURREAL_USER, password: process.env.SURREAL_PASS });
  await db.use({ namespace: process.env.SURREAL_NS, database: process.env.SURREAL_DB });
  console.log(`connected: ${process.env.SURREAL_NS}/${process.env.SURREAL_DB}`);
  console.log(`client:    ${CLIENT}`);
  console.log(`corpus:    ${CORPUS_ROOT}`);
  console.log(`mode:      ${args.write ? 'WRITE (mutating SurrealDB)' : 'dry-run (report only)'}`);
  console.log('');

  // Ensure the ledger table + unique index exist (idempotent — same shape the
  // verify script and the app assume).
  await db.query(`
    DEFINE TABLE IF NOT EXISTS content_items SCHEMALESS;
    DEFINE INDEX IF NOT EXISTS url ON content_items FIELDS url UNIQUE;
    DEFINE INDEX IF NOT EXISTS org_slug ON content_items FIELDS org_slug;
  `);

  // --- Read the canonical side ONCE (cheap, avoids per-file round-trips) -----
  const orgRes = await db.query('SELECT id, slug, complete_name, org_corpus, domains FROM organizations;');
  const orgs = orgRes?.[0] || [];
  const orgBySlug = new Map();
  const domainToOrg = new Map(); // bare hostname -> org  (the PUBLISHER lookup)
  const orgLinkUrls = new Map(); // org_corpus url -> org slug
  for (const o of orgs) {
    if (o.slug) orgBySlug.set(o.slug, o);
    for (const dom of (o.domains || [])) {
      if (dom?.domain) domainToOrg.set(String(dom.domain).toLowerCase().replace(/^www\./, ''), o);
    }
    for (const entry of (o.org_corpus || [])) {
      if (entry?.url) orgLinkUrls.set(entry.url, o.slug);
    }
  }

  const ciRes = await db.query('SELECT VALUE url FROM content_items;');
  const ledgerUrls = new Set(ciRes?.[0] || []);

  // --- Compute the Venn ------------------------------------------------------
  const aboutMatched = [];      // disk file → funder_slug resolves to an org (the "about" side)
  const corpusWithoutOrg = [];  // disk file → funder_slug has no org
  const publisherResolved = []; // disk file → url_domain resolves to a publisher org
  const ledgerGap = [];         // disk url not yet in content_items
  const unmatchedSlugs = new Map(); // funder_slug -> count (no org)

  for (const d of diskUrls) {
    const aboutOrg = orgBySlug.get(d.funder_slug);
    if (aboutOrg) aboutMatched.push({ ...d, org_id: aboutOrg.id });
    else {
      corpusWithoutOrg.push(d);
      unmatchedSlugs.set(d.funder_slug, (unmatchedSlugs.get(d.funder_slug) || 0) + 1);
    }
    if (domainToOrg.get(d.url_domain)) publisherResolved.push(d);
    if (!ledgerUrls.has(d.url)) ledgerGap.push(d);
  }

  // org_corpus URLs the operator added but that were never fetched to disk
  const diskUrlSet = new Set(diskUrls.map((d) => d.url));
  const orgLinkWithoutCorpus = [...orgLinkUrls.entries()]
    .filter(([url]) => !diskUrlSet.has(url))
    .map(([url, slug]) => ({ url, org_slug: slug }));

  // --- Report ----------------------------------------------------------------
  const venn = {
    corpus_files_scanned: disk.length,
    skipped_no_url: skipped.length,
    duplicate_url_files: dupes,
    unique_fetched_urls: diskUrls.length,
    organizations_total: orgs.length,
    organizations_with_slug: orgBySlug.size,
    organizations_with_domains: domainToOrg.size,
    content_items_existing: ledgerUrls.size,
    about_matched_to_org: aboutMatched.length,
    publisher_resolved: publisherResolved.length,
    corpus_without_org: corpusWithoutOrg.length,
    org_link_without_corpus: orgLinkWithoutCorpus.length,
    ledger_gap: ledgerGap.length,
    unmatched_funder_slugs: [...unmatchedSlugs.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([slug, n]) => ({ slug, files: n })),
  };

  if (args.json) {
    console.log(JSON.stringify({ venn, orgLinkWithoutCorpus }, null, 2));
  } else {
    console.log('── Venn ───────────────────────────────────────────────────');
    console.log(`  corpus files scanned       : ${venn.corpus_files_scanned}`);
    console.log(`    skipped (no exact_url)   : ${venn.skipped_no_url}`);
    console.log(`    duplicate-url files      : ${venn.duplicate_url_files}`);
    console.log(`  unique fetched URLs        : ${venn.unique_fetched_urls}`);
    console.log(`  organizations             : ${venn.organizations_total}  (with slug ${venn.organizations_with_slug}, with domains ${venn.organizations_with_domains})`);
    console.log(`  content_items existing     : ${venn.content_items_existing}`);
    console.log('');
    console.log(`  ⟴ published_by resolved    : ${venn.publisher_resolved}  (url_domain → organizations.domains[])`);
    console.log(`  ✓ about → org resolved     : ${venn.about_matched_to_org}  (funder_slug → organizations.slug)`);
    console.log(`  ✗ about without org        : ${venn.corpus_without_org}  (funder_slug has no organizations.slug — about keeps funder_slug only)`);
    console.log(`  ✗ org-link without corpus  : ${venn.org_link_without_corpus}  (org_corpus URL never fetched to disk)`);
    console.log(`  + ledger gap (to create)   : ${venn.ledger_gap}  (fetched URL with no content_items row)`);
    if (venn.unmatched_funder_slugs.length) {
      console.log('');
      console.log('  unmatched funder_slugs (no canonical org — resolve by hand):');
      for (const u of venn.unmatched_funder_slugs.slice(0, 25)) {
        console.log(`    - ${u.slug}  (${u.files} file${u.files === 1 ? '' : 's'})`);
      }
      if (venn.unmatched_funder_slugs.length > 25) {
        console.log(`    … and ${venn.unmatched_funder_slugs.length - 25} more`);
      }
    }
  }

  // --- Write -----------------------------------------------------------------
  if (!args.write) {
    console.log('');
    console.log('dry-run only — re-run with --write to upsert content_items and connect them to orgs.');
    await db.close();
    process.exit(0);
  }

  console.log('');
  console.log('── Writing content_items ──────────────────────────────────');
  let created = 0, updated = 0, aboutLinked = 0, publisherLinked = 0, errored = 0;
  const errors = [];
  const t0 = Date.now();

  for (let i = 0; i < diskUrls.length; i += 1) {
    const d = diskUrls[i];
    const aboutOrg = orgBySlug.get(d.funder_slug);   // funder_slug → org (the "about" side)
    const pub = domainToOrg.get(d.url_domain);       // url_domain → org (the publisher)

    // about[] — one entry per thing this content is about. funder_slug is
    // always carried; org_slug fills in when it resolves to a canonical org.
    // (Today: one entry. Third-party media content can grow this to many.)
    const about = [{
      funder_slug: d.funder_slug,
      org_slug: aboutOrg ? aboutOrg.slug : null,
    }];

    // Provenance + reconcile fields common to create and update.
    const prov = {
      url: d.url,
      url_domain: d.url_domain,
      corpus_path: d.path,
      funder_slug: d.funder_slug,
      record_id: d.record_id,
      response_id: d.response_id,
      pack_id: d.pack_id,
      fetched_at: d.fetched_at,         // ISO string from frontmatter
      about,
      published_by_slug: pub ? pub.slug : null,
      client: d.client || CLIENT,
    };

    try {
      const hitRes = await db.query(
        'SELECT VALUE id FROM content_items WHERE url = $url LIMIT 1',
        { url: d.url },
      );
      const hit = hitRes?.[0]?.[0];

      if (hit) {
        // Update: stamp fetch provenance + publisher/about connection; client-tag;
        // do NOT touch reference_count (that counts entity-array references, not fetches).
        await db.query(
          `UPDATE $id SET
              on_disk         = true,
              corpus_path     = $corpus_path,
              funder_slug     = $funder_slug,
              record_id       = $record_id,
              response_id     = $response_id,
              pack_id         = $pack_id,
              fetched_at      = $fetched_at,
              about           = $about,
              ${pub ? 'published_by = $published_by, published_by_slug = $published_by_slug,' : ''}
              reconciled_at   = time::now(),
              last_referenced_at = time::now(),
              client_access   = array::union(client_access ?? [], [$client]),
              last_touched_by = $client,
              last_touched_at = time::now()`,
          pub ? { id: hit, ...prov, published_by: pub.id } : { id: hit, ...prov },
        );
        updated += 1;
      } else {
        // Create: mirror the app's content_items shape, plus reconcile fields.
        // reference_count starts at 0 — no entity array references it yet; the
        // app bumps it when a person/org adds it to *_corpus.
        await db.query(
          `CREATE content_items SET
              id = rand::uuid::v7(),
              url = $url,
              url_domain = $url_domain,
              kind = "other",
              on_disk = true,
              corpus_path = $corpus_path,
              funder_slug = $funder_slug,
              record_id = $record_id,
              response_id = $response_id,
              pack_id = $pack_id,
              fetched_at = $fetched_at,
              about = $about,
              mentions = [],
              ${pub ? 'published_by = $published_by, published_by_slug = $published_by_slug,' : ''}
              first_seen_at      = time::now(),
              last_referenced_at = time::now(),
              reconciled_at      = time::now(),
              reference_count    = 0,
              client_access      = [$client],
              first_touched_by   = $client,
              last_touched_by    = $client,
              last_touched_at    = time::now()`,
          pub ? { ...prov, published_by: pub.id } : prov,
        );
        created += 1;
      }
      if (aboutOrg) aboutLinked += 1;
      if (pub) publisherLinked += 1;
    } catch (err) {
      errored += 1;
      errors.push(`${d.url}: ${err && err.message ? err.message : String(err)}`);
    }

    if ((i + 1) % 50 === 0) {
      const el = ((Date.now() - t0) / 1000).toFixed(1);
      process.stdout.write(`  ${i + 1}/${diskUrls.length} (created ${created}, updated ${updated}, about ${aboutLinked}, pub ${publisherLinked}, err ${errored}) ${el}s\n`);
    }
  }

  const el = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('');
  console.log(`done in ${el}s`);
  console.log(`  created : ${created}`);
  console.log(`  updated : ${updated}`);
  console.log(`  about → org linked   : ${aboutLinked}`);
  console.log(`  published_by linked  : ${publisherLinked}`);
  console.log(`  errored : ${errored}`);
  if (errors.length) {
    console.log('first 5 errors:');
    for (const e of errors.slice(0, 5)) console.log(`  - ${e}`);
  }

  await db.close();
  process.exit(errored ? 1 : 0);
}

main().catch((err) => {
  console.error('fatal:', err && err.stack ? err.stack : err);
  process.exit(2);
});
