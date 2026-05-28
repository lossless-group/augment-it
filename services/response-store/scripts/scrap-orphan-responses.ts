// scrap-orphan-responses — one-shot cleanup for responses whose parent
// record set no longer exists in row-store. These are audit-trail
// orphans created when record_set.promote deletes parent rows but
// leaves their responses behind. Per
// context-v/blueprints/Response-Row-Identity-Across-Promote.md §Cost —
// pre-fix orphans can't be backfilled because their parent rows are
// already gone; either keep as orphans-in-amber or delete. This script
// is the delete path.
//
// What it does:
//   1. Reads services/row-store/data/rows.json — builds the set of
//      record_set_ids that currently exist.
//   2. Reads services/response-store/data/responses.json — drops every
//      response whose record_set_id is NOT in that set. Backs up first
//      to .backups/ with a timestamped suffix.
//   3. Reports the count removed + kept.
//
// Idempotent — safe to run twice (second run removes 0 since no orphans
// remain). The local data/*.json paths here are passthrough copies;
// the live data lives in Docker named volumes — extract via
// `docker cp` before running, push back after. The pattern matches
// services/social-search/scripts/scrap-pack-artifacts.ts.
//
// HOW TO RUN:
//   1. Stop response-store + row-store (or all of compose).
//   2. docker cp augment-it-row-store-1:/data/rows.json          services/row-store/data/rows.json
//   3. docker cp augment-it-response-store-1:/data/responses.json services/response-store/data/responses.json
//   4. tsx services/response-store/scripts/scrap-orphan-responses.ts --dry-run
//   5. tsx services/response-store/scripts/scrap-orphan-responses.ts
//   6. docker compose start response-store row-store (if stopped)
//   7. docker cp services/response-store/data/responses.json augment-it-response-store-1:/data/responses.json
//   8. docker compose restart response-store

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
  const dest = join(BACKUPS_DIR, `${label}_${stamp}.pre-scrap-orphans.json`);
  await mkdir(BACKUPS_DIR, { recursive: true });
  await writeFile(dest, JSON.stringify(exists, null, 2));
  return dest;
}

async function main(): Promise<void> {
  console.log(`scrap-orphan-responses — ${DRY ? 'DRY RUN' : 'live run'}`);
  console.log(`  rows      → ${ROWS_PATH}`);
  console.log(`  responses → ${RESPONSES_PATH}`);
  console.log('');

  // 1. Build the set of live record_set_ids from row-store
  const rowsData = (await loadJson(ROWS_PATH)) as
    | { record_sets?: Record<string, unknown> }
    | null;
  if (!rowsData || !rowsData.record_sets) {
    console.error('rows.json missing or empty — refusing to declare anything orphan.');
    process.exit(1);
  }
  const liveSetIds = new Set(Object.keys(rowsData.record_sets));
  console.log(`row-store has ${liveSetIds.size} record set${liveSetIds.size === 1 ? '' : 's'}:`);
  for (const id of liveSetIds) console.log(`  · ${id}`);
  console.log('');

  // 2. Walk responses, classify, drop orphans
  const respData = (await loadJson(RESPONSES_PATH)) as
    | { responses?: Record<string, { record_set_id?: string }> }
    | null;
  if (!respData || !respData.responses) {
    console.error('responses.json missing or empty — nothing to scrap.');
    process.exit(1);
  }
  const entries = Object.entries(respData.responses);
  const total = entries.length;
  const kept: typeof entries = [];
  const removedByOrphanSet: Record<string, number> = {};
  for (const [id, rec] of entries) {
    const setId = rec.record_set_id ?? '<no-record-set-id>';
    if (liveSetIds.has(setId)) {
      kept.push([id, rec]);
    } else {
      removedByOrphanSet[setId] = (removedByOrphanSet[setId] ?? 0) + 1;
    }
  }
  const removedCount = total - kept.length;

  console.log(`responses: ${removedCount} orphan removed / ${kept.length} kept (of ${total} total)`);
  if (removedCount > 0) {
    console.log('removed by orphan record_set_id:');
    for (const [setId, n] of Object.entries(removedByOrphanSet)) {
      console.log(`  · ${setId} → ${n} response${n === 1 ? '' : 's'}`);
    }
  }

  if (DRY) {
    console.log('');
    console.log('Dry run — no files written.');
    return;
  }

  if (removedCount === 0) {
    console.log('');
    console.log('Nothing to remove.');
    return;
  }

  const backup_path = await backup(RESPONSES_PATH, 'responses');
  if (backup_path) console.log(`  backup → ${backup_path}`);
  const next = { ...respData, responses: Object.fromEntries(kept) };
  await writeJson(RESPONSES_PATH, next);

  console.log('');
  console.log('Done. Copy services/response-store/data/responses.json back into the container');
  console.log('and restart response-store.');
}

main().catch((err) => {
  console.error('scrap-orphan-responses failed:', err);
  process.exit(1);
});
