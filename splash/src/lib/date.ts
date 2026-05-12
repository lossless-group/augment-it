/**
 * Coerce any frontmatter date value to a Date or undefined. Tolerant of the
 * loader's raw-frontmatter fallback path: when schema validation fails, dates
 * arrive as strings. Sorting + formatting code goes through this helper so a
 * single bad value never crashes the page.
 */
export function toDate(v: unknown): Date | undefined {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? undefined : v;
  if (typeof v === 'number') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  if (typeof v === 'string') {
    const t = v.trim();
    if (t === '' || t === '[]' || t === '~' || t === 'TBD' || t === 'tbd') return undefined;
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
}

export function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
