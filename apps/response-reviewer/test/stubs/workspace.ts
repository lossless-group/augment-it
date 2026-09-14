/**
 * Inert stand-in for @augment-it/workspace, aliased in via `resolve.alias`.
 *
 * `connect` is a NO-OP rather than a throw — App.svelte calls it in onMount, so
 * throwing there kills the mount before any markup exists. It opens nothing.
 * `invoke` serves ONLY the four read capabilities the surface loads on mount,
 * from an in-memory fixture. Every other capability throws, which covers every
 * write verb this app has: response.accept, response.delete, response.flag,
 * row.update, row.helpful_links.add, content_ingest.preview_url, corpus.add.
 * The last two are the exact pair a probe drove into live client data on
 * 2026-09-13, so their refusal here is the point, not a formality.
 */
const refuse = (what: string) => {
  throw new Error(`stub-workspace: refusing ${what} — tests never talk to a service`);
};

export type PromptTemplate = Record<string, unknown>;
export type RecordSet = Record<string, unknown>;
export type ResponseFlag = 'good' | 'partial' | 'wrong' | 'needs-rerun' | 'needs-human';
export type Row = Record<string, unknown>;
export type HelpfulLink = Record<string, unknown>;
export type SocialProfile = Record<string, unknown>;
export type ResponseRecord = Record<string, unknown>;

export const SNIPPET_TEXT = 'Acme Foundation funds workforce development across the Midwest.';

const RESPONSE = {
  response_id: 'resp-1',
  run_id: 'run-1',
  prompt_id: 'prompt-1',
  row_id: 'row-1',
  record_set_id: 'rs-1',
  output_column: 'website',
  model: 'stub',
  request_body: {},
  response_text: 'acme.org',
  edited_text: null,
  flag: null,
  accepted: false,
  created_at: '2026-09-01T00:00:00Z',
  reviewed_at: null,
  edited_at: null,
  outcome: 'found',
  structured: {
    url: 'https://acme.org',
    display_name: 'Acme Foundation',
    confidence: 88,
    snippet: SNIPPET_TEXT,
  },
  archival_markdown: null,
  pack_id: 'pack-orgs',
  bundle_id: null,
  pass: 1,
};

const ROW = { row_id: 'row-1', record_set_id: 'rs-1', cells: { name: 'Acme Foundation' } };

const READS: Record<string, unknown> = {
  'response.list': { responses: [RESPONSE] },
  'prompt.list': { prompts: [] },
  'record_set.list': { record_sets: [{ record_set_id: 'rs-1', name: 'orgs', schema: { fields: [] }, row_ids: ['row-1'] }] },
  'connectors.inventory': { connectors: [], packs: [] },
  'row.list': { rows: [ROW] },
  'row.get': { row: ROW },
  'corpus.list': { entries: [] },
};

export const workspace = {
  activeView: { kind: 'none' } as { kind: string; record_set_id?: string },
  // App.svelte reads workspace.events[events.length - 1] in an $effect. Omitting
  // it threw inside the effect on every mount — vitest reported it as an
  // UNHANDLED error rather than a failure, which is exactly the shape that makes
  // a green run untrustworthy. Empty, and it stays empty: nothing pushes here.
  events: [] as { seq: number; subject: string }[],
  connect() {
    /* no socket, no status callback — the surface renders offline */
  },
  disconnect() {},
  async invoke(capability: string) {
    if (capability in READS) return READS[capability];
    return refuse(`capability ${capability}`);
  },
};

export const WORKSPACE_CHANGED_EVENT = 'augment-it:workspace-changed';
export function resolveWsUrl(): string {
  return 'ws://stub.invalid/never-dialed';
}
