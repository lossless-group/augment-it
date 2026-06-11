// Backfill record_uuid into corpus .md frontmatter.
//
//   node backfill-corpus-record-uuid.mjs [--client <slug>] [--apply]
//
// Why this exists: corpus.list_for_record (services/content-ingest/src/
// corpus.ts) joins files to v10 rows via three strategies:
//   1. strict record_id match  (file.record_id === row.row_id)
//   2. record_uuid match       (file.record_uuid === row.record_uuid)
//   3. lineage walk            (row-store.get(file.record_id).record_uuid
//                                === row.record_uuid)
// Strategy 3 fails when the file's record_id points at a row-set that
// row-store no longer holds — common for the v8-era set
// `rs_mq7aabtq_oqy3x6` that produced ~96 corpus files. If we stamp the
// file's record_uuid NOW while row-store still resolves those legacy
// row_ids, strategy 2 keeps working forever — independent of row-store
// churn.
//
// What this script does:
//   - Pulls the row_id → record_uuid map via NATS row.list.requested
//     (same call content-ingest's getRecordUuidByRowId uses).
//   - Walks clients/<client>/corpus/**/*.md.
//   - Categorizes each file:
//       already-stamped   — file has record_uuid; left alone
//       backfill          — record_id resolves; record_uuid will be added
//       stale-uuid        — file has record_uuid but it disagrees with
//                            row-store's lookup; LOGGED, never overwritten
//       orphan-no-row     — file's record_id is non-null but row-store
//                            doesn't know it (deleted row-set / never
//                            ingested)
//       orphan-null-id    — file has no record_id at all (mostly inbox/)
//   - Dry-run by default. Pass --apply to actually rewrite files.
//
// Stale-uuid is the dangerous case. We never overwrite a stamped
// record_uuid with a different one — that would mask a real disagreement
// the operator needs to see. The log lists every stale-uuid path; the
// operator decides per-file whether to hand-correct or route through the
// pending corpus-overrides.yaml mechanism.
//
// Inserts the record_uuid line directly after record_id in the existing
// frontmatter rather than re-serializing the whole block — preserves
// the original ordering, quoting style, and any keys the parser doesn't
// know about. Idempotent: re-running on a freshly-stamped file falls
// through to already-stamped.

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { connect, JSONCodec } from 'nats';

const args = parseArgs(process.argv.slice(2));
const CLIENT_ID = args.client ?? 'reach-edu';
const APPLY = Boolean(args.apply);
const REPO_ROOT = new URL('..', import.meta.url).pathname;
const CORPUS_ROOT = join(REPO_ROOT, 'clients', CLIENT_ID, 'corpus');

const jc = JSONCodec();

const nc = await connect({
  servers: 'nats://localhost:4222',
  name: 'backfill-corpus-record-uuid',
});

const recordUuidByRowId = await fetchLineageMap(nc);
console.log(
  `lineage map loaded: ${recordUuidByRowId.size} row_id → record_uuid entries`,
);

const buckets = {
  alreadyStamped: [],
  backfill: [],
  staleUuid: [],
  orphanNoRow: [],
  orphanNullId: [],
};

const funderDirs = await listSubdirs(CORPUS_ROOT);
for (const funder of funderDirs) {
  const dir = join(CORPUS_ROOT, funder);
  const files = (await readdir(dir, { withFileTypes: true }))
    .filter((d) => d.isFile() && d.name.endsWith('.md'))
    .map((d) => d.name);
  for (const name of files) {
    const path = join(dir, name);
    const raw = await readFile(path, 'utf8');
    const fm = readFrontmatter(raw);
    if (!fm) continue;
    const rawRecordId = typeof fm.fields.record_id === 'string' ? fm.fields.record_id : null;
    // YAML `record_id: null` round-trips through this parser as the
    // string "null" — re-coerce so the report buckets it under
    // orphan-null-id instead of orphan-no-row.
    const fileRecordId = rawRecordId === 'null' ? null : rawRecordId;
    const fileRecordUuid = typeof fm.fields.record_uuid === 'string' ? fm.fields.record_uuid : null;
    const relPath = path.slice(REPO_ROOT.length);

    if (!fileRecordId) {
      buckets.orphanNullId.push({ path: relPath });
      continue;
    }
    const resolvedUuid = recordUuidByRowId.get(fileRecordId);
    if (!resolvedUuid) {
      buckets.orphanNoRow.push({ path: relPath, record_id: fileRecordId });
      continue;
    }
    if (fileRecordUuid) {
      if (fileRecordUuid === resolvedUuid) {
        buckets.alreadyStamped.push({ path: relPath });
      } else {
        buckets.staleUuid.push({
          path: relPath,
          record_id: fileRecordId,
          file_uuid: fileRecordUuid,
          row_store_uuid: resolvedUuid,
        });
      }
      continue;
    }
    buckets.backfill.push({
      path,
      relPath,
      record_id: fileRecordId,
      record_uuid: resolvedUuid,
      raw,
      fm,
    });
  }
}

if (APPLY) {
  for (const item of buckets.backfill) {
    const next = insertRecordUuid(item.raw, item.fm, item.record_uuid);
    await writeFile(item.path, next, 'utf8');
  }
}

printReport(buckets, APPLY);

await nc.drain();

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

async function fetchLineageMap(nc) {
  const reply = await nc.request('row.list.requested', jc.encode({}), {
    timeout: 30_000,
  });
  const out = jc.decode(reply.data);
  const map = new Map();
  for (const r of out.rows ?? []) {
    const ru = r?.fields?.record_uuid;
    if (typeof ru === 'string' && ru) map.set(r.row_id, ru);
  }
  return map;
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

// Returns { headerEnd, fields, lines } so callers can both inspect parsed
// fields and edit the original frontmatter region in place.
function readFrontmatter(raw) {
  if (!raw.startsWith('---\n') && !raw.startsWith('---\r\n')) return null;
  const after = raw.indexOf('\n---', 3);
  if (after < 0) return null;
  const block = raw.slice(4, after);
  const lines = block.split('\n');
  const fields = {};
  let pendingKey = null;
  for (const line of lines) {
    if (line.startsWith('  - ')) {
      if (pendingKey && Array.isArray(fields[pendingKey])) {
        fields[pendingKey].push(unquote(line.slice(4).trim()));
      }
      continue;
    }
    const m = line.match(/^([a-z_][a-z0-9_]*):\s*(.*)$/i);
    if (!m) continue;
    const [, key, rest] = m;
    if (rest === '' || rest === '[]') {
      fields[key] = [];
      pendingKey = key;
    } else if (rest === '{}') {
      fields[key] = {};
      pendingKey = null;
    } else {
      fields[key] = unquote(rest.trim());
      pendingKey = null;
    }
  }
  return { fields, headerStart: 0, blockStart: 4, blockEnd: after + 1 };
}

function unquote(s) {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
  }
  return s;
}

// Inserts `record_uuid: "<uuid>"` directly after the existing record_id
// line. If for any reason record_id isn't present as a literal line (it
// will be — readFrontmatter saw it — but defensively), inserts at the
// end of the frontmatter block instead.
function insertRecordUuid(raw, fm, recordUuid) {
  const newline = `record_uuid: "${recordUuid}"\n`;
  const block = raw.slice(fm.blockStart, fm.blockEnd);
  const recordIdLineMatch = block.match(/^record_id:\s*[^\n]*\n/m);
  if (recordIdLineMatch) {
    const insertAt = fm.blockStart + recordIdLineMatch.index + recordIdLineMatch[0].length;
    return raw.slice(0, insertAt) + newline + raw.slice(insertAt);
  }
  return raw.slice(0, fm.blockEnd) + newline + raw.slice(fm.blockEnd);
}

function printReport(buckets, applied) {
  const total =
    buckets.alreadyStamped.length +
    buckets.backfill.length +
    buckets.staleUuid.length +
    buckets.orphanNoRow.length +
    buckets.orphanNullId.length;
  console.log('');
  console.log(`== backfill report (${applied ? 'APPLIED' : 'DRY RUN'}) ==`);
  console.log(`total files inspected:    ${total}`);
  console.log(`already stamped:          ${buckets.alreadyStamped.length}`);
  console.log(`${applied ? 'stamped now:             ' : 'would stamp:             '} ${buckets.backfill.length}`);
  console.log(`stale uuid (skipped):     ${buckets.staleUuid.length}`);
  console.log(`orphan — no matching row: ${buckets.orphanNoRow.length}`);
  console.log(`orphan — null record_id:  ${buckets.orphanNullId.length}`);
  if (buckets.staleUuid.length) {
    console.log('');
    console.log('-- stale uuid (file disagrees with row-store; hand-review) --');
    for (const e of buckets.staleUuid) {
      console.log(`  ${e.path}`);
      console.log(`    record_id:      ${e.record_id}`);
      console.log(`    file uuid:      ${e.file_uuid}`);
      console.log(`    row-store uuid: ${e.row_store_uuid}`);
    }
  }
  if (buckets.orphanNoRow.length) {
    console.log('');
    console.log('-- orphan: file.record_id not in row-store --');
    const byRecordSet = new Map();
    for (const e of buckets.orphanNoRow) {
      const prefix = e.record_id.replace(/_[0-9a-f]+$/i, '');
      const list = byRecordSet.get(prefix) ?? [];
      list.push(e);
      byRecordSet.set(prefix, list);
    }
    for (const [prefix, list] of [...byRecordSet.entries()].sort((a, b) => b[1].length - a[1].length)) {
      console.log(`  ${prefix}  (${list.length} files)`);
      for (const e of list.slice(0, 5)) console.log(`    ${e.path}`);
      if (list.length > 5) console.log(`    … and ${list.length - 5} more`);
    }
  }
  if (buckets.orphanNullId.length) {
    console.log('');
    console.log(`-- orphan: null record_id (${buckets.orphanNullId.length} files) --`);
    const byDir = new Map();
    for (const e of buckets.orphanNullId) {
      const dir = e.path.split('/').slice(0, -1).join('/');
      byDir.set(dir, (byDir.get(dir) ?? 0) + 1);
    }
    for (const [dir, n] of [...byDir.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${dir}: ${n}`);
    }
  }
  console.log('');
  if (!applied && buckets.backfill.length) {
    console.log(`re-run with --apply to stamp ${buckets.backfill.length} files.`);
  }
}
