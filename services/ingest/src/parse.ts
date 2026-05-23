// CSV → { schema, rows }. The schema is derived purely from the header row;
// no fixed columns, no required fields, no validation against a known shape.
// See [[feedback_augment_it_dynamic_schema]] memory for the constraint.

import { parse } from 'csv-parse/sync';

export type ColumnSchema = {
  fields: { name: string; order: number }[];
  source: { kind: 'csv'; filename: string; uploaded_at: string };
};

export type ParsedCsv = {
  schema: ColumnSchema;
  rows: { fields: Record<string, unknown> }[];
};

/** A row is "fully blank" when every cell is null/undefined or whitespace. */
function isBlankRow(rec: Record<string, unknown>): boolean {
  for (const v of Object.values(rec)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'string') {
      if (v.trim() !== '') return false;
    } else {
      // numbers, booleans, dates — anything non-string and non-nullish counts
      return false;
    }
  }
  return true;
}

export function parseCsv(csvText: string, filename: string): ParsedCsv {
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, unknown>[];

  const headerOrder: string[] =
    records.length > 0 ? Object.keys(records[0]) : [];

  const schema: ColumnSchema = {
    fields: headerOrder.map((name, order) => ({ name, order })),
    source: {
      kind: 'csv',
      filename,
      uploaded_at: new Date().toISOString(),
    },
  };

  // Drop trailing/scattered all-empty rows — they're an artifact of
  // spreadsheets that pre-format more rows than they populate. csv-parse's
  // `skip_empty_lines` already handles zero-cell lines; this catches lines
  // that have commas but no values (",,,,").
  const populated = records.filter((rec) => !isBlankRow(rec));
  const dropped = records.length - populated.length;
  if (dropped > 0) {
    console.log(JSON.stringify({
      level: 'info',
      msg: 'dropped blank rows during csv ingest',
      filename,
      dropped,
      kept: populated.length,
    }));
  }

  const rows = populated.map((rec) => ({ fields: rec }));
  return { schema, rows };
}
