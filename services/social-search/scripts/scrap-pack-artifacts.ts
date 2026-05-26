// scrap-pack-artifacts — one-shot cleanup for the 2026-05-25 pack-runner
// smoke run that landed 576 pack-shaped responses against a record set
// before the design pivoted (socials goes into one JSON column per row,
// not six `profiles.<source>` columns).
//
// What it does:
//   1. Reads services/response-store/data/responses.json — removes every
//      record where pack_id !== null. Backs up first to .backups/.
//   2. Reads services/row-store/data/rows.json — strips every row.fields
//      key matching `profiles.<anything>` (left over from response.accept
//      writes that fired against the pre-pivot output_column). Backs up.
//
// Idempotent — safe to run twice. Reports what it did.
//
// HOW TO RUN:
//   1. Stop docker compose (or at least the response-store + row-store
//      services). Running services would race the file rewrite.
//   2. From augment-it/: `tsx services/social-search/scripts/scrap-pack-artifacts.ts`
//   3. Boot services back up.
//
// To dry-run: pass `--dry-run` as the first arg. Reports what WOULD be
// removed without writing anything.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const RESPONSES_PATH = join(ROOT, 'services/response-store/data/responses.json');
const ROWS_PATH = join(ROOT, 'services/row-store/data/rows.json');
const BACKUPS_DIR = join(ROOT, '.backups');

const DRY = process.argv.includes('--dry-run');

function nowStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function loadJson(path: string): Promise<unknown | null> {
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2));
}

async function backup(path: string, label: string): Promise<string | null> {
  const exists = await loadJson(path);
  if (exists === null) return null;
  const stamp = nowStamp();
  const dest = join(BACKUPS_DIR, `${label}_${stamp}.pre-scrap.json`);
  await mkdir(BACKUPS_DIR, { recursive: true });
  await writeFile(dest, JSON.stringify(exists, null, 2));
  return dest;
}

async function scrapResponses(): Promise<{
  total: number;
  removed: number;
  kept: number;
  backup_path: string | null;
}> {
  const data = (await loadJson(RESPONSES_PATH)) as { responses?: Record<string, { pack_id?: string | null }> } | null;
  if (!data || !data.responses) {
    return { total: 0, removed: 0, kept: 0, backup_path: null };
  }
  const entries = Object.entries(data.responses);
  const total = entries.length;
  const kept: typeof entries = [];
  let removed = 0;
  for (const [id, rec] of entries) {
    if (rec.pack_id) removed += 1;
    else kept.push([id, rec]);
  }
  const backup_path = DRY ? null : await backup(RESPONSES_PATH, 'responses');
  if (!DRY) {
    const next = { ...data, responses: Object.fromEntries(kept) };
    await writeJson(RESPONSES_PATH, next);
  }
  return { total, removed, kept: kept.length, backup_path };
}

async function scrapRows(): Promise<{
  rows_total: number;
  rows_touched: number;
  fields_removed: number;
  backup_path: string | null;
}> {
  const data = (await loadJson(ROWS_PATH)) as
    | { rows?: Record<string, { row_id: string; fields: Record<string, unknown> }>; record_sets?: unknown }
    | null;
  if (!data || !data.rows) {
    return { rows_total: 0, rows_touched: 0, fields_removed: 0, backup_path: null };
  }
  const ids = Object.keys(data.rows);
  let rows_touched = 0;
  let fields_removed = 0;
  const nextRows: Record<string, { row_id: string; fields: Record<string, unknown> }> = {};
  for (const id of ids) {
    const row = data.rows[id];
    const nextFields: Record<string, unknown> = {};
    let touched = false;
    for (const [k, v] of Object.entries(row.fields)) {
      if (k === 'profiles' || k.startsWith('profiles.')) {
        fields_removed += 1;
        touched = true;
        continue;
      }
      nextFields[k] = v;
    }
    if (touched) rows_touched += 1;
    nextRows[id] = { ...row, fields: nextFields };
  }
  const backup_path = DRY ? null : await backup(ROWS_PATH, 'rows');
  if (!DRY) {
    const next = { ...data, rows: nextRows };
    await writeJson(ROWS_PATH, next);
  }
  return { rows_total: ids.length, rows_touched, fields_removed, backup_path };
}

async function main(): Promise<void> {
  console.log(`scrap-pack-artifacts — ${DRY ? 'DRY RUN' : 'live run'}`);
  console.log(`  responses → ${RESPONSES_PATH}`);
  console.log(`  rows      → ${ROWS_PATH}`);
  console.log('');

  const responses = await scrapResponses();
  console.log(
    `responses: ${responses.removed} pack-tagged removed / ${responses.kept} kept (of ${responses.total} total)`,
  );
  if (responses.backup_path) console.log(`  backup → ${responses.backup_path}`);

  const rows = await scrapRows();
  console.log(
    `rows:      ${rows.fields_removed} profiles.* fields removed across ${rows.rows_touched} rows (of ${rows.rows_total} total)`,
  );
  if (rows.backup_path) console.log(`  backup → ${rows.backup_path}`);

  console.log('');
  console.log(DRY ? 'Dry run — no files written.' : 'Done. Restart docker compose.');
}

main().catch((err) => {
  console.error('scrap-pack-artifacts failed:', err);
  process.exit(1);
});
