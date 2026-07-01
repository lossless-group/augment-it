import { connect } from '@nats-io/transport-node';
import { registerHandlers } from './handlers';

const NATS_URL = process.env.NATS_URL ?? 'nats://localhost:4222';

async function main(): Promise<void> {
  const nc = await connect({ servers: NATS_URL, name: 'content-ingest-service' });
  console.log(JSON.stringify({ level: 'info', msg: 'nats connected', url: NATS_URL }));
  registerHandlers(nc);
  console.log(JSON.stringify({ level: 'info', msg: 'content-ingest-service ready' }));
}

main().catch((err) => {
  console.error('content-ingest-service failed to boot', err);
  process.exit(1);
});
