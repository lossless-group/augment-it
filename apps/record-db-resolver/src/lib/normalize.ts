// row.fields → NormRecord. The v10 pipeline tracker stores socials /
// helpful_links as JSON-string arrays of objects (each with a `.url`) and the
// official-updates columns as a single URL string plus a plural list; this
// normalizes all of them to the resolver's { name, url, socials[], streams[],
// corpus[] } shape. Tolerant of already-parsed arrays (row-store reserved
// keys) and of plain whitespace/comma-separated URL lists.

import type { NormRecord } from './types';

const NAME_KEYS = [
  'Prospect / Organization',
  'Organization',
  'organization',
  'Company',
  'company',
  'Name',
  'name',
  'entity_name',
  'Entity Name',
];

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
}

function firstString(fields: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = str(fields[k]);
    if (v) return v;
  }
  return '';
}

// Parse a cell that may be: a JS array, a JSON array string, or a plain
// whitespace/comma-separated URL list. Returns the contained URL strings.
function urlsFrom(v: unknown): string[] {
  let arr: unknown[] = [];
  if (Array.isArray(v)) {
    arr = v;
  } else if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return [];
    if (s.startsWith('[')) {
      try {
        const p = JSON.parse(s);
        arr = Array.isArray(p) ? p : [];
      } catch {
        arr = [];
      }
    } else {
      // plain list of bare URLs
      return s.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
    }
  }
  return arr
    .map((e) => (typeof e === 'string' ? e : str((e as { url?: unknown })?.url)))
    .map((x) => str(x))
    .filter(Boolean);
}

export function normalizeRecord(fields: Record<string, unknown>): NormRecord {
  const name = firstString(fields, NAME_KEYS);
  const slug_hint = str(fields['corpus_funder_slug']) || null;
  const url = str(fields['url']) || null;

  const socials = urlsFrom(fields['socials']);

  // streams = official_updates index(es): a single column + a plural one.
  const streams = [
    ...urlsFrom(fields['official_updates_index_url']),
    ...urlsFrom(fields['official_updates_index_urls']),
  ];

  const corpus = urlsFrom(fields['helpful_links']);

  // dedup each list while preserving order
  const dedup = (xs: string[]): string[] => [...new Set(xs)];

  return {
    name,
    slug_hint,
    url,
    socials: dedup(socials),
    streams: dedup(streams),
    corpus: dedup(corpus),
  };
}
