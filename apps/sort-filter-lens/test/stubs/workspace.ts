/**
 * Inert stand-in for @augment-it/workspace, aliased in via `resolve.alias`.
 *
 * READS return a two-record fixture. EVERY WRITE VERB THROWS. This member calls
 * `content_ingest.preview_url` and `corpus.add` — the exact pair a probe with a
 * silently-ignored `source.alias` drove on 2026-09-13, writing a real file into
 * live client data at clients/reach-edu/corpus/. Nothing here opens a socket;
 * anything that tries to write fails loudly instead of succeeding against
 * production.
 */
const READ_ONLY = new Set(['record_set.list', 'row.list', 'corpus.list_for_record']);

export const RECORD_SETS = [
  {
    record_set_id: 'rs_alpha',
    name: 'alpha-2026-01-01.csv',
    created_at: '2026-01-01T00:00:00Z',
    archived: false,
    row_ids: ['r1', 'r2'],
    schema: { fields: [{ name: 'org_name' }, { name: 'url' }] },
  },
  {
    record_set_id: 'rs_bravo',
    name: 'bravo-2026-02-01.csv',
    created_at: '2026-02-01T00:00:00Z',
    archived: false,
    row_ids: ['r3'],
    schema: { fields: [{ name: 'org_name' }] },
  },
  {
    record_set_id: 'rs_charlie',
    name: 'charlie-2026-03-01.csv',
    created_at: '2026-03-01T00:00:00Z',
    archived: false,
    row_ids: [],
    schema: { fields: [{ name: 'org_name' }] },
  },
];

export const workspace = {
  activeView: { kind: 'none' } as { kind: string; record_set_id?: string },
  last_capability: undefined as string | undefined,
  active_client_id: undefined as string | undefined,
  status: 'open',
  connect(): void {
    /* deliberately inert — no socket, no token, no service */
  },
  disconnect(): void {},
  async invoke(capability: string): Promise<unknown> {
    if (!READ_ONLY.has(capability)) {
      throw new Error(
        `stub-workspace: refusing write verb ${capability} — tests never talk to a service`,
      );
    }
    if (capability === 'record_set.list') return { record_sets: RECORD_SETS };
    if (capability === 'row.list') return { rows: [] };
    return { corpus: [] };
  },
  chatTurn(): never {
    throw new Error('stub-workspace: refusing write verb chatTurn');
  },
};

export const WORKSPACE_CHANGED_EVENT = 'augment-it:workspace-changed';
export function resolveWsUrl(): string {
  return 'ws://stub.invalid/never-dialled';
}