import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { connectNats } from './nats';
import { loadSessions } from './auth';
import { registerWebsocket } from './ws';
import { initWorkspaces } from './workspaces';

const NATS_URL = process.env.NATS_URL ?? 'nats://localhost:4222';
const SESSION_STORE_PATH = process.env.SESSION_STORE_PATH ?? './data/sessions.json';
// Where to look for workspace directories. /clients in docker, repo-relative
// for local dev. Each child dir == one workspace; see workspaces.ts.
const CLIENTS_ROOT = process.env.CLIENTS_ROOT ?? '../../clients';
const INITIAL_ACTIVE_CLIENT_ID = process.env.ACTIVE_CLIENT_ID;
const PORT = Number(process.env.PORT ?? 3001);

async function main(): Promise<void> {
  const app = Fastify({ logger: { level: 'info' } });
  await app.register(websocket);

  app.get('/health', async () => ({ ok: true }));

  await loadSessions(SESSION_STORE_PATH);
  app.log.info({ path: SESSION_STORE_PATH }, 'sessions loaded');

  await initWorkspaces({
    clients_root: CLIENTS_ROOT,
    initial_active_id: INITIAL_ACTIVE_CLIENT_ID,
  });
  app.log.info({ clients_root: CLIENTS_ROOT }, 'workspaces initialized');

  await connectNats(NATS_URL);
  app.log.info({ url: NATS_URL }, 'nats connected');

  await registerWebsocket(app);

  await app.listen({ port: PORT, host: '0.0.0.0' });
  app.log.info({ port: PORT }, 'workspace-service ready');
}

main().catch((err) => {
  console.error('workspace-service failed to boot', err);
  process.exit(1);
});
