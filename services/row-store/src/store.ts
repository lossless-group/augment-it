// JSON-file record-set + row store. Schema is per-RecordSet, derived at
// upload time by the ingest service. row-store owns nothing about column
// shape beyond "whatever the schema says." See
// [[feedback_augment_it_dynamic_schema]] memory.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export type ColumnSchema = {
  fields: { name: string; order: number }[];
  // 'csv' for uploaded sets (the ingest services). 'derivation' for sets
  // produced by running a prompt — prompt-runner creates these. 'promotion'
  // for sets produced by the record_set.promote capability (cementing a
  // canonical snapshot from a source set).
  source:
    | { kind: 'csv'; filename: string; uploaded_at: string }
    | {
        kind: 'derivation';
        prompt_id: string;
        prompt_name: string;
        parent_record_set_id: string;
        derived_at: string;
      }
    | {
        kind: 'promotion';
        promoted_from: string[];      // record_set_ids of the source(s)
        promoted_at: string;          // ISO timestamp
        record_count: number;
      };
};

export type RecordSet = {
  record_set_id: string;
  name: string;
  schema: ColumnSchema;
  row_ids: string[];
  created_at: string;
  // Present only for derived sets (output of a prompt run). Uploaded sets
  // omit it. The lineage is what turns repeated enrichment into a chain
  // instead of the duplicate-uploads problem.
  derived_from?: {
    record_set_id: string;
    prompt_id: string;
    added_columns: string[];
  };
  // Set true by the promotion mechanic when this set is superseded by a
  // new canonical set. Archived sets still load and are auditable; they
  // hide from default UIs.
  archived?: boolean;
  // Present on sets created by record_set.promote. Reads back the lineage
  // without having to parse names.
  promoted_from?: {
    record_set_ids: string[];
    promoted_at: string;
    record_count: number;
  };
  // Variant-family pointers. A family is an explicit, user-curated
  // grouping of RecordSets that represent the same external dataset
  // evolving over time. The id is stable; the label is denormalized
  // across members so a single-row read renders the family name without
  // a second lookup. See context-v/specs/Record-Set-Family-Grouping.md.
  variant_family_id?: string;
  variant_family_label?: string;
};

// A variant family — its own row in the store so rename / dissolve work
// even when no member set is loaded. Members carry the id back as a
// pointer on RecordSet.variant_family_id.
export type VariantFamily = {
  variant_family_id: string;
  label: string;
  created_at: string;
  // The match stem (normalized basename) that the suggestion heuristic
  // used to propose this family. Preserved so subsequent ingests with the
  // same stem can offer to join. Null when the family was created
  // explicitly without a stem (manual link of unrelated names).
  stem: string | null;
};

// One cemented triage state on a row, keyed in Row.fields.triage_states
// by prompt_id. See context-v/specs/Enhanced-Records-List-and-Promotion-Checkpoint.md.
export type CementedTriage = {
  flag: 'good' | 'partial' | 'wrong' | 'needs-human' | 'needs-rerun' | null;
  accepted: boolean;
  response_id: string;
  cemented_at: string;
};

export type Row = {
  row_id: string;
  record_set_id: string;
  // Dynamic — schema columns come from the upload's CSV headers. A handful
  // of RESERVED side-channel keys also live here, distinct from CSV
  // columns:
  //   - 'record_uuid'    string         — stable identity across derivations
  //   - 'helpful_links'  HelpfulLink[]  — human-captured side-channel links
  //   - 'archived'       boolean        — row-level archive (drops out of promotion)
  //   - 'triage_states'  Record<promptId, CementedTriage>  — cemented at promotion
  // Reserved keys are NEVER ingested from CSV headers; the ingest service
  // refuses or namespaces any incoming column that collides.
  fields: Record<string, unknown>;
  status?: string;
};

type Store = {
  record_sets: Record<string, RecordSet>;
  rows: Record<string, Row>;
  variant_families: Record<string, VariantFamily>;
};

let data: Store = { record_sets: {}, rows: {}, variant_families: {} };
let storePath = '';

export async function load(path: string): Promise<void> {
  storePath = path;
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw);
    data = {
      record_sets: parsed.record_sets ?? {},
      rows: parsed.rows ?? {},
      // Backwards-compat: stores written before the family work omit
      // this top-level key entirely. Default to empty.
      variant_families: parsed.variant_families ?? {},
    };
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      await mkdir(dirname(path), { recursive: true });
      data = { record_sets: {}, rows: {}, variant_families: {} };
      await persist();
    } else {
      throw err;
    }
  }
}

async function persist(): Promise<void> {
  await writeFile(storePath, JSON.stringify(data, null, 2));
}

export function listRecordSets(): RecordSet[] {
  return Object.values(data.record_sets);
}

export function getRecordSet(record_set_id: string): RecordSet | undefined {
  return data.record_sets[record_set_id];
}

export function getRow(row_id: string): Row | undefined {
  return data.rows[row_id];
}

export function listRows(record_set_id?: string): Row[] {
  const all = Object.values(data.rows);
  if (!record_set_id) return all;
  return all.filter((r) => r.record_set_id === record_set_id);
}

export async function createRecordSet(params: {
  name: string;
  schema: ColumnSchema;
  rows: { fields: Record<string, unknown> }[];
  derived_from?: RecordSet['derived_from'];
  // Optional predecessor for snapshot-promotion: when set, the new
  // record set carries promoted_from: { record_set_ids: [predecessor],
  // promoted_at: now } AND the predecessor is archived. Mirrors the
  // semantics promoteRecordSet bakes in, but for the ingest-from-CSV
  // path where the union/derivation logic doesn't apply.
  predecessor_record_set_id?: string;
}): Promise<{ record_set: RecordSet; rows: Row[] }> {
  const record_set_id = `rs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const created_at = new Date().toISOString();

  const newRows: Row[] = params.rows.map((r, i) => {
    // record_uuid is the load-bearing identity field — it carries through
    // every derivation and promotion so the lineage of a single conceptual
    // record stays traceable across versions. Without it, a row that was
    // refined four times has four unrelated identities and the "all data
    // continues" invariant breaks.
    //
    // Minting rule: if the incoming row already has a record_uuid (from
    // prompt-runner's parent-field spread, or from a previous derivation,
    // or carried through a promote), keep it. Otherwise mint a new one.
    // It's just another field in row.fields — visible like any other.
    const fields = { ...r.fields };
    if (typeof fields.record_uuid !== 'string' || !fields.record_uuid) {
      fields.record_uuid = `rec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    }
    return {
      row_id: `row_${record_set_id}_${i.toString(36)}`,
      record_set_id,
      fields,
    };
  });

  // If the caller named a predecessor (snapshot-promotion case), stitch
  // the lineage: stamp promoted_from on the new set and archive the
  // predecessor. The predecessor must exist; the link is rejected
  // silently if not (better to land the new set unlinked than to fail
  // the whole create).
  let promoted_from: RecordSet['promoted_from'] | undefined;
  const pred = params.predecessor_record_set_id
    ? data.record_sets[params.predecessor_record_set_id]
    : undefined;
  if (pred) {
    promoted_from = {
      record_set_ids: [pred.record_set_id],
      promoted_at: created_at,
      record_count: newRows.length,
    };
  }

  const rs: RecordSet = {
    record_set_id,
    name: params.name,
    schema: params.schema,
    row_ids: newRows.map((r) => r.row_id),
    created_at,
    ...(params.derived_from ? { derived_from: params.derived_from } : {}),
    ...(promoted_from ? { promoted_from } : {}),
  };

  data.record_sets[record_set_id] = rs;
  for (const r of newRows) data.rows[r.row_id] = r;
  // Archive the predecessor as part of the same persist cycle so the
  // sidebar's "leaf vs archived" view stays consistent (the family-
  // grouping logic computes leaves at read-time from promoted_from
  // references; archiving collapses the prior generation into the
  // "Earlier generations" list immediately).
  if (pred && !pred.archived) {
    data.record_sets[pred.record_set_id] = { ...pred, archived: true };
  }
  await persist();

  return { record_set: rs, rows: newRows };
}

export async function updateRow(
  row_id: string,
  fields: Record<string, unknown>,
): Promise<Row> {
  const existing = data.rows[row_id];
  if (!existing) throw new Error(`row not found: ${row_id}`);
  const next: Row = { ...existing, fields: { ...existing.fields, ...fields } };
  data.rows[row_id] = next;
  await persist();
  return next;
}

export type HelpfulLinkInput = {
  row_id: string;
  url: string;
  label?: string;
  note?: string;
  response_id?: string | null;
};

type HelpfulLink = {
  link_id: string;
  url: string;
  label: string;
  note: string;
  source: 'manual' | 'distill' | 'enrichment';
  added_at: string;
  response_id: string | null;
};

function getLinks(row: Row): HelpfulLink[] {
  const raw = row.fields.helpful_links;
  return Array.isArray(raw) ? (raw as HelpfulLink[]) : [];
}

export async function addHelpfulLink(params: HelpfulLinkInput): Promise<Row> {
  const existing = data.rows[params.row_id];
  if (!existing) throw new Error(`row not found: ${params.row_id}`);
  const url = params.url.trim();
  if (!url) throw new Error('url is required');
  const link: HelpfulLink = {
    link_id: `hl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    url,
    label: (params.label ?? '').trim(),
    note: (params.note ?? '').trim(),
    source: 'manual',
    added_at: new Date().toISOString(),
    response_id: params.response_id ?? null,
  };
  const next: Row = {
    ...existing,
    fields: { ...existing.fields, helpful_links: [...getLinks(existing), link] },
  };
  data.rows[params.row_id] = next;
  await persist();
  return next;
}

export async function removeHelpfulLink(row_id: string, link_id: string): Promise<Row> {
  const existing = data.rows[row_id];
  if (!existing) throw new Error(`row not found: ${row_id}`);
  const filtered = getLinks(existing).filter((l) => l.link_id !== link_id);
  const next: Row = {
    ...existing,
    fields: { ...existing.fields, helpful_links: filtered },
  };
  data.rows[row_id] = next;
  await persist();
  return next;
}

// --- Socials (pack-response write-back) ---
// Per [[Packs-and-Bundles-Pattern]] §Row write-back. One row-level array
// column, replace-by-pack_id semantics — a row has at most one entry per
// pack_id (one LinkedIn, one X, one Wikipedia). Accepting a new pack
// response replaces the previous entry for the same pack on this row;
// the previous response stays in response-store for audit.

export type SocialProfile = {
  socials_id: string;
  pack_id: string;
  url: string;
  display_name: string;
  confidence: number;
  snippet: string;
  source_metadata: Record<string, unknown>;
  response_id: string;
  accepted_at: string;
};

export type SocialProfileInput = {
  row_id: string;
  pack_id: string;
  url: string;
  display_name: string;
  confidence: number;
  snippet?: string;
  source_metadata?: Record<string, unknown>;
  response_id: string;
};

function getSocials(row: Row): SocialProfile[] {
  const raw = row.fields.socials;
  return Array.isArray(raw) ? (raw as SocialProfile[]) : [];
}

export async function addSocial(params: SocialProfileInput): Promise<Row> {
  const existing = data.rows[params.row_id];
  if (!existing) throw new Error(`row not found: ${params.row_id}`);
  const url = params.url.trim();
  if (!url) throw new Error('url is required');
  const profile: SocialProfile = {
    socials_id: `soc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    pack_id: params.pack_id,
    url,
    display_name: params.display_name,
    confidence: params.confidence,
    snippet: (params.snippet ?? '').trim(),
    source_metadata: params.source_metadata ?? {},
    response_id: params.response_id,
    accepted_at: new Date().toISOString(),
  };
  // Replace-by-pack_id: drop any existing entry for the same pack first.
  const remaining = getSocials(existing).filter((s) => s.pack_id !== params.pack_id);
  const next: Row = {
    ...existing,
    fields: { ...existing.fields, socials: [...remaining, profile] },
  };
  data.rows[params.row_id] = next;
  await persist();
  return next;
}

export async function removeSocial(row_id: string, socials_id: string): Promise<Row> {
  const existing = data.rows[row_id];
  if (!existing) throw new Error(`row not found: ${row_id}`);
  const filtered = getSocials(existing).filter((s) => s.socials_id !== socials_id);
  const next: Row = {
    ...existing,
    fields: { ...existing.fields, socials: filtered },
  };
  data.rows[row_id] = next;
  await persist();
  return next;
}

// --- Promotion + archive helpers ---
// Implementation of the Enhanced-Records-List spec §"The promotion action".
// See context-v/specs/Enhanced-Records-List-and-Promotion-Checkpoint.md.

/**
 * Set `archived: true` on a record set. Idempotent — archiving an already-
 * archived set is a no-op and still returns the set. Throws if not found.
 */
export async function archiveRecordSet(record_set_id: string): Promise<RecordSet> {
  const existing = data.record_sets[record_set_id];
  if (!existing) throw new Error(`record set not found: ${record_set_id}`);
  if (existing.archived) return existing;
  const next: RecordSet = { ...existing, archived: true };
  data.record_sets[record_set_id] = next;
  await persist();
  return next;
}

/**
 * Set `archived: true` on one row's fields. Per the spec this is the only
 * mechanism for a record to drop out of the canonical lineage at promotion
 * time. Reserved key 'archived' in Row.fields.
 */
export async function archiveRow(row_id: string): Promise<Row> {
  const existing = data.rows[row_id];
  if (!existing) throw new Error(`row not found: ${row_id}`);
  const next: Row = { ...existing, fields: { ...existing.fields, archived: true } };
  data.rows[row_id] = next;
  await persist();
  return next;
}

/**
 * Build the canonical name per the universal convention:
 *   <ISO_DATE>_<slug>_v<N>.<ext>
 *
 * Examples:
 *   "Master Pipeline Tracker_ DRAFT - Active Pipeline.csv"
 *     → "2026-05-23_Master-Pipeline-Tracker--Active-Pipeline_v2.csv"
 *   "2026-05-23_Master-Pipeline-Tracker--Active-Pipeline_v2.csv"  (re-promotion)
 *     → "2026-05-24_Master-Pipeline-Tracker--Active-Pipeline_v3.csv"
 *
 * Legacy-cruft cleaning: an earlier code path produced names like
 *   "Master Pipeline Tracker_ DRAFT - Active Pipeline · canonical · 2026-05-23"
 * When such a name re-enters this function as the source of another
 * promotion, we strip the "· canonical · YYYY-MM-DD" remnants so the slug
 * doesn't accumulate them across rounds.
 *
 * Slugification rules:
 *   - Strip .csv / .xlsx extension (default .csv if absent)
 *   - Strip noise words: DRAFT, WIP (case-insensitive)
 *   - Strip legacy "· canonical · YYYY-MM-DD" markers (any hyphen variant)
 *   - Treat ` - ` as a section break — becomes `--`
 *   - Unify _ and whitespace, collapse to single `-` within a section
 *   - Idempotent: a name already in canonical form parses + bumps the version
 *
 * v1 is the original-ingest convention; first promotion is v2.
 */
function stripLegacyCanonicalCruft(s: string): string {
  return (
    s
      // Already-hyphen-normalized form: "-·-canonical-·-2026-05-23"
      .replace(/-?·-?canonical-?·-?\d{4}-\d{2}-\d{2}/gi, '')
      // Raw form before slugification: " · canonical · 2026-05-23"
      .replace(/\s*·\s*canonical\s*·\s*\d{4}-\d{2}-\d{2}/gi, '')
      // Loose "canonical" suffix without date (defensive)
      .replace(/-?·-?canonical(?=$|[_.])/gi, '')
      .replace(/\s*·\s*canonical(?=$|[_.])/gi, '')
      // Trailing hyphens left behind by the strips
      .replace(/-+$/, '')
  );
}

function buildCanonicalName(sourceName: string, isoDate: string): string {
  // Already-canonical form? Parse + bump version, clean any legacy slug
  // cruft, swap in today's date.
  const canonicalMatch = sourceName.match(/^\d{4}-\d{2}-\d{2}_(.+)_v(\d+)(\.\w+)$/);
  if (canonicalMatch) {
    const [, rawSlug, versionStr, ext] = canonicalMatch;
    const slug = stripLegacyCanonicalCruft(rawSlug);
    return `${isoDate}_${slug}_v${parseInt(versionStr, 10) + 1}${ext}`;
  }

  // Fresh slugify path.
  const extMatch = sourceName.match(/\.(csv|xlsx)$/i);
  const ext = extMatch ? extMatch[0] : '.csv';
  const withoutExt = sourceName.replace(/\.(csv|xlsx)$/i, '');

  const slug = stripLegacyCanonicalCruft(withoutExt)
    .replace(/_/g, ' ')                              // _ becomes space (unifies separators)
    .replace(/\b(DRAFT|WIP)\b/gi, '')                 // strip noise status words
    .replace(/\s+-\s+/g, '--')                        // " - " is a section break
    .replace(/\s+/g, ' ')                             // collapse internal whitespace
    .trim()
    .replace(/\s/g, '-')                              // spaces → hyphens
    .replace(/-{3,}/g, '--')                          // never more than two consecutive
    .replace(/^-+/, '')                               // no leading dashes
    .replace(/-+$/, '');                              // no trailing dashes

  return `${isoDate}_${slug}_v2${ext}`;
}

/**
 * Promote a source record set into a new canonical set, FOLDING every
 * derivation of the source into the snapshot. This is the operation that
 * matches the Enhanced-Records-List's unified view: parent + every
 * derivation chained to it → one canonical row per parent row, with
 * latest non-null fields from any contributing row.
 *
 * Predecessors archived: the source set AND every derivation of it.
 *
 * Identity-column matching with positional disambiguation handles the
 * duplicate-row case (Schusterman). See the consolidation script for the
 * same logic in standalone form.
 *
 * v0.0.1 does NOT yet cement triage_states — that's v0.0.2.
 *
 * @param source_record_set_id The parent set whose derivations to fold
 * @param name                 Optional override; defaults to a dated, extension-stripped variant
 */
export async function promoteRecordSet(params: {
  source_record_set_id: string;
  name?: string;
}): Promise<{ record_set: RecordSet; rows: Row[]; archived: number }> {
  const source = data.record_sets[params.source_record_set_id];
  if (!source) throw new Error(`source record set not found: ${params.source_record_set_id}`);

  // Find every derivation of the source. Walk one level deep for v0.0.1
  // (the spec models multi-generational lineage; defer until a use case
  // demands it).
  const derived = Object.values(data.record_sets).filter((rs) => {
    if (rs.archived) return false;
    const src = rs.schema.source as { kind?: string; parent_record_set_id?: string } | undefined;
    return src?.kind === 'derivation' && src.parent_record_set_id === source.record_set_id;
  });

  // Source rows, non-archived only, in parent order.
  const sourceRows = source.row_ids
    .map((id) => data.rows[id])
    .filter((r): r is Row => !!r && r.fields.archived !== true);

  const identityCol = source.schema.fields[0]?.name;
  // Build identity → ordered parent buckets (positional disambiguation
  // for duplicates).
  const parentByIdentity = new Map<string, Row[]>();
  if (identityCol) {
    for (const sr of sourceRows) {
      const v = String(sr.fields[identityCol] ?? '');
      const arr = parentByIdentity.get(v) ?? [];
      arr.push(sr);
      parentByIdentity.set(v, arr);
    }
  }

  // For each source row, gather its corresponding derived row(s) by
  // identity-with-cursor. The cursor consumes parent buckets in order so
  // duplicates map 1:1.
  const matchedDeriveds = new Map<string, Row[]>();
  for (const sr of sourceRows) matchedDeriveds.set(sr.row_id, []);
  for (const ds of derived) {
    const cursors = new Map<string, number>();
    for (const drid of ds.row_ids) {
      const dr = data.rows[drid];
      if (!dr || !identityCol) continue;
      const v = String(dr.fields[identityCol] ?? '');
      const bucket = parentByIdentity.get(v) ?? [];
      const cursor = cursors.get(v) ?? 0;
      const target = bucket[cursor];
      cursors.set(v, cursor + 1);
      if (target) matchedDeriveds.get(target.row_id)!.push(dr);
    }
  }

  // Union schema. ALL DATA CONTINUES — any key with a value in any
  // contributing row becomes a column in the canonical's declared schema.
  // No exclusions, no "reserved fields" filter. The principle: if data
  // exists, it's a column.
  //
  // Three sources, in priority order:
  //   1. Parent schema fields (preserves the user's original CSV column order)
  //   2. Derivation schema fields not in parent (enrichment columns)
  //   3. Any other keys present in row.fields across parent + deriveds
  //      that weren't declared in ANY schema (e.g. helpful_links written
  //      by Response Reviewer triage, record_uuid minted at row creation,
  //      triage_states cemented at past promotions). The UI can choose
  //      to hide some of these from default display, but the SCHEMA
  //      declares them — that's the contract with "all data continues".
  const parentColNames = source.schema.fields.map((f) => f.name);
  const declaredEnrichmentCols: string[] = [];
  for (const ds of derived) {
    for (const f of ds.schema.fields) {
      if (!parentColNames.includes(f.name) && !declaredEnrichmentCols.includes(f.name)) {
        declaredEnrichmentCols.push(f.name);
      }
    }
  }
  // Scan actual row.fields for keys with values present in any contributing
  // row that no schema yet declares — every one becomes a column.
  const undeclaredCols: string[] = [];
  const allContributingRows: Row[] = [
    ...sourceRows,
    ...derived.flatMap((ds) =>
      ds.row_ids.map((id) => data.rows[id]).filter((r): r is Row => !!r),
    ),
  ];
  for (const row of allContributingRows) {
    for (const key of Object.keys(row.fields)) {
      if (parentColNames.includes(key)) continue;
      if (declaredEnrichmentCols.includes(key)) continue;
      if (undeclaredCols.includes(key)) continue;
      undeclaredCols.push(key);
    }
  }
  const unionFields = [
    ...source.schema.fields.map((f) => ({ ...f })),
    ...declaredEnrichmentCols.map((name, i) => ({
      name,
      order: parentColNames.length + i,
    })),
    ...undeclaredCols.map((name, i) => ({
      name,
      order: parentColNames.length + declaredEnrichmentCols.length + i,
    })),
  ];

  const canonical_id = `rs_promoted_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  const isoDate = now.slice(0, 10); // YYYY-MM-DD

  // Fold — purely TYPE-DRIVEN, never field-name-aware. No hardcoded
  // knowledge of any specific column. The rules:
  //   - Start with EVERY field from the source row, verbatim.
  //   - For each derived row's fields, walk the keys generically:
  //     * Skip values that read as "empty" (null, undefined, '', empty
  //       array, empty object) so derivation absences don't erase parent
  //       presence.
  //     * If BOTH existing and incoming are arrays: concatenate and
  //       shallow-dedup. ANY array column accumulates.
  //     * If BOTH existing and incoming are non-null non-array objects:
  //       merge by key (incoming wins ties).
  //     * Otherwise (scalar incoming, or type-mismatch): incoming
  //       overwrites existing.
  //   - These rules apply to EVERY key the same way. helpful_links,
  //     triage_states, "user_notes", "tags", "anything_arbitrary" all
  //     behave identically.
  //
  // Why this works across tenants: the data shape of a tenant's CSV is
  // unknown. Type-based merge handles whatever shape arrives. The fold
  // never says "if (k === 'X')".
  const isEffectivelyEmpty = (v: unknown): boolean => {
    if (v === null || v === undefined || v === '') return true;
    if (Array.isArray(v) && v.length === 0) return true;
    if (typeof v === 'object' && v !== null && Object.keys(v as object).length === 0) return true;
    return false;
  };

  const isPlainObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);

  const dedupShallow = (arr: unknown[]): unknown[] => {
    // For primitives: Set works. For objects: dedupe by JSON-stringify
    // signature (good-enough; tenants' array shapes vary).
    const seen = new Set<string>();
    const out: unknown[] = [];
    for (const item of arr) {
      const key = typeof item === 'object' && item !== null ? JSON.stringify(item) : String(item);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  };

  const newRows: Row[] = sourceRows.map((sr, i) => {
    const folded: Record<string, unknown> = { ...sr.fields };
    for (const dr of matchedDeriveds.get(sr.row_id) ?? []) {
      for (const [k, v] of Object.entries(dr.fields)) {
        if (isEffectivelyEmpty(v)) continue;
        const existing = folded[k];
        if (Array.isArray(existing) && Array.isArray(v)) {
          folded[k] = dedupShallow([...existing, ...v]);
        } else if (isPlainObject(existing) && isPlainObject(v)) {
          folded[k] = { ...existing, ...v };
        } else {
          folded[k] = v;
        }
      }
    }
    return {
      row_id: `row_${canonical_id}_${i.toString(36)}`,
      record_set_id: canonical_id,
      fields: folded,
    };
  });

  // Default name per the universal convention: ISO_Name-of-File_vN.<ext>
  // — see buildCanonicalName() above for the slugification rules.
  const defaultName = buildCanonicalName(source.name, isoDate);

  const allPredecessorIds = [source.record_set_id, ...derived.map((d) => d.record_set_id)];

  const canonical: RecordSet = {
    record_set_id: canonical_id,
    name: params.name ?? defaultName,
    schema: {
      fields: unionFields,
      source: {
        kind: 'promotion',
        promoted_from: allPredecessorIds,
        promoted_at: now,
        record_count: newRows.length,
      },
    },
    row_ids: newRows.map((r) => r.row_id),
    created_at: now,
    promoted_from: {
      record_set_ids: allPredecessorIds,
      promoted_at: now,
      record_count: newRows.length,
    },
  };

  // Mutate: write canonical, archive source + every derivation of it.
  data.record_sets[canonical_id] = canonical;
  for (const r of newRows) data.rows[r.row_id] = r;
  for (const predecessorId of allPredecessorIds) {
    const prev = data.record_sets[predecessorId];
    if (prev) data.record_sets[predecessorId] = { ...prev, archived: true };
  }

  await persist();

  return { record_set: canonical, rows: newRows, archived: allPredecessorIds.length };
}

export async function deleteRecordSet(
  record_set_id: string,
): Promise<{ deleted: boolean; row_count: number }> {
  const rs = data.record_sets[record_set_id];
  if (!rs) return { deleted: false, row_count: 0 };
  const row_count = rs.row_ids.length;
  for (const row_id of rs.row_ids) delete data.rows[row_id];
  delete data.record_sets[record_set_id];
  await persist();
  return { deleted: true, row_count };
}

// --- Variant family operations ---
// Implementation of context-v/specs/Record-Set-Family-Grouping.md.
// A variant family is an explicit, user-curated grouping of RecordSets
// that share an external source. Orthogonal to lineage (which is
// computed at read time from RecordSet.promoted_from). Suggestion-only
// heuristic — auto-linking is rejected per the spec's Decision 2.

/**
 * Normalize a filename or record-set name into a comparison stem.
 * The heuristic matches sets that look like sequential exports of the
 * same external dataset, even when the date prefix and version suffix
 * change between uploads.
 *
 * Strips, in order:
 *   1. Leading `YYYY-MM-DD_` date prefix.
 *   2. Trailing `_v\d+`, `-v\d+`, ` (\d+)`, or `.<digits>` version
 *      markers (case-insensitive on the `v`).
 *   3. The trailing extension (`.csv` / `.xlsx`).
 *   4. Replaces any run of non-alphanumeric chars with a single `-`.
 *   5. Lowercases the result.
 *
 * Returns the empty string for names that normalize to nothing — those
 * never match anything else; callers should treat empty stem as "no
 * suggestion possible."
 */
export function normalizeStem(name: string): string {
  let s = name;
  s = s.replace(/^\d{4}-\d{2}-\d{2}[_-]/, '');
  s = s.replace(/\.(csv|xlsx)$/i, '');
  s = s.replace(/[ _-][vV]\d+$/, '');
  s = s.replace(/\s*\(\d+\)$/, '');
  s = s.replace(/\.\d+$/, '');
  s = s.replace(/[^a-zA-Z0-9]+/g, '-');
  s = s.replace(/^-+|-+$/g, '');
  return s.toLowerCase();
}

export function listVariantFamilies(): VariantFamily[] {
  return Object.values(data.variant_families);
}

export function getVariantFamily(id: string): VariantFamily | undefined {
  return data.variant_families[id];
}

/**
 * Create a variant family with N initial member record sets. The label
 * is stored on the family AND denormalized onto every member. Returns
 * the new family plus the updated record sets.
 *
 * `stem` is optional — passed when the family was created from a
 * heuristic suggestion, omitted for manual links. Future ingests with
 * the same stem can offer to join (still suggestion-only).
 */
export async function createVariantFamily(params: {
  label: string;
  record_set_ids: string[];
  stem?: string | null;
}): Promise<{ family: VariantFamily; record_sets: RecordSet[] }> {
  const label = params.label.trim();
  if (!label) throw new Error('label is required');
  if (!params.record_set_ids.length) {
    throw new Error('at least one record_set_id is required');
  }
  for (const id of params.record_set_ids) {
    if (!data.record_sets[id]) throw new Error(`record set not found: ${id}`);
    if (data.record_sets[id].variant_family_id) {
      throw new Error(`record set already in a variant family: ${id}`);
    }
  }
  const variant_family_id = `vf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const family: VariantFamily = {
    variant_family_id,
    label,
    created_at: new Date().toISOString(),
    stem: params.stem ?? null,
  };
  data.variant_families[variant_family_id] = family;
  const updated: RecordSet[] = [];
  for (const id of params.record_set_ids) {
    const next: RecordSet = {
      ...data.record_sets[id],
      variant_family_id,
      variant_family_label: label,
    };
    data.record_sets[id] = next;
    updated.push(next);
  }
  await persist();
  return { family, record_sets: updated };
}

/**
 * Rename a variant family. Updates the family AND every member's
 * denormalized label. Returns the updated family + member sets.
 */
export async function updateVariantFamily(params: {
  variant_family_id: string;
  label: string;
}): Promise<{ family: VariantFamily; record_sets: RecordSet[] }> {
  const family = data.variant_families[params.variant_family_id];
  if (!family) throw new Error(`variant family not found: ${params.variant_family_id}`);
  const label = params.label.trim();
  if (!label) throw new Error('label is required');
  const next: VariantFamily = { ...family, label };
  data.variant_families[params.variant_family_id] = next;
  const updated: RecordSet[] = [];
  for (const rs of Object.values(data.record_sets)) {
    if (rs.variant_family_id === params.variant_family_id) {
      const nextRs: RecordSet = { ...rs, variant_family_label: label };
      data.record_sets[rs.record_set_id] = nextRs;
      updated.push(nextRs);
    }
  }
  await persist();
  return { family: next, record_sets: updated };
}

/**
 * Add an existing record set to an existing family. Throws if the set
 * is already a member of any family — the user must remove it first.
 */
export async function addToVariantFamily(params: {
  variant_family_id: string;
  record_set_id: string;
}): Promise<{ family: VariantFamily; record_set: RecordSet }> {
  const family = data.variant_families[params.variant_family_id];
  if (!family) throw new Error(`variant family not found: ${params.variant_family_id}`);
  const rs = data.record_sets[params.record_set_id];
  if (!rs) throw new Error(`record set not found: ${params.record_set_id}`);
  if (rs.variant_family_id && rs.variant_family_id !== params.variant_family_id) {
    throw new Error(`record set already in a different variant family: ${params.record_set_id}`);
  }
  const next: RecordSet = {
    ...rs,
    variant_family_id: family.variant_family_id,
    variant_family_label: family.label,
  };
  data.record_sets[params.record_set_id] = next;
  await persist();
  return { family, record_set: next };
}

/**
 * Remove a record set from its variant family. Idempotent — calling on
 * a set that's not in a family returns the set unchanged. Does NOT
 * dissolve the family even if this was the last member; an empty family
 * is fine and the user can either rebuild it or call dissolve.
 */
export async function removeFromVariantFamily(params: {
  record_set_id: string;
}): Promise<{ record_set: RecordSet }> {
  const rs = data.record_sets[params.record_set_id];
  if (!rs) throw new Error(`record set not found: ${params.record_set_id}`);
  if (!rs.variant_family_id) return { record_set: rs };
  const next: RecordSet = { ...rs };
  delete next.variant_family_id;
  delete next.variant_family_label;
  data.record_sets[params.record_set_id] = next;
  await persist();
  return { record_set: next };
}

/**
 * Dissolve a variant family. Clears the pointer + label on every member
 * and deletes the family row. Returns the list of member ids that were
 * disassociated so the caller can broadcast per-set events if desired.
 */
export async function dissolveVariantFamily(params: {
  variant_family_id: string;
}): Promise<{ dissolved: boolean; record_set_ids: string[] }> {
  const family = data.variant_families[params.variant_family_id];
  if (!family) return { dissolved: false, record_set_ids: [] };
  const affected: string[] = [];
  for (const rs of Object.values(data.record_sets)) {
    if (rs.variant_family_id === params.variant_family_id) {
      const next: RecordSet = { ...rs };
      delete next.variant_family_id;
      delete next.variant_family_label;
      data.record_sets[rs.record_set_id] = next;
      affected.push(rs.record_set_id);
    }
  }
  delete data.variant_families[params.variant_family_id];
  await persist();
  return { dissolved: true, record_set_ids: affected };
}

/**
 * Suggest a variant family for a record set, based on filename-stem
 * matching against existing sets. Suggestion-only — the caller decides
 * whether to accept and create / join. Returns `{ match: undefined }`
 * when nothing comparable is found.
 *
 * Match rules:
 *   1. Normalize the input set's name to a stem.
 *   2. If the stem is empty, no suggestion.
 *   3. If the input is already in a family, no suggestion.
 *   4. Find other non-archived record sets whose stem matches AND whose
 *      schema column count differs by ≤ 3 (allow modest schema
 *      evolution between versions).
 *   5. Exclude the input set itself.
 *   6. If any matching set is already in a variant family, suggest
 *      joining that family. Otherwise suggest creating a new family
 *      from the matched peers.
 *   7. `suggested_label` is the matched stem with hyphens → spaces and
 *      title-cased — a starting point the user can edit on accept.
 */
export function suggestVariantFamily(params: {
  record_set_id: string;
}): { match?: { variant_family_id?: string; stem: string; record_set_ids: string[]; suggested_label: string } } {
  const rs = data.record_sets[params.record_set_id];
  if (!rs) return {};
  if (rs.variant_family_id) return {};
  const stem = normalizeStem(rs.name);
  if (!stem) return {};
  const inputColCount = rs.schema.fields.length;
  const peers: RecordSet[] = [];
  for (const other of Object.values(data.record_sets)) {
    if (other.record_set_id === rs.record_set_id) continue;
    if (other.archived) continue;
    if (normalizeStem(other.name) !== stem) continue;
    if (Math.abs(other.schema.fields.length - inputColCount) > 3) continue;
    peers.push(other);
  }
  if (!peers.length) return {};
  const existingFamilyId = peers.find((p) => p.variant_family_id)?.variant_family_id;
  const suggested_label = stem
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  return {
    match: {
      ...(existingFamilyId ? { variant_family_id: existingFamilyId } : {}),
      stem,
      record_set_ids: [rs.record_set_id, ...peers.map((p) => p.record_set_id)],
      suggested_label,
    },
  };
}
