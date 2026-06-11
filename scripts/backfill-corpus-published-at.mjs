// Backfill published_at into corpus .md frontmatter by parsing the
// Jina preamble that's still sitting in the body of every legacy file.
//
//   node backfill-corpus-published-at.mjs [--client <slug>] [--apply]
//
// Why this exists: jina.ts didn't lift Jina's `Published Time:` preamble
// line into frontmatter until 2026-06-11 (the forward fix in this same
// session). Every .md captured before then has the date sitting in the
// markdown body but absent from frontmatter — sort/filter UIs can't see
// it. This script extracts it and stamps top-level `published_at:`.
//
// What it does:
//   - Walks clients/<client>/corpus/**/*.md.
//   - Categorizes each file:
//       already-stamped — frontmatter already has published_at; left alone
//       backfill         — body has Published Time; will be lifted to FM
//       no-published-time — body has no preamble entry (PDF text, hand
//                            captures, sources where Jina didn't extract)
//   - Dry-run by default. Pass --apply to actually rewrite files.
//
// Inserts the `published_at:` line directly after the existing
// `fetched_at:` line — mirrors what jina.ts now does on fresh writes,
// so output of this script is indistinguishable from a post-fix capture.
// Date is normalized to ISO 8601 (matches the live writer). Idempotent:
// re-running on a freshly-stamped file falls through to already-stamped.

import { readFile, readdir, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const args = parseArgs(process.argv.slice(2));
const CLIENT_ID = args.client ?? 'reach-edu';
const APPLY = Boolean(args.apply);
const REPO_ROOT = new URL('..', import.meta.url).pathname;
const CORPUS_ROOT = join(REPO_ROOT, 'clients', CLIENT_ID, 'corpus');

const buckets = {
  alreadyStamped: [],
  backfill: [],
  noPublishedTime: [],
};

await walkAndCategorize(CORPUS_ROOT);

if (APPLY) {
  for (const item of buckets.backfill) {
    const next = insertPublishedAt(item.raw, item.frontmatterEnd, item.publishedAt);
    await writeFile(item.path, next, 'utf8');
  }
}

printReport(buckets, APPLY);

async function walkAndCategorize(root) {
  const subdirs = await listSubdirs(root);
  for (const sub of subdirs) {
    const dir = join(root, sub);
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (err) {
      if (err.code === 'ENOENT') continue;
      throw err;
    }
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith('.md')) continue;
      const path = join(dir, e.name);
      const raw = await readFile(path, 'utf8');
      const fm = readFrontmatter(raw);
      if (!fm) continue;
      const relPath = path.slice(REPO_ROOT.length);
      if (fm.fields.published_at) {
        buckets.alreadyStamped.push({ path: relPath });
        continue;
      }
      const bodyStart = fm.blockEnd + 4; // skip the closing '---\n'
      const body = raw.slice(bodyStart);
      const publishedTime = extractPublishedTime(body);
      if (!publishedTime) {
        buckets.noPublishedTime.push({ path: relPath });
        continue;
      }
      const iso = normalizeToISO(publishedTime);
      if (!iso) {
        // Treat un-parseable dates as no-publish — better than stamping
        // garbage. Surface the raw string in the report so an operator
        // can hand-correct if it matters.
        buckets.noPublishedTime.push({
          path: relPath,
          un_parseable_raw_date: publishedTime,
        });
        continue;
      }
      buckets.backfill.push({
        path,
        relPath,
        raw,
        frontmatterEnd: fm.blockEnd,
        rawDate: publishedTime,
        publishedAt: iso,
      });
    }
  }
}

async function listSubdirs(root) {
  try {
    return (await readdir(root, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`corpus root does not exist: ${root}`);
    }
    throw err;
  }
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--client') out.client = argv[++i];
    else if (a.startsWith('--client=')) out.client = a.slice('--client='.length);
  }
  return out;
}

function readFrontmatter(raw) {
  if (!raw.startsWith('---\n') && !raw.startsWith('---\r\n')) return null;
  const after = raw.indexOf('\n---', 3);
  if (after < 0) return null;
  const block = raw.slice(4, after);
  const fields = {};
  for (const line of block.split('\n')) {
    const m = line.match(/^([a-z_][a-z0-9_]*):\s*(.*)$/i);
    if (!m) continue;
    const [, key, rest] = m;
    if (rest === '' || rest === '[]') continue;
    fields[key] = unquote(rest.trim());
  }
  return { fields, blockEnd: after + 1 };
}

function unquote(s) {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
  return s;
}

// Reads Jina's preamble — same logic as services/content-ingest/src/
// jina.ts parsePreamble. Blank lines between entries are NOT a
// terminator; the `Markdown Content:` marker is, and we cap at 30 lines.
function extractPublishedTime(body) {
  const lines = body.split('\n').slice(0, 30);
  for (const raw of lines) {
    const line = raw.trim();
    if (/^Markdown Content:/i.test(line)) break;
    if (line === '') continue;
    const m = line.match(/^Published Time:\s+(.+)$/i);
    if (m) return m[1].trim();
  }
  return null;
}

function normalizeToISO(s) {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? s : d.toISOString();
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function insertPublishedAt(raw, frontmatterEnd, publishedAt) {
  const newline = `published_at: "${publishedAt}"\n`;
  // Find the fetched_at line WITHIN the frontmatter block only.
  const block = raw.slice(0, frontmatterEnd);
  const fetchedAtMatch = block.match(/^fetched_at:[^\n]*\n/m);
  if (fetchedAtMatch) {
    const insertAt = fetchedAtMatch.index + fetchedAtMatch[0].length;
    return raw.slice(0, insertAt) + newline + raw.slice(insertAt);
  }
  // Defensive fallback: insert just before the closing ---.
  return raw.slice(0, frontmatterEnd) + newline + raw.slice(frontmatterEnd);
}

function printReport(buckets, applied) {
  const total =
    buckets.alreadyStamped.length +
    buckets.backfill.length +
    buckets.noPublishedTime.length;
  console.log('');
  console.log(`== published_at backfill report (${applied ? 'APPLIED' : 'DRY RUN'}) ==`);
  console.log(`total files inspected:              ${total}`);
  console.log(`already stamped:                    ${buckets.alreadyStamped.length}`);
  console.log(`${applied ? 'stamped now:                       ' : 'would stamp:                       '} ${buckets.backfill.length}`);
  console.log(`no Published Time in body:          ${buckets.noPublishedTime.length}`);
  const unParseable = buckets.noPublishedTime.filter((e) => e.un_parseable_raw_date);
  if (unParseable.length) {
    console.log('');
    console.log(`-- un-parseable date strings (date present but couldn't normalize; ${unParseable.length} files) --`);
    for (const e of unParseable.slice(0, 10)) {
      console.log(`  ${e.path}`);
      console.log(`    raw: ${e.un_parseable_raw_date}`);
    }
    if (unParseable.length > 10) console.log(`  … and ${unParseable.length - 10} more`);
  }
  if (buckets.backfill.length && !applied) {
    console.log('');
    console.log('-- sample of dates that would land --');
    for (const e of buckets.backfill.slice(0, 5)) {
      console.log(`  ${e.path}`);
      console.log(`    raw: ${e.rawDate}  →  iso: ${e.publishedAt}`);
    }
    if (buckets.backfill.length > 5) console.log(`  … and ${buckets.backfill.length - 5} more`);
  }
  console.log('');
  if (!applied && buckets.backfill.length) {
    console.log(`re-run with --apply to stamp ${buckets.backfill.length} files.`);
  }
}
