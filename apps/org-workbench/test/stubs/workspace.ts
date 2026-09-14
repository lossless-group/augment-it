/**
 * Inert stand-in for @augment-it/workspace, aliased in via `resolve.alias`.
 *
 * `invoke` serves ONLY the read capabilities org-workbench's disclosures need,
 * from an in-memory fixture. Every other capability — and every write verb —
 * throws. Nothing here opens a socket: a test that reaches the network is a
 * test that could reach production, which is what happened on 2026-09-13.
 */
export type Suggestion = { capability: string; hint: string };

const refuse = (verb: string) => () => {
  throw new Error(`stub-workspace: refusing ${verb}() — tests never talk to a service`);
};

const PEOPLE = [
  {
    person_uuid: 'p-ada',
    name: 'Ada Lovelace',
    headline: null,
    role: 'Program Officer',
    relevance: 'high',
    agent_search_rationale: null,
    personal_links: [],
    personal_corpus: [],
    personal_corpus_count: 2,
  },
  {
    person_uuid: 'p-grace',
    name: 'Grace Hopper',
    headline: null,
    role: null,
    relevance: null,
    agent_search_rationale: null,
    personal_links: [],
    personal_corpus: [],
    personal_corpus_count: 0,
  },
];

const READS: Record<string, unknown> = {
  'organization.affiliations': { ok: true, people: PEOPLE },
  'client.brief.get': { ok: true, brief: null, updated_at: null },
};

export const workspace = {
  activeView: { kind: 'none' } as { kind: string; record_set_id?: string },
  last_capability: undefined as string | undefined,
  active_client_id: undefined as string | undefined,
  connect: refuse('connect'),
  disconnect: refuse('disconnect'),
  chatTurn: refuse('chatTurn'),
  async invoke(capability: string, args?: Record<string, unknown>) {
    if (capability === 'resolver.search') {
      const q = String(args?.q ?? '');
      return { ok: true, candidates: searchHook.handler ? await searchHook.handler(q) : [] };
    }
    if (capability in READS) return READS[capability];
    throw new Error(`stub-workspace: refusing capability ${capability} — not a whitelisted read`);
  },
};

export function suggest(): Suggestion[] {
  return [];
}

export const WORKSPACE_CHANGED_EVENT = 'augment-it:workspace-changed';
export function resolveWsUrl(): string {
  throw new Error('stub-workspace: refusing to resolve a socket URL');
}

/**
 * resolver.search — the capability OrgSearch's autocomplete rides.
 *
 * A test installs a per-term behaviour here rather than mutating READS, so the
 * timing of two overlapping lookups is controllable. Left unset it returns no
 * candidates, which is what every other test in this member wants.
 */
export const searchHook = {
  handler: undefined as undefined | ((q: string) => Promise<unknown[]>),
};
