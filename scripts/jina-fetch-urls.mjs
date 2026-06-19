#!/usr/bin/env node
// Manual Jina corpus fetcher — mirrors services/content-ingest/src/jina.ts +
// corpus.ts (addToCorpus shape) for one-off, operator-driven pulls of
// known URLs into a client corpus. Use when you have a hand-picked list of
// pages (e.g. a client's own blog / press stream) rather than a row-store
// pack. Funder-attributed posts go under their funder_slug; first-party
// press with no single funder goes under a `reach-edu-first-party` bucket.
//
// Idempotent: skips any URL whose exact_url is already in the corpus.
//
// Usage:
//   node scripts/jina-fetch-urls.mjs            # uses the MANIFEST below
//   node scripts/jina-fetch-urls.mjs --dry-run  # fetch + report, write nothing
//
// Reads JINA_AI_API_KEY from augment-it/.env (Jina paid tier; the service
// reads JINA_API_KEY in-container, but the committed .env var is JINA_AI_API_KEY).

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const CLIENT_ID = 'reach-edu';
const CORPUS_ROOT = join(REPO_ROOT, 'clients', CLIENT_ID, 'corpus');
const JINA_BASE = 'https://r.jina.ai/';
const DRY_RUN = process.argv.includes('--dry-run');

// bucket = the corpus subdir (funder_slug). related_funder_slug records the
// aboutness edge when first-party content also concerns a specific funder
// (the filesystem can only carry one folder; the DB/graph carries both).
const FIRST_PARTY = 'reach-edu-first-party';
const MANIFEST = [
  { url: 'https://reach.edu/blog/reach-university-secures-2m-grant-carnegie-corporation-of-new-york', bucket: 'carnegie-corporation', related_funder_slug: 'carnegie-corporation' },
  { url: 'https://reach.edu/blog/inside-higher-ed-a-college-for-health-care-apprentices', bucket: FIRST_PARTY },
  { url: 'https://reach.edu/blog/work-shift-a-pioneer-of-apprenticeship-degrees-steps-into-healthcare', bucket: FIRST_PARTY },
  { url: 'https://reach.edu/blog/philanthropy-roundtable-turning-the-workplace-into-the-new-learning-place-with-reach-university', bucket: FIRST_PARTY, related_funder_slug: 'stand-together-trust' },
  { url: 'https://reach.edu/blog/work-forces-podcast-joe-e.-ross-pioneering-the-apprenticeship-degree-model', bucket: FIRST_PARTY },
  { url: 'https://reach.edu/blog/nola.com-with-a-nationwide-teacher-shortage-how-did-jefferson-parish-schools-cut-vacancies-in-half', bucket: FIRST_PARTY },
  { url: 'https://reach.edu/blog/foundation-year-redesign-working-learners', bucket: FIRST_PARTY },
  { url: 'https://reach.edu/blog/al.com-education-lab-low-cost-alabama-program-takes-new-approach-to-train-teachers-transformational', bucket: FIRST_PARTY },
  { url: 'https://reach.edu/blog/chronicle-of-higher-ed-the-slow-rise-of-the-apprentice-degree', bucket: FIRST_PARTY },
  { url: 'https://reach.edu/blog/visionary-voices-transforming-higher-ed-reach-universitys-game-changing-apprenticeship-model', bucket: FIRST_PARTY },
  { url: 'https://reach.edu/blog/futuro-healths-workforcerx-podcast-turning-jobs-into-degrees', bucket: FIRST_PARTY },
];

// Deliberately NOT fetched — already grounded in the corpus, would create
// near-duplicates. Documented here so the manifest is the full record of the
// operator's URL list, not a silently-trimmed subset:
//   - reach.edu/blog/announcement-1m-grant-...-behavioral-health
//       → same announcement already filed under the-goodness-web-foundation/
//         from its thegoodnessweb.org URL (content dupe, different URL).
//   - reach.edu/blog/reach-university-and-training-fund-launch-apprenticeship-college-of-health-...
//       → already filed under ballmer-group-ii/ (and again under inbox/) from
//         this exact reach.edu URL (caught by the exact_url dedupe).

async function loadJinaKey() {
  if (process.env.JINA_AI_API_KEY) return process.env.JINA_AI_API_KEY;
  try {
    const env = await readFile(join(REPO_ROOT, '.env'), 'utf8');
    const m = env.match(/^JINA_AI_API_KEY=(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  } catch {}
  return null;
}

// Set of exact_urls already present anywhere in the corpus (dedupe guard).
async function existingUrls() {
  const urls = new Set();
  let dirs;
  try {
    dirs = (await readdir(CORPUS_ROOT, { withFileTypes: true })).filter((d) => d.isDirectory());
  } catch { return urls; }
  for (const d of dirs) {
    const dir = join(CORPUS_ROOT, d.name);
    let files;
    try { files = (await readdir(dir)).filter((f) => f.endsWith('.md')); } catch { continue; }
    for (const f of files) {
      const raw = await readFile(join(dir, f), 'utf8');
      const m = raw.match(/^exact_url:\s*"?(.+?)"?\s*$/m);
      if (m) urls.add(m[1].trim());
    }
  }
  return urls;
}

function parsePreamble(markdown) {
  const out = {};
  for (const raw of markdown.split('\n').slice(0, 30)) {
    const line = raw.trim();
    if (/^Markdown Content:/i.test(line)) break;
    if (line === '') continue;
    const m = line.match(/^([A-Za-z][A-Za-z0-9 _-]{0,40}):\s+(.+)$/);
    if (m && m[2].trim() !== '') out[m[1].trim()] = m[2].trim();
  }
  return out;
}

function normalizeToISO(raw) {
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function extractTitle(markdown, url) {
  for (const line of markdown.split('\n', 10)) {
    const m = line.match(/^Title:\s*(.+?)\s*$/i);
    if (m) return m[1].trim();
  }
  for (const line of markdown.split('\n', 10)) {
    const m = line.match(/^#\s+(.+?)\s*$/);
    if (m) return m[1].trim();
  }
  return url;
}

function slugify(s) {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/g, '');
}

function yamlString(s) {
  return `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

async function fetchOnce(url, key) {
  const fetched_at = new Date().toISOString();
  const headers = { Accept: 'text/markdown' };
  if (key) headers.Authorization = `Bearer ${key}`;
  const res = await fetch(JINA_BASE + url, { headers });
  if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status} ${res.statusText}`, fetched_at };
  const markdown = await res.text();
  if (!markdown.trim()) return { ok: false, error: 'empty body', fetched_at };
  const preamble = parsePreamble(markdown);
  const published_at = preamble['Published Time'] ? normalizeToISO(preamble['Published Time']) : null;
  return {
    ok: true, markdown, fetched_at,
    title: extractTitle(markdown, url),
    published_at,
    status: res.status,
  };
}

async function fetchWithRetry(url, key) {
  let backoff = 2000;
  for (let i = 0; i < 3; i++) {
    const r = await fetchOnce(url, key);
    if (r.ok || r.status !== 429) return r;
    if (i < 2) { await new Promise((res) => setTimeout(res, backoff)); backoff *= 2; }
  }
  return { ok: false, error: '429 after retries' };
}

function buildFrontmatter(item, r) {
  const datePart = r.fetched_at.slice(0, 10);
  const lines = ['---'];
  lines.push(`title: ${yamlString(r.title)}`);
  lines.push(`exact_url: ${yamlString(item.url)}`);
  lines.push(`fetched_at: ${r.fetched_at}`);
  if (r.published_at) lines.push(`published_at: ${yamlString(r.published_at)}`);
  lines.push(`record_id: null`);
  lines.push(`response_id: null`);
  lines.push(`client_id: ${yamlString(CLIENT_ID)}`);
  lines.push(`funder_slug: ${yamlString(item.bucket)}`);
  lines.push(`pack_id: "manual"`);
  lines.push('tags: []');
  lines.push('extra_metadata:');
  lines.push(`  jina_status: ${yamlString(String(r.status))}`);
  lines.push(`  content_length_bytes: ${yamlString(String(r.markdown.length))}`);
  lines.push(`  source: "first-party"`);
  lines.push(`  source_domain: "reach.edu"`);
  lines.push(`  ingest_method: "manual-jina-cli"`);
  lines.push(`  ingested_by: "claude-code"`);
  if (item.related_funder_slug && item.related_funder_slug !== item.bucket) {
    lines.push(`  related_funder_slug: ${yamlString(item.related_funder_slug)}`);
  }
  lines.push('---');
  return { fm: lines.join('\n'), datePart };
}

async function main() {
  const key = await loadJinaKey();
  if (!key) console.warn('⚠  No JINA_AI_API_KEY found — trying free tier (lower rate limits).');
  const seen = await existingUrls();
  let written = 0, skipped = 0, failed = 0;

  for (const item of MANIFEST) {
    if (seen.has(item.url)) { console.log(`SKIP (dupe)      ${item.url}`); skipped++; continue; }
    const r = await fetchWithRetry(item.url, key);
    if (!r.ok) { console.log(`FAIL  ${r.error}  ${item.url}`); failed++; continue; }
    const { fm, datePart } = buildFrontmatter(item, r);
    const slug = slugify(r.title) || slugify(item.url);
    const baseDir = join(CORPUS_ROOT, item.bucket);
    let filename = `${datePart}_${slug}.md`;
    let target = join(baseDir, filename);
    // collision suffix (mirrors corpus.ts)
    let tries = 0;
    while (await readFile(target).then(() => true).catch(() => false)) {
      const suffix = Math.random().toString(36).slice(2, 6);
      filename = `${datePart}_${slug}_${suffix}.md`;
      target = join(baseDir, filename);
      if (++tries > 8) break;
    }
    if (DRY_RUN) {
      console.log(`WOULD WRITE [${item.bucket}] ${filename}  (${r.markdown.length}b, pub ${r.published_at ?? 'n/a'})`);
      written++; continue;
    }
    await mkdir(baseDir, { recursive: true });
    await writeFile(target, `${fm}\n${r.markdown.trim()}\n`, 'utf8');
    seen.add(item.url);
    console.log(`WROTE [${item.bucket}] ${filename}  (${r.markdown.length}b, pub ${r.published_at ?? 'n/a'})`);
    written++;
  }
  console.log(`\nDone. written=${written} skipped=${skipped} failed=${failed}${DRY_RUN ? ' (dry-run)' : ''}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
