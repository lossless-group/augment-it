#!/usr/bin/env node
// Inspects what Crawlbase's storage endpoint actually returns for one
// of the RIDs we've already submitted. Prints the raw JSON response so
// we can see the real field shape and fix the field mapping in
// crawlbase-linkedin-profiles.mjs's rowFromScrape().
//
// Usage:
//   node scripts/crawlbase-inspect-storage.mjs <jobs.json>

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

let jobsPath = process.argv[2];
if (!jobsPath) {
  // Auto-discover: most recent *.jobs.json under clients/*/inputs/.
  const clientsDir = 'clients';
  const candidates = [];
  for (const slug of await readdir(clientsDir)) {
    const inputs = join(clientsDir, slug, 'inputs');
    try {
      for (const f of await readdir(inputs)) {
        if (f.endsWith('.jobs.json')) candidates.push(join(inputs, f));
      }
    } catch { /* no inputs dir */ }
  }
  if (candidates.length === 0) {
    console.error('no *.jobs.json found under clients/*/inputs/. Pass path as arg.');
    process.exit(1);
  }
  // Pick most-recently-modified.
  const stats = await Promise.all(candidates.map(async (p) => {
    const { stat } = await import('node:fs/promises');
    return { p, m: (await stat(p)).mtimeMs };
  }));
  stats.sort((a, b) => b.m - a.m);
  jobsPath = stats[0].p;
  console.log('auto-discovered:', jobsPath);
  console.log('');
}
const token = process.env.CRAWLBASE_TOKEN;
if (!token) {
  console.error('No CRAWLBASE_TOKEN in env. export $(grep CRAWLBASE_TOKEN .env | xargs)');
  process.exit(1);
}

const jobs = JSON.parse(await readFile(jobsPath, 'utf8'));
// Find first collected RID.
const entry = Object.entries(jobs).find(([, v]) => v.status === 'collected' && v.rid);
if (!entry) {
  console.error('no collected RIDs found in jobs file');
  process.exit(1);
}
const [url, job] = entry;
console.log('url:', url);
console.log('rid:', job.rid);
console.log('');

const params = new URLSearchParams({ token, rid: job.rid, format: 'json' });
const res = await fetch(`https://api.crawlbase.com/storage?${params.toString()}`);
const text = await res.text();
console.log('http status:', res.status);
console.log('body length:', text.length);
console.log('');
console.log('=== full body ===');
console.log(text);
console.log('=== end ===');
