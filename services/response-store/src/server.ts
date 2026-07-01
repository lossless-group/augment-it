// response-store — the store of record for every fired LLM response. The
// post-flight review log that response-reviewer reads. Structurally a
// sibling of prompt-store.
//
// Spec: context-v/specs/Response-Reviewer-and-Response-Store.md

import { connect } from '@nats-io/transport-node';
import { load } from './store';
import { registerHandlers } from './handlers';

const NATS_URL = process.env.NATS_URL ?? 'nats://localhost:4222';
const RESPONSE_STORE_PATH = process.env.RESPONSE_STORE_PATH ?? './data/responses.json';

async function main(): Promise<void> {
  await load(RESPONSE_STORE_PATH);
  console.log(JSON.stringify({ level: 'info', msg: 'store loaded', path: RESPONSE_STORE_PATH }));

  const nc = await connect({ servers: NATS_URL, name: 'response-store-service' });
  console.log(JSON.stringify({ level: 'info', msg: 'nats connected', url: NATS_URL }));

  registerHandlers(nc);
  console.log(JSON.stringify({ level: 'info', msg: 'response-store-service ready' }));
}

main().catch((err) => {
  console.error('response-store-service failed to boot', err);
  process.exit(1);
});
