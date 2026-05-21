import { connect } from 'nats';
import { load } from './store';
import { registerHandlers } from './handlers';

const NATS_URL = process.env.NATS_URL ?? 'nats://localhost:4222';
const ROW_STORE_PATH = process.env.ROW_STORE_PATH ?? './data/rows.json';

async function main(): Promise<void> {
  await load(ROW_STORE_PATH);
  console.log(JSON.stringify({ level: 'info', msg: 'store loaded', path: ROW_STORE_PATH }));

  const nc = await connect({ servers: NATS_URL, name: 'row-store-service' });
  console.log(JSON.stringify({ level: 'info', msg: 'nats connected', url: NATS_URL }));

  registerHandlers(nc);
  console.log(JSON.stringify({ level: 'info', msg: 'row-store-service ready' }));
}

main().catch((err) => {
  console.error('row-store-service failed to boot', err);
  process.exit(1);
});
