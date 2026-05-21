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

  const rows = records.map((rec) => ({ fields: rec }));
  return { schema, rows };
}
