// Local state container for enhanced-records-list — the unified view
// across all enrichment derivations of a single parent set.
//
// v0.0.1 reality: record_uuid hasn't been backfilled onto rows yet
// ([[Enhanced-Records-List-and-Promotion-Checkpoint]] §"Data model
// changes" is unresolved). Until that lands, this surface unions the
// derived sets in MEMORY, grouping each derived row to its parent by
// (parent_record_set_id from RecordSet.schema.source.parent_record_set_id,
// plus position-in-parent of the source row).
//
// Once record_uuid is plumbed end-to-end, this grouper collapses to a
// single line: group by row.fields.record_uuid.

import { workspace, type RecordSet, type Row } from '@augment-it/workspace';

// One unified row in the table — derived from one or more underlying rows
// across the derivation chain. The latest non-null value per column wins.
export type EnhancedRecord = {
  // Stable key for this render — v0.0.1 uses the latest underlying row's
  // row_id. Becomes record_uuid once the backfill lands.
  key: string;
  identity: string;            // value of the identity column (first CSV column)
  latest_fields: Record<string, unknown>;
  origin_set_name: string;     // friendly label for "where did the latest version come from"
  origin_set_id: string;
  // Provenance — the underlying rows that fold into this record.
  underlying_row_ids: string[];
};

class EnhancedRecordsState {
  // Which parent set we're showing the unified view for. Set by the user
  // (eventually via a picker; v0.0.1 picks the first non-RSVP parent set).
  active_parent_id: string | null;

  constructor() {
    this.active_parent_id = $state<string | null>(null);
  }

  /**
   * Pick the parent set to show by default.
   *
   * Priority:
   *   1. Most-recently-created non-archived PROMOTED set (the current
   *      working canonical — what the user is most likely operating on
   *      after one or more enrichment rounds).
   *   2. The largest non-archived CSV parent with >10 columns (heuristic
   *      that rules out small event RSVP lists).
   *
   * Also re-picks if the previously-chosen set has been archived or
   * deleted — e.g. after a promotion archived the source the user was
   * viewing.
   */
  autoPickParent(): void {
    if (this.active_parent_id) {
      const current = workspace.record_sets[this.active_parent_id];
      if (current && !current.archived) return;
      // Current pick is gone or archived — fall through to re-pick.
      this.active_parent_id = null;
    }
    const entries = Object.values(workspace.record_sets);

    // 1. Latest non-archived promoted canonical.
    const canonicals = entries.filter((rs) => {
      if (rs.archived) return false;
      const src = rs.schema?.source as { kind?: string } | undefined;
      return src?.kind === 'promotion';
    });
    if (canonicals.length > 0) {
      canonicals.sort((a, b) => b.created_at.localeCompare(a.created_at));
      this.active_parent_id = canonicals[0].record_set_id;
      return;
    }

    // 2. Fall back to a non-archived CSV with >10 columns.
    const csv = entries.find((rs) => {
      if (rs.archived) return false;
      const src = rs.schema?.source as { kind?: string } | undefined;
      return src?.kind === 'csv' && (rs.schema?.fields?.length ?? 0) > 10;
    });
    if (csv) this.active_parent_id = csv.record_set_id;
  }
}

export const enhancedState = new EnhancedRecordsState();

// --- Pure grouping logic. Lives outside the state class so it's testable
// and trivially replaceable when record_uuid lands. ---

/**
 * For a given parent record set, compute the unified record list by
 * walking every derivation that traces back to it and folding each
 * derived row onto its source-parent row.
 *
 * v0.0.1 matching: parent → derived linkage by position-in-parent (the
 * runner preserves order when row_ids subset is supplied). When the
 * 25-row + 71-row recon showed 0 mismatch, this is safe for the live
 * dataset. record_uuid eliminates the need for position-matching once
 * it lands.
 */
export function buildEnhancedRecords(
  parent: RecordSet,
  derivedSets: RecordSet[],
  allRows: Record<string, Row>,
): EnhancedRecord[] {
  // Index parent rows by their position-in-parent — derived rows arrive
  // in the order their row_ids were passed to prompt-runner, which IS
  // the order they appear in the parent's row_ids array.
  const parentRows = parent.row_ids.map((id) => allRows[id]).filter((r): r is Row => !!r);
  const identityCol = parent.schema.fields[0]?.name ?? '';

  // Each parent row gets one EnhancedRecord. Start with the parent's own
  // fields; derived rows overwrite where they have non-null values.
  const records: EnhancedRecord[] = parentRows.map((parentRow) => ({
    key: parentRow.row_id,
    identity: String(parentRow.fields[identityCol] ?? '<no identity>'),
    latest_fields: { ...parentRow.fields },
    origin_set_name: parent.name,
    origin_set_id: parent.record_set_id,
    underlying_row_ids: [parentRow.row_id],
  }));

  // Walk each derived set, mapping its rows to parent records by content.
  // The recon (2026-05-23) confirmed exact-match on identity-column for
  // the live dataset; we use identity column + first-occurrence position
  // disambiguation for the rare duplicate case (Schusterman).
  const parentIdentityToRecords: Map<string, EnhancedRecord[]> = new Map();
  records.forEach((rec) => {
    const arr = parentIdentityToRecords.get(rec.identity) ?? [];
    arr.push(rec);
    parentIdentityToRecords.set(rec.identity, arr);
  });

  for (const ds of derivedSets) {
    // Per-set cursor over the parent's identity-duplicate buckets so each
    // duplicate occurrence consumes ONE parent record in order.
    const cursors: Map<string, number> = new Map();
    for (const drid of ds.row_ids) {
      const dr = allRows[drid];
      if (!dr) continue;
      const identityVal = String(dr.fields[identityCol] ?? '');
      const matches = parentIdentityToRecords.get(identityVal) ?? [];
      if (matches.length === 0) continue;
      const cursor = cursors.get(identityVal) ?? 0;
      const target = matches[cursor] ?? matches[matches.length - 1];
      cursors.set(identityVal, cursor + 1);
      // Fold the derived row's NON-NULL fields onto the record. Empty
      // strings and undefined don't overwrite — they're absence, not data.
      for (const [k, v] of Object.entries(dr.fields)) {
        if (v !== null && v !== undefined && v !== '') {
          target.latest_fields[k] = v;
        }
      }
      target.origin_set_name = ds.name;
      target.origin_set_id = ds.record_set_id;
      target.underlying_row_ids.push(drid);
      target.key = drid; // latest wins
    }
  }

  return records;
}

/**
 * Walk workspace.record_sets and return the parent + every derivation
 * chained to it (one level deep — v0.0.1 doesn't model promotion lineage
 * yet).
 */
export function gatherDerivedSets(parentId: string, allSets: Record<string, RecordSet>): RecordSet[] {
  return Object.values(allSets).filter((rs) => {
    const src = rs.schema?.source as { kind?: string; parent_record_set_id?: string } | undefined;
    return src?.kind === 'derivation' && src.parent_record_set_id === parentId;
  });
}
