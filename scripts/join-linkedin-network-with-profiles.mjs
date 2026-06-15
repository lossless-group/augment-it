#!/usr/bin/env node
// ============================================================================
// join-linkedin-network-with-profiles.mjs
//
// Joins a LinkedIn-network search-results CSV (output of
// linkedin-search-results-to-csv.js) with a deep-profile-capture JSON
// (output of linkedin-profile-to-row.js / linkedin-profiles-download-json.js)
// by `profile_url`.
//
// Output: an enriched CSV in the same input directory with columns:
//   name, profile_url, headline, location,
//   deep_visited (true/false),
//   deep_visited_at (ISO timestamp or empty),
//   deep_headline (precise profile-page version, when captured),
//   deep_location (precise profile-page version, when captured),
//   experience_json (the experience array as a JSON string)
//
// Where deep-capture fields are empty (current snippet limitation —
// selectors stale on LinkedIn's late-2025 DOM rewrite, fix pending), the
// search-results values stand on their own. The deep_visited flag is
// still useful: it tells the operator which contacts they've already
// clicked-into during a hand-curation pass.
//
// Usage
// -----
//   node scripts/join-linkedin-network-with-profiles.mjs \
//     --network <path-to-search-results.csv> \
//     --profiles <path-to-profiles.json> \
//     [--out <output-path.csv>]
//
// If --out is omitted, the output filename is derived from the network
// CSV's filename with a "-joined" suffix and a fresh timestamp.
// ============================================================================

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const flag = argv[i];
    const val = argv[i + 1];
    if (flag === '--network') { out.network = val; i += 1; }
    else if (flag === '--profiles') { out.profiles = val; i += 1; }
    else if (flag === '--out') { out.out = val; i += 1; }
    else if (flag === '--help' || flag === '-h') { out.help = true; }
  }
  return out;
}

function usage() {
  console.log(`Usage:
  node scripts/join-linkedin-network-with-profiles.mjs \\
    --network <search-results.csv> \\
    --profiles <profiles.json> \\
    [--out <output.csv>]
`);
}

// Minimal CSV parser. Handles quoted fields containing commas, escaped
// quotes (""), and CR/LF line endings. Returns { headers, rows } where
// rows is an array of {colName: value} objects.
function parseCsv(text) {
  const lines = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i += 1; }
        else { inQuotes = false; }
      } else { cur += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) {
        lines.push(cur);
        cur = '';
        if (ch === '\r') i += 1;
      } else { cur += ch; }
    }
  }
  if (cur.length > 0) lines.push(cur);
  const splitRow = (line) => {
    const cells = [];
    let c = '';
    let q = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (q) {
        if (ch === '"') {
          if (line[i + 1] === '"') { c += '"'; i += 1; }
          else { q = false; }
        } else { c += ch; }
      } else {
        if (ch === '"') { q = true; }
        else if (ch === ',') { cells.push(c); c = ''; }
        else { c += ch; }
      }
    }
    cells.push(c);
    return cells;
  };
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = splitRow(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const cells = splitRow(line);
    const row = {};
    for (let i = 0; i < headers.length; i += 1) row[headers[i]] = cells[i] ?? '';
    return row;
  });
  return { headers, rows };
}

function toCsv(headers, rows) {
  const esc = (s) => {
    const v = String(s ?? '');
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const lines = [headers.join(',')];
  for (const r of rows) lines.push(headers.map((h) => esc(r[h])).join(','));
  return lines.join('\n');
}

// Normalize the profile URL the same way the browser snippets do, so
// trailing slashes / query params don't break the join key.
function normalizeProfileUrl(u) {
  if (!u) return '';
  try {
    const url = new URL(u);
    const m = url.pathname.match(/^\/in\/[^/]+/);
    const path = m ? m[0] : url.pathname.replace(/\/$/, '');
    return `${url.origin}${path}`.toLowerCase();
  } catch {
    return String(u).toLowerCase().replace(/\/$/, '');
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.network || !args.profiles) {
    usage();
    process.exit(args.help ? 0 : 1);
  }

  const networkText = await readFile(args.network, 'utf8');
  const profilesText = await readFile(args.profiles, 'utf8');

  const { rows: networkRows } = parseCsv(networkText);
  const profiles = JSON.parse(profilesText);
  if (!Array.isArray(profiles)) throw new Error('profiles JSON is not an array');

  // Index deep-capture profiles by normalized URL. Last-wins for duplicate
  // URLs — matches the snippet's own update-in-place semantics.
  const byUrl = new Map();
  for (const p of profiles) byUrl.set(normalizeProfileUrl(p.profile_url), p);

  const outHeaders = [
    'name',
    'profile_url',
    'headline',
    'location',
    'deep_visited',
    'deep_visited_at',
    'deep_headline',
    'deep_location',
    'experience_json',
  ];
  const out = [];
  let visited = 0;
  let visitedWithData = 0;
  for (const r of networkRows) {
    const key = normalizeProfileUrl(r.profile_url);
    const deep = byUrl.get(key);
    if (deep) {
      visited += 1;
      if (deep.name || deep.headline || (deep.experience && deep.experience.length > 0)) {
        visitedWithData += 1;
      }
    }
    out.push({
      name: r.name ?? '',
      profile_url: r.profile_url ?? '',
      headline: r.headline ?? '',
      location: r.location ?? '',
      deep_visited: deep ? 'true' : 'false',
      deep_visited_at: deep?.captured_at ?? '',
      deep_headline: deep?.headline ?? '',
      deep_location: deep?.location ?? '',
      experience_json: deep && Array.isArray(deep.experience) && deep.experience.length > 0
        ? JSON.stringify(deep.experience)
        : '',
    });
  }

  // Also report profile URLs that appear in the deep capture but NOT in
  // the search-results CSV (orphans — captured from somewhere else, or
  // URL normalization mismatch).
  const networkKeys = new Set(networkRows.map((r) => normalizeProfileUrl(r.profile_url)));
  const orphans = [];
  for (const [key, p] of byUrl) {
    if (!networkKeys.has(key)) orphans.push(p);
  }

  const outPath = args.out ?? (() => {
    const dir = dirname(args.network);
    const base = basename(args.network, '.csv');
    return join(dir, `${base}-joined-${Date.now()}.csv`);
  })();
  await writeFile(outPath, toCsv(outHeaders, out));

  console.log(`network rows:           ${networkRows.length}`);
  console.log(`profile captures:       ${profiles.length}`);
  console.log(`joined rows:            ${out.length}`);
  console.log(`  - deep visited:       ${visited}  (${networkRows.length - visited} unvisited)`);
  console.log(`  - visited w/ data:    ${visitedWithData}  (${visited - visitedWithData} visited but empty)`);
  console.log(`orphan profile URLs:    ${orphans.length}  (in profiles JSON but not in network CSV)`);
  if (orphans.length > 0 && orphans.length <= 5) {
    console.log('  orphans:');
    for (const o of orphans) console.log(`    - ${o.profile_url}`);
  }
  console.log(`\nwrote: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
