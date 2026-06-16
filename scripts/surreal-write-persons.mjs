#!/usr/bin/env node
// ============================================================================
// surreal-write-persons.mjs
//
// Reads a CSV of LinkedIn profile rows and writes one `persons` record per
// row to SurrealDB Cloud. The unique join key is `linkedin_profile_url`.
// IDs are UUIDs generated server-side via `rand::uuid::v7()` (time-ordered).
//
// Usage:
//   set -a; . ./.env; set +a
//   node scripts/surreal-write-persons.mjs --csv <path>
//
//   # or pass nothing and it uses the humain-vc NYC network CSV:
//   node scripts/surreal-write-persons.mjs
//
// Behavior:
//   - DEFINEs a UNIQUE INDEX on persons.linkedin_profile_url (idempotent).
//   - For each row, SELECT by linkedin_profile_url:
//       hit  → MERGE the row's fields onto the existing record
//       miss → CREATE persons with id = rand::uuid::v7() and the row's fields
//   - Maps CSV column `profile_url` → record field `linkedin_profile_url`.
//   - Reports created / updated / error counts at the end.
// ============================================================================

import { readFile } from 'node:fs/promises';
import { Surreal } from 'surrealdb';

const DEFAULT_CSV =
  'clients/humain-vc/inputs/2026-06-14_Staton_Query-NYC_linkedin-network-1781465447748.csv';

function parseArgs(argv) {
  const out = { csv: DEFAULT_CSV };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--csv') { out.csv = argv[i + 1]; i += 1; }
    else if (argv[i] === '--client') { out.client = argv[i + 1]; i += 1; }
    else if (argv[i] === '--help' || argv[i] === '-h') { out.help = true; }
  }
  return out;
}

// Single-pass CSV parser. Tracks quote state across both row and cell
// boundaries (the prior two-pass version had a bug: the outer pass
// stripped quotes, so the inner pass saw quoted commas as separators —
// truncating values like "New York, NY, USA" to "New York").
function parseCsv(text) {
  const rows = [[]];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i += 1; }
      else if (ch === '"') { q = false; }
      else { cur += ch; }
    } else {
      if (ch === '"') { q = true; }
      else if (ch === ',') { rows[rows.length - 1].push(cur); cur = ''; }
      else if (ch === '\n') {
        rows[rows.length - 1].push(cur); cur = '';
        rows.push([]);
      }
      else if (ch === '\r') { /* skip; \n on next iter handles row break */ }
      else { cur += ch; }
    }
  }
  if (cur.length || rows[rows.length - 1].length > 0) {
    rows[rows.length - 1].push(cur);
  }
  const cleaned = rows.filter((r) => r.length > 1 || (r.length === 1 && r[0].length > 0));
  if (!cleaned.length) return { headers: [], rows: [] };
  const headers = cleaned[0].map((h) => h.trim());
  const dataRows = cleaned.slice(1).map((cells) => {
    const o = {};
    for (let i = 0; i < headers.length; i += 1) o[headers[i]] = (cells[i] ?? '').trim();
    return o;
  });
  return { headers, rows: dataRows };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log('node scripts/surreal-write-persons.mjs --client <slug> [--csv <path>]');
    process.exit(0);
  }

  const client = args.client || process.env.SURREAL_CLIENT;
  if (!client) {
    console.error('missing --client <slug> (or SURREAL_CLIENT env). Required so writes are tagged with the originating workspace.');
    process.exit(1);
  }

  for (const k of ['SURREAL_URL', 'SURREAL_NS', 'SURREAL_DB', 'SURREAL_USER', 'SURREAL_PASS']) {
    if (!process.env[k]) { console.error(`missing env: ${k}`); process.exit(1); }
  }

  const text = await readFile(args.csv, 'utf8');
  const { headers, rows } = parseCsv(text);
  console.log(`csv:     ${args.csv}`);
  console.log(`headers: ${headers.join(', ')}`);
  console.log(`rows:    ${rows.length}`);
  console.log('');

  const db = new Surreal();
  await db.connect(process.env.SURREAL_URL);
  await db.signin({ username: process.env.SURREAL_USER, password: process.env.SURREAL_PASS });
  await db.use({ namespace: process.env.SURREAL_NS, database: process.env.SURREAL_DB });
  console.log(`connected: ${process.env.SURREAL_NS}/${process.env.SURREAL_DB}`);

  // Idempotent unique index on linkedin_profile_url. Re-defining is a no-op
  // shape-wise; if existing data violates uniqueness this will throw.
  try {
    await db.query(
      'DEFINE INDEX IF NOT EXISTS linkedin_profile_url ON persons FIELDS linkedin_profile_url UNIQUE',
    );
    console.log('index:     persons.linkedin_profile_url UNIQUE');
  } catch (err) {
    console.error('index DEFINE failed:', err && err.message ? err.message : err);
    await db.close();
    process.exit(1);
  }
  console.log('');

  let created = 0, updated = 0, errored = 0;
  const errors = [];
  const t0 = Date.now();

  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const url = r.profile_url;
    if (!url) { errored += 1; errors.push(`row ${i}: empty profile_url`); continue; }

    const fields = {
      linkedin_profile_url: url,
      name: r.name || '',
      headline: r.headline || '',
      location: r.location || '',
      source: 'linkedin-network-walker',
    };

    try {
      const existing = await db.query(
        'SELECT id FROM persons WHERE linkedin_profile_url = $url LIMIT 1',
        { url },
      );
      const hit = existing?.[0]?.[0];
      if (hit?.id) {
        await db.query(
          `UPDATE $id MERGE $fields SET
              last_seen_at = time::now(),
              client_access = array::union(client_access ?? [], [$client]),
              last_touched_by = $client,
              last_touched_at = time::now()`,
          { id: hit.id, fields, client },
        );
        updated += 1;
      } else {
        await db.query(
          `CREATE persons SET
              id = rand::uuid::v7(),
              linkedin_profile_url = $linkedin_profile_url,
              name = $name,
              headline = $headline,
              location = $location,
              source = $source,
              client_access = [$client],
              first_touched_by = $client,
              last_touched_by = $client,
              last_touched_at = time::now(),
              first_seen_at = time::now(),
              last_seen_at = time::now()`,
          { ...fields, client },
        );
        created += 1;
      }
    } catch (err) {
      errored += 1;
      const msg = err && err.message ? err.message : String(err);
      errors.push(`row ${i} (${url}): ${msg}`);
    }

    if ((i + 1) % 50 === 0) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      process.stdout.write(`  ${i + 1}/${rows.length} (created ${created}, updated ${updated}, err ${errored}) ${elapsed}s\n`);
    }
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('');
  console.log(`done in ${elapsed}s`);
  console.log(`  created: ${created}`);
  console.log(`  updated: ${updated}`);
  console.log(`  errored: ${errored}`);
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
