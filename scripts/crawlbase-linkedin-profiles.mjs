#!/usr/bin/env node
// ============================================================================
// crawlbase-linkedin-profiles.mjs
//
// Fetches LinkedIn profile data for a queue of profile URLs via Crawlbase's
// Crawling API in ASYNC mode (LinkedIn requires async — see Crawlbase docs
// at https://crawlbase.com/docs/crawling-api/parameters/#async).
//
// Two-phase flow:
//   1. Submit:  for each URL, POST to api.crawlbase.com with async=true.
//               Crawlbase queues the request and returns a Request ID (rid).
//               State (url → rid) persists in a JSON sidecar so the script
//               survives crashes and laptop sleep.
//   2. Collect: for each rid not yet collected, GET /storage?rid=…
//               with the linkedin-profile scraper to retrieve the parsed
//               result. Storage retention is 14 days; partial runs resume.
//
// Usage
// -----
//   node scripts/crawlbase-linkedin-profiles.mjs \
//     --queue <urls.json> \
//     --out   <out.csv>   \
//     [--token <crawlbase-token>] \
//     [--phase submit|collect|both]  (default: both)
//     [--poll-interval-ms <ms>]       (default: 15000)
//     [--max-poll-min <minutes>]      (default: 30)
//
// Resumability
// ------------
//   - Submit phase writes <out>.jobs.json mapping url → rid.
//   - Collect phase reads jobs.json + the CSV, skips URLs already in CSV.
//   - Crash mid-submit: re-run with --phase submit; only un-submitted URLs
//     get submitted.
//   - Crash mid-collect: re-run with --phase collect; only un-collected
//     RIDs get polled.
//   - Default phase=both does submit then collect in one process.
// ============================================================================

import { readFile, writeFile, appendFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';

function parseArgs(argv) {
  const out = { phase: 'both' };
  for (let i = 2; i < argv.length; i += 1) {
    const flag = argv[i];
    const val = argv[i + 1];
    if (flag === '--queue') { out.queue = val; i += 1; }
    else if (flag === '--out') { out.out = val; i += 1; }
    else if (flag === '--token') { out.token = val; i += 1; }
    else if (flag === '--phase') { out.phase = val; i += 1; }
    else if (flag === '--poll-interval-ms') { out.pollIntervalMs = Number(val); i += 1; }
    else if (flag === '--max-poll-min') { out.maxPollMin = Number(val); i += 1; }
    else if (flag === '--help' || flag === '-h') { out.help = true; }
  }
  return out;
}

function usage() {
  console.log(`Usage:
  node scripts/crawlbase-linkedin-profiles.mjs \\
    --queue <urls.json> \\
    --out   <out.csv>   \\
    [--token <token>] \\
    [--phase submit|collect|both]  (default: both)
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

const csvEscape = (s) => {
  const v = String(s ?? '');
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

async function fileExists(p) {
  try { await access(p); return true; } catch { return false; }
}

async function readDoneUrls(outPath) {
  if (!(await fileExists(outPath))) return new Set();
  const text = await readFile(outPath, 'utf8');
  const lines = text.split('\n').filter(Boolean);
  if (lines.length <= 1) return new Set();
  const done = new Set();
  for (const line of lines.slice(1)) {
    const first = line.split(',')[0];
    if (first) done.add(first.trim());
  }
  return done;
}

async function readJobs(jobsPath) {
  if (!(await fileExists(jobsPath))) return {};
  try {
    return JSON.parse(await readFile(jobsPath, 'utf8'));
  } catch {
    return {};
  }
}

async function writeJobs(jobsPath, jobs) {
  await writeFile(jobsPath, JSON.stringify(jobs, null, 2));
}

async function ensureHeader(outPath) {
  if (!(await fileExists(outPath))) {
    await writeFile(outPath, HEADERS.join(',') + '\n');
  }
}

function pickFirst(...vals) {
  for (const v of vals) {
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return '';
}

function rowFromScrape(profile_url, json) {
  const name = pickFirst(json?.name, json?.fullName, json?.full_name);
  const headline = pickFirst(json?.headline, json?.title, json?.tagline);
  const location = pickFirst(json?.location, json?.geoLocation, json?.locationName);
  const about = pickFirst(json?.about, json?.summary, json?.bio);
  const experience = Array.isArray(json?.experience) ? json.experience
    : Array.isArray(json?.experiences) ? json.experiences
    : [];
  const education = Array.isArray(json?.education) ? json.education
    : Array.isArray(json?.educations) ? json.educations
    : [];
  const skills = Array.isArray(json?.skills) ? json.skills : [];
  const current_company = pickFirst(
    json?.currentPosition?.companyName,
    json?.currentCompany,
    json?.current_company,
    experience[0]?.companyName,
    experience[0]?.company,
  );
  const current_title = pickFirst(
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

const rowToCsv = (row) => HEADERS.map((h) => csvEscape(row[h])).join(',');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- API CALLS --------------------------------------------------------
async function submitAsync(token, profileUrl) {
  const params = new URLSearchParams({
    token,
    url: profileUrl,
    scraper: 'linkedin-profile',
    async: 'true',
    callback: 'false',
  });
  const res = await fetch(`https://api.crawlbase.com/?${params.toString()}`);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`submit http ${res.status}: ${text.slice(0, 200)}`);
  }
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { throw new Error(`submit returned non-JSON: ${text.slice(0, 200)}`); }
  if (!parsed.rid) {
    throw new Error(`submit returned no rid: ${text.slice(0, 200)}`);
  }
  return parsed.rid;
}

async function pollStorage(token, rid) {
  // The storage endpoint returns 200 with body when ready, or 404 when
  // still processing. Some Crawlbase tiers also return 200 with a
  // "RID not found yet" body — we treat both as "not ready".
  const params = new URLSearchParams({ token, rid, format: 'json' });
  const res = await fetch(`https://api.crawlbase.com/storage?${params.toString()}`);
  const text = await res.text();
  if (res.status === 404) return { ready: false };
  if (!res.ok) return { ready: false, error: `http ${res.status}: ${text.slice(0, 200)}` };
  if (!text || text.length < 5) return { ready: false };
  // Some 200 responses with very short bodies (< 50 chars) are status-only.
  if (text.length < 50 && /not found|processing|pending/i.test(text)) {
    return { ready: false };
  }
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { return { ready: false, error: `storage non-JSON: ${text.slice(0, 200)}` }; }
  const body = parsed.body && typeof parsed.body === 'object' ? parsed.body : parsed;
  return { ready: true, body };
}

// ---- PHASES ----------------------------------------------------------
async function phaseSubmit(token, queue, jobsPath) {
  const jobs = await readJobs(jobsPath);
  let submitted = 0, alreadyHad = 0, failed = 0;
  for (let i = 0; i < queue.length; i += 1) {
    const url = queue[i];
    const label = `[submit ${i + 1}/${queue.length}]`;
    if (jobs[url] && jobs[url].rid) {
      alreadyHad += 1;
      continue;
    }
    try {
      const rid = await submitAsync(token, url);
      jobs[url] = { rid, submitted_at: new Date().toISOString(), status: 'pending' };
      submitted += 1;
      if (submitted % 25 === 0) {
        await writeJobs(jobsPath, jobs);
        console.log(`  ${label} ${url} → rid ${rid.slice(0, 8)}…  (saved progress, ${submitted} new)`);
      } else {
        console.log(`  ${label} ${url} → rid ${rid.slice(0, 8)}…`);
      }
    } catch (err) {
      jobs[url] = { error: err && err.message ? err.message : String(err), submitted_at: new Date().toISOString(), status: 'submit_failed' };
      failed += 1;
      console.log(`  ${label} ${url}  SUBMIT-ERR ${err && err.message ? err.message : err}`);
    }
    await sleep(200);  // small throttle on submission
  }
  await writeJobs(jobsPath, jobs);
  console.log(`submit phase: ${submitted} new, ${alreadyHad} already had, ${failed} failed`);
  return jobs;
}

async function phaseCollect(token, queue, jobsPath, outPath, pollIntervalMs, maxPollMin) {
  await ensureHeader(outPath);
  const jobs = await readJobs(jobsPath);
  const doneUrls = await readDoneUrls(outPath);

  // Identify pending: in jobs with rid, not yet in done CSV.
  const pending = [];
  for (const url of queue) {
    if (doneUrls.has(url)) continue;
    const job = jobs[url];
    if (!job || !job.rid) {
      // Never submitted (submit phase didn't run or failed) — write an
      // error row so the operator knows.
      await appendFile(outPath, rowToCsv(rowFromError(url, 'not_submitted', job?.error || 'no rid')) + '\n');
      continue;
    }
    pending.push({ url, rid: job.rid });
  }
  if (pending.length === 0) {
    console.log('nothing to collect.');
    return;
  }
  console.log(`collect phase: ${pending.length} RIDs to poll. interval=${pollIntervalMs}ms, max=${maxPollMin}min`);

  const startedAt = Date.now();
  const deadline = startedAt + maxPollMin * 60_000;
  let round = 0;
  while (pending.length > 0 && Date.now() < deadline) {
    round += 1;
    let collected = 0;
    let stillPending = [];
    for (let i = 0; i < pending.length; i += 1) {
      const { url, rid } = pending[i];
      try {
        const r = await pollStorage(token, rid);
        if (r.ready) {
          const row = rowFromScrape(url, r.body);
          await appendFile(outPath, rowToCsv(row) + '\n');
          collected += 1;
          // Mark in jobs file for the record.
          if (jobs[url]) { jobs[url].status = 'collected'; jobs[url].collected_at = new Date().toISOString(); }
        } else {
          stillPending.push({ url, rid });
        }
      } catch (err) {
        // Transient — keep in pending; if it persists across rounds
        // we'll eventually time out.
        stillPending.push({ url, rid });
      }
      await sleep(120);  // small throttle on polling
    }
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    console.log(`  round ${round}: collected ${collected}, still pending ${stillPending.length} (elapsed ${elapsed}s)`);
    pending.length = 0;
    pending.push(...stillPending);
    if (pending.length > 0) {
      await writeJobs(jobsPath, jobs);
      await sleep(pollIntervalMs);
    }
  }
  await writeJobs(jobsPath, jobs);

  if (pending.length > 0) {
    console.log(`timed out with ${pending.length} still pending. Re-run with --phase collect to keep polling.`);
    // Don't write error rows for still-pending — re-runnable.
  }
  console.log('collect phase done.');
}

// ---- MAIN ------------------------------------------------------------
async function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.queue || !args.out) {
    usage();
    process.exit(args.help ? 0 : 1);
  }
  const token = args.token || process.env.CRAWLBASE_TOKEN;
  if (!token) {
    console.error('🚨 No Crawlbase token. Pass --token or set CRAWLBASE_TOKEN in env.');
    process.exit(1);
  }
  const pollIntervalMs = Number.isFinite(args.pollIntervalMs) ? args.pollIntervalMs : 15_000;
  const maxPollMin = Number.isFinite(args.maxPollMin) ? args.maxPollMin : 30;

  const queue = JSON.parse(await readFile(args.queue, 'utf8'));
  if (!Array.isArray(queue)) {
    console.error('queue is not a JSON array');
    process.exit(1);
  }

  const outPath = resolve(args.out);
  const jobsPath = outPath.replace(/\.csv$/, '.jobs.json');

  console.log(`queue:    ${queue.length} URLs`);
  console.log(`out:      ${outPath}`);
  console.log(`jobs:     ${jobsPath}`);
  console.log(`phase:    ${args.phase}`);
  console.log('');

  if (args.phase === 'submit' || args.phase === 'both') {
    await phaseSubmit(token, queue, jobsPath);
  }
  if (args.phase === 'collect' || args.phase === 'both') {
    if (args.phase === 'both') {
      console.log('\nwaiting 20s for Crawlbase to start processing the queue…');
      await sleep(20_000);
    }
    await phaseCollect(token, queue, jobsPath, outPath, pollIntervalMs, maxPollMin);
  }
}

main().catch((err) => {
  console.error('crashed:', err);
  process.exit(1);
});
