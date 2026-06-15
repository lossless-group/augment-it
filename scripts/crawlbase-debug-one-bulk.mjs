#!/usr/bin/env node
// Picks ONE rid (by --url, by --index, or default the first) from the most
// recent jobs.json, POSTs it to /storage/bulk, dumps everything we need to
// see the shape Crawlbase actually returned. Writes the full decoded body
// to /tmp/crawlbase-debug-decoded.txt.
//
// Usage:
//   node scripts/crawlbase-debug-one-bulk.mjs                # first rid
//   node scripts/crawlbase-debug-one-bulk.mjs --index 1      # second rid
//   node scripts/crawlbase-debug-one-bulk.mjs --url https://www.linkedin.com/in/...

import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

const args = process.argv.slice(2);
const argMap = {};
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--index') { argMap.index = Number(args[i + 1]); i += 1; }
  else if (args[i] === '--url') { argMap.url = args[i + 1]; i += 1; }
}

const token = process.env.CRAWLBASE_TOKEN;
if (!token) {
  console.error('No CRAWLBASE_TOKEN in env.');
  process.exit(1);
}

const candidates = [];
for (const slug of await readdir('clients').catch(() => [])) {
  const inputs = join('clients', slug, 'inputs');
  try {
    for (const f of await readdir(inputs)) {
      if (f.endsWith('.jobs.json')) candidates.push(join(inputs, f));
    }
  } catch {}
}
if (!candidates.length) { console.error('no *.jobs.json found'); process.exit(1); }
const withMtime = await Promise.all(candidates.map(async (p) => ({ p, m: (await stat(p)).mtimeMs })));
withMtime.sort((a, b) => b.m - a.m);
const jobsPath = withMtime[0].p;

const jobs = JSON.parse(await readFile(jobsPath, 'utf8'));
const entries = Object.entries(jobs).filter(([, v]) => v?.rid);

let picked;
if (argMap.url) {
  picked = entries.find(([u]) => u === argMap.url);
  if (!picked) { console.error('url not found in jobs:', argMap.url); process.exit(1); }
} else {
  const idx = Number.isFinite(argMap.index) ? argMap.index : 0;
  picked = entries[idx];
  if (!picked) { console.error('index out of range:', idx); process.exit(1); }
}
const [url, job] = picked;
const rid = job.rid;

console.log('jobs file:', jobsPath);
console.log('total rids:', entries.length);
console.log('picked url:', url);
console.log('picked rid:', rid);
console.log('');

console.log('POST /storage/bulk with this one rid…');
const res = await fetch(`https://api.crawlbase.com/storage/bulk?token=${token}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ rids: [rid] }),
});
const text = await res.text();
console.log('http status:', res.status);
console.log('content-type:', res.headers.get('content-type'));
console.log('body length:', text.length);
console.log('');

let arr;
try { arr = JSON.parse(text); }
catch { console.log('non-json response:', text.slice(0, 500)); process.exit(0); }
if (!arr.length) { console.log('empty array. raw:', text.slice(0, 500)); process.exit(0); }

const entry = arr[0];
const { body, ...rest } = entry;
console.log('=== entry (without body) ===');
console.log(JSON.stringify(rest, null, 2));
console.log('');

if (!body) { console.log('no body field'); process.exit(0); }
const buf = Buffer.from(body, 'base64');
const isGzip = buf[0] === 0x1f && buf[1] === 0x8b;
const decoded = isGzip ? gunzipSync(buf).toString('utf8') : buf.toString('utf8');
await writeFile('/tmp/crawlbase-debug-decoded.txt', decoded);

let json;
try { json = JSON.parse(decoded); }
catch { console.log('decoded body is not JSON. first 500 chars:'); console.log(decoded.slice(0, 500)); process.exit(0); }

console.log('=== top-level keys ===');
console.log(Object.keys(json));
console.log('');
console.log('=== key values ===');
console.log('title:        ', JSON.stringify(json.title));
console.log('headline:     ', JSON.stringify(json.headline));
console.log('location:     ', JSON.stringify(json.location));
console.log('sublines:     ', JSON.stringify(json.sublines));
console.log('positionInfo: ', JSON.stringify(json.positionInfo));
console.log('summary len:  ', Array.isArray(json.summary) ? json.summary.length : '(not array)');
console.log('experience:   ', JSON.stringify({
  total: json.experience?.experienceTotal,
  groupLen: json.experience?.experienceGroup?.length,
  listLen: json.experience?.experienceList?.length,
}));
console.log('education len:', Array.isArray(json.education) ? json.education.length : '(not array)');
console.log('');
console.log('full decoded body written to /tmp/crawlbase-debug-decoded.txt');
