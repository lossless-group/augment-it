// row.fields → RatingNormRecord, using an explicit per-record-set column
// mapping — same discipline person-db-resolver's normalize.ts established:
// dynamic schema in, explicit mapping, never a hardcoded column-name
// allowlist.

import type { RatingFieldMapping, RatingNormRecord } from './types';

const NONE = '(none)';

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
}

export function normalizeRatingRecord(
  fields: Record<string, unknown>,
  mapping: RatingFieldMapping,
): RatingNormRecord {
  const get = (col: string): string => (col && col !== NONE ? str(fields[col]) : '');
  return {
    person_uuid: get(mapping.person_uuid),
    org_slug: get(mapping.org_slug),
    relevance: get(mapping.relevance),
    relevance_note: get(mapping.relevance_note) || null,
    person_name: get(mapping.person_name) || null,
    org_name: get(mapping.org_name) || null,
  };
}

// Best-guess default mapping from export-affiliation-ratings-csv.mjs's own
// column names — matches on the first pass, so the mapping step is usually
// just a confirm-click, not real typing.
const GUESSES: Record<keyof RatingFieldMapping, string[]> = {
  person_uuid: ['person_uuid'],
  org_slug: ['org_slug'],
  relevance: ['relevance'],
  relevance_note: ['relevance_note'],
  person_name: ['person_name', 'name'],
  org_name: ['org_name', 'organization'],
};

export function guessMapping(columns: string[]): RatingFieldMapping {
  const pick = (field: keyof RatingFieldMapping): string => {
    for (const candidate of GUESSES[field]) {
      if (columns.includes(candidate)) return candidate;
    }
    return NONE;
  };
  return {
    person_uuid: pick('person_uuid'),
    org_slug: pick('org_slug'),
    relevance: pick('relevance'),
    relevance_note: pick('relevance_note'),
    person_name: pick('person_name'),
    org_name: pick('org_name'),
  };
}

export { NONE as MAPPING_NONE };
