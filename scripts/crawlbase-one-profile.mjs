#!/usr/bin/env node
// ============================================================================
// crawlbase-one-profile.mjs
//
// Re-do (or first-time fetch) one or more LinkedIn profile URLs through
// Crawlbase: submit async → poll for storage → decode → append to the
// existing CSV + JSONL pair.
//
// Use cases:
//   - Re-try a profile that came back as empty_skeleton.
//   - Add a one-off URL outside the original batch.
//   - Tail-fill after spotting a gap.
//
// Usage
// -----
//   # Single URL, append to most-recent CSV under clients/*/inputs/:
//   node scripts/crawlbase-one-profile.mjs https://www.linkedin.com/in/foo
//
//   # Multiple URLs:
//   node scripts/crawlbase-one-profile.mjs https://…/foo https://…/bar
//
//   # Pipe from another command (one URL per line):
//   awk -F, 'NR>1 && $20=="empty_skeleton" {print $1}' run.csv \
//     | xargs node scripts/crawlbase-one-profile.mjs
//
//   # Explicit CSV target:
//   node scripts/crawlbase-one-profile.mjs --out path/to/run.csv https://…/foo
//
// CSV column order must match crawlbase-bulk-collect.mjs HEADERS — kept
// in sync by copy. JSONL appends a fresh line per profile.
// ============================================================================

import { readFile, writeFile, appendFile, access, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';

const HEADERS = [
  'profile_url',
  'canonical_profile_url',
  'name',
  'headline',
  'location',
  'current_company',
  'current_company_url',
  'about',
  'connections_count',
  'followers_count',
  'experience_total',
  'education_count',
  'recommendations_count',
  'website_link',
  'profile_image',
  'cover_image',
  'first_school',
  'first_school_dates',
  'fetched_at',
  'crawlbase_status',
  'crawlbase_error',
];

const csvEscape = (s) => {
  const v = String(s ?? '');
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

const rowToCsv = (row) => HEADERS.map((h) => csvEscape(row[h])).join(',');

function pickFirst(...vals) {
  for (const v of vals) if (v !== undefined && v !== null && v !== '') return v;
  return '';
}

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
  const experience_total = json?.experience?.experienceTotal ?? '';
  const education = Array.isArray(json?.education) ? json.education : [];
  const recommendations = Array.isArray(json?.recommendations) ? json.recommendations : [];
  const firstEdu = education[0] || {};
  const firstSchoolDates = firstEdu.startDate || firstEdu.endDate
    ? `${firstEdu.startDate || ''}-${firstEdu.endDate || ''}`
    : '';
  return {
    profile_url,
    canonical_profile_url: pickFirst(json?.profileUrl),
    name,
    headline,
    location,
    current_company,
    current_company_url,
    about,
    connections_count,
    followers_count,
    experience_total,
    education_count: education.length,
    recommendations_count: recommendations.length,
    website_link: pickFirst(json?.websiteInfo?.link),
    profile_image: pickFirst(json?.profileImage),
    cover_image: pickFirst(json?.coverImage),
    first_school: pickFirst(firstEdu.school),
    first_school_dates: firstSchoolDates,
    fetched_at: new Date().toISOString(),
    crawlbase_status: 'ok',
    crawlbase_error: '',
  };
}

function rowFromError(profile_url, status, error) {
  return {
    profile_url, canonical_profile_url: '',
    name: '', headline: '', location: '',
    current_company: '', current_company_url: '', about: '',
    connections_count: '', followers_count: '',
    experience_total: '', education_count: '', recommendations_count: '',
    website_link: '', profile_image: '', cover_image: '',
    first_school: '', first_school_dates: '',
    fetched_at: new Date().toISOString(),
    crawlbase_status: status,
    crawlbase_error: String(error || '').slice(0, 500),
  };
}

function decodeBody(bodyB64) {
  const buf = Buffer.from(bodyB64, 'base64');
  if (buf[0] === 0x1f && buf[1] === 0x8b) return gunzipSync(buf).toString('utf8');
  return buf.toString('utf8');
}

async function fileExists(p) { try { await access(p); return true; } catch { return false; } }

async function findLatestCsv() {
  const candidates = [];
  for (const slug of await readdir('clients').catch(() => [])) {
    const inputs = join('clients', slug, 'inputs');
    try {
      for (const f of await readdir(inputs)) {
        if (f.endsWith('-crawlbase-profiles.csv')) candidates.push(join(inputs, f));
      }
    } catch {}
  }
  if (!candidates.length) return null;
  const withMtime = await Promise.all(candidates.map(async (p) => ({ p, m: (await stat(p)).mtimeMs })));
  withMtime.sort((a, b) => b.m - a.m);
  return withMtime[0].p;
}

function parseArgs(argv) {
  const out = { urls: [] };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--out') { out.out = argv[i + 1]; i += 1; }
    else if (a === '--token') { out.token = argv[i + 1]; i += 1; }
    else if (a === '--max-wait') { out.maxWait = Number(argv[i + 1]); i += 1; }
    else if (a === '--help' || a === '-h') { out.help = true; }
    else if (a.startsWith('http')) { out.urls.push(a); }
    else { console.error('unknown arg:', a); process.exit(1); }
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function submitOne(token, url) {
  const params = new URLSearchParams({
    token,
    url,
    scraper: 'linkedin-profile',
    async: 'true',
  });
  const apiUrl = `https://api.crawlbase.com/?${params.toString()}`;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const res = await fetch(apiUrl);
    const text = await res.text();
    try {
      const j = JSON.parse(text);
      if (j.rid) return { rid: j.rid };
      if (attempt === 3) return { error: `no rid after 3 attempts: ${text.slice(0, 200)}` };
    } catch {
      if (attempt === 3) return { error: `non-json submit response: ${text.slice(0, 200)}` };
    }
    await sleep(2000 * attempt);
  }
  return { error: 'unreachable' };
}

async function fetchOne(token, rid) {
  const res = await fetch(`https://api.crawlbase.com/storage/bulk?token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rids: [rid] }),
  });
  if (!res.ok) return { error: `bulk http ${res.status}: ${(await res.text()).slice(0, 200)}` };
  let arr;
  try { arr = JSON.parse(await res.text()); }
  catch (e) { return { error: `non-json bulk response: ${e.message}` }; }
  if (!arr.length) return { notReady: true };
  const entry = arr[0];
  if (!entry.body) return { notReady: true };
  try {
    const decoded = decodeBody(entry.body);
    const json = JSON.parse(decoded);
    return { json };
  } catch (e) { return { error: `decode/parse: ${e.message}` }; }
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || args.urls.length === 0) {
    console.log(`Usage:
  node scripts/crawlbase-one-profile.mjs <url> [<url2> ...] [--out path.csv] [--max-wait 120]
`);
    process.exit(args.help ? 0 : 1);
  }
  const token = args.token || process.env.CRAWLBASE_TOKEN;
  if (!token) { console.error('No CRAWLBASE_TOKEN in env. Pass --token or export.'); process.exit(1); }

  const outPath = resolve(args.out || (await findLatestCsv()) || '');
  if (!outPath) { console.error('No --out and no *-crawlbase-profiles.csv found under clients/*/inputs/.'); process.exit(1); }
  const jsonlPath = outPath.endsWith('.csv') ? outPath.replace(/\.csv$/, '.jsonl') : outPath + '.jsonl';

  // Create CSV with header if missing.
  if (!(await fileExists(outPath))) {
    await writeFile(outPath, HEADERS.join(',') + '\n');
    await writeFile(jsonlPath, '');
    console.log('created fresh:', outPath);
  }

  console.log(`csv:   ${outPath}`);
  console.log(`jsonl: ${jsonlPath}`);
  console.log(`urls:  ${args.urls.length}`);
  console.log('');

  const maxWaitSec = args.maxWait ?? 90;
  let okCount = 0, skeletonCount = 0, errCount = 0;

  for (const url of args.urls) {
    process.stdout.write(`→ ${url} … `);
    const sub = await submitOne(token, url);
    if (sub.error) {
      console.log(`SUBMIT-ERR ${sub.error}`);
      await appendFile(outPath, rowToCsv(rowFromError(url, 'submit_error', sub.error)) + '\n');
      await appendFile(jsonlPath, JSON.stringify({ profile_url: url, rid: null, fetched_at: new Date().toISOString(), crawlbase_status: 'submit_error', crawlbase_error: sub.error, scrape: null }) + '\n');
      errCount += 1;
      continue;
    }
    process.stdout.write(`rid=${sub.rid} `);

    // Poll /storage/bulk until ready or timeout.
    let json = null, error = null;
    const start = Date.now();
    let waited = 0;
    while (Date.now() - start < maxWaitSec * 1000) {
      await sleep(5000);
      waited = Math.round((Date.now() - start) / 1000);
      process.stdout.write(`(${waited}s) `);
      const r = await fetchOne(token, sub.rid);
      if (r.json) { json = r.json; break; }
      if (r.error) { error = r.error; break; }
      // notReady: keep polling
    }

    if (error) {
      console.log(`FETCH-ERR ${error}`);
      await appendFile(outPath, rowToCsv(rowFromError(url, 'fetch_error', error)) + '\n');
      await appendFile(jsonlPath, JSON.stringify({ profile_url: url, rid: sub.rid, fetched_at: new Date().toISOString(), crawlbase_status: 'fetch_error', crawlbase_error: error, scrape: null }) + '\n');
      errCount += 1;
      continue;
    }
    if (!json) {
      console.log(`TIMEOUT (${maxWaitSec}s)`);
      await appendFile(outPath, rowToCsv(rowFromError(url, 'timeout', `no body after ${maxWaitSec}s`)) + '\n');
      await appendFile(jsonlPath, JSON.stringify({ profile_url: url, rid: sub.rid, fetched_at: new Date().toISOString(), crawlbase_status: 'timeout', crawlbase_error: `no body after ${maxWaitSec}s`, scrape: null }) + '\n');
      errCount += 1;
      continue;
    }

    if (json && typeof json === 'object') delete json.peopleAlsoViewed;
    const row = rowFromScrape(url, json);
    const isSkeleton = !row.name && !row.headline && !row.about && !row.current_company;
    if (isSkeleton) {
      row.crawlbase_status = 'empty_skeleton';
      skeletonCount += 1;
      console.log(`EMPTY ${waited}s`);
    } else {
      okCount += 1;
      console.log(`OK ${row.name || '(no name)'} @ ${row.current_company || '(no company)'} ${waited}s`);
    }
    await appendFile(outPath, rowToCsv(row) + '\n');
    await appendFile(jsonlPath, JSON.stringify({
      profile_url: url, rid: sub.rid, fetched_at: row.fetched_at,
      crawlbase_status: row.crawlbase_status, crawlbase_error: '', scrape: json,
    }) + '\n');
  }

  console.log('');
  console.log(`done. ${okCount} ok, ${skeletonCount} empty skeletons, ${errCount} errors.`);
}

main().catch((err) => { console.error('crashed:', err); process.exit(1); });
