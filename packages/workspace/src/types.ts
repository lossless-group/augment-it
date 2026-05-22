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
  // 'csv' for uploaded sets (ingest / xlsx-ingest); 'derivation' for sets
  // produced by running a prompt (prompt-runner).
  source:
    | { kind: 'csv'; filename: string; uploaded_at: string }
    | {
        kind: 'derivation';
        prompt_id: string;
        prompt_name: string;
        parent_record_set_id: string;
        derived_at: string;
      };
};

export type RecordSet = {
  record_set_id: string;
  name: string;                                 // user-facing label (often the filename)
  schema: ColumnSchema;
  row_ids: string[];                            // ordered references into rows
  created_at: string;
  // Present only for derived sets (the output of a prompt run). Uploaded
  // sets omit it. Lineage turns repeated enrichment into a chain.
  derived_from?: {
    record_set_id: string;
    prompt_id: string;
    added_columns: string[];
  };
};

// A prompt template — authored in prompt-template-manager, stored in
// prompt-store, executed per-row by prompt-runner. {{token}} names are
// derived from `content` at bind time, never stored separately.
//
// `tools` is the per-prompt capability list — the prompt declares what
// server-side tools its LLM call needs. Walking-skeleton supports one
// value: 'web_search'. A prompt without it makes a plain completion call;
// a prompt with it gets Anthropic's server-side web search. The capability
// is a property of the prompt, not a runner-wide hardcode.
export type PromptTool = 'web_search';

export type PromptTemplate = {
  prompt_id: string;
  name: string;
  description: string;
  content: string;
  output_column: string;
  tools: PromptTool[];
  created_at: string;
  updated_at: string;
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

// --- request-reviewer / response-reviewer surfaces ---
// See context-v/specs/Request-Reviewer-Pre-Flight-Surface.md and
// context-v/specs/Response-Reviewer-and-Response-Store.md.

// One {{token}} in a prompt template, resolved against a record row.
export type TokenBinding = {
  token: string;
  value: string | null; // the row's value, stringified; null when unbound
  bound: boolean; // false → no matching column in the record set
};

// The result of the prompt.preview capability. prompt-runner returns either
// the resolved request (built by buildRequest, never sent) or an error —
// a discriminated union on `ok`.
export type PreviewOk = {
  ok: true;
  filled_prompt: string;
  request_body: unknown; // the exact messages.create() body
  bind: TokenBinding[];
  unbound_tokens: string[];
};
export type PreviewResult = PreviewOk | { ok: false; error: string };

// A fired LLM response, recorded by the response-store service. Named
// ResponseRecord (not Response) to avoid shadowing the Fetch API global.
export type ResponseFlag = 'good' | 'partial' | 'wrong' | 'needs-rerun';

export type ResponseRecord = {
  response_id: string;
  run_id: string; // groups the N responses of one prompt.run
  prompt_id: string;
  row_id: string;
  record_set_id: string;
  output_column: string; // the column an accepted value writes to
  model: string; // the model that actually ran
  request_body: unknown; // the exact request that fired
  response_text: string; // the verbose model output
  flag: ResponseFlag | null; // null until a human triages it
  accepted: boolean; // a value from this response reached a cell
  created_at: string;
  reviewed_at: string | null;
};
