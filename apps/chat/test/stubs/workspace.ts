/**
 * Inert stand-in for @augment-it/workspace, aliased in via `resolve.alias`.
 *
 * Reads return empty. EVERY WRITE VERB THROWS — a test that reaches the network
 * is a test that could reach production, and this is the surface that did on
 * 2026-09-13. Nothing here opens a socket.
 */
export type Suggestion = { capability: string; hint: string };

const refuse = (verb: string) => () => {
  throw new Error(`stub-workspace: refusing write verb ${verb}() — tests never talk to a service`);
};

export const workspace = {
  activeView: { kind: 'none' } as { kind: string; record_set_id?: string },
  last_capability: undefined as string | undefined,
  active_client_id: undefined as string | undefined,
  connect: refuse('connect'),
  disconnect: refuse('disconnect'),
  invoke: refuse('invoke'),
  chatTurn: refuse('chatTurn'),
};

export function suggest(): Suggestion[] {
  return [];
}

export const WORKSPACE_CHANGED_EVENT = 'augment-it:workspace-changed';
export function resolveWsUrl(): string {
  throw new Error('stub-workspace: refusing to resolve a socket URL');
}
