// JSON-file record-set + row store. Schema is per-RecordSet, derived at
// upload time by the ingest service. row-store owns nothing about column
// shape beyond "whatever the schema says." See
// [[feedback_augment_it_dynamic_schema]] memory.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export type ColumnSchema = {
  fields: { name: string; order: number }[];
  source: { kind: 'csv'; filename: string; uploaded_at: string };
};

export type RecordSet = {
  record_set_id: string;
  name: string;
  schema: ColumnSchema;
  row_ids: string[];
  created_at: string;
};

export type Row = {
  row_id: string;
  record_set_id: string;
  fields: Record<string, unknown>;
  status?: string;
};

type Store = {
  record_sets: Record<string, RecordSet>;
  rows: Record<string, Row>;
};

let data: Store = { record_sets: {}, rows: {} };
let storePath = '';

export async function load(path: string): Promise<void> {
  storePath = path;
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw);
    data = {
      record_sets: parsed.record_sets ?? {},
      rows: parsed.rows ?? {},
    };
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      await mkdir(dirname(path), { recursive: true });
      data = { record_sets: {}, rows: {} };
      await persist();
    } else {
      throw err;
    }
  }
}

async function persist(): Promise<void> {
  await writeFile(storePath, JSON.stringify(data, null, 2));
}

export function listRecordSets(): RecordSet[] {
  return Object.values(data.record_sets);
}

export function getRecordSet(record_set_id: string): RecordSet | undefined {
  return data.record_sets[record_set_id];
}

export function listRows(record_set_id?: string): Row[] {
  const all = Object.values(data.rows);
  if (!record_set_id) return all;
  return all.filter((r) => r.record_set_id === record_set_id);
}

export async function createRecordSet(params: {
  name: string;
  schema: ColumnSchema;
  rows: { fields: Record<string, unknown> }[];
}): Promise<{ record_set: RecordSet; rows: Row[] }> {
  const record_set_id = `rs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const created_at = new Date().toISOString();

  const newRows: Row[] = params.rows.map((r, i) => ({
    row_id: `row_${record_set_id}_${i.toString(36)}`,
    record_set_id,
    fields: r.fields,
  }));

  const rs: RecordSet = {
    record_set_id,
    name: params.name,
    schema: params.schema,
    row_ids: newRows.map((r) => r.row_id),
    created_at,
  };

  data.record_sets[record_set_id] = rs;
  for (const r of newRows) data.rows[r.row_id] = r;
  await persist();

  return { record_set: rs, rows: newRows };
}

export async function updateRow(
  row_id: string,
  fields: Record<string, unknown>,
): Promise<Row> {
  const existing = data.rows[row_id];
  if (!existing) throw new Error(`row not found: ${row_id}`);
  const next: Row = { ...existing, fields: { ...existing.fields, ...fields } };
  data.rows[row_id] = next;
  await persist();
  return next;
}

export async function deleteRecordSet(
  record_set_id: string,
): Promise<{ deleted: boolean; row_count: number }> {
  const rs = data.record_sets[record_set_id];
  if (!rs) return { deleted: false, row_count: 0 };
  const row_count = rs.row_ids.length;
  for (const row_id of rs.row_ids) delete data.rows[row_id];
  delete data.record_sets[record_set_id];
  await persist();
  return { deleted: true, row_count };
}
