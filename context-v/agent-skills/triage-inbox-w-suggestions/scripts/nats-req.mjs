#!/usr/bin/env node
// One-shot NATS request helper for triage runs.
// usage: node nats-req.mjs <subject> '<json-body>' [timeoutMs]
import { createRequire } from 'node:module';
const require = createRequire(
  '/Users/mpstaton/code/lossless-monorepo/ai-labs/augment-it/services/social-search/package.json',
);
const { connect } = require('@nats-io/transport-node');

const [subject, bodyJson, timeoutStr] = process.argv.slice(2);
if (!subject) {
  console.error('usage: node nats-req.mjs <subject> <json-body> [timeoutMs]');
  process.exit(1);
}
const nc = await connect({ servers: process.env.NATS_URL ?? 'nats://localhost:4222', name: 'triage-inbox-helper' });
const dec = new TextDecoder();
try {
  const reply = await nc.request(subject, bodyJson ?? '{}', { timeout: Number(timeoutStr ?? 30_000) });
  console.log(dec.decode(reply.data));
} finally {
  await nc.drain();
}
