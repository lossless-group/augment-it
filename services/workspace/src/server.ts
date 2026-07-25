import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { connectNats } from './nats';
import { loadSessions } from './auth';
import { registerWebsocket } from './ws';
import { initWorkspaces, registerActiveQueryResponder, listWorkspaces, getActiveClientId } from './workspaces';
import { loadSearches, startSearchSweep } from './searches';
import { didiMode } from './didi';

const NATS_URL = process.env.NATS_URL ?? 'nats://localhost:4222';
const SESSION_STORE_PATH = process.env.SESSION_STORE_PATH ?? './data/sessions.json';
// The search registry — searches as async jobs, persisted like sessions.
// See ./searches.ts and context-v/specs/Search-Results-Queue-Remote.md.
const SEARCH_STORE_PATH = process.env.SEARCH_STORE_PATH ?? './data/searches.json';
// Where to look for workspace directories. /clients in docker, repo-relative
// for local dev. Each child dir == one workspace; see workspaces.ts.
const CLIENTS_ROOT = process.env.CLIENTS_ROOT ?? '../../clients';
const INITIAL_ACTIVE_CLIENT_ID = process.env.ACTIVE_CLIENT_ID;
const PORT = Number(process.env.PORT ?? 3001);

async function main(): Promise<void> {
  const app = Fastify({ logger: { level: 'info' } });
  await app.register(websocket);

  app.get('/health', async () => ({ ok: true }));

  // Plain, unauthenticated GET so the shell can learn this instance's
  // DIDI_AUTH posture BEFORE attempting the WS upgrade — needed because an
  // anonymous upgrade against a `required` instance is rejected (4401)
  // before any session frame is ever sent, so the session frame alone
  // can't tell an anonymous visitor "this instance requires sign-in."
  // Build-Order Step 7. CORS is manual (no @fastify/cors dependency) since
  // this is the only cross-origin GET the service serves.
  app.get('/config', async (_req, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    return { didi_auth_mode: didiMode() };
  });

  await loadSessions(SESSION_STORE_PATH);
  app.log.info({ path: SESSION_STORE_PATH }, 'sessions loaded');

  await initWorkspaces({
    clients_root: CLIENTS_ROOT,
    initial_active_id: INITIAL_ACTIVE_CLIENT_ID,
  });
  // Diagnostic: which workspaces did discover() actually find, and what
  // did active-id resolution land on? "workspaces initialized" alone gave
  // no visibility into a real prod bug (2026-07-11 — humain-vc showing
  // "no workspace" in the curator on the deployed instance).
  const discovered = await listWorkspaces();
  app.log.info(
    {
      clients_root: CLIENTS_ROOT,
      initial_active_id: INITIAL_ACTIVE_CLIENT_ID,
      resolved_active_id: getActiveClientId(),
      discovered_slugs: discovered.map((w) => w.client_id),
    },
    'workspaces initialized',
  );

  await connectNats(NATS_URL);
  app.log.info({ url: NATS_URL }, 'nats connected');

  registerActiveQueryResponder();
  app.log.info('workspace.active.requested responder registered');

  // After NATS: a stranded-entry mark on load never needs the connection,
  // but everything the registry does from here on (execute, broadcast) does.
  await loadSearches(SEARCH_STORE_PATH);
  startSearchSweep();
  app.log.info({ path: SEARCH_STORE_PATH }, 'search registry loaded');

  await registerWebsocket(app);

  await app.listen({ port: PORT, host: '0.0.0.0' });
  app.log.info({ port: PORT }, 'workspace-service ready');
}

main().catch((err) => {
  console.error('workspace-service failed to boot', err);
  process.exit(1);
});
