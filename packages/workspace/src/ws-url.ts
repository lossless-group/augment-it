// Where workspace-service's WebSocket lives.
//
// This is the ONE place the endpoint is decided. It exists because it used
// to be decided in sixteen places: every remote declared its own
// `const WS_URL = 'ws://localhost:3001/ws'` and never read the environment,
// so on augment.didi.sh they each dialled the *visitor's* laptop and showed
// an empty surface behind a `closed` badge. Local dev hid it perfectly —
// the operator's machine really is running workspace-service on :3001.
// See [[Every-Remote-Hardcodes-The-Workspace-WS-To-Localhost-So-Prod-Loads-No-Data]].
//
// rsbuild inlines PUBLIC_-prefixed vars into import.meta.env at BUILD time,
// and it does so for plain .ts modules too — not just .svelte files. This
// module is consumed as source (packages/workspace has `main: ./src/index.ts`),
// so each app's own build substitutes its own PUBLIC_WS_URL here. Changing
// the value therefore requires a rebuild, never just a restart.

/** Dev fallback: the local docker-compose workspace-service. */
export const DEFAULT_WS_URL = 'ws://localhost:3001/ws';

/**
 * The workspace WebSocket endpoint for this build.
 *
 * Prod must set `PUBLIC_WS_URL=wss://ws.augment.didi.sh/ws`. Note the `wss`:
 * an insecure `ws://` socket opened from an `https://` page is blocked as
 * mixed content, so a plain `ws://` value cannot work in production even
 * when the host is right.
 */
export function resolveWsUrl(): string {
  const fromEnv = (import.meta as { env?: Record<string, string> }).env?.PUBLIC_WS_URL;
  return (typeof fromEnv === 'string' && fromEnv.length > 0 ? fromEnv : DEFAULT_WS_URL);
}

/**
 * The matching HTTP origin for the same service — `ws(s)://host/ws` →
 * `http(s)://host`. Used for plain fetches like `/config`.
 */
export function resolveHttpBase(wsUrl: string = resolveWsUrl()): string {
  return wsUrl.replace(/^ws/, 'http').replace(/\/ws$/, '');
}
