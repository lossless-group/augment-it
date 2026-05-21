import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { connectNats } from './nats';
import { loadSessions } from './auth';
import { registerWebsocket } from './ws';

const NATS_URL = process.env.NATS_URL ?? 'nats://localhost:4222';
const SESSION_STORE_PATH = process.env.SESSION_STORE_PATH ?? './data/sessions.json';
const PORT = Number(process.env.PORT ?? 3001);

async function main(): Promise<void> {
  const app = Fastify({ logger: { level: 'info' } });
  await app.register(websocket);

  app.get('/health', async () => ({ ok: true }));

  await loadSessions(SESSION_STORE_PATH);
  app.log.info({ path: SESSION_STORE_PATH }, 'sessions loaded');

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
