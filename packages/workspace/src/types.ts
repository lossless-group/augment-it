// Shared type surface for @augment-it/workspace.
//
// Schema discipline: the column shape of a Row is NEVER predefined. Every
// upload derives its own ColumnSchema from the CSV headers at ingest time,
// and that schema lives on the RecordSet the rows belong to. The Row.fields
// map is intentionally untyped at this layer — it carries whatever columns
// the upload had. See [[feedback_augment_it_dynamic_schema]] memory for the
// constraint; see [[Tanuj-Record-Collector-As-Built]] for the legacy lift-out
// that made the dynamic-schema generality the core idea.

export type ColumnSchema = {
  fields: { name: string; order: number }[];   // column names, in CSV-header order
  source: {
    kind: 'csv';
    filename: string;
    uploaded_at: string;                        // ISO timestamp
  };
};

export type RecordSet = {
  record_set_id: string;
  name: string;                                 // user-facing label (often the filename)
  schema: ColumnSchema;
  row_ids: string[];                            // ordered references into rows
  created_at: string;
};

export type Row = {
  row_id: string;
  record_set_id: string;                        // which upload this row belongs to
  fields: Record<string, unknown>;              // keys are whatever the CSV had
  status?: string;
};

export type ActiveView =
  | { kind: 'idle' }
  | { kind: 'record_set_list' }
  | { kind: 'record_set'; record_set_id: string }
  | { kind: 'row_detail'; record_set_id: string; row_id: string };

export type JobEvent = {
  seq: number;
  subject: string;
  payload: unknown;
  ts?: string;
};

export type UserContext = {
  session_token: string;
  user_id?: string;
};

export type InvokeFrame = {
  kind: 'invoke';
  id: string;
  capability: string;
  args: unknown;
};

export type ResultFrame = {
  kind: 'result';
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
  display_hint?: ActiveView;
};

export type EventFrame = {
  kind: 'event';
  seq: number;
  subject: string;
  payload: unknown;
};

export type SessionFrame = {
  kind: 'session';
  token: string;
};

export type ServerFrame = ResultFrame | EventFrame | SessionFrame;
export type ClientFrame = InvokeFrame;
