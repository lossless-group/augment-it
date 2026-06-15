#!/usr/bin/env node
// ============================================================================
// crawlbase-bulk-collect.mjs
//
// Pulls all stored Crawlbase responses for a set of RIDs in one shot via
// the /storage/bulk endpoint (up to 100 RIDs per request, paginated
// here). Decodes each entry (base64 → gunzip → JSON), parses with the
// linkedin-profile field mapping, writes a flat CSV.
//
// Bypasses the per-rid polling loop entirely. Run once, get everything.
//
// Usage
// -----
//   node scripts/crawlbase-bulk-collect.mjs \
//     --jobs <jobs.json> \
//     --out  <out.csv>   \
//     [--token <token>]   \
//     [--auto-delete]    # delete from Crawlbase storage on success
//
// If --jobs is omitted, auto-discovers the most recent *.jobs.json
// under clients/*/inputs/ (same as crawlbase-inspect-storage.mjs).
// ============================================================================

import { readFile, writeFile, appendFile, access, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const flag = argv[i];
    const val = argv[i + 1];
    if (flag === '--jobs') { out.jobs = val; i += 1; }
    else if (flag === '--out') { out.out = val; i += 1; }
    else if (flag === '--token') { out.token = val; i += 1; }
    else if (flag === '--auto-delete') { out.autoDelete = true; }
    else if (flag === '--help' || flag === '-h') { out.help = true; }
  }
  return out;
}

const HEADERS = [
  'profile_url',
  'name',
  'headline',
  'location',
  'current_company',
  'current_company_url',
  'about',
  'connections_count',
  'followers_count',
  'experience_json',
  'education_json',
  'sublines_json',
  'fetched_at',
  'crawlbase_status',
  'crawlbase_error',
];

const csvEscape = (s) => {
  const v = String(s ?? '');
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

function pickFirst(...vals) {
  for (const v of vals) if (v !== undefined && v !== null && v !== '') return v;
  return '';
}

// Same field mapping as crawlbase-linkedin-profiles.mjs (kept inline so this
// script has no internal imports).
function rowFromScrape(profile_url, json) {
  const name = pickFirst(json?.title, json?.full_name, json?.name);
  const headline = pickFirst(json?.headline, json?.tagline);
  const location = pickFirst(json?.location, (json?.sublines || [])[0]);
  const summaryArr = Array.isArray(json?.summary) ? json.summary : [];
  const about = summaryArr.filter(Boolean).join(' ').trim();
  const current_company = pickFirst(json?.positionInfo?.company);
  const current_company_url = pickFirst(json?.positionInfo?.link);
  const sublines = Array.isArray(json?.sublines) ? json.sublines : [];
  const findCount = (re) => {
    const s = sublines.find((l) => typeof l === 'string' && re.test(l));
    if (!s) return '';
    const m = s.match(/^([\d,KMm.+]+)/);
    return m ? m[1] : '';
  };
  const connections_count = findCount(/connection/i);
  const followers_count = findCount(/follower/i);
  const experience = json?.experience ?? {};
  const education = Array.isArray(json?.education) ? json.education : [];
  return {
    profile_url,
    name,
    headline,
    location,
    current_company,
    current_company_url,
    about,
    connections_count,
    followers_count,
    experience_json: JSON.stringify(experience),
    education_json: JSON.stringify(education),
    sublines_json: JSON.stringify(sublines),
    fetched_at: new Date().toISOString(),
    crawlbase_status: 'ok',
    crawlbase_error: '',
  };
}

function rowFromError(profile_url, status, error) {
  return {
    profile_url,
    name: '', headline: '', location: '',
    current_company: '', current_company_url: '', about: '',
    connections_count: '', followers_count: '',
    experience_json: '{}', education_json: '[]', sublines_json: '[]',
    fetched_at: new Date().toISOString(),
    crawlbase_status: status,
    crawlbase_error: String(error || '').slice(0, 500),
  };
}

const rowToCsv = (row) => HEADERS.map((h) => csvEscape(row[h])).join(',');

async function fileExists(p) {
  try { await access(p); return true; } catch { return false; }
}

async function findLatestJobsFile() {
  const candidates = [];
  for (const slug of await readdir('clients').catch(() => [])) {
    const inputs = join('clients', slug, 'inputs');
    try {
      for (const f of await readdir(inputs)) {
        if (f.endsWith('.jobs.json')) candidates.push(join(inputs, f));
      }
    } catch { /* no inputs dir */ }
  }
  if (candidates.length === 0) return null;
  const withMtime = await Promise.all(
    candidates.map(async (p) => ({ p, m: (await stat(p)).mtimeMs })),
  );
  withMtime.sort((a, b) => b.m - a.m);
  return withMtime[0].p;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Decode the gzip-compressed-then-base64-encoded body field that the
// bulk endpoint returns. Falls back to returning the raw string if
// decoding fails (some entries may not be encoded depending on scraper).
function decodeBody(bodyB64) {
  try {
    const buf = Buffer.from(bodyB64, 'base64');
    // Try gunzip; if it fails, the body might already be plain text.
    try {
      const inflated = gunzipSync(buf);
      return inflated.toString('utf8');
    } catch {
      return buf.toString('utf8');
    }
  } catch {
    return bodyB64;
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.out) {
    console.log(`Usage:
  node scripts/crawlbase-bulk-collect.mjs --out <out.csv> [--jobs <jobs.json>] [--token <token>] [--auto-delete]
`);
    process.exit(args.help ? 0 : 1);
  }
  const token = args.token || process.env.CRAWLBASE_TOKEN;
  if (!token) {
    console.error('No CRAWLBASE_TOKEN in env. Pass --token or export from .env.');
    process.exit(1);
  }
  let jobsPath = args.jobs;
  if (!jobsPath) {
    jobsPath = await findLatestJobsFile();
    if (!jobsPath) {
      console.error('No *.jobs.json found. Pass --jobs <path>.');
      process.exit(1);
    }
    console.log('jobs auto-discovered:', jobsPath);
  }

  const jobs = JSON.parse(await readFile(jobsPath, 'utf8'));
  const ridToUrl = new Map();
  for (const [url, job] of Object.entries(jobs)) {
    if (job?.rid) ridToUrl.set(job.rid, url);
  }
  const rids = Array.from(ridToUrl.keys());
  const outPath = resolve(args.out);

  console.log(`rids to fetch: ${rids.length}`);
  console.log(`out:           ${outPath}`);
  console.log(`auto-delete:   ${!!args.autoDelete}`);
  console.log('');

  // Fresh CSV every run (this is a one-shot snapshot of all stored data).
  await writeFile(outPath, HEADERS.join(',') + '\n');

  // Also write URLs that have no rid as error rows (e.g., submits that
  // failed entirely during phaseSubmit).
  for (const [url, job] of Object.entries(jobs)) {
    if (!job?.rid) {
      await appendFile(outPath, rowToCsv(rowFromError(url, 'not_submitted', job?.error || 'no rid')) + '\n');
    }
  }

  const batches = chunk(rids, 100);
  let okCount = 0, errCount = 0;
  let shapeLogged = false;
  for (let bi = 0; bi < batches.length; bi += 1) {
    const batch = batches[bi];
    console.log(`batch ${bi + 1}/${batches.length}: posting ${batch.length} rids…`);
    let entries = [];
    try {
      const res = await fetch(`https://api.crawlbase.com/storage/bulk?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rids: batch, auto_delete: !!args.autoDelete }),
      });
      const text = await res.text();
      if (!res.ok) {
        console.log(`  batch http ${res.status}: ${text.slice(0, 200)}`);
        for (const rid of batch) {
          const url = ridToUrl.get(rid) || rid;
          await appendFile(outPath, rowToCsv(rowFromError(url, 'bulk_http_error', `${res.status}: ${text.slice(0, 200)}`)) + '\n');
          errCount += 1;
        }
        continue;
      }
      try {
        entries = JSON.parse(text);
      } catch {
        console.log(`  batch returned non-JSON: ${text.slice(0, 200)}`);
        for (const rid of batch) {
          const url = ridToUrl.get(rid) || rid;
          await appendFile(outPath, rowToCsv(rowFromError(url, 'bulk_non_json', text.slice(0, 200))) + '\n');
          errCount += 1;
        }
        continue;
      }
    } catch (err) {
      console.log(`  batch crashed: ${err && err.message ? err.message : err}`);
      for (const rid of batch) {
        const url = ridToUrl.get(rid) || rid;
        await appendFile(outPath, rowToCsv(rowFromError(url, 'bulk_fetch_error', err && err.message ? err.message : String(err))) + '\n');
        errCount += 1;
      }
      continue;
    }

    // entries is an array of { rid, url, body (base64+gzip), pc_status, original_status, stored_at }
    const seenRids = new Set();
    for (const entry of entries) {
      const rid = entry.rid;
      const url = ridToUrl.get(rid) || entry.url || rid;
      seenRids.add(rid);
      try {
        const decoded = decodeBody(entry.body || '');
        if (!shapeLogged) {
          console.log('  first decoded body (first 300 chars):', decoded.slice(0, 300));
          shapeLogged = true;
        }
        const json = JSON.parse(decoded);
        const row = rowFromScrape(url, json);
        await appendFile(outPath, rowToCsv(row) + '\n');
        okCount += 1;
      } catch (err) {
        await appendFile(outPath, rowToCsv(rowFromError(url, 'parse_error', err && err.message ? err.message : String(err))) + '\n');
        errCount += 1;
      }
    }
    // RIDs in this batch that did NOT come back at all from /storage/bulk.
    for (const rid of batch) {
      if (seenRids.has(rid)) continue;
      const url = ridToUrl.get(rid) || rid;
      await appendFile(outPath, rowToCsv(rowFromError(url, 'rid_not_in_bulk_response', 'storage may have expired or been deleted')) + '\n');
      errCount += 1;
    }
  }

  console.log('');
  console.log(`done. ${okCount} ok, ${errCount} errors. → ${outPath}`);
}

main().catch((err) => {
  console.error('crashed:', err);
  process.exit(1);
});
