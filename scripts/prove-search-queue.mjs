#!/usr/bin/env node
// ============================================================================
// prove-search-queue.mjs — Search-Results Queue Phase 1 acceptance proof.
// Talks over the workspace WS (the search.* registry ops are LOCAL to the
// workspace service — no NATS subject to hit directly).
//
// Proves the full async round-trip:
//   (a) search.submit       — returns {ok, search_id} immediately (<2s)
//   (b) search.updated      — WS event frames arrive for running + settle
//   (c) search.list         — the card shows with status/timestamps/typical_ms
//   (d) search.results      — the settled payload (results | people) fetches
//   (e) search.dismiss      — the entry leaves the registry
//
// Prereqs: the stack up (workspace-service :3001 + prompt-runner for the
// crawl). Fires ONE real crawl — use the safe target.
// Usage:   node scripts/prove-search-queue.mjs <org_slug> <client> [target]
//          target defaults to 'links' (the fastest, ~90s typical)
//
// Spec: context-v/specs/Search-Results-Queue-Remote.md §Phase 1.
// ============================================================================

const WS_URL = process.env.WORKSPACE_WS_URL ?? 'ws://localhost:3001/ws';
const [ORG_SLUG, CLIENT, TARGET = 'links'] = process.argv.slice(2);
if (!ORG_SLUG || !CLIENT) {
  console.error('usage: node scripts/prove-search-queue.mjs <org_slug> <client> [links|streams|team]');
  process.exit(1);
}

let failed = 0;
const check = (label, ok, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${label}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failed++;
};

const ws = new WebSocket(WS_URL);
let nextId = 0;
const pending = new Map();
const seenEvents = [];
let onEvent = null;

ws.addEventListener('message', (evt) => {
  const frame = JSON.parse(evt.data);
  if (frame.kind === 'result') {
    const p = pending.get(frame.id);
    if (p) {
      pending.delete(frame.id);
      frame.ok ? p.resolve(frame.result) : p.reject(new Error(frame.error));
    }
  } else if (frame.kind === 'event' && frame.subject === 'search.updated') {
    seenEvents.push(frame.payload);
    onEvent?.(frame.payload);
  }
});

const invoke = (capability, args) =>
  new Promise((resolve, reject) => {
    const id = `prove_${++nextId}`;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ kind: 'invoke', id, capability, args }));
  });

await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve);
  ws.addEventListener('error', () => reject(new Error(`cannot reach ${WS_URL}`)));
});

// (a) submit returns immediately
const t0 = Date.now();
const sub = await invoke('search.submit', {
  entity: { org_slug: ORG_SLUG, display_name: ORG_SLUG },
  target: TARGET,
  client: CLIENT,
});
const submitMs = Date.now() - t0;
check('search.submit immediate', sub.ok === true && typeof sub.search_id === 'string' && submitMs < 2_000,
  `search_id=${sub.search_id} in ${submitMs}ms`);
const id = sub.search_id;

// (c, pre-settle) the card is listed as queued/running
const list1 = await invoke('search.list', { client: CLIENT });
const card1 = (list1.searches ?? []).find((s) => s.search_id === id);
check('search.list shows the in-flight card',
  Boolean(card1) && ['queued', 'running'].includes(card1?.status) && card1?.typical_ms > 0,
  card1 ? `status=${card1.status} typical_ms=${card1.typical_ms}` : 'card missing');

// (b) wait for the settle event (crawls run minutes — 12min ceiling)
console.log(`… waiting for the ${TARGET} crawl of ${ORG_SLUG} to settle (typically ~${Math.round((card1?.typical_ms ?? 90000) / 1000)}s)`);
const settled = await new Promise((resolve) => {
  const timer = setTimeout(() => resolve(null), 720_000);
  const check_ = (p) => {
    if (p.search_id === id && (p.status === 'done' || p.status === 'failed')) {
      clearTimeout(timer);
      resolve(p);
    }
  };
  seenEvents.forEach(check_);
  onEvent = check_;
});
check('search.updated settle event', Boolean(settled), settled ? `status=${settled.status}` : 'no settle event in 12min');
check('search.updated running event seen', seenEvents.some((p) => p.search_id === id && p.status === 'running'));

// (d) results fetch
const res = await invoke('search.results', { search_id: id });
const payload = res.results ?? res.people;
check('search.results',
  res.ok === true && (settled?.status === 'failed' ? typeof res.error === 'string' : Array.isArray(payload)),
  settled?.status === 'failed' ? `failed as reported: ${res.error}` : `${payload?.length ?? 0} ${res.results ? 'results' : 'people'}`);

// (e) dismiss removes it
await invoke('search.dismiss', { search_id: id });
const list2 = await invoke('search.list', { client: CLIENT });
check('search.dismiss removes the card', !(list2.searches ?? []).some((s) => s.search_id === id));

console.log(failed === 0 ? '\nall green' : `\n${failed} check(s) failed`);
ws.close();
process.exit(failed === 0 ? 0 : 1);
