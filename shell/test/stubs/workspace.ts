/**
 * Inert stand-in for @augment-it/workspace, aliased in via `resolve.alias`.
 *
 * The shell is the federation host and `workspace` is the singleton every
 * remote shares, so this is the stub with the largest blast radius in the repo.
 * NOTHING HERE OPENS A SOCKET. `invoke` and `chatTurn` — the write path a probe
 * with a silently-ignored `source.alias` drove on 2026-09-13, writing a real
 * file into clients/reach-edu/corpus/ — throw on every verb.
 *
 * `activateWorkspace` is the one verb that does not throw, because it is the
 * thing under test: WorkspaceSwitcher's click path calls it. It RECORDS the
 * call into `activated` and touches nothing else. Real activation persists to
 * localStorage and re-dials the service; this does neither.
 *
 * SENTINEL: `resolveWsUrl()` returns a URL that could not possibly reach a
 * service. Every test file asserts it, because a sandbox that is not asserted
 * is not a sandbox — an alias key that is accepted and ignored is
 * indistinguishable from one that worked, right up until it writes to a client.
 */
import type { WorkspaceSummary, UserContext } from '@augment-it/workspace/types';

export const STUB_WS_URL = 'ws://stub.invalid/never-dialled';

export const WORKSPACES: WorkspaceSummary[] = [
  { client_id: 'alpha-co', display_name: 'Alpha Co', has_env: true, default_domain_type: 'strategy' },
  { client_id: 'bravo-fund', display_name: 'Bravo Fund', has_env: false, default_domain_type: 'strategy' },
  { client_id: 'charlie-trust', display_name: 'Charlie Trust', has_env: true, default_domain_type: 'strategy' },
];

/** Every activateWorkspace call, in order. The click-path guard reads this. */
export const activated: string[] = [];

export const workspace = {
  user: null as UserContext | null,
  workspaces: [...WORKSPACES] as WorkspaceSummary[],
  active_client_id: 'alpha-co' as string | null,
  workspaces_status: 'ready' as 'idle' | 'loading' | 'ready' | 'error',
  workspaces_error: null as string | null,
  connection_status: 'open' as 'idle' | 'connecting' | 'open' | 'closed' | 'error' | 'auth_required',
  didi_auth_mode: null as 'off' | 'optional' | 'required' | null,
  pinned: false,
  last_capability: undefined as string | undefined,
  connect(): void {
    /* deliberately inert — no socket, no token, no service */
  },
  disconnect(): void {},
  async activateWorkspace(client_id: string): Promise<void> {
    activated.push(client_id);
    this.active_client_id = client_id;
  },
  async invoke(capability: string): Promise<never> {
    throw new Error(`stub-workspace: refusing ${capability} — tests never talk to a service`);
  },
  chatTurn(): never {
    throw new Error('stub-workspace: refusing write verb chatTurn');
  },
};

/** Reset between tests — the stub is a module singleton, like the real one. */
export function resetStub(): void {
  workspace.workspaces = [...WORKSPACES];
  workspace.active_client_id = 'alpha-co';
  workspace.workspaces_status = 'ready';
  workspace.workspaces_error = null;
  workspace.connection_status = 'open';
  activated.length = 0;
}

export const WORKSPACE_CHANGED_EVENT = 'augment-it:workspace-changed';
export function resolveWsUrl(): string {
  return STUB_WS_URL;
}
export function resolveHttpBase(): string {
  return 'http://stub.invalid';
}
