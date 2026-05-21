// Phase 3 smoke test: end-to-end through the WebSocket path.
//
//   node smoke-ws.mjs [path-to-csv]
//
// Uses Node 22's native WebSocket — same API as the browser. Exercises:
//   1. session handshake (server mints token, sends SessionFrame)
//   2. record_set.list invoke → result
//   3. (if CSV path given) record_set.ingest invoke → result
//   4. record_set.created event arrives over the same WS

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

const WS_URL = process.env.WORKSPACE_WS ?? 'ws://localhost:3001/ws';
const csvPath = process.argv[2];

const ws = new WebSocket(WS_URL);
const pending = new Map();
let nextId = 0;
let token = null;
const events = [];

function genId() {
  nextId += 1;
  return `inv_${Date.now().toString(36)}_${nextId.toString(36)}`;
}

function invoke(capability, args) {
  const id = genId();
  const frame = { kind: 'invoke', id, capability, args };
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify(frame));
  });
}

ws.addEventListener('open', async () => {
  console.log('[ws] open:', WS_URL);
});

ws.addEventListener('message', (evt) => {
  const frame = JSON.parse(evt.data);
  if (frame.kind === 'session') {
    token = frame.token;
    console.log('[ws] session token:', token.slice(0, 12) + '…');
    runScript().catch((err) => {
      console.error('[script] error:', err);
      ws.close();
    });
  } else if (frame.kind === 'result') {
    const p = pending.get(frame.id);
    if (!p) return;
    pending.delete(frame.id);
    if (frame.ok) p.resolve(frame.result);
    else p.reject(new Error(frame.error));
  } else if (frame.kind === 'event') {
    events.push(frame);
    console.log('[ws] event:', frame.subject, '(seq', frame.seq + ')');
  }
});

ws.addEventListener('close', () => {
  console.log('[ws] closed');
});

ws.addEventListener('error', (evt) => {
  console.error('[ws] error:', evt);
});

async function runScript() {
  console.log('\n[step 1] record_set.list');
  const list = await invoke('record_set.list', {});
  console.log('  → record_sets:', list.record_sets.length);
  for (const rs of list.record_sets) {
    console.log('    -', rs.record_set_id, '|', rs.name, '|', rs.schema.fields.length, 'cols,', rs.row_ids.length, 'rows');
  }

  if (csvPath) {
    console.log('\n[step 2] record_set.ingest (uploading', csvPath, ')');
    const csv = await readFile(csvPath, 'utf8');
    const result = await invoke('record_set.ingest', {
      filename: basename(csvPath),
      csv,
    });
    console.log('  → ingested record_set:', result.record_set?.record_set_id, 'with', result.rows?.length, 'rows');

    // wait briefly for the event broadcast
    await new Promise((r) => setTimeout(r, 250));
    const created = events.find((e) => e.subject === 'record_set.created');
    if (created) {
      console.log('  → event observed:', created.subject, 'for', created.payload.record_set_id);
    } else {
      console.warn('  → event NOT observed (broadcast may have lagged)');
    }
  }

  console.log('\n[done]');
  ws.close();
  process.exit(0);
}

setTimeout(() => {
  console.error('[ws] timeout — no response in 15s');
  process.exit(1);
}, 15_000);
