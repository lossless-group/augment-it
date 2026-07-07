// row.fields → PersonNormRecord, using an explicit per-record-set column
// mapping instead of a hardcoded column-name allowlist. This is the direct
// fix for the bug that shipped record-db-resolver's normalizeRecord() — it
// only recognized five hardcoded Master Pipeline Tracker column names and
// silently dropped everything else (including a speaker CSV's `org` column).
// See context-v/plans/Person-Aware-Canonical-Resolver-Extension.md §4.

import type { FieldMapping, PersonNormRecord } from './types';

const NONE = '(none)';

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
}

export function normalizePersonRecord(
  fields: Record<string, unknown>,
  mapping: FieldMapping,
): PersonNormRecord {
  const get = (col: string): string => (col && col !== NONE ? str(fields[col]) : '');
  return {
    name: get(mapping.name),
    org_name: get(mapping.org) || null,
    role: get(mapping.role) || null,
    linkedin_url: get(mapping.linkedin_url) || null,
    observation: get(mapping.observation) || null,
  };
}

// Best-guess default mapping from a record set's actual column names — a
// starting point the operator confirms/adjusts once per record set, not a
// silent assumption. Every guessable field defaults to '(none)' if nothing
// matches, rather than guessing wrong.
const GUESSES: Record<keyof FieldMapping, string[]> = {
  name: ['name', 'Name', 'full_name', 'Full Name'],
  org: ['org', 'organization', 'Organization', 'org_name', 'company', 'Company'],
  role: ['title', 'role', 'Title', 'Role'],
  linkedin_url: ['linkedin_url', 'linkedin', 'profile_url', 'LinkedIn'],
  observation: ['observation', 'Observation'],
};

export function guessMapping(columns: string[]): FieldMapping {
  const pick = (field: keyof FieldMapping): string => {
    for (const candidate of GUESSES[field]) {
      if (columns.includes(candidate)) return candidate;
    }
    return NONE;
  };
  return {
    name: pick('name'),
    org: pick('org'),
    role: pick('role'),
    linkedin_url: pick('linkedin_url'),
    observation: pick('observation'),
  };
}

export { NONE as MAPPING_NONE };
