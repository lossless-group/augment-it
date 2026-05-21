// Smoke test: ingest an XLSX file via the WebSocket path through the
// new xlsx-ingest microservice. Same shape as smoke-ws.mjs.
//
//   node smoke-xlsx.mjs <path-to-xlsx>

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

const WS_URL = process.env.WORKSPACE_WS ?? 'ws://localhost:3001/ws';
const xlsxPath = process.argv[2];

if (!xlsxPath) {
  console.error('usage: node smoke-xlsx.mjs <path-to-xlsx>');
  process.exit(2);
}

const ws = new WebSocket(WS_URL);
const pending = new Map();
let nextId = 0;

function invoke(capability, args) {
  nextId += 1;
  const id = `inv_${Date.now().toString(36)}_${nextId.toString(36)}`;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ kind: 'invoke', id, capability, args }));
  });
}

ws.addEventListener('open', () => console.log('[ws] open'));
ws.addEventListener('message', async (evt) => {
  const frame = JSON.parse(evt.data);
  if (frame.kind === 'session') {
    console.log('[ws] session', frame.token.slice(0, 8) + '…');
    try {
      const buffer = await readFile(xlsxPath);
      const xlsx_b64 = buffer.toString('base64');
      console.log(`[step] record_set.ingest.xlsx — ${basename(xlsxPath)} (${buffer.length} bytes)`);
      const result = await invoke('record_set.ingest.xlsx', {
        filename: basename(xlsxPath),
        xlsx_b64,
      });
      console.log('  → record_set:', result.record_set?.record_set_id);
      console.log('  → rows:', result.rows?.length);
      console.log('  → columns:', result.record_set?.schema?.fields?.map((f) => f.name).join(' | '));
      ws.close();
      process.exit(0);
    } catch (err) {
      console.error('[err]', err.message);
      process.exit(1);
    }
  } else if (frame.kind === 'result') {
    const p = pending.get(frame.id);
    if (!p) return;
    pending.delete(frame.id);
    frame.ok ? p.resolve(frame.result) : p.reject(new Error(frame.error));
  }
});

setTimeout(() => { console.error('[ws] timeout'); process.exit(1); }, 20_000);
