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
  // produced by running a prompt (prompt-runner); 'promotion' for sets
  // produced by record_set.promote.
  source:
    | { kind: 'csv'; filename: string; uploaded_at: string }
    | {
        kind: 'derivation';
        prompt_id: string;
        prompt_name: string;
        parent_record_set_id: string;
        derived_at: string;
      }
    | {
        kind: 'promotion';
        promoted_from: string[];
        promoted_at: string;
        record_count: number;
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
  // Set true by the promotion mechanic when this set is superseded.
  // See context-v/specs/Enhanced-Records-List-and-Promotion-Checkpoint.md.
  archived?: boolean;
  // Set when this RecordSet was produced by record_set.promote; reads the
  // lineage without parsing names.
  promoted_from?: {
    record_set_ids: string[];
    promoted_at: string;
    record_count: number;
  };
};

// One cemented triage state on a row, keyed by prompt_id in
// Row.fields.triage_states. See the Enhanced-Records-List spec.
export type CementedTriage = {
  flag: ResponseFlag | null;          // ResponseFlag declared further down
  accepted: boolean;
  response_id: string;                // provenance — which response produced this state
  cemented_at: string;                // promotion timestamp, ISO
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
  // Dynamic — schema columns come from the upload's CSV headers. A handful
  // of RESERVED side-channel keys also live here, distinct from CSV columns:
  //   - 'record_uuid'    string         — stable identity across derivations
  //   - 'helpful_links'  HelpfulLink[]  — human-captured side-channel links
  //   - 'archived'       boolean        — row-level archive (drops out of promotion)
  //   - 'triage_states'  Record<promptId, CementedTriage>  — cemented at promotion
  // Reserved keys are NEVER ingested from CSV headers; the ingest service
  // refuses or namespaces any incoming column that collides.
  fields: Record<string, unknown>;
  status?: string;
};

// A side-channel link attached to a row by a human during triage (or, later,
// extracted automatically by the highlight-collector / a follow-up enrichment
// prompt). Lives in row.fields.helpful_links as an array — NOT a CSV-derived
// schema column, to keep the dynamic-schema discipline intact.
// See context-v/prompts/Helpful-Links-on-Records-Captured-During-Triage.md.
export type HelpfulLinkSource = 'manual' | 'distill' | 'enrichment';
export type HelpfulLink = {
  link_id: string;
  url: string;
  label: string;            // empty allowed; UI falls back to URL host
  note: string;             // empty allowed
  source: HelpfulLinkSource;
  added_at: string;
  response_id: string | null; // the response being triaged when this was saved
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

// --- Chat surface frames ---
// See context-v/blueprints/Chat-As-Verb-Surface-Patterns.md (ai-labs).
// The chat is layered ON TOP of the invoke/result surface — a chat_turn
// produces a chat_response, and any capability the chat suggests is
// dispatched through the same InvokeFrame/ResultFrame as everything else.

export type ChatProposal = {
  capability: string;            // e.g. 'prompt.draft'
  args: unknown;                 // prefilled args the user can edit
  hint: string;                  // one-line label for the affordance
};

export type ChatToolCall = {
  capability: string;
  args: unknown;
};

export type ChatTurnFrame = {
  kind: 'chat_turn';
  id: string;                    // turn id; reused in the response
  message: string;               // the user's free-text message
  thread_id?: string;            // groups turns in one conversation
  /**
   * Optional context the chat surface knows but the server doesn't —
   * the active prompt draft id being discussed, etc. The server inlines
   * this into the user-message slab of the prompt so the model can act
   * on it without a separate fetch.
   */
  context?: { focused_prompt_id?: string; record_set_id?: string };
};

export type ChatResponseMode = 'answer' | 'propose' | 'invoke';

export type ChatResponseFrame = {
  kind: 'chat_response';
  id: string;                    // matches the chat_turn id
  mode: ChatResponseMode;
  text: string;                  // the model's prose framing (always present)
  proposals?: ChatProposal[];    // when mode === 'propose'
  tool_call?: ChatToolCall;      // when mode === 'invoke'
};

export type ChatErrorFrame = {
  kind: 'chat_error';
  id: string;
  error: string;
};

export type ServerFrame = ResultFrame | EventFrame | SessionFrame | ChatResponseFrame | ChatErrorFrame;
export type ClientFrame = InvokeFrame | ChatTurnFrame;

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
export type ResponseFlag = 'good' | 'partial' | 'wrong' | 'needs-rerun' | 'needs-human';

export type ResponseRecord = {
  response_id: string;
  run_id: string; // groups the N responses of one prompt.run
  prompt_id: string;
  row_id: string;
  record_set_id: string;
  output_column: string; // the column an accepted value writes to
  model: string; // the model that actually ran
  request_body: unknown; // the exact request that fired
  response_text: string; // the verbose model output, as the LLM returned it
  edited_text: string | null; // human's in-progress edit; autosaved on blur
  flag: ResponseFlag | null; // null until a human triages it
  accepted: boolean; // a value from this response reached a cell
  created_at: string;
  reviewed_at: string | null;
  edited_at: string | null;
};

// Returned by the response.coverage capability — the response-store-derived
// view of which rows of a record set have already been fired against a given
// prompt. Coverage classifies any row that has at least one ResponseRecord;
// rows with NO response at all are computed client-side by subtracting these
// two sets from the record set's full row list (the store has no idea what
// rows belong to the set — that's row-store's territory).
//
//   covered_row_ids     — at least one response exists that is NOT flagged
//                         needs-rerun (treat the row as done)
//   needs_rerun_row_ids — every response for this row is flagged needs-rerun
//                         (the human explicitly asked to re-fire)
export type Coverage = {
  prompt_id: string;
  record_set_id: string;
  covered_row_ids: string[];
  needs_rerun_row_ids: string[];
};
