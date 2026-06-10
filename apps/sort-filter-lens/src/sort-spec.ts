// Sort-spec: the JSON shape the lens emits and persists; the comparator
// the lens applies to row arrays; the derived-virtual-column resolvers
// (has_url, has_socials, socials_count, augmentation_tier) that aren't
// in the CSV but are sortable.
//
// Spec: ../../../context-v/specs/Records-Surface-Sort-Step-and-UI.md v0.0.0.3

import type { Row } from '@augment-it/workspace';

export type SortDirection = 'asc' | 'desc';

export type SortKey = {
  column: string;
  direction: SortDirection;
  empty_position?: 'first' | 'last';
};

export type SortSpec = {
  sort: SortKey[];
};

// Bookkeeping the lens uses to surface derived virtual columns in the
// "Sort by …" popover. Keep in sync with deriveValue() below.
export const DERIVED_COLUMNS = [
  'has_url',
  'has_socials',
  'socials_count',
  'helpful_links_count',
  'augmentation_tier',
] as const;

export type DerivedColumn = (typeof DERIVED_COLUMNS)[number];

const isDerived = (col: string): col is DerivedColumn =>
  (DERIVED_COLUMNS as readonly string[]).includes(col);

// Decode the socials field which is JSON-shaped in row.fields. Returns
// the platform-entry count, or 0 if absent / unparsable.
function socialsCount(raw: unknown): number {
  if (raw == null) return 0;
  if (Array.isArray(raw)) return raw.length;
  if (typeof raw === 'object') return Object.keys(raw as Record<string, unknown>).length;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === 'unknown' || trimmed === '[]' || trimmed === '{}') return 0;
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.length;
      if (parsed && typeof parsed === 'object') return Object.keys(parsed).length;
    } catch {
      // not JSON — count comma-separated tokens as a fallback
      return trimmed.split(/[,;]/).map((s) => s.trim()).filter(Boolean).length;
    }
  }
  return 0;
}

function helpfulLinksCount(raw: unknown): number {
  if (Array.isArray(raw)) return raw.length;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      return 0;
    }
  }
  return 0;
}

function urlPresent(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  return trimmed.length > 0 && trimmed !== 'unknown';
}

// augmentation_tier thresholds — operator-configurable in v2 via a
// sort-config block. v1 hardcodes per the spec.
function augmentationTier(
  fields: Record<string, unknown>,
  corpusCount: number,
): 'rich' | 'middle' | 'sparse' | 'private' {
  const hasUrl = urlPresent(fields.url);
  const hasSocials = socialsCount(fields.socials) > 0;
  if (corpusCount >= 5) return 'rich';
  if (hasUrl && hasSocials && corpusCount < 5) return 'middle';
  if ((hasUrl || hasSocials) && corpusCount < 5) return 'sparse';
  return 'private';
}

// Order the tiers when sorting by augmentation_tier.
const TIER_ORDER: Record<string, number> = { rich: 3, middle: 2, sparse: 1, private: 0 };

export type CorpusLookup = (row_id: string) => number;

export function deriveValue(
  column: string,
  row: Row,
  corpusCount: CorpusLookup,
): unknown {
  if (!isDerived(column)) return row.fields[column];
  const f = row.fields;
  const n = corpusCount(row.row_id);
  switch (column) {
    case 'has_url':
      return urlPresent(f.url) ? 1 : 0;
    case 'has_socials':
      return socialsCount(f.socials) > 0 ? 1 : 0;
    case 'socials_count':
      return socialsCount(f.socials);
    case 'helpful_links_count':
      return helpfulLinksCount(f.helpful_links);
    case 'augmentation_tier':
      return TIER_ORDER[augmentationTier(f, n)];
  }
}

// Best-effort numeric coerce: pulls leading numbers out of strings like
// "$250,000" → 250000, or returns NaN if there's nothing numeric.
function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const stripped = v.replace(/[$,\s]/g, '');
    if (!stripped) return NaN;
    const n = Number(stripped);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

// Natural-number-aware string compare: "v10" sorts after "v9", not before.
function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

// Treat empty / null / undefined / 'unknown' as "missing" for empty_position.
function isEmpty(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === 'string') {
    const t = v.trim();
    return t === '' || t === 'unknown';
  }
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

function compareOne(a: unknown, b: unknown, key: SortKey): number {
  const empty = key.empty_position ?? 'last';
  const aE = isEmpty(a);
  const bE = isEmpty(b);
  if (aE && bE) return 0;
  if (aE) return empty === 'last' ? 1 : -1;
  if (bE) return empty === 'last' ? -1 : 1;

  // numeric first if both coerce; falls back to natural string compare
  const aN = toNumber(a);
  const bN = toNumber(b);
  let cmp: number;
  if (!Number.isNaN(aN) && !Number.isNaN(bN)) {
    cmp = aN - bN;
  } else {
    cmp = naturalCompare(String(a), String(b));
  }
  return key.direction === 'desc' ? -cmp : cmp;
}

export function compareRows(
  a: Row,
  b: Row,
  spec: SortSpec,
  corpusCount: CorpusLookup,
): number {
  for (const key of spec.sort) {
    const av = deriveValue(key.column, a, corpusCount);
    const bv = deriveValue(key.column, b, corpusCount);
    const c = compareOne(av, bv, key);
    if (c !== 0) return c;
  }
  return 0;
}

export function applySort(rows: Row[], spec: SortSpec, corpusCount: CorpusLookup): Row[] {
  if (!spec.sort.length) return rows;
  const indexed = rows.map((r, i) => ({ r, i }));
  indexed.sort((x, y) => {
    const c = compareRows(x.r, y.r, spec, corpusCount);
    return c === 0 ? x.i - y.i : c;     // stable on ties via original index
  });
  return indexed.map((entry) => entry.r);
}

export function loadSortSpec(record_set_id: string): SortSpec {
  if (typeof localStorage === 'undefined') return { sort: [] };
  try {
    const key = `augment-it:step2:sort_and_filter_state:${record_set_id}`;
    const raw = localStorage.getItem(key);
    if (!raw) return { sort: [] };
    const parsed = JSON.parse(raw);
    const spec = parsed?.sort_spec;
    if (spec && Array.isArray(spec.sort)) return spec as SortSpec;
    return { sort: [] };
  } catch {
    return { sort: [] };
  }
}

export function saveSortSpec(record_set_id: string, spec: SortSpec): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const key = `augment-it:step2:sort_and_filter_state:${record_set_id}`;
    const existing = localStorage.getItem(key);
    const parsed = existing ? JSON.parse(existing) : {};
    parsed.sort_spec = spec;
    localStorage.setItem(key, JSON.stringify(parsed));
  } catch {
    /* noop */
  }
}
