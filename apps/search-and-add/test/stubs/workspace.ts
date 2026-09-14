/**
 * Inert stand-in for @augment-it/workspace, aliased in via `resolve.alias`.
 *
 * `ProviderPalette` does not import it, but the alias is wired anyway: this
 * member's App.svelte drives `content_ingest.preview_url` and `corpus.add` —
 * the exact pair a probe with a silently-ignored `source.alias` fired on
 * 2026-09-13, writing a real file into live client data. Every write verb here
 * THROWS, so extending these tests upward fails loudly instead of succeeding
 * against production. Nothing here opens a socket.
 */
export const workspace = {
  activeView: { kind: 'none' } as { kind: string; record_set_id?: string },
  active_client_id: undefined as string | undefined,
  status: 'open',
  connect(): void {},
  disconnect(): void {},
  async invoke(capability: string): Promise<unknown> {
    throw new Error(
      `stub-workspace: refusing ${capability} — tests never talk to a service`,
    );
  },
};

export const WORKSPACE_CHANGED_EVENT = 'augment-it:workspace-changed';
export function resolveWsUrl(): string {
  return 'ws://stub.invalid/never-dialled';
}
export function resolveHttpBase(): string {
  return 'http://stub.invalid/never-dialled';
}
