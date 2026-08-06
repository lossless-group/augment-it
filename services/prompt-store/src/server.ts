import { connect } from '@nats-io/transport-node';
import { load } from './store';
import { registerPromptStoreHandlers } from './handlers';

const NATS_URL = process.env.NATS_URL ?? 'nats://localhost:4222';
const PROMPT_STORE_PATH = process.env.PROMPT_STORE_PATH ?? './data/prompts.json';

async function main(): Promise<void> {
  await load(PROMPT_STORE_PATH);
  console.log(JSON.stringify({ level: 'info', msg: 'store loaded', path: PROMPT_STORE_PATH }));

  const nc = await connect({ servers: NATS_URL, name: 'prompt-store-service' });
  console.log(JSON.stringify({ level: 'info', msg: 'nats connected', url: NATS_URL }));

  registerPromptStoreHandlers(nc);
  console.log(JSON.stringify({ level: 'info', msg: 'prompt-store-service ready' }));
}

main().catch((err) => {
  console.error('prompt-store-service failed to boot', err);
  process.exit(1);
});
