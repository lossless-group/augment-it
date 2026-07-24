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
  // Variant-family pointers — orthogonal to lineage. A family is an
  // explicit, user-curated grouping of RecordSets that represent the
  // same external dataset evolving over time (e.g. five CSV exports
  // of a tracker uploaded as separate files). The id is stable; the
  // label is denormalized across members so single-row reads render
  // the family name without a second lookup. See
  // context-v/specs/Record-Set-Family-Grouping.md.
  variant_family_id?: string;
  variant_family_label?: string;
};

// A variant family — a user-curated grouping of RecordSets that share an
// external source. Tracked separately so the family has its own identity
// for rename / dissolve operations even when no member set is loaded.
// See context-v/specs/Record-Set-Family-Grouping.md.
export type VariantFamily = {
  variant_family_id: string;
  label: string;
  created_at: string;
  // The match stem that produced this family — preserved so future
  // ingests with the same stem can offer to join automatically (still
  // suggestion-only, per the spec's Decision 2).
  stem: string | null;
};

// Returned by record_set.suggest_variant_family. If the heuristic finds
// a candidate, `match` is populated; otherwise the field is undefined.
// The shape is the same whether the suggestion is to join an existing
// family (variant_family_id present) or create a new one from a set of
// matching peers (variant_family_id absent).
export type VariantFamilySuggestion = {
  match?: {
    variant_family_id?: string;
    stem: string;
    record_set_ids: string[];
    suggested_label: string;
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
  //   - 'record_uuid'    string                     — stable identity across derivations
  //   - 'helpful_links'  HelpfulLink[]              — human-captured side-channel links
  //   - 'archived'       boolean                    — row-level archive (drops out of promotion)
  //   - 'triage_states'  Record<promptId, CementedTriage> — cemented at promotion
  //   - 'socials'        SocialProfile[]            — accepted pack-response profiles, one per pack_id
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

// A verified public profile captured into a row's `socials` array when the
// user accepts a pack response. Mirrors HelpfulLink in shape — array-on-row
// rather than spawned columns. Replace-by-pack_id semantics: one row has at
// most one entry per pack_id; accepting a new candidate for the same pack
// replaces the previous entry on the row (the previous response stays in
// response-store for audit).
// See context-v/blueprints/Packs-and-Bundles-Pattern.md §Row write-back.
export type SocialProfile = {
  socials_id: string;                      // mirrors helpful_links.link_id
  pack_id: string;                         // 'linkedin-pack', 'x-pack', ...
  url: string;
  display_name: string;
  confidence: number;                      // 0-100
  snippet: string;                         // empty allowed
  source_metadata: Record<string, unknown>;
  response_id: string;                     // provenance — which response was accepted
  accepted_at: string;                     // ISO
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
  /** didi.sh stable person id — present when the WS upgrade carried a
   *  verified didi_session cookie (server-verified, not client-asserted). */
  didi_id?: string | null;
};

export type InvokeFrame = {
  kind: 'invoke';
  id: string;
  capability: string;
  args: unknown;
  /** How this invoke was triggered — e.g. 'didi-agent' when replaying a
   *  chat-accepted tool call, omitted for a direct UI action. Server-side
   *  attribution provenance only; never used for gating. */
  via?: string;
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
  /** Verified didi.sh identity, or null when the upgrade had no valid cookie. */
  didi_id?: string | null;
  /**
   * The instance's DIDI_AUTH posture (services/workspace/src/didi.ts's
   * MODE), carried on every session frame so the shell can decide whether
   * to render the pre-auth wall (Build-Order Step 7) without a separate
   * round-trip. 'required' + no didi_id → wall; anything else → mount.
   */
  didi_auth_mode?: 'off' | 'optional' | 'required';
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
   *
   * `client_id` is the tenant boundary — the workspace the operator has
   * toggled to in the shell header. Per [[Workspaces-as-Tenant-Primitive]]
   * the wire field is `client_id` (lived-with naming with the prior
   * substrate plan; the UI/spec word is "workspace").
   */
  context?: {
    focused_prompt_id?: string;
    record_set_id?: string;
    client_id?: string;
    // The org card open in the Org Workbench — broadcast via
    // augment-it:active-entity (+ localStorage, same race-hardening as the
    // search envelope) so didi's "this org" resolves without asking.
    focused_org_slug?: string;
    focused_org_name?: string;
  };
};

// One workspace as discovered by the workspace-service. The directory
// IS the workspace; display_name is title-cased from the slug.
// See workspace.list / workspace.activate / workspace.active.
export type WorkspaceSummary = {
  client_id: string;
  display_name: string;
  has_env: boolean;
  /** DEFAULT_DOMAIN_TYPE from this workspace's .env, or 'strategy' if unset. */
  default_domain_type: string;
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

// Re-attach to an invoke after a reconnect (gh #41) — the server replies
// with the normal ResultFrame for that id (possibly stashed from before the
// drop), or ok:false when it restarted and no longer knows the invoke.
export type ClaimFrame = { kind: 'claim'; id: string };

export type ServerFrame = ResultFrame | EventFrame | SessionFrame | ChatResponseFrame | ChatErrorFrame;
export type ClientFrame = InvokeFrame | ChatTurnFrame | ClaimFrame;

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

// Packs-and-bundles extension (2026-05-25). Spec:
// context-v/blueprints/Packs-and-Bundles-Pattern.md
export type Outcome = 'found' | 'not_found' | 'error' | 'skipped' | 'pending';

export type Candidate = {
  url: string;
  display_name: string;
  confidence: number; // 0-100
  snippet?: string;
  source_metadata?: Record<string, unknown>;
};

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
  // Packs-and-bundles extension. Older records backfill to outcome='found'
  // (if response_text non-empty) or 'pending'; structured + the four pack
  // correlation fields default to null.
  outcome: Outcome;
  structured: Candidate | null;
  archival_markdown: string | null;
  pack_id: string | null;
  bundle_id: string | null;
  pass: 1 | 2 | null;
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
