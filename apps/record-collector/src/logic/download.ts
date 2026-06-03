// Build + trigger a CSV download for a record set. Reads the row data
// via workspace, composes a CSV using the set's schema column order, and
// writes a blob URL the browser downloads.

import { workspace, type Row, type RecordSet } from '@augment-it/workspace';

function csvEscape(value: unknown): string {
  if (value == null) return '';
  let s: string;
  if (typeof value === 'string') {
    s = value;
  } else if (typeof value === 'number' || typeof value === 'boolean') {
    s = String(value);
  } else {
    // Arrays + objects (e.g. socials, helpful_links, official_updates_index_urls)
    // serialize as JSON so the structure round-trips.
    s = JSON.stringify(value);
  }
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function downloadRecordSetAsCsv(rs: RecordSet): Promise<void> {
  // Pull all rows for the set.
  const reply = (await workspace.invoke('row.list', {
    record_set_id: rs.record_set_id,
  })) as { rows: Row[] };
  const rows = reply.rows ?? [];

  // Union the schema's declared columns with any keys present on rows
  // (a row may carry fields the schema doesn't list — e.g.
  // official_updates_index_urls landed via direct row.update on the
  // Records Surface). Order: declared first (preserves CSV header
  // order), then any extras alphabetically.
  const declared = rs.schema.fields.map((f) => f.name);
  const extras = new Set<string>();
  for (const r of rows) {
    for (const k of Object.keys(r.fields)) {
      if (!declared.includes(k)) extras.add(k);
    }
  }
  const headers = [...declared, ...[...extras].sort()];

  const lines: string[] = [];
  lines.push(headers.map(csvEscape).join(','));
  for (const r of rows) {
    const f = r.fields as Record<string, unknown>;
    lines.push(headers.map((h) => csvEscape(f[h])).join(','));
  }
  const csv = lines.join('\n');

  // Filename: prefer the record set's `name` if it looks like a filename,
  // otherwise generate one. Force `.csv` extension.
  let filename = rs.name.endsWith('.csv') ? rs.name : `${rs.name}.csv`;
  filename = filename.replace(/[/\\]/g, '_');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
