#!/usr/bin/env node
// ============================================================================
// prove-augment-from-db-capabilities.mjs — Augment-from-DB Phase 1 acceptance
// proof. Talks directly to NATS (the workspace hop is Phase 2's concern).
//
// Proves:
//   (a) organization.detail          — full org card, all three lists present
//   (b) organization.affiliations    — ≥1 person for an org known to have edges
//   (c) search.fire (no provider)    — resolves to SearXNG (free default)
//   (d) search.fire provider='exa'   — Exa peer connector returns results
//   (e) search.fire provider='nope'  — localized ok:false, service stays up
//   (f) resolver.search <alias>      — D4: alias/domain matching (optional arg)
//
// The Exa needs-env negative (spec criterion): restart social-search once with
// EXA_AI_API_KEY unset and re-run — expect (d) to fail with
// "connector exa is needs-env" while (c) stays green. Manual toggle, by design.
//
// Prereqs: docker compose up -d nats searxng social-search record-surrealdb-resolver
// Usage:   node scripts/prove-augment-from-db-capabilities.mjs <org_slug> <client> [alias_fragment]
//
// Plan: context-v/plans/Augment-From-DB-Phase-1-Service-Capabilities.md
// Spec: context-v/specs/Augment-From-DB-Flow.md
// ============================================================================

import { createRequire } from 'node:module';
const require = createRequire(
  new URL('../services/social-search/package.json', import.meta.url),
);
const { connect } = require('@nats-io/transport-node');

const NATS_URL = process.env.NATS_URL ?? 'nats://localhost:4222';
const [ORG_SLUG, CLIENT, ALIAS_Q] = process.argv.slice(2);
if (!ORG_SLUG || !CLIENT) {
  console.error('usage: node scripts/prove-augment-from-db-capabilities.mjs <org_slug> <client> [alias_fragment]');
  process.exit(1);
}

const nc = await connect({ servers: NATS_URL, name: 'prove-augment-from-db' });
const dec = new TextDecoder();
const req = async (subject, body, timeout = 30_000) =>
  JSON.parse(dec.decode((await nc.request(subject, JSON.stringify(body), { timeout })).data));

let failed = 0;
const check = (label, ok, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${label}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failed++;
};

// (a) organization.detail
const det = await req('organization.detail.requested', { org_slug: ORG_SLUG, client: CLIENT });
check(
  'organization.detail',
  det.ok === true && det.org?.slug === ORG_SLUG &&
    Array.isArray(det.org?.org_links) && Array.isArray(det.org?.media_streams) && Array.isArray(det.org?.org_corpus),
  det.ok
    ? `links=${det.org.org_links.length} streams=${det.org.media_streams.length} corpus=${det.org.org_corpus.length}`
    : det.error,
);

// (b) organization.affiliations
const aff = await req('organization.affiliations.requested', { org_slug: ORG_SLUG, client: CLIENT });
check(
  'organization.affiliations ≥1 person',
  aff.ok === true && Array.isArray(aff.people) && aff.people.length >= 1,
  aff.ok
    ? `people=${aff.people.length} first="${aff.people[0]?.name ?? '?'}" role=${aff.people[0]?.role ?? '-'} relevance=${aff.people[0]?.relevance ?? '-'}`
    : aff.error,
);

// (c) search.fire — default resolution → searxng (free tier wins)
const sx = await req('search.fire.requested', { query: 'anthropic claude' });
check(
  'search.fire default → searxng, results > 0',
  sx.ok === true && sx.provider === 'searxng' && Array.isArray(sx.results) && sx.results.length > 0,
  sx.ok ? `n=${sx.results.length} first=${sx.results[0]?.url ?? '?'}` : sx.error,
);

// (d) search.fire — explicit Exa
const ex = await req('search.fire.requested', { query: 'anthropic claude', provider: 'exa' });
check(
  "search.fire provider='exa', results > 0",
  ex.ok === true && ex.provider === 'exa' && Array.isArray(ex.results) && ex.results.length > 0,
  ex.ok ? `n=${ex.results.length} first=${ex.results[0]?.url ?? '?'}` : ex.error,
);

// (e) unknown provider → localized ok:false
const bad = await req('search.fire.requested', { query: 'x', provider: 'nope' });
check(
  'search.fire unknown provider → ok:false',
  bad.ok === false && /unknown connector/.test(bad.error ?? ''),
  bad.error ?? '(no error message)',
);

// (f) D4 — alias/domain matching through resolver.search
if (ALIAS_Q) {
  const s = await req('resolver.search.requested', { q: ALIAS_Q, client: CLIENT });
  check(
    `resolver.search alias/domain "${ALIAS_Q}" ≥1 candidate`,
    s.ok === true && Array.isArray(s.candidates) && s.candidates.length >= 1,
    s.ok ? s.candidates.map((c) => c.slug).join(', ') : s.error,
  );
} else {
  console.log('ℹ️  (f) skipped — pass an alias/domain fragment as the third arg to prove D4');
}

// Bonus: exa visible in connectors.inventory with correct tier + status
const inv = await req('connectors.inventory.requested', {});
const exaReg = (inv.connectors ?? []).find((c) => c.id === 'exa');
check(
  "connectors.inventory lists 'exa' (paid)",
  Boolean(exaReg) && exaReg.cost_tier === 'paid',
  exaReg ? `status=${exaReg.status}` : 'not registered',
);

await nc.drain();
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks green — Phase 1 acceptance met.');
process.exit(failed ? 1 : 0);
