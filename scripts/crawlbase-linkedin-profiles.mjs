#!/usr/bin/env node
// ============================================================================
// crawlbase-linkedin-profiles.mjs
//
// Fetches LinkedIn profile data for a queue of profile URLs via Crawlbase's
// Crawling API with their pre-built linkedin-profile scraper. Returns
// structured JSON per profile — no HTML parsing needed.
//
// Usage
// -----
//   node scripts/crawlbase-linkedin-profiles.mjs \
//     --queue  <path-to-urls.json> \
//     --out    <path-to-output.csv> \
//     [--token <crawlbase-token>] \
//     [--throttle-ms <ms-between-requests>]
//
// If --token is omitted, reads from CRAWLBASE_TOKEN env var (loaded from
// clients/<workspace>/.env per [[Workspaces-as-Tenant-Primitive]] when
// run via augment-it, or from your shell otherwise).
//
// Resumable: if --out already exists, the script reads it and skips any
// profile_url already present. So crashing/interrupting and re-running
// picks up where you left off.
//
// Throttle: defaults to 1100ms between requests. Crawlbase's free tier
// allows 20 req/s, but going slower is friendlier and gives their
// proxies time to rotate.
//
// Output CSV columns
// ------------------
//   profile_url, name, headline, location, current_company, current_title,
//   about, experience_json, education_json, skills_json, fetched_at,
//   crawlbase_status, crawlbase_error
//
// experience_json / education_json / skills_json hold the structured
// arrays serialized as JSON strings (one cell each) so the row stays
// tabular for spreadsheet import.
// ============================================================================

import { readFile, writeFile, appendFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const flag = argv[i];
    const val = argv[i + 1];
    if (flag === '--queue') { out.queue = val; i += 1; }
    else if (flag === '--out') { out.out = val; i += 1; }
    else if (flag === '--token') { out.token = val; i += 1; }
    else if (flag === '--throttle-ms') { out.throttleMs = Number(val); i += 1; }
    else if (flag === '--help' || flag === '-h') { out.help = true; }
  }
  return out;
}

function usage() {
  console.log(`Usage:
  node scripts/crawlbase-linkedin-profiles.mjs \\
    --queue  <urls.json> \\
    --out    <out.csv> \\
    [--token <crawlbase-token>] \\
    [--throttle-ms <ms>]

Reads a JSON array of LinkedIn profile URLs and fetches each via
Crawlbase's linkedin-profile scraper. Resumable: skips URLs already
in --out so re-running picks up where the last run stopped.
`);
}

const HEADERS = [
  'profile_url',
  'name',
  'headline',
  'location',
  'current_company',
  'current_title',
  'about',
  'experience_json',
  'education_json',
  'skills_json',
  'fetched_at',
  'crawlbase_status',
  'crawlbase_error',
];

function csvEscape(s) {
  const v = String(s ?? '');
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

async function readDoneUrls(outPath) {
  try {
    await access(outPath);
  } catch {
    return new Set();
  }
  const text = await readFile(outPath, 'utf8');
  const lines = text.split('\n').filter(Boolean);
  if (lines.length <= 1) return new Set();
  const done = new Set();
  for (const line of lines.slice(1)) {
    // First column is profile_url. Handles unquoted URLs (no embedded
    // commas/newlines/quotes in normalized LinkedIn URLs).
    const first = line.split(',')[0];
    if (first) done.add(first.trim());
  }
  return done;
}

function normalizeProfileUrl(u) {
  try {
    const url = new URL(u);
    const m = url.pathname.match(/^\/in\/[^/]+/);
    const path = m ? m[0] : url.pathname.replace(/\/$/, '');
    return `${url.origin}${path}`.toLowerCase();
  } catch {
    return String(u).toLowerCase();
  }
}

function pickFirst(...vals) {
  for (const v of vals) {
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return '';
}

function rowFromScrape(profile_url, json) {
  // Crawlbase's linkedin-profile scraper returns a shape like:
  //   { name, headline, location, summary (=about), currentPosition,
  //     experience: [...], education: [...], skills: [...] }
  // Field names vary slightly across their scraper versions; we
  // defensively pick from several candidates.
  const name = pickFirst(json?.name, json?.fullName, json?.full_name);
  const headline = pickFirst(json?.headline, json?.title, json?.tagline);
  const location = pickFirst(json?.location, json?.geoLocation, json?.locationName);
  const about = pickFirst(json?.about, json?.summary, json?.bio);
  const experience = Array.isArray(json?.experience) ? json.experience
    : Array.isArray(json?.experiences) ? json.experiences
    : [];
  const education = Array.isArray(json?.education)
    ? json.education
    : Array.isArray(json?.educations) ? json.educations
    : [];
  const skills = Array.isArray(json?.skills) ? json.skills : [];
  // Current company / title: prefer explicit fields; fall back to
  // experience[0] if present.
  let current_company = pickFirst(
    json?.currentPosition?.companyName,
    json?.currentCompany,
    json?.current_company,
    experience[0]?.companyName,
    experience[0]?.company,
  );
  let current_title = pickFirst(
    json?.currentPosition?.title,
    json?.currentTitle,
    json?.current_title,
    experience[0]?.title,
    experience[0]?.position,
  );

  return {
    profile_url,
    name,
    headline,
    location,
    current_company,
    current_title,
    about,
    experience_json: JSON.stringify(experience),
    education_json: JSON.stringify(education),
    skills_json: JSON.stringify(skills),
    fetched_at: new Date().toISOString(),
    crawlbase_status: 'ok',
    crawlbase_error: '',
  };
}

function rowFromError(profile_url, status, error) {
  return {
    profile_url,
    name: '', headline: '', location: '',
    current_company: '', current_title: '', about: '',
    experience_json: '[]', education_json: '[]', skills_json: '[]',
    fetched_at: new Date().toISOString(),
    crawlbase_status: status,
    crawlbase_error: String(error || '').slice(0, 500),
  };
}

function rowToCsv(row) {
  return HEADERS.map((h) => csvEscape(row[h])).join(',');
}

async function ensureHeader(outPath) {
  try {
    await access(outPath);
  } catch {
    await writeFile(outPath, HEADERS.join(',') + '\n');
  }
}

async function fetchProfile(token, profileUrl) {
  // Crawlbase Crawling API with their linkedin-profile data scraper.
  // The scraper parameter tells Crawlbase to parse the response into
  // structured JSON before returning.
  const params = new URLSearchParams({
    token,
    url: profileUrl,
    scraper: 'linkedin-profile',
  });
  const apiUrl = `https://api.crawlbase.com/?${params.toString()}`;
  const res = await fetch(apiUrl);
  // Crawlbase puts original-site status in pc_status header and their
  // own status in original_status header — but both indicate the same
  // outcome for our purposes via res.status.
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`http ${res.status}: ${text.slice(0, 200)}`);
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch (err) {
    // When the scraper can't parse (e.g., login wall, captcha, weird
    // page), Crawlbase returns raw HTML instead. That's a soft failure.
    throw new Error(`scraper returned non-JSON (likely a login wall / captcha)`);
  }
  // Crawlbase's data scrapers wrap the actual parsed result in a body
  // sometimes. Check both shapes.
  return json.body && typeof json.body === 'object' ? json.body : json;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.queue || !args.out) {
    usage();
    process.exit(args.help ? 0 : 1);
  }
  const token = args.token || process.env.CRAWLBASE_TOKEN;
  if (!token) {
    console.error('🚨 No Crawlbase token. Pass --token <token> or set CRAWLBASE_TOKEN env var.');
    console.error('   For augment-it tenants: put CRAWLBASE_TOKEN=... in clients/<slug>/.env');
    process.exit(1);
  }
  const throttleMs = Number.isFinite(args.throttleMs) ? args.throttleMs : 1100;

  const queueRaw = await readFile(args.queue, 'utf8');
  const queue = JSON.parse(queueRaw);
  if (!Array.isArray(queue)) {
    console.error('queue file is not a JSON array');
    process.exit(1);
  }

  const outPath = resolve(args.out);
  await ensureHeader(outPath);
  const done = await readDoneUrls(outPath);
  const todo = queue.filter((u) => !done.has(u));

  console.log(`queue:       ${queue.length}`);
  console.log(`already done: ${done.size}`);
  console.log(`to fetch:    ${todo.length}`);
  console.log(`out:         ${outPath}`);
  console.log(`throttle:    ${throttleMs}ms`);
  console.log('');

  let ok = 0, fail = 0;
  for (let i = 0; i < todo.length; i += 1) {
    const url = todo[i];
    const label = `[${i + 1}/${todo.length}] ${url}`;
    try {
      const json = await fetchProfile(token, url);
      const row = rowFromScrape(url, json);
      await appendFile(outPath, rowToCsv(row) + '\n');
      ok += 1;
      console.log(`  ok  ${label}  ${row.name ? `(${row.name})` : ''}`);
    } catch (err) {
      const row = rowFromError(url, 'error', err && err.message ? err.message : err);
      await appendFile(outPath, rowToCsv(row) + '\n');
      fail += 1;
      console.log(`  ERR ${label}  ${err && err.message ? err.message : err}`);
    }
    if (i < todo.length - 1) {
      await new Promise((r) => setTimeout(r, throttleMs));
    }
  }

  console.log('');
  console.log(`done. ${ok} ok, ${fail} error, total ${ok + fail} (skipped ${done.size} already done).`);
}

main().catch((err) => {
  console.error('crashed:', err);
  process.exit(1);
});
