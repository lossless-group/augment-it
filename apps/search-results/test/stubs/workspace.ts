/**
 * Inert stand-in for @augment-it/workspace, aliased in via `resolve.alias`.
 *
 * EVERY VERB THROWS. search-results' client wraps workspace.invoke for
 * submit / list / results / dismiss — two of which WRITE — so a test that
 * reached the real module could reach the same live client data a probe wrote
 * into on 2026-09-13. Nothing here opens a socket.
 */
const refuse = (verb: string) => () => {
  throw new Error(`stub-workspace: refusing ${verb}() — tests never talk to a service`);
};

export const workspace = {
  activeView: { kind: 'none' } as { kind: string; record_set_id?: string },
  connect: refuse('connect'),
  disconnect: refuse('disconnect'),
  invoke: refuse('invoke'),
};

export const WORKSPACE_CHANGED_EVENT = 'augment-it:workspace-changed';
export function resolveWsUrl(): string {
  throw new Error('stub-workspace: refusing to resolve a socket URL');
}
