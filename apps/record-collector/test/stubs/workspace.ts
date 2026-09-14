/**
 * Inert stand-in for @augment-it/workspace, aliased in via `resolve.alias`.
 *
 * record-collector imports only the RecordSet TYPE from here, but the alias is
 * kept anyway: `import type` erasure is a compiler detail, and a probe that
 * assumed the real module was unreachable is exactly how a browser drive wrote
 * into live client data on 2026-09-13. Every verb throws; nothing opens a socket.
 */
const refuse = (verb: string) => () => {
  throw new Error(`stub-workspace: refusing ${verb}() — tests never talk to a service`);
};

export type RecordSet = {
  record_set_id: string;
  name: string;
  archived?: boolean;
  variant_family_id?: string | null;
  variant_family_label?: string | null;
  promoted_from?: { record_set_ids: string[] } | null;
  [k: string]: unknown;
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
