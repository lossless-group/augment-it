// Smoke test for prompt-store: exercises the full CRUD cycle over NATS and
// watches for the broadcast events.
//
//   node smoke-prompt-store.mjs

import { connect, JSONCodec } from 'nats';

const jc = JSONCodec();
const nc = await connect({ servers: 'nats://localhost:4222', name: 'smoke-prompt-store' });
console.log('[smoke] connected');

// watch broadcasts
const events = [];
for (const subject of ['prompt.created', 'prompt.updated', 'prompt.deleted']) {
  const sub = nc.subscribe(subject);
  (async () => {
    for await (const m of sub) {
      events.push({ subject, payload: jc.decode(m.data) });
      console.log(`[event] ${subject}:`, JSON.stringify(jc.decode(m.data)));
    }
  })();
}

async function req(subject, body) {
  const reply = await nc.request(subject, jc.encode(body), { timeout: 5000 });
  return jc.decode(reply.data);
}

// create
console.log('\n[1] prompt.create');
const created = await req('prompt.create.requested', {
  name: 'Find Organisation URL',
  description: 'Enrichment: derive a website URL from an organisation name.',
  content: 'You are a research assistant. Find the official website URL for the organisation named {{Prospect / Organization}}. Respond with only the URL, nothing else.',
  output_column: 'url',
});
const id = created.prompt.prompt_id;
console.log('  → created', id, '|', created.prompt.name);

// list
console.log('\n[2] prompt.list');
const list = await req('prompt.list.requested', {});
console.log('  → prompts:', list.prompts.length);

// get
console.log('\n[3] prompt.get');
const got = await req('prompt.get.requested', { prompt_id: id });
console.log('  → output_column:', got.prompt.output_column);

// update
console.log('\n[4] prompt.update');
const updated = await req('prompt.update.requested', {
  prompt_id: id,
  patch: { description: 'UPDATED description.' },
});
console.log('  → description:', updated.prompt.description, '| updated_at changed:', updated.prompt.updated_at !== created.prompt.updated_at);

// delete
console.log('\n[5] prompt.delete');
const deleted = await req('prompt.delete.requested', { prompt_id: id });
console.log('  → deleted:', deleted.deleted);

const list2 = await req('prompt.list.requested', {});
console.log('  → prompts after delete:', list2.prompts.length);

await new Promise((r) => setTimeout(r, 300));
console.log('\n[smoke] broadcast events observed:', events.map((e) => e.subject).join(', '));
await nc.drain();
console.log('[done]');
