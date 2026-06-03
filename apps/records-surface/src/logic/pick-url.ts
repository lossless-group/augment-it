// Best-effort URL resolution for a row. Tries the common URL-shaped column
// names; returns undefined if nothing usable.

import type { Row } from '@augment-it/workspace';

const URL_FIELDS = [
  'url', 'URL', 'Url',
  'website', 'Website',
  'site', 'Site',
  'domain', 'Domain',
  'homepage', 'Homepage',
];

export function pickRowUrl(row: Row): string | undefined {
  const fields = row.fields as Record<string, unknown>;
  for (const key of URL_FIELDS) {
    const v = fields[key];
    if (typeof v === 'string' && v.trim().length > 0) {
      const trimmed = v.trim();
      return trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
    }
  }
  return undefined;
}

const NAME_FIELDS = [
  'Prospect / Organization', 'Organization', 'organization',
  'Company', 'company', 'Name', 'name', 'entity_name', 'Entity Name',
];

export function pickRowName(row: Row): string {
  const fields = row.fields as Record<string, unknown>;
  for (const key of NAME_FIELDS) {
    const v = fields[key];
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return row.row_id;
}
