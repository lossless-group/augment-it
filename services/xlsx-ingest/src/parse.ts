// XLSX → { schema, rows }. Header row in the first worksheet defines the
// column names; same dynamic-schema discipline as the CSV ingest service.
// See [[feedback_augment_it_dynamic_schema]] memory.

import ExcelJS from 'exceljs';

export type ColumnSchema = {
  fields: { name: string; order: number }[];
  source: { kind: 'csv'; filename: string; uploaded_at: string };
};

export type ParsedXlsx = {
  schema: ColumnSchema;
  rows: { fields: Record<string, unknown> }[];
};

// @types/node 26 made Buffer generic; the caller passes Buffer.from() (a real
// Node Buffer). exceljs's load() is typed against a non-generic Buffer that the
// generic one won't unify with in either direction, so cast at that one
// boundary — the runtime value is exactly the Buffer exceljs expects.
export async function parseXlsx(buffer: Buffer, filename: string): Promise<ParsedXlsx> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);

  const ws = wb.worksheets[0];
  if (!ws) throw new Error('xlsx has no worksheets');

  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const v = cell.value;
    const name = v === null || v === undefined ? `column_${colNumber}` : String(v).trim();
    headers[colNumber - 1] = name || `column_${colNumber}`;
  });
  // exceljs's eachCell starts at column 1; trim any trailing undefined slots
  while (headers.length > 0 && (headers[headers.length - 1] === undefined || headers[headers.length - 1] === '')) {
    headers.pop();
  }

  const schema: ColumnSchema = {
    fields: headers.map((name, order) => ({ name, order })),
    // We re-use the 'csv' source-kind for now since downstream consumers
    // already key off it; xlsx is an input format, not a schema variant.
    source: {
      kind: 'csv',
      filename,
      uploaded_at: new Date().toISOString(),
    },
  };

  const rows: { fields: Record<string, unknown> }[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;                  // header
    const fields: Record<string, unknown> = {};
    headers.forEach((name, idx) => {
      const cell = row.getCell(idx + 1);
      // Hyperlink cells and rich text return objects; flatten to text.
      const v = cell.value;
      if (v === null || v === undefined) {
        fields[name] = '';
      } else if (typeof v === 'object' && v !== null && 'text' in v) {
        fields[name] = String((v as { text: unknown }).text);
      } else if (typeof v === 'object' && v !== null && 'result' in v) {
        // formula cell — store the computed result
        fields[name] = (v as { result: unknown }).result ?? '';
      } else if (v instanceof Date) {
        fields[name] = v.toISOString();
      } else {
        fields[name] = v;
      }
    });
    // Skip rows that are entirely empty after the flatten
    if (Object.values(fields).some((x) => x !== '' && x !== null && x !== undefined)) {
      rows.push({ fields });
    }
  });

  return { schema, rows };
}
