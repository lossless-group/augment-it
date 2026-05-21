// Smoke test: ingest a CSV through the running stack end-to-end.
//
//   node smoke-ingest.mjs <path-to-csv>
//
// Flow:
//   this script ──NATS request──▶ ingest-service
//                                    │
//                                    ▼ NATS request
//                                 row-store
//                                    │
//                                    ▼ persist + broadcast
//                                 record_set.created event
//
// Connects directly to NATS (bypassing the Workspace Service / WebSocket
// hop) — that's the right shape for a backend smoke test. The browser path
// goes through the Workspace Service; this script proves the bus-side chain.

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { connect, JSONCodec } from 'nats';

const csvPath = process.argv[2];
if (!csvPath) {
  console.error('usage: node smoke-ingest.mjs <path-to-csv>');
  process.exit(2);
}

const jc = JSONCodec();

const csv = await readFile(csvPath, 'utf8');
const filename = basename(csvPath);

const nc = await connect({ servers: 'nats://localhost:4222', name: 'smoke-ingest' });
console.log(`[smoke] connected to NATS, publishing ${filename} (${csv.length} bytes)`);

// Subscribe to the broadcast event before requesting so we don't miss it.
const eventSub = nc.subscribe('record_set.created');
(async () => {
  for await (const msg of eventSub) {
    const ev = jc.decode(msg.data);
    console.log('[smoke] received broadcast record_set.created:', JSON.stringify(ev, null, 2));
    eventSub.unsubscribe();
    await nc.drain();
  }
})();

try {
  const reply = await nc.request(
    'record_set.ingest.requested',
    jc.encode({ filename, csv }),
    { timeout: 20_000 },
  );
  const result = jc.decode(reply.data);
  console.log('[smoke] ingest replied with:');
  console.log(JSON.stringify(result, null, 2).slice(0, 2000));
  console.log('[smoke] row count:', Array.isArray(result?.rows) ? result.rows.length : '(unknown shape)');
} catch (err) {
  console.error('[smoke] ingest failed:', err.message);
  await nc.drain();
  process.exit(1);
}
