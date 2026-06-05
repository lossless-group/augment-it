// Group RecordSets into family groups for the Record Collector sidebar.
// Two distinct family signals (per Record-Set-Family-Grouping.md):
//
//   - Internal lineage: RecordSet.promoted_from.record_set_ids points at
//     the predecessors of a promoted set. Predecessors carry archived:true.
//     Computed at read time — no new field.
//
//   - External variant family: RecordSet.variant_family_id / .label. An
//     explicit, user-curated grouping. Stored on the set; mirrored on a
//     top-level VariantFamily row (not consumed here — labels are
//     denormalized onto every member).
//
// A variant family may contain lineage families: e.g. a v7 root, three
// promoted descendants of v7, and a v8 upload the user linked to the
// same family. That's one variant family with two user-visible "members"
// (v7-lineage and v8) and five RecordSet records under the hood.

import type { RecordSet } from '@augment-it/workspace';

export interface LineageMember {
  rs: RecordSet;
  generation: number; // 0 = root of this lineage
}

export interface FamilyMember {
  // The user-visible member is the leaf of its own lineage (most
  // recent generation, non-archived if any non-archived exists).
  leaf: RecordSet;
  // Every set in this member's lineage chain, ordered by generation
  // ascending (root first, leaf last). Length 1 when there's no
  // internal promotion history.
  lineage: LineageMember[];
}

export interface FamilyGroup {
  // Stable id for collapse-state persistence. For variant families it's
  // the variant_family_id; for ungrouped sets it's `solo:${record_set_id}`.
  group_id: string;
  // User-facing name. For variant families: variant_family_label. For
  // solo sets: the set's name (rendered without a group header).
  label: string;
  kind: 'variant_family' | 'solo';
  members: FamilyMember[];
  // Generation count summed across all lineages in this family. Used
  // by the group header to show "(N variants, M generations)" only
  // when M > N (i.e. some member has > 1 generation).
  generation_total: number;
  // Most-recent created_at across all member leaves; the sidebar sorts
  // groups by this descending so the user's recent uploads / promotions
  // float to the top.
  sort_key: string;
}

/**
 * Build the sidebar grouping from a flat list of RecordSets.
 *
 * Algorithm:
 *   1. Build a lookup: record_set_id → RecordSet.
 *   2. Identify lineage chains. A lineage's root is any set that:
 *        - has no other set's promoted_from.record_set_ids pointing at
 *          it AS a descendant (i.e. it's a leaf going forward), AND
 *        - is non-archived if any leaf in its chain is non-archived.
 *      For each leaf, walk backwards via promoted_from to assemble the
 *      generation chain.
 *   3. Group leaves by variant_family_id. Leaves without a
 *      variant_family_id become solo groups.
 *   4. Sort groups by sort_key descending; within each group sort
 *      members by leaf.created_at descending; within each member sort
 *      lineage by generation ascending.
 *
 * Archived predecessors are kept in the lineage chain so the sidebar
 * can render them under "Earlier generations (archived)" — the caller
 * decides which to display.
 */
export function buildFamilyGroups(record_sets: RecordSet[]): FamilyGroup[] {
  const byId = new Map<string, RecordSet>();
  for (const rs of record_sets) byId.set(rs.record_set_id, rs);

  // Set of ids that ARE referenced as a predecessor by some other set.
  // Those are non-leaf within their lineage.
  const referencedAsPredecessor = new Set<string>();
  for (const rs of record_sets) {
    const preds = rs.promoted_from?.record_set_ids ?? [];
    for (const p of preds) referencedAsPredecessor.add(p);
  }

  // Lineage leaves = sets that are not referenced as a predecessor.
  const leaves = record_sets.filter((rs) => !referencedAsPredecessor.has(rs.record_set_id));

  // Build a FamilyMember (lineage chain) for each leaf.
  const members: FamilyMember[] = leaves.map((leaf) => {
    const chain: LineageMember[] = [];
    let cursor: RecordSet | undefined = leaf;
    let generationFromLeaf = 0;
    const visited = new Set<string>();
    while (cursor && !visited.has(cursor.record_set_id)) {
      visited.add(cursor.record_set_id);
      chain.push({ rs: cursor, generation: generationFromLeaf });
      // Walk backwards. promoted_from can have multiple predecessor ids
      // (a future merge); we pick the first deterministically. For the
      // v0 working corpus a chain is always linear.
      const predId: string | undefined = cursor.promoted_from?.record_set_ids?.[0];
      cursor = predId ? byId.get(predId) : undefined;
      generationFromLeaf += 1;
    }
    // Re-number generations so root = 0, leaf = N-1, then sort
    // DESCENDING (leaf at index 0, oldest predecessor at the end) so
    // any archived-ancestor list extracted from this lineage renders
    // newest-first per the sidebar ordering rule.
    const lastGen = chain.length - 1;
    const lineage: LineageMember[] = chain
      .map((m) => ({ rs: m.rs, generation: lastGen - m.generation }))
      .sort((a, b) => b.generation - a.generation);
    return { leaf, lineage };
  });

  // Group members by variant_family_id.
  const groupsById = new Map<string, FamilyGroup>();
  const soloGroups: FamilyGroup[] = [];
  for (const m of members) {
    const vfid = m.leaf.variant_family_id;
    if (vfid) {
      let g = groupsById.get(vfid);
      if (!g) {
        g = {
          group_id: vfid,
          label: m.leaf.variant_family_label ?? '(unnamed family)',
          kind: 'variant_family',
          members: [],
          generation_total: 0,
          sort_key: '',
        };
        groupsById.set(vfid, g);
      }
      g.members.push(m);
      g.generation_total += m.lineage.length;
      if ((m.leaf.created_at ?? '') > g.sort_key) g.sort_key = m.leaf.created_at ?? '';
    } else {
      soloGroups.push({
        group_id: `solo:${m.leaf.record_set_id}`,
        label: m.leaf.name,
        kind: 'solo',
        members: [m],
        generation_total: m.lineage.length,
        sort_key: m.leaf.created_at ?? '',
      });
    }
  }

  const all = [...groupsById.values(), ...soloGroups];
  // Sort within each group: members desc by leaf.created_at, lineage
  // asc by generation. Constructor already sorted lineage; sort members.
  for (const g of all) {
    g.members.sort((a, b) => {
      const ac = a.leaf.created_at ?? '';
      const bc = b.leaf.created_at ?? '';
      if (ac === bc) return a.leaf.record_set_id.localeCompare(b.leaf.record_set_id);
      return ac > bc ? -1 : 1;
    });
  }
  // Sort groups by sort_key desc; ties by label asc for stability.
  all.sort((a, b) => {
    if (a.sort_key === b.sort_key) return a.label.localeCompare(b.label);
    return a.sort_key > b.sort_key ? -1 : 1;
  });
  return all;
}
