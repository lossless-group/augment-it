// Phase 2 proof-of-life: run a real enrichment prompt against a real
// record set. Seeds a url-finder prompt, fires prompt.run.requested with
// row_limit 3, watches progress, prints the derived record set.
//
//   node smoke-prompt-run.mjs

import { connect, JSONCodec } from 'nats';

const jc = JSONCodec();
const nc = await connect({ servers: 'nats://localhost:4222', name: 'smoke-prompt-run' });
console.log('[smoke] connected');

async function req(subject, body, timeout = 600_000) {
  const reply = await nc.request(subject, jc.encode(body), { timeout });
  return jc.decode(reply.data);
}

// progress events
const progressSub = nc.subscribe('prompt.run.progress');
(async () => {
  for await (const m of progressSub) {
    const p = jc.decode(m.data);
    console.log(`  [progress] ${p.done}/${p.total}`);
  }
})();

// 1. find a pipeline-tracker CSV record set
const list = await req('record_set.list.requested', {});
const target = list.record_sets.find((rs) => rs.name.toLowerCase().includes('pipeline'));
if (!target) {
  console.error('[smoke] no pipeline-tracker record set found — ingest one first');
  process.exit(1);
}
console.log(`[smoke] target: ${target.record_set_id} | ${target.name} | ${target.row_ids.length} rows`);
const colNames = target.schema.fields.map((f) => f.name);
console.log(`[smoke] columns include: ${colNames.slice(0, 4).join(', ')}…`);

// 2. seed the url-finder prompt
const orgColumn = colNames.find((n) => n.toLowerCase().includes('organization') || n.toLowerCase().includes('prospect')) ?? colNames[0];
console.log(`[smoke] using {{${orgColumn}}} as the org-name token`);
const created = await req('prompt.create.requested', {
  name: 'Find Organisation URL',
  description: 'Enrichment: derive a website URL from an organisation name.',
  content: `You are a research assistant. Search the web to find the official website URL for the organisation named {{${orgColumn}}}. Respond with only the URL (e.g. https://example.org), nothing else. If you genuinely cannot determine it, respond with "unknown".`,
  output_column: 'url',
  tools: ['web_search'],
});
const promptId = created.prompt.prompt_id;
console.log(`[smoke] prompt created: ${promptId}`);

// 3. run it, row_limit 3
console.log('\n[smoke] running prompt against 3 rows — real LLM calls…\n');
const result = await req('prompt.run.requested', {
  prompt_id: promptId,
  record_set_id: target.record_set_id,
  row_limit: 3,
});

if (!result.ok) {
  console.error('[smoke] run failed:', result.error);
  process.exit(1);
}

console.log(`\n[smoke] derived record set: ${result.record_set.record_set_id}`);
console.log(`[smoke] name: ${result.record_set.name}`);
console.log(`[smoke] schema source kind: ${result.record_set.schema.source.kind}`);
console.log(`[smoke] derived_from: ${JSON.stringify(result.record_set.derived_from)}`);

// 4. fetch the derived rows, show the new url column
const derived = await req('record_set.get.requested', { record_set_id: result.record_set.record_set_id });
console.log('\n[smoke] enriched rows:');
for (const row of derived.rows) {
  const org = row.fields[orgColumn];
  console.log(`  ${org}  →  url: ${row.fields.url}`);
}

await nc.drain();
console.log('\n[done]');
