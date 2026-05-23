// One-time data migration: collapse the existing parent → derived chain
// into a single canonical record set with universal record_uuid coverage.
//
// Context (recon 2026-05-23):
//   - Parent "Master Pipeline Tracker" — 96 rows, 24 columns, no record_uuid
//   - Derived (25 rows) "+ url" from parent
//   - Derived (71 rows) "+ url" from parent (the Fire-remaining follow-up)
//   - Together: 96 derived rows, 1:1 with parent (one duplicate identity by
//     design: Schusterman appears twice in the parent CSV — preserved)
//   - RSVP list (39 rows) — separate parent, untouched by this script
//
// What this produces:
//   - A new canonical RecordSet named "<parent.name> · canonical v1"
//     containing 96 rows, one per parent-row position
//   - Each row carries the LATEST non-null fields across (parent row +
//     all its derivations) and a freshly-minted record_uuid
//   - helpful_links from any contributing row are preserved
//   - The parent + both deriveds get archived: true
//   - promoted_from set on the new canonical set
//
// Safety:
//   - Refuses to write if coverage isn't perfect (any parent row without a
//     derived match, or any derived row whose identity doesn't match its
//     parent slot).
//   - Backs up the live rows.json to .backups/ before mutating.
//   - Designed to be run with the row-store container STOPPED — avoids the
//     persist() race I flagged earlier.
//
// Usage:
//   cd services/row-store
//   docker compose stop row-store
//   pnpm tsx scripts/consolidate-to-canonical.ts
//   docker compose start row-store
//
// See context-v/specs/Enhanced-Records-List-and-Promotion-Checkpoint.md
// for the full specification this script implements as a one-shot.

import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

// ----------------------------------------------------------------------
// Types — mirror row-store's store.ts, kept local so the script doesn't
// have to be wired into the package's module graph.
// ----------------------------------------------------------------------

type ColumnField = { name: string; order: number };
type RecordSet = {
  record_set_id: string;
  name: string;
  schema: {
    fields: ColumnField[];
    source: unknown;
  };
  row_ids: string[];
  created_at: string;
  derived_from?: {
    record_set_id: string;
    prompt_id: string;
    added_columns: string[];
  };
  archived?: boolean;
  promoted_from?: {
    record_set_ids: string[];
    promoted_at: string;
    record_count: number;
  };
};
type Row = {
  row_id: string;
  record_set_id: string;
  fields: Record<string, unknown>;
  status?: string;
};
type Store = {
  record_sets: Record<string, RecordSet>;
  rows: Record<string, Row>;
};

// ----------------------------------------------------------------------
// Identify which sets participate in the consolidation. Heuristic for
// v0.0.1: the parent is the largest non-derived set with >10 columns;
// the deriveds are everything with kind='derivation' whose parent_record_set_id
// matches it.
// ----------------------------------------------------------------------

function identifyTargets(store: Store): {
  parent: RecordSet;
  derived: RecordSet[];
} {
  const csv = Object.values(store.record_sets).filter(
    (rs) =>
      (rs.schema.source as { kind?: string } | undefined)?.kind === 'csv' &&
      !rs.archived,
  );
  if (csv.length === 0) throw new Error('no non-archived CSV parents found');
  // Pick the one with more than 10 columns — RSVP list has 6.
  const candidates = csv.filter((rs) => rs.schema.fields.length > 10);
  if (candidates.length === 0) throw new Error('no parent with >10 columns');
  if (candidates.length > 1) {
    throw new Error(
      `multiple parent candidates: ${candidates.map((c) => c.name).join(', ')}; refine the heuristic`,
    );
  }
  const parent = candidates[0]!;
  const derived = Object.values(store.record_sets).filter((rs) => {
    const src = rs.schema.source as { kind?: string; parent_record_set_id?: string } | undefined;
    return (
      src?.kind === 'derivation' &&
      src.parent_record_set_id === parent.record_set_id &&
      !rs.archived
    );
  });
  return { parent, derived };
}

// ----------------------------------------------------------------------
// Match each parent row to its derived counterpart(s).
//
// Matching strategy: identity column (first CSV column), with a positional
// disambiguator for duplicate identities (Schusterman case). Within a
// derived set, multiple rows with the same identity are matched to the
// parent's same-identity rows in occurrence order.
//
// Returns: parent_row_id -> { parent_row, derived_rows: Row[] }
// ----------------------------------------------------------------------

function matchParentsToDeriveds(
  parent: RecordSet,
  derived: RecordSet[],
  rows: Record<string, Row>,
): {
  ok: true;
  matched: Map<string, { parent_row: Row; derived_rows: Row[] }>;
} | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const identityCol = parent.schema.fields[0]?.name;
  if (!identityCol) {
    errors.push('parent has no columns; cannot derive identity column');
    return { ok: false, errors };
  }

  // Build parent identity buckets, in order of appearance.
  const parentByIdentity = new Map<string, Row[]>();
  const parentRows = parent.row_ids
    .map((id) => rows[id])
    .filter((r): r is Row => !!r);
  if (parentRows.length !== parent.row_ids.length) {
    errors.push(`parent has ${parent.row_ids.length} row_ids but ${parentRows.length} resolved`);
  }
  for (const pr of parentRows) {
    const v = String(pr.fields[identityCol] ?? '');
    const arr = parentByIdentity.get(v) ?? [];
    arr.push(pr);
    parentByIdentity.set(v, arr);
  }

  // Match each derived row to a parent, consuming buckets in order.
  const consumed = new Map<string, number>();
  const matched = new Map<string, { parent_row: Row; derived_rows: Row[] }>();
  for (const pr of parentRows) matched.set(pr.row_id, { parent_row: pr, derived_rows: [] });

  for (const ds of derived) {
    for (const drid of ds.row_ids) {
      const dr = rows[drid];
      if (!dr) {
        errors.push(`derived row_id ${drid} (set ${ds.name}) does not resolve`);
        continue;
      }
      const v = String(dr.fields[identityCol] ?? '');
      const bucket = parentByIdentity.get(v) ?? [];
      const cursor = consumed.get(v) ?? 0;
      const target = bucket[cursor];
      if (!target) {
        errors.push(
          `derived row in '${ds.name}' has identity '${v}' but no matching parent slot at cursor ${cursor}`,
        );
        continue;
      }
      consumed.set(v, cursor + 1);
      matched.get(target.row_id)!.derived_rows.push(dr);
    }
  }

  // Sanity: every parent row must have at least one derived row (per the
  // recon — both sets together covered all 96 parents).
  for (const [, slot] of matched) {
    if (slot.derived_rows.length === 0) {
      errors.push(
        `parent '${String(slot.parent_row.fields[identityCol])}' (row_id ${slot.parent_row.row_id}) has no derived match`,
      );
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, matched };
}

// ----------------------------------------------------------------------
// Produce the canonical set: walk parent rows in order, fold derived
// fields onto each, mint record_uuid.
// ----------------------------------------------------------------------

function buildCanonicalSet(
  parent: RecordSet,
  derived: RecordSet[],
  matched: Map<string, { parent_row: Row; derived_rows: Row[] }>,
  store: Store,
): { record_set: RecordSet; rows: Row[] } {
  const canonical_id = `rs_canonical_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();

  // Union of all column names across parent + every derived set, preserving
  // parent column order first, then any new enrichment columns by name.
  const parentColNames = parent.schema.fields.map((f) => f.name);
  const enrichmentColNames: string[] = [];
  for (const ds of derived) {
    for (const f of ds.schema.fields) {
      if (!parentColNames.includes(f.name) && !enrichmentColNames.includes(f.name)) {
        enrichmentColNames.push(f.name);
      }
    }
  }
  const unionFields: ColumnField[] = [
    ...parent.schema.fields,
    ...enrichmentColNames.map((name, i) => ({
      name,
      order: parentColNames.length + i,
    })),
  ];

  const newRows: Row[] = [];
  for (const parent_row_id of parent.row_ids) {
    const slot = matched.get(parent_row_id);
    if (!slot) continue; // already errored upstream

    // Fold derived fields onto parent fields. Non-null derived value
    // overrides parent. Latest derivation wins where the same column is
    // produced by multiple derived sets (in this dataset, all derivations
    // produced `url`, but only one row per slot has it).
    const folded: Record<string, unknown> = { ...slot.parent_row.fields };
    for (const dr of slot.derived_rows) {
      for (const [k, v] of Object.entries(dr.fields)) {
        if (v !== null && v !== undefined && v !== '') {
          folded[k] = v;
        }
      }
    }

    // Mint a fresh record_uuid for the canonical row. Overrides any
    // record_uuid the parent or derived rows may have picked up between
    // the schema upgrade and this script's run.
    folded.record_uuid = `rec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}_${newRows.length.toString(36)}`;

    newRows.push({
      row_id: `row_${canonical_id}_${newRows.length.toString(36)}`,
      record_set_id: canonical_id,
      fields: folded,
    });
  }

  const canonical: RecordSet = {
    record_set_id: canonical_id,
    name: `${parent.name} · canonical v1`,
    schema: {
      fields: unionFields,
      source: {
        kind: 'promotion',
        promoted_from: [parent.record_set_id, ...derived.map((d) => d.record_set_id)],
        promoted_at: now,
        record_count: newRows.length,
      },
    },
    row_ids: newRows.map((r) => r.row_id),
    created_at: now,
    promoted_from: {
      record_set_ids: [parent.record_set_id, ...derived.map((d) => d.record_set_id)],
      promoted_at: now,
      record_count: newRows.length,
    },
  };

  return { record_set: canonical, rows: newRows };
}

// ----------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------

async function main(): Promise<void> {
  const storeArg = process.argv[2];
  // Default to the docker volume path WHEN running inside an alpine
  // bind-mount; otherwise, take an explicit path argument.
  const storePath = storeArg
    ? resolve(storeArg)
    : process.env.ROW_STORE_PATH || '/data/rows.json';

  console.log(`reading ${storePath}`);
  const raw = await readFile(storePath, 'utf8');
  const store: Store = JSON.parse(raw);

  console.log(
    `  ${Object.keys(store.record_sets).length} record sets, ${Object.keys(store.rows).length} rows`,
  );

  const { parent, derived } = identifyTargets(store);
  console.log(`\nparent: '${parent.name}' (${parent.row_ids.length} rows)`);
  for (const d of derived) {
    console.log(`  + derived: '${d.name}' (${d.row_ids.length} rows)`);
  }

  const match = matchParentsToDeriveds(parent, derived, store.rows);
  if (!match.ok) {
    console.error('\n✗ matching failed:');
    for (const e of match.errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  const { record_set: canonical, rows: newRows } = buildCanonicalSet(
    parent,
    derived,
    match.matched,
    store,
  );
  console.log(`\nproposed canonical set: '${canonical.name}' (${newRows.length} rows)`);
  console.log(`  union of ${canonical.schema.fields.length} columns`);

  if (newRows.length !== parent.row_ids.length) {
    console.error(
      `\n✗ row count mismatch — parent has ${parent.row_ids.length}, canonical would have ${newRows.length}; refusing to write`,
    );
    process.exit(1);
  }

  // Back up the live file before mutating.
  const backupDir = join(dirname(storePath), '.backups');
  await mkdir(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = join(backupDir, `rows_pre_canonical_${stamp}.json`);
  await copyFile(storePath, backupPath);
  console.log(`\n  ✓ backed up to ${backupPath}`);

  // Apply mutations.
  store.record_sets[canonical.record_set_id] = canonical;
  for (const r of newRows) store.rows[r.row_id] = r;
  // Archive predecessors.
  store.record_sets[parent.record_set_id].archived = true;
  for (const d of derived) store.record_sets[d.record_set_id].archived = true;

  await writeFile(storePath, JSON.stringify(store, null, 2));
  console.log(
    `\n  ✓ wrote ${storePath}\n  ✓ canonical set: ${canonical.record_set_id}\n  ✓ archived: parent + ${derived.length} derived set(s)`,
  );
  console.log('\ndone. start the row-store container to pick up the new state.');
}

main().catch((err) => {
  console.error('consolidation failed:', err);
  process.exit(1);
});
