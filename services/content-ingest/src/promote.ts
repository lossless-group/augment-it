// Snapshot promotion. Plan:
// [[../../context-v/plans/Augmentation-State-Preservation-and-Snapshot-Promotion]]
//
// The verb the operator runs to advance the spine. Reads the latest
// inputs/*_vN.csv, walks clients/<client>/corpus/*/*.md indexing by
// each file's record_id frontmatter, joins, emits a new vN+1.csv with
// the spine columns passed through untouched plus system columns
// appended.
//
// The re-derive rule (see plan §"The re-derive rule"): system columns
// are ALWAYS derived from filesystem truth at promotion time; never
// preserved from the prior CSV. A fresh Google-Sheets export that
// lacks system columns gets them re-added on the next promote.

import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as csvParse } from 'csv-parse/sync';
import { stringify as csvStringify } from 'csv-stringify/sync';

const CLIENTS_ROOT = process.env.CLIENTS_ROOT ?? '/clients';

// System columns the promoter appends to vN+1. Order matters — a
// colleague handed v9 sees the same columns in the same order every
// time. New columns append; existing columns never shift.
const SYSTEM_COLUMNS = [
  'corpus_count',
  'corpus_funder_slug',
  'corpus_last_updated',
  'corpus_by_pack',
  'augmentation_snapshot_at',
  'augmentation_snapshot_version',
] as const;

// The set of column names that the promoter owns. Used to strip any
// stale system columns out of the input CSV before re-deriving — the
// re-derive rule means we never trust prior system-column values.
const SYSTEM_COLUMN_SET: ReadonlySet<string> = new Set(SYSTEM_COLUMNS);

export type PromoteSnapshotArgs = {
  client_id: string;
  // row_id → record_uuid resolver. The CSV's identity column is
  // record_uuid (stable across record-set derivations); the corpus
  // markdown's record_id field is the internal row_id. Without this
  // map the join silently fails because the keys don't align. The
  // handler builds this from a row.list.requested NATS call before
  // invoking promoteSnapshot.
  record_uuid_by_row_id: Map<string, string>;
};

export type PromoteSnapshotResult = {
  snapshot_path: string;       // path relative to CLIENTS_ROOT
  source_filename: string;     // bare filename of the vN we promoted from
  written_at: string;
  source_version: string;      // e.g. "v8"
  new_version: string;         // e.g. "v9"
  rows_with_corpus: number;
  rows_without_corpus: number;
  total_corpus_files_indexed: number;
};

type CorpusIndexEntry = {
  count: number;
  funder_counts: Map<string, number>;   // funder_slug → file count
  pack_counts: Map<string, number>;      // pack_id → file count
  last_updated: string;                  // ISO 8601, max(fetched_at)
};

export async function promoteSnapshot(
  args: PromoteSnapshotArgs,
): Promise<PromoteSnapshotResult> {
  const clientRoot = join(CLIENTS_ROOT, args.client_id);
  const inputsDir = join(clientRoot, 'inputs');
  const corpusDir = join(clientRoot, 'corpus');

  // 1. Find the latest input CSV.
  const latest = await findLatestInputCsv(inputsDir);
  if (!latest) {
    throw new Error(`no input CSV found in ${inputsDir.replace(CLIENTS_ROOT, '<clients>')}`);
  }

  // 2. Walk the corpus filesystem and build the record_uuid index.
  //    The corpus markdown stores record_id (row_id); we resolve to
  //    record_uuid via the caller-supplied map so the join below
  //    against the CSV's record_uuid column lines up.
  const index = await buildCorpusIndex(corpusDir, args.record_uuid_by_row_id);

  // 3. Read the source CSV.
  const sourceText = await readFile(latest.path, 'utf8');
  const sourceRecords = csvParse(sourceText, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as Record<string, string>[];

  // 4. Determine the spine columns (everything from the source that
  //    isn't a system column we're about to re-derive).
  const sourceHeader: string[] =
    sourceRecords.length > 0 ? Object.keys(sourceRecords[0]) : [];
  const spineColumns = sourceHeader.filter((c) => !SYSTEM_COLUMN_SET.has(c));
  const outHeader = [...spineColumns, ...SYSTEM_COLUMNS];

  // 5. Compute the new version and output filename.
  const newVersionNum = latest.versionNumber + 1;
  const newVersion = `v${newVersionNum}`;
  const today = new Date().toISOString().slice(0, 10);
  let outFilename = `${today}_${latest.basename}_${newVersion}.csv`;
  let outPath = join(inputsDir, outFilename);
  let tries = 0;
  while (await fileExists(outPath)) {
    tries += 1;
    if (tries > 8) {
      throw new Error('exhausted collision-suffix attempts for snapshot filename');
    }
    outFilename = `${today}_${latest.basename}_${newVersion}_${tries + 1}.csv`;
    outPath = join(inputsDir, outFilename);
  }

  // 6. Join: for each spine row, look up the corpus index by
  //    record_uuid and fill the system columns.
  const snapshotAt = new Date().toISOString();
  let rowsWithCorpus = 0;
  let rowsWithoutCorpus = 0;
  const outRows: Record<string, string>[] = sourceRecords.map((row) => {
    const out: Record<string, string> = {};
    for (const col of spineColumns) {
      out[col] = row[col] ?? '';
    }
    const recordUuid = (row['record_uuid'] ?? '').trim();
    const entry = recordUuid ? index.get(recordUuid) : undefined;
    if (entry && entry.count > 0) {
      rowsWithCorpus += 1;
      out['corpus_count'] = String(entry.count);
      out['corpus_funder_slug'] = primaryFunderSlug(entry.funder_counts);
      out['corpus_last_updated'] = entry.last_updated;
      out['corpus_by_pack'] = serializePackCounts(entry.pack_counts);
    } else {
      rowsWithoutCorpus += 1;
      out['corpus_count'] = '0';
      out['corpus_funder_slug'] = '';
      out['corpus_last_updated'] = '';
      out['corpus_by_pack'] = '';
    }
    out['augmentation_snapshot_at'] = snapshotAt;
    out['augmentation_snapshot_version'] = newVersion;
    return out;
  });

  // 7. Emit the new CSV.
  await mkdir(inputsDir, { recursive: true });
  const outText = csvStringify(outRows, {
    header: true,
    columns: outHeader,
  });
  await writeFile(outPath, outText, 'utf8');

  const totalCorpusFilesIndexed = Array.from(index.values()).reduce(
    (sum, e) => sum + e.count,
    0,
  );

  return {
    snapshot_path: outPath.replace(`${CLIENTS_ROOT}/`, ''),
    source_filename: latest.path.split('/').pop() ?? '',
    written_at: new Date().toISOString(),
    source_version: `v${latest.versionNumber}`,
    new_version: newVersion,
    rows_with_corpus: rowsWithCorpus,
    rows_without_corpus: rowsWithoutCorpus,
    total_corpus_files_indexed: totalCorpusFilesIndexed,
  };
}

type LatestCsv = {
  path: string;
  basename: string;          // e.g. "Master-Pipeline-Tracker--Active-Pipeline"
  versionNumber: number;     // e.g. 8
  datePrefix: string;        // e.g. "2026-06-05"
};

// Match filenames of the shape <YYYY-MM-DD>_<basename>_v<N>[_suffix].csv.
// The version segment is required; the trailing suffix (used by the
// collision-suffix loop above) is optional.
const FILENAME_RE = /^(\d{4}-\d{2}-\d{2})_(.+?)_v(\d+)(?:_\d+)?\.csv$/;

async function findLatestInputCsv(inputsDir: string): Promise<LatestCsv | null> {
  let entries: string[];
  try {
    entries = await readdir(inputsDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  let best: LatestCsv | null = null;
  for (const name of entries) {
    const m = name.match(FILENAME_RE);
    if (!m) continue;
    const [, datePrefix, basename, vStr] = m;
    const versionNumber = Number(vStr);
    if (!Number.isFinite(versionNumber)) continue;
    if (
      best === null
      || versionNumber > best.versionNumber
      || (versionNumber === best.versionNumber && datePrefix > best.datePrefix)
    ) {
      best = { path: join(inputsDir, name), basename, versionNumber, datePrefix };
    }
  }
  return best;
}

async function buildCorpusIndex(
  corpusDir: string,
  recordUuidByRowId: Map<string, string>,
): Promise<Map<string, CorpusIndexEntry>> {
  const index = new Map<string, CorpusIndexEntry>();
  let funderDirs: string[];
  try {
    funderDirs = (await readdir(corpusDir, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      // Skip inbox/ — those files lack record_id (pre-triage). When
      // triage writes record_id onto them and they're moved into a
      // per-funder directory, they're picked up like any other corpus
      // file. See plan §"Inbox files with record_id: null".
      .filter((d) => d.name !== 'inbox')
      .map((d) => d.name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return index;
    throw err;
  }
  for (const funder of funderDirs) {
    const dir = join(corpusDir, funder);
    const files = (await readdir(dir, { withFileTypes: true }))
      .filter((d) => d.isFile() && d.name.endsWith('.md'))
      .map((d) => d.name);
    for (const file of files) {
      const path = join(dir, file);
      let raw: string;
      try {
        raw = await readFile(path, 'utf8');
      } catch {
        continue;
      }
      const fm = parseMinimalFrontmatter(raw);
      if (!fm) continue;
      const rowId = stringValue(fm.record_id);
      if (!rowId) continue;
      // Resolve row_id → record_uuid via the caller-supplied map.
      // Files whose row_id isn't in row-store (e.g. row deleted after
      // capture) silently drop out of the index — they're not joinable
      // to any spine row anyway.
      const recordUuid = recordUuidByRowId.get(rowId);
      if (!recordUuid) continue;
      const packId = stringValue(fm.pack_id) ?? 'unknown';
      const fetchedAt = stringValue(fm.fetched_at) ?? '';
      let entry = index.get(recordUuid);
      if (!entry) {
        entry = {
          count: 0,
          funder_counts: new Map(),
          pack_counts: new Map(),
          last_updated: '',
        };
        index.set(recordUuid, entry);
      }
      entry.count += 1;
      entry.funder_counts.set(funder, (entry.funder_counts.get(funder) ?? 0) + 1);
      entry.pack_counts.set(packId, (entry.pack_counts.get(packId) ?? 0) + 1);
      if (fetchedAt && fetchedAt > entry.last_updated) {
        entry.last_updated = fetchedAt;
      }
    }
  }
  return index;
}

// Minimal YAML frontmatter parser scoped to the field set we use.
// Mirrors parseFrontmatter in corpus.ts; promotion only needs flat
// scalar reads, so we don't bring in a YAML library.
function parseMinimalFrontmatter(raw: string): Record<string, unknown> | null {
  if (!raw.startsWith('---')) return null;
  const end = raw.indexOf('\n---', 3);
  if (end < 0) return null;
  const block = raw.slice(3, end).trim();
  const out: Record<string, unknown> = {};
  // Track nesting depth (by leading-space count) so we ignore keys
  // inside nested blocks like binary_asset: or extra_metadata: that
  // we don't currently care about at the top level.
  for (const line of block.split('\n')) {
    if (/^\s/.test(line)) continue;            // skip indented lines (nested)
    if (line.startsWith('  - ')) continue;
    const m = line.match(/^([a-z_][a-z0-9_]*):\s*(.*)$/i);
    if (!m) continue;
    const [, key, rest] = m;
    if (rest === '' || rest === '[]' || rest === '{}') {
      out[key] = rest === '[]' ? [] : rest === '{}' ? {} : null;
      continue;
    }
    out[key] = unquote(rest.trim());
  }
  return out;
}

function unquote(s: string): string {
  if (s === 'null') return '';
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
  }
  return s;
}

function stringValue(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  if (trimmed === '' || trimmed === 'null') return null;
  return trimmed;
}

function primaryFunderSlug(counts: Map<string, number>): string {
  if (counts.size === 0) return '';
  let best = '';
  let bestN = -1;
  for (const [slug, n] of counts) {
    // Tie-break by name (alphabetical) for determinism.
    if (n > bestN || (n === bestN && slug < best)) {
      best = slug;
      bestN = n;
    }
  }
  return best;
}

function serializePackCounts(counts: Map<string, number>): string {
  // Stable alphabetical order so promoted CSVs are diffable.
  return Array.from(counts.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([pack, n]) => `${pack}=${n}`)
    .join(';');
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw err;
  }
}
