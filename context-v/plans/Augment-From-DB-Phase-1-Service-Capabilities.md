---
title: "Augment from DB · Phase 1 — service capabilities + Exa, no UI"
lede: "Four service-side deliverables that make the whole flow provable from a script before any remote exists: org detail + org affiliations reads, a registry-resolved search.fire, and Exa as a peer connector."
date_created: 2026-07-22
date_modified: 2026-07-22
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
semantic_version: 0.0.1.0
date_first_published: 2026-07-22
spec_reference: "[[../specs/Augment-From-DB-Flow]] §Phase 1"
post_ship_note: "Executed same day as authored. All 12 steps landed as written; proof script green on first run (the-aspen-institute / reach-edu / gary-lauder), needs-env toggle verified live, three services typecheck clean. Both version-sensitive SurrealQL constructs (Steps 7 and 9) worked without their named fallbacks. Only deviation: EXA_AI_API_KEY passthrough uses the ${VAR:-} empty-default form (ANTHROPIC_API_KEY precedent) so compose doesn't warn when unset. Regression #4's pack.search override check covered by typecheck exhaustiveness + untouched dispatch path rather than a live fire."
tags:
  - Plan
  - Augment-It
  - Augment-From-DB
  - Phase-1
  - Capabilities
  - Exa
  - SurrealDB
  - Search-Providers
status: Shipped
site_uuid: c1e0a473-1b1a-4a6d-b8cc-08b8ab78ab0f
hex_code: 8en2qa
date_authored_initial_draft: 2026-07-22
date_authored_current_draft: 2026-07-22
---

# Augment from DB · Phase 1 — service capabilities + Exa

## Spec reference

Implements **Phase 1** of [[../specs/Augment-From-DB-Flow]] (Signed-Off, v0.0.1.0). No UI in this phase; success is proven by a NATS script. Branch: `rebuild/turbo-rsbuild` (the canonical rebuild branch — do not target `main`).

Everything below was verified against the working tree on 2026-07-22; three facts discovered during plan authoring **supersede the spec's anticipated snippets** where they differ:

1. `ConnectorRegistry.resolve(intent)` returns a **sorted array** (free-tier first), not a single registration — `search.fire` takes `resolve(intent)[0]`.
2. The legacy `CONNECTORS` map in `connectors/index.ts` is `Record<ProviderId, Connector>` — **exhaustive**. Extending `ProviderId` with `'exa'` without adding the map entry is a type error; adding it also gives the legacy `provider_override: 'exa'` path on `pack.search` for free.
3. The `affiliations` edge's `relevance` is a **string | null** in live code (`AffiliationEdgeRow`, written by the CSV rating loop) — `AffiliatedPerson.relevance` passes it through as `string | null`, sorted in JS, not in SurrealQL.

## Scope

| # | Deliverable | Where |
|---|---|---|
| 1 | `EXA_AI_API_KEY` passthrough | `docker-compose.yml` (social-search service) |
| 2 | Exa connector + both registrations | `services/social-search/src/connectors/{types,exa,index}.ts`, `registry/register-connectors.ts` |
| 3 | `search.fire` capability | `services/social-search/src/{search-fire.ts,server.ts}` |
| 4 | `organization.detail` + `organization.affiliations` capabilities | `services/record-surrealdb-resolver/src/{resolver,person-resolver,handlers,person-handlers}.ts` |
| 5 | D4 — `searchOrgs` matches aliases + domains | `services/record-surrealdb-resolver/src/resolver.ts` |
| 6 | Workspace verb map + timeouts (3 entries) | `services/workspace/src/capabilities.ts` |
| 7 | Acceptance proof script | `scripts/prove-augment-from-db-capabilities.mjs` |

**Out of scope:** both remotes (Phases 2–3), any `apps/` or `shell/` change, `organization.stream.scan` (Phase 5), persistence of fire results, Exa contents/similarity endpoints.

## Steps (dependency-ordered)

### Step 1 — compose passthrough

`docker-compose.yml`, social-search `environment:` block (after `FIRECRAWL_API_KEY`), matching the existing comment style:

```yaml
      # Exa — neural/keyword web search, a peer connector in the registry
      # (Augment-from-DB search.fire). Sourced from augment-it/.env, where
      # the key already lives under this exact name.
      EXA_AI_API_KEY: ${EXA_AI_API_KEY}
```

### Step 2 — `ProviderId` union

`services/social-search/src/connectors/types.ts`:

```ts
export type ProviderId = 'tavily' | 'searxng' | 'serpapi' | 'gdelt' | 'google-news-rss' | 'exa';
```

### Step 3 — Exa connector (new file)

`services/social-search/src/connectors/exa.ts` — the spec's snippet verbatim (mirrors `tavily.ts`: throw on missing env so the caller localizes to `outcome: 'error'`; POST `https://api.exa.ai/search` with `x-api-key`; map `results[].{url,title,text,publishedDate}` → `ConnectorResult`). See [[../specs/Augment-From-DB-Flow]] §"Exa connector" for the full body — copy it as written, it was authored against `tavily.ts`'s exact shape.

### Step 4 — legacy map (required by exhaustiveness)

`services/social-search/src/connectors/index.ts`:

```ts
import { exaConnector } from './exa';
// in CONNECTORS:
  exa: exaConnector,
```

### Step 5 — registry registration

`services/social-search/src/registry/register-connectors.ts` — add after `GOOGLE_NEWS_RSS_REG`, register in `registerExistingConnectors()`:

```ts
import { exaConnector } from '../connectors/exa';

const EXA_REG: ConnectorRegistration = {
  id: 'exa',
  display_name: 'Exa (neural search)',
  short_label: 'ex',
  capabilities: ['search.web', ...SOCIAL_INTENTS],
  cost_tier: 'paid',
  requires_env: ['EXA_AI_API_KEY'],   // registry flips to 'needs-env' automatically when absent
  status: 'available',
  fire: async (opts: ConnectorFireOpts) =>
    exaConnector(opts.query, {
      include_domains: opts.include_domains,
      max_results: opts.max_results,
      signal: opts.signal,
    }),
};
```

Note the id convention: registry ids are the palette/override ids (`'exa'`, like `'serpapi-google'` vs legacy `'serpapi'`). `search.fire`'s `provider` arg takes **registry** ids.

### Step 6 — `search-fire.ts` (new file) + server subscription

`services/social-search/src/search-fire.ts`:

```ts
// search.fire — the generic query-shaped fire for Augment-from-DB's
// search-and-add surface. Resolves through the registry: explicit provider
// wins, else best available for the intent (free-tier first per resolve()'s
// ordering), else error. One query, one provider, one reply — the operator's
// re-fire loop lives in the UI, not here.
// Spec: context-v/specs/Augment-From-DB-Flow.md §Capability contract.

import { getRegistry } from './registry/registry';
import type { Capability } from './registry/capabilities';
import type { ConnectorResult } from './connectors/types';

export type SearchFireInput = {
  query: string;
  intent?: Capability;
  provider?: string;          // registry id ('exa', 'searxng', 'serpapi-google', …)
  include_domains?: string[];
  max_results?: number;
};

export async function fireSearch(
  input: SearchFireInput,
): Promise<{ provider: string; results: ConnectorResult[] }> {
  const registry = getRegistry();
  const intent = input.intent ?? ('search.web' as Capability);
  const reg = input.provider
    ? registry.byId(input.provider)
    : registry.resolve(intent)[0];
  if (!reg) {
    throw new Error(
      input.provider
        ? `unknown connector: ${input.provider}`
        : `no available connector for intent: ${intent}`,
    );
  }
  if (reg.status !== 'available') {
    throw new Error(`connector ${reg.id} is ${reg.status}`);
  }
  const results = await reg.fire({
    intent,
    query: input.query,
    max_results: input.max_results ?? 10,
    include_domains: input.include_domains,
  });
  return { provider: reg.id, results };
}
```

`services/social-search/src/server.ts` — new subscription block alongside `connector.fire.requested`, **but replying with the spec's contract** (`{ok:false,error}` on failure — unlike connector.fire's error-inside-result shape, because here the UI needs to distinguish "provider failed" from "zero results"):

```ts
  // search.fire.requested — Augment-from-DB generic query fire. See
  // context-v/specs/Augment-From-DB-Flow.md.
  (async () => {
    const sub = nc.subscribe('search.fire.requested');
    for await (const msg of sub) {
      const args = msg.json() as SearchFireInput;
      try {
        const { provider, results } = await fireSearch(args);
        if (msg.reply) {
          msg.respond(JSON.stringify({ ok: true, provider, results, fired_at: new Date().toISOString() }));
        }
        console.log(JSON.stringify({ level: 'info', msg: 'search.fire', provider, results: results.length }));
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error(JSON.stringify({ level: 'error', msg: 'search.fire failed', error }));
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();
```

(Import `fireSearch, type SearchFireInput` from `'./search-fire'` at the top with the other imports.)

### Step 7 — D4: extend `searchOrgs`

`services/record-surrealdb-resolver/src/resolver.ts` (line ~311) — two clauses added to the existing WHERE, nothing else changes (`LIMIT 8`, ordering, return shape all stay):

```sql
           OR string::lowercase(array::join(aliases ?? [], ' '))           CONTAINS $q
           OR string::lowercase(array::join(domains[*].domain ?? [], ' ')) CONTAINS $q
```

`OrgRow.domains` is `{domain?: string}[]` (already typed in this file), so `domains[*].domain` is the right projection. If the installed SurrealDB rejects `[*]` inside `array::join`, fall back to `domains.map(|$d| $d.domain)` or match in two clauses — the acceptance test (alias match) is the arbiter.

### Step 8 — `getOrgDetail` (resolver.ts) + handler

New function at the bottom of `resolver.ts`, following the file's existing shapes (`OrgRow`, `String(id)`, `[]`-defaults):

```ts
export type OrgDetailResult = {
  ok: true;
  org: {
    org_id: string; slug: string;
    complete_name: string | null; conventional_name: string | null;
    aliases: string[]; domains: { domain?: string }[];
    org_links: ShapedLink[];
    media_streams: (ShapedLink & { party?: string })[];
    org_corpus: (ShapedLink & { content_id?: unknown })[];
  };
};

export async function getOrgDetail(
  db: Surreal,
  org_slug: string,
  client: string,
): Promise<OrgDetailResult> {
  const r = await db.query(
    `SELECT id, slug, complete_name, conventional_name, aliases, domains,
            org_links, media_streams, org_corpus
       FROM organizations
       WHERE slug = $slug AND client_access CONTAINS $client
       LIMIT 1;`,
    { slug: org_slug, client },
  );
  const row = ((r?.[0] as (OrgRow & { org_links?: ShapedLink[] })[]) ?? [])[0];
  if (!row) throw new Error(`organization not found: ${org_slug}`);
  return {
    ok: true,
    org: {
      org_id: String(row.id),
      slug: row.slug,
      complete_name: row.complete_name ?? null,
      conventional_name: row.conventional_name ?? null,
      aliases: row.aliases ?? [],
      domains: (row.domains as { domain?: string }[]) ?? [],
      org_links: (row.org_links as ShapedLink[]) ?? [],
      media_streams: (row.media_streams as (ShapedLink & { party?: string })[]) ?? [],
      org_corpus: (row.org_corpus as (ShapedLink & { content_id?: unknown })[]) ?? [],
    },
  };
}
```

Handler in `handlers.ts` — copy any existing block (e.g. `resolver.update_org`), subject `organization.detail.requested`, args `{ org_slug: string; client: string }`, respond with the result or `{ok:false,error}`.

### Step 9 — `listOrgAffiliations` (person-resolver.ts) + handler

Use the **two-query pattern already proven in `getAffiliationDetail`** (person-resolver.ts:728) — resolve the org's live RecordId by slug, then filter edges. NOT the spec's `ONLY … LIMIT 1` subquery form (untested here; the spec itself flagged this fallback as acceptable):

```ts
export type OrgAffiliationsInput = { org_slug: string; client: string };
export type AffiliatedPerson = {
  person_uuid: string;
  name: string | null;
  headline: string | null;
  role: string | null;            // affiliation `kind`
  relevance: string | null;       // passes through as written by the rating loop
  personal_links: ShapedLink[];
  personal_corpus_count: number;
};

export async function listOrgAffiliations(
  db: Surreal,
  input: OrgAffiliationsInput,
): Promise<{ ok: true; people: AffiliatedPerson[] }> {
  const orgRes = await db.query(
    `SELECT id FROM organizations WHERE slug = $slug AND client_access CONTAINS $client LIMIT 1;`,
    { slug: input.org_slug, client: input.client },
  );
  const org = ((orgRes?.[0] as { id: unknown }[]) ?? [])[0];
  if (!org) throw new Error(`organization not found: ${input.org_slug}`);

  const affRes = await db.query(
    `SELECT kind, relevance,
            in.person_uuid AS person_uuid, in.name AS name, in.headline AS headline,
            in.personal_links AS personal_links,
            array::len(in.personal_corpus ?? []) AS personal_corpus_count
       FROM affiliations
       WHERE out = $org;`,
    { org: org.id },
  );
  const rows = (affRes?.[0] as Record<string, unknown>[]) ?? [];
  const people: AffiliatedPerson[] = rows
    .filter((r) => r.person_uuid)     // edge whose person was deleted → skip
    .map((r) => ({
      person_uuid: String(r.person_uuid),
      name: (r.name as string) ?? null,
      headline: (r.headline as string) ?? null,
      role: (r.kind as string) ?? null,
      relevance: (r.relevance as string) ?? null,
      personal_links: (r.personal_links as ShapedLink[]) ?? [],
      personal_corpus_count: Number(r.personal_corpus_count ?? 0),
    }))
    // relevance is a string ("90", "75", …) — numeric sort in JS, nulls last
    .sort((a, b) => (Number(b.relevance ?? -1)) - (Number(a.relevance ?? -1)));
  return { ok: true, people };
}
```

Handler in `person-handlers.ts` — copy the `affiliation.detail` block, subject `organization.affiliations.requested`.

> If the nested `in.person_uuid` projection returns objects instead of flat
> values on the installed SurrealDB version, fall back to `FETCH in` and read
> `r.in.person_uuid` — same two-query discipline, same contract.

### Step 10 — workspace verb map

`services/workspace/src/capabilities.ts`:

```ts
// CAPABILITY_TO_SUBJECT — with the other resolver/person entries:
'organization.detail':       'organization.detail.requested',
'organization.affiliations': 'organization.affiliations.requested',
// with the pack/search entries:
'search.fire':               'search.fire.requested',

// TIMEOUTS:
'organization.detail': 30_000,
'organization.affiliations': 30_000,
'search.fire': 30_000,
```

### Step 11 — acceptance proof script

`scripts/prove-augment-from-db-capabilities.mjs` — same conventions as `prove-didi-auth.mjs` (createRequire against a service's package.json for deps; fail-fast helpers; env-overridable targets). Talks **directly to NATS** (the workspace hop is Phase 2's concern):

```js
#!/usr/bin/env node
// prove-augment-from-db-capabilities.mjs — Phase 1 acceptance proof.
// Prereqs: docker compose up -d nats searxng social-search record-surrealdb-resolver
// Usage:   node scripts/prove-augment-from-db-capabilities.mjs <org_slug> <client> [alias_fragment]

import { createRequire } from 'node:module';
const require = createRequire(new URL('../services/social-search/package.json', import.meta.url));
const { connect } = require('@nats-io/transport-node');

const NATS_URL = process.env.NATS_URL ?? 'nats://localhost:4222';
const [ORG_SLUG, CLIENT, ALIAS_Q] = process.argv.slice(2);
if (!ORG_SLUG || !CLIENT) { console.error('usage: … <org_slug> <client> [alias_fragment]'); process.exit(1); }

const nc = await connect({ servers: NATS_URL });
const req = async (subject, body, timeout = 30_000) =>
  JSON.parse(new TextDecoder().decode((await nc.request(subject, JSON.stringify(body), { timeout })).data));
let failed = 0;
const check = (label, ok, extra = '') => { console.log(`${ok ? '✅' : '❌'} ${label} ${extra}`); if (!ok) failed++; };

// (a) org detail — all three lists present
const det = await req('organization.detail.requested', { org_slug: ORG_SLUG, client: CLIENT });
check('organization.detail', det.ok && det.org?.slug === ORG_SLUG,
  det.ok ? `links=${det.org.org_links.length} streams=${det.org.media_streams.length} corpus=${det.org.org_corpus.length}` : det.error);

// (b) affiliations — ≥1 person for an org known to have edges
const aff = await req('organization.affiliations.requested', { org_slug: ORG_SLUG, client: CLIENT });
check('organization.affiliations', aff.ok && Array.isArray(aff.people) && aff.people.length >= 1,
  aff.ok ? `people=${aff.people.length} first=${aff.people[0]?.name ?? '?'} role=${aff.people[0]?.role ?? '-'}` : aff.error);

// (c) search.fire — SearXNG default (no provider arg)
const sx = await req('search.fire.requested', { query: 'anthropic claude' });
check('search.fire default→searxng', sx.ok && sx.provider === 'searxng' && sx.results.length > 0, sx.ok ? `n=${sx.results.length}` : sx.error);

// (d) search.fire — explicit Exa
const ex = await req('search.fire.requested', { query: 'anthropic claude', provider: 'exa' });
check('search.fire provider=exa', ex.ok && ex.provider === 'exa' && ex.results.length > 0, ex.ok ? `n=${ex.results.length}` : ex.error);

// (e) unknown provider → localized ok:false (service stays up)
const bad = await req('search.fire.requested', { query: 'x', provider: 'nope' });
check('search.fire unknown provider → ok:false', bad.ok === false && /unknown connector/.test(bad.error ?? ''));

// (f) D4 — alias/domain match through resolver.search
if (ALIAS_Q) {
  const s = await req('resolver.search.requested', { q: ALIAS_Q, client: CLIENT });
  check(`resolver.search alias "${ALIAS_Q}"`, s.ok && s.candidates.length >= 1,
    s.ok ? s.candidates.map((c) => c.slug).join(',') : s.error);
}

await nc.drain();
process.exit(failed ? 1 : 0);
```

The Exa needs-env behaviour (spec criterion (c)-negative) is proven by restarting social-search once with `EXA_AI_API_KEY` unset and re-running check (d) — expect `ok:false` with `connector exa is needs-env`. One manual toggle, noted in the run log, not automated.

### Step 12 — close out

- Changelog entry per [[changelog-conventions]] (`2026-07-2X_NN_Augment-From-DB-Phase-1-Capabilities…`).
- Flip [[../specs/Augment-From-DB-Flow]] `status: Signed-Off → Implementing` (+ `date_modified`, patch bump) when this plan starts executing; this plan → `Shipped` when the proof script exits 0.
- Do **not** bump parent pseudomonorepo gitlinks (standing rule — parents are tidied deliberately).

## Success criteria (from the spec, made concrete)

1. `node scripts/prove-augment-from-db-capabilities.mjs <org_slug> <client> <alias>` exits 0 with all checks green, against an org known to have affiliation edges (a FreedomFest org from the 2026-07-07 verification pass is the known-good pick).
2. The needs-env toggle shows `search.fire {provider:'exa'}` failing localized (`ok:false`), with SearXNG default checks still green — no service crash.
3. `connectors.inventory` (existing verb) now lists `exa` with `cost_tier: 'paid'` and correct status — spot-check via one extra `nc.request` if desired.
4. Regression: `pack.search` with `provider_override: 'searxng'` still works (untouched path); `pnpm -r typecheck` (or the per-service `tsc`) is clean — the `ProviderId` extension compiles only when Step 4's map entry exists.

## Gotchas carried from the codebase

- `record-surrealdb-resolver` refuses to boot without all five `SURREAL_*` env vars — the proof script's failures will be connection-shaped, not query-shaped, if compose env is off.
- NATS max_payload is 8MB (`nats.conf`) — no risk here, but keep `max_results` defaults modest anyway.
- SurrealQL `??` inside projections and `[*]` projections are version-sensitive; both uses above have named fallbacks (Steps 7 and 9). The proof script is the arbiter — don't debate syntax in review, run it.
- Registry ids ≠ legacy `ProviderId` for SerpApi (`'serpapi-google'` vs `'serpapi'`); Exa deliberately uses `'exa'` in both.

## Related

- [[../specs/Augment-From-DB-Flow]] — the signed-off spec (Phase 1 of 5)
- [[../explorations/Augment-From-DB-Flow-Two-New-Microfrontends]] — exploration of record
- [[../issues/Search-Providers-as-First-Class-SearXNG-Default]] — the resolved provider-plurality issue this extends
- [[Connector-Inventory-and-Per-Record-Palette]] — the registry's spec (Partially-Shipped)
- [[../blueprints/Connecting-To-And-Using-SurrealDB]] — env + handshake contract
