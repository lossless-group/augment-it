// Best-effort URL + name resolution for a row. Returns BOTH the value and
// the field name it was found in, so inline-edit save calls can write back
// to the same field. When the row has neither url nor helpful_links, the
// field name defaults to the first URL_FIELDS / NAME_FIELDS entry so an
// inline edit creates the canonical field.

import type { Row } from '@augment-it/workspace';

const URL_FIELDS = [
  'url', 'URL', 'Url',
  'website', 'Website',
  'site', 'Site',
  'domain', 'Domain',
  'homepage', 'Homepage',
];

const NAME_FIELDS = [
  'Prospect / Organization', 'Organization', 'organization',
  'Company', 'company', 'Name', 'name', 'entity_name', 'Entity Name',
];

// "Unknown" / sentinel values we should NOT treat as a real URL. Picks
// fall back to helpful_links[0].url when the row's url column carries
// one of these — recovers the user's hand-curated URL trapped in
// helpful_links (per Augment-Transformations-Not-Reliably-Persisting issue).
const UNKNOWN_URL_VALUES = new Set(['unknown', 'Unknown', 'UNKNOWN', 'n/a', 'N/A', 'na', 'NA', '-', '']);

function isRealUrl(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const t = v.trim();
  if (!t || UNKNOWN_URL_VALUES.has(t)) return false;
  return true;
}

export type ResolvedField = {
  value: string;
  field_name: string;  // where to write back on edit
  source: 'direct' | 'helpful_links' | 'default';
};

export function resolveRowUrl(row: Row): ResolvedField {
  const fields = row.fields as Record<string, unknown>;
  // 1. Direct match on any URL-shaped column.
  for (const key of URL_FIELDS) {
    const v = fields[key];
    if (isRealUrl(v)) {
      const trimmed = (v as string).trim();
      return {
        value: trimmed.startsWith('http') ? trimmed : `https://${trimmed}`,
        field_name: key,
        source: 'direct',
      };
    }
  }
  // 2. Fall back to helpful_links[0].url when the user's hand-curated URL
  //    got routed there (the Griffin Catalyst / Howard Schultz / Lumina
  //    pattern). Edits still write back to the primary URL column so the
  //    canonical value moves to where the rest of the system reads it.
  const hl = fields.helpful_links;
  if (Array.isArray(hl)) {
    for (const entry of hl) {
      if (entry && typeof entry === 'object' && isRealUrl((entry as { url?: unknown }).url)) {
        const u = ((entry as { url: string }).url).trim();
        // Pick the URL column that already exists on this row, or fall
        // back to 'url' if none does.
        const target = URL_FIELDS.find((k) => k in fields) ?? 'url';
        return {
          value: u.startsWith('http') ? u : `https://${u}`,
          field_name: target,
          source: 'helpful_links',
        };
      }
    }
  }
  // 3. No URL anywhere — pick the column to write back to if the user
  //    types one.
  const target = URL_FIELDS.find((k) => k in fields) ?? 'url';
  return { value: '', field_name: target, source: 'default' };
}

export function resolveRowName(row: Row): ResolvedField {
  const fields = row.fields as Record<string, unknown>;
  for (const key of NAME_FIELDS) {
    const v = fields[key];
    if (typeof v === 'string' && v.trim().length > 0) {
      return { value: v.trim(), field_name: key, source: 'direct' };
    }
  }
  const target = NAME_FIELDS.find((k) => k in fields) ?? 'name';
  return { value: row.row_id, field_name: target, source: 'default' };
}

// Legacy helpers — kept so existing callers (PromoteBar, etc.) keep
// working without modification.
export function pickRowUrl(row: Row): string | undefined {
  const r = resolveRowUrl(row);
  return r.value || undefined;
}
export function pickRowName(row: Row): string {
  return resolveRowName(row).value;
}
