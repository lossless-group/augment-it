#!/usr/bin/env node
// One-off Jina fetcher for the 2026-07-28 mega-gifts-by-topic research run.
// Sibling of jina-fetch-urls.mjs, but manifest-from-CSV: reads
// clients/reach-edu/outputs/2026-07-28_mega-gifts-by-topic/mega-gifts-by-topic.csv
// and captures every unique source_url into corpus/inbox/ (capture-first per
// corpus AGENTS.md), carrying the row's strategy mapping as top-level
// `strategy_slugs` frontmatter plus a `topic` lane field. Funder aboutness is
// recorded as extra_metadata.suggested_funder_slug for the later triage pass —
// filing into funders/<slug>/ stays a deliberate operator step.
//
// Gated discipline: HTTP-blocked fetches AND "successful" bot-wall bodies
// (Access Denied / Just a moment…) land in inbox/gated/ as stubs — URL still
// wanted, only the fetch failed.
//
// Usage:
//   node scripts/jina-fetch-mega-gifts-sources.mjs --limit 2   # smoke test
//   node scripts/jina-fetch-mega-gifts-sources.mjs             # full run

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const CLIENT_ID = 'reach-edu';
const CLIENT_ROOT = join(REPO_ROOT, 'clients', CLIENT_ID);
const CORPUS_ROOT = join(CLIENT_ROOT, 'corpus');
const CSV_PATH = join(CLIENT_ROOT, 'outputs', '2026-07-28_mega-gifts-by-topic', 'mega-gifts-by-topic.csv');
const RESEARCH_RUN = 'outputs/2026-07-28_mega-gifts-by-topic';
const JINA_BASE = 'https://r.jina.ai/';
const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg !== -1 ? Number(process.argv[limitArg + 1]) : Infinity;

const WALL_TITLE = /access denied|just a moment|attention required|are you a robot|verify you are|cloudflare|forbidden|page not found|error 40\d/i;
const GATED_STATUSES = new Set([401, 402, 403, 404, 451]);

function parseCsv(text) {
  const rows = [];
  let field = '', row = [], inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift();
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

function slugify(s) {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/g, '');
}

function yamlString(s) {
  return `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

async function loadJinaKey() {
  if (process.env.JINA_API_KEY) return process.env.JINA_API_KEY;
  try {
    const env = await readFile(join(REPO_ROOT, '.env'), 'utf8');
    const m = env.match(/^JINA_API_KEY=(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  } catch {}
  return null;
}

// Recursive exact_url scan so inbox/gated/ and strategies/*/sources/ count as "already captured".
async function existingUrls(dir = CORPUS_ROOT, urls = new Set()) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return urls; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await existingUrls(p, urls);
    else if (e.name.endsWith('.md')) {
      const raw = await readFile(p, 'utf8');
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

async function fetchOnce(url, key) {
  const fetched_at = new Date().toISOString();
  const headers = { Accept: 'text/markdown' };
  if (key) headers.Authorization = `Bearer ${key}`;
  const res = await fetch(JINA_BASE + url, { headers });
  if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status} ${res.statusText}`, fetched_at };
  const markdown = await res.text();
  if (!markdown.trim()) return { ok: false, status: res.status, error: 'empty body', fetched_at };
  const preamble = parsePreamble(markdown);
  const published_at = preamble['Published Time']
    ? (Number.isNaN(new Date(preamble['Published Time']).getTime()) ? null : new Date(preamble['Published Time']).toISOString())
    : null;
  return { ok: true, markdown, fetched_at, title: extractTitle(markdown, url), published_at, status: res.status };
}

async function fetchWithRetry(url, key) {
  let backoff = 2000;
  for (let i = 0; i < 3; i++) {
    const r = await fetchOnce(url, key);
    if (r.ok || r.status !== 429) return r;
    if (i < 2) { await new Promise((res) => setTimeout(res, backoff)); backoff *= 2; }
  }
  return { ok: false, status: 429, error: '429 after retries', fetched_at: new Date().toISOString() };
}

function buildFrontmatter(item, r, { gated, title }) {
  const lines = ['---'];
  lines.push(`title: ${yamlString(title)}`);
  lines.push(`exact_url: ${yamlString(item.url)}`);
  lines.push(`fetched_at: ${r.fetched_at}`);
  if (r.published_at) lines.push(`published_at: ${yamlString(r.published_at)}`);
  lines.push(`client_id: ${yamlString(CLIENT_ID)}`);
  lines.push(`funder_slug: "inbox"`);
  lines.push(`record_id: null`);
  lines.push(`response_id: null`);
  lines.push(`pack_id: "inbox"`);
  lines.push(`topic: ${yamlString(item.topics.join('|'))}`);
  lines.push(`strategy_slugs: [${item.strategySlugs.map((s) => yamlString(s)).join(', ')}]`);
  lines.push('tags: []');
  lines.push(`inbox_status: ${yamlString(gated ? 'gated' : 'pending')}`);
  lines.push(`captured_at: ${r.fetched_at}`);
  lines.push(`captured_from: "mega-gifts-by-topic-research"`);
  lines.push(`captured_note: ${yamlString(`Source of a gift/initiative row in ${RESEARCH_RUN}`)}`);
  lines.push(`captured_session_id: null`);
  lines.push(`triaged_at: null`);
  lines.push(`triaged_to: null`);
  lines.push(`triaged_by: null`);
  lines.push(`triaged_note: null`);
  lines.push('extra_metadata:');
  lines.push(`  jina_status: ${yamlString(String(r.status ?? 'n/a'))}`);
  lines.push(`  content_length_bytes: ${yamlString(String(r.markdown ? r.markdown.length : 0))}`);
  if (!r.ok || gated) lines.push(`  fetch_error: ${yamlString(r.error ?? 'bot-wall body')}`);
  lines.push(`  ingest_method: "manual-jina-cli"`);
  lines.push(`  ingested_by: "claude-code"`);
  lines.push(`  research_output: ${yamlString(RESEARCH_RUN)}`);
  lines.push(`  suggested_funder_slug: ${yamlString(item.suggestedFunderSlug)}`);
  lines.push(`  funder_name: ${yamlString(item.funder)}`);
  lines.push(`  recipient_or_initiative: ${yamlString(item.recipient)}`);
  lines.push(`  gift_year: ${yamlString(item.year)}`);
  lines.push(`  amount_display: ${yamlString(item.amount)}`);
  lines.push(`  gift_type: ${yamlString(item.giftType)}`);
  lines.push('---');
  return lines.join('\n');
}

async function writeUnique(baseDir, datePart, slug, content) {
  await mkdir(baseDir, { recursive: true });
  let filename = `${datePart}_${slug}.md`;
  let target = join(baseDir, filename);
  let tries = 0;
  while (await readFile(target).then(() => true).catch(() => false)) {
    const suffix = Math.random().toString(36).slice(2, 6);
    filename = `${datePart}_${slug}_${suffix}.md`;
    target = join(baseDir, filename);
    if (++tries > 8) break;
  }
  await writeFile(target, content, 'utf8');
  return filename;
}

async function main() {
  const key = await loadJinaKey();
  if (!key) console.warn('⚠  No JINA_API_KEY found — trying free tier (lower rate limits).');
  const rows = parseCsv(await readFile(CSV_PATH, 'utf8'));

  // Group rows by URL; union strategy slugs + topics across rows sharing a source.
  const byUrl = new Map();
  for (const row of rows) {
    const url = row.source_url.trim();
    if (!byUrl.has(url)) {
      byUrl.set(url, {
        url,
        topics: [], strategySlugs: [],
        funder: row.funder, recipient: row.recipient_or_initiative,
        year: row.year, amount: row.amount_display, giftType: row.gift_type,
        suggestedFunderSlug: slugify(row.funder),
      });
    }
    const item = byUrl.get(url);
    if (!item.topics.includes(row.topic)) item.topics.push(row.topic);
    for (const s of row.strategy_slugs.split('|')) {
      if (s && !item.strategySlugs.includes(s)) item.strategySlugs.push(s);
    }
  }

  const seen = await existingUrls();
  let written = 0, gatedCount = 0, skipped = 0, processed = 0;

  for (const item of byUrl.values()) {
    if (processed >= LIMIT) break;
    if (seen.has(item.url)) { console.log(`SKIP (dupe)  ${item.url}`); skipped++; continue; }
    processed++;
    const r = await fetchWithRetry(item.url, key);
    const wallBody = r.ok && (WALL_TITLE.test(r.title) || r.markdown.length < 900);
    const gated = !r.ok || wallBody;
    const title = r.ok ? r.title : `Fetch failed (${r.error})`;
    const fm = buildFrontmatter(item, r, { gated, title });
    const body = r.ok ? r.markdown.trim() : `Fetch failed: ${r.error}. URL still wanted — re-fetch later.`;
    const slug = slugify(r.ok ? r.title : item.url) || slugify(item.url);
    const dir = gated ? join(CORPUS_ROOT, 'inbox', 'gated') : join(CORPUS_ROOT, 'inbox');
    const filename = await writeUnique(dir, r.fetched_at.slice(0, 10), slug, `${fm}\n${body}\n`);
    seen.add(item.url);
    if (gated) {
      console.log(`GATED [inbox/gated] ${filename}  (${r.error ?? `wall body ${r.markdown.length}b "${r.title}"`})`);
      gatedCount++;
    } else {
      console.log(`WROTE [inbox] ${filename}  (${r.markdown.length}b, pub ${r.published_at ?? 'n/a'}, strategies ${item.strategySlugs.join('|')})`);
      written++;
    }
  }
  console.log(`\nDone. written=${written} gated=${gatedCount} skipped=${skipped} of ${byUrl.size} unique urls`);
}

main().catch((e) => { console.error(e); process.exit(1); });
