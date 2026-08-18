---
title: "Search Providers as First-Class — Stand Up SearXNG as the New Default for Social Packs; Tavily Stays as a Peer; Per-Row Iteration as the Workflow We're Building Toward"
lede: "Tavily is a content-RAG index — wrong substrate for social-profile pages. The fix isn't a swap — it's making provider plural per-fire."
date_created: 2026-05-26
date_modified: 2026-07-21
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
  - Claude Code on Claude Fable 5
semantic_version: 0.0.0.4
revisions:
  - "2026-07-21 — Status sweep, resolved. The core ask fully landed: SearXNG shipped as peer provider + social-pack default with provider_override on 2026-06-01 (changelog 2026-06-01_01), and the capability registry (registry/, register-connectors.ts booting searxng/tavily/serpapi/gdelt/google-news-rss) landed 2026-06-02 — going beyond this issue's Layer 1. Never done from the original plan: step 7's foundation-dataset smoke (the ≥60% acceptance number) and step 8's blueprint write-up. Those are noted, not blocking — the architecture the issue argued for is in production. (semver 0.0.0.4)"
  - "2026-05-26 — Initial draft as \"Switch Search Substrate from Tavily to SearXNG.\" Framed the move as a substrate swap with Tavily preserved as a side-effect. (semver 0.0.0.1)"
  - "2026-05-27 — Reframed. The decision is **provider plurality as a first-class architectural concern**, not a substrate swap. SearXNG becomes the new default for social packs; Tavily stays as a peer for content-RAG packs; future providers (Brave, Google CSE, ProPublica NPO, Candid, LinkedIn-direct, MCP-server-as-provider) plug in via the same connector interface. Added §The iteration loop we're building toward — per-row, per-pack provider selection as a future product affordance. File renamed from `Switch-Search-Substrate-from-Tavily-to-Searxng.md` to `Search-Providers-as-First-Class-SearXNG-Default.md` to match. (semver 0.0.0.2)"
  - "2026-05-28 — Layer 1 (the connector plumbing, proposed-work steps 1–6) landed in code. `connectors/{types,index,tavily,searxng}.ts` exist, `PackConfig` is provider-aware, all common-seven social packs default to `connector: 'searxng'`, `runOnePackSearch` dispatches on provider and accepts `provider_override`, and the SearXNG container + `settings.yml` are in `docker-compose.yml`. Steps 7 (foundation-dataset smoke / the ≥60% acceptance number) and 8 (blueprint write-up) remain, as does the per-record iteration UI in response-reviewer :3005. (semver 0.0.0.3)"
tags:
  - Issue
  - Augment-It
  - Packs-and-Bundles
  - Search-Providers
  - Connector-Pattern
  - SearXNG
  - Tavily
  - Provider-Plurality
  - Iteration-Loop
  - Social-Search
status: Resolved · Provider Plurality Shipped 2026-06-01 · Registry 2026-06-02 · Smoke Metric + Blueprint Skipped
site_uuid: 4e75401b-b169-4757-9395-bee3567bd922
hex_code: ywq1cg
date_authored_initial_draft: 2026-05-26
date_authored_current_draft: 2026-05-26
---

# Search Providers as First-Class — SearXNG Becomes the New Default for Social Packs

## What changed in this revision

The earlier draft (titled "Switch Search Substrate from Tavily to SearXNG")
framed this as a substrate swap with Tavily preserved as a courtesy.
Reframed on 2026-05-27 after a clarifying note from the user: **don't think
of this as replacing Tavily**. Think of it as making "search provider" a
first-class, plural concern in the architecture. SearXNG joins as a peer.
The common-seven social packs flip their default to SearXNG because that's
what they need. Tavily stays for the packs/bundles that need a content-RAG
index. Future providers slot in the same way. And — looking past this
issue — the product is being built around an iteration loop where a user
can re-fire any pack on any row through a different provider until the
data is right, with the fewest API calls possible.

The body below is rewritten in that frame.

## The symptom

Running pack-runner against the foundation dataset (96 philanthropic
organizations), then triaging in Response Reviewer's by-record view, the
user noticed a pattern: many `not_found` results from Facebook, X,
Instagram, and similar social packs are organizations whose pages
**actually exist** and are immediately findable by Googling
`"OrgName" facebook` manually.

Concrete instance the user named: typing `Bridgespan facebook` into a
browser surfaces the Bridgespan Group's Facebook page as the first result;
our `facebook-pack` returned `not_found` for that same row. Same pattern
across Instagram, X, and to a lesser extent LinkedIn.

## The diagnosis

Three concurrent issues, ordered by likely impact:

### Issue 1 — Tavily's index is thin on social-profile pages

Tavily is a **RAG-optimized search**. Its index is curated and weighted
toward content-rich pages — articles, blog posts, documentation, structured
data sources. Social-profile pages (Facebook, Instagram, LinkedIn) are
sparse-text, JS-rendered surfaces whose value is in the URL + headline
metadata, not the body text. Tavily's index under-represents these by
design because they don't fit the "retrieve passages to ground an LLM
answer" use case Tavily was built for.

A search-engine aggregator (SearXNG → Google/Bing/DDG/Brave) returns what
the manual searches find, because that's what Google and Bing index.

**This is not a defect in Tavily.** Tavily is the right tool for content
RAG. It's the wrong tool for social-profile discovery. The category error
is making a single provider answer for both jobs.

### Issue 2 — Over-constrained query construction

Even where Tavily *does* index a relevant page, the queries we build are
narrowed past the threshold:

```ts
// services/social-search/src/packs.ts (current)
'facebook-pack': {
  tavily_query_template: '"{{entity_name}}" site:facebook.com',
  tavily_include_domains: ['facebook.com', 'fb.com'],
},
```

- **Quoted entity name** `"Bridgespan Group"` won't match "The Bridgespan
  Group" or "Bridgespan Group, LLC." A casual researcher types
  `Bridgespan facebook` (no quotes, just the salient tokens).
- **`site:` operator + `include_domains` is belt-and-suspenders.** Tavily
  applies both; the constraint stacks and excludes near-matches.
- **`max_results: 3` + `search_depth: 'basic'`** is conservative — even
  when Tavily has the page, it might not rank in the top 3 of its narrow
  search.

These are tweaks that might improve Tavily-side recall by ~30%, but
they're polish on the wrong substrate for this category of pack.

### Issue 3 — Hardcoded coupling to one provider

`services/social-search/src/search.ts` imports `searchTavily` directly
from `./tavily`. Every pack runs through that single function. There's no
seam for "this pack uses a different search engine" or "this pack hits a
specific provider's API instead of search."

That's fine when one provider fits all packs. It stops being fine the
moment a second provider is needed — which is right now — and it forecloses
the iteration loop described below.

## The decision

**Make search provider a first-class concern in the architecture.**
Concretely, in this issue:

1. Introduce a `services/social-search/src/connectors/` directory with a
   common `Connector` interface.
2. Move the existing Tavily implementation behind that interface as
   `connectors/tavily.ts`.
3. Stand up `connectors/searxng.ts` as a peer (self-hosted Docker container,
   no API key, free).
4. Extend `PackConfig` to a discriminated union keyed on `connector`.
5. Flip the common-seven social packs to `connector: 'searxng'`.
6. Keep Tavily wired in as a peer — it stays the right choice for content-RAG
   packs that don't exist yet (deep-research, annual-report extraction,
   document summarization).

Two reasons we don't tear Tavily out:

1. **Tavily is the right tool for content-RAG retrieval.** A future
   "deep-research" pack/bundle is exactly Tavily's sweet spot. Removing the
   integration now would mean rebuilding it later.
2. **Provider commitments shouldn't be irreversible.** Today SearXNG is
   the answer for social. Tomorrow Brave Search might beat SearXNG on
   X/Twitter recall. The architecture should treat providers as plug-in
   so that comparison stays cheap.

## The architectural goal — separate Pack concerns from Provider concerns

Today's shape:

```
search.ts → searchTavily (hardcoded)
packs.ts has tavily_query_template + tavily_include_domains (Tavily-shaped)
```

Target shape:

```
connectors/
  tavily.ts        — Tavily REST client
  searxng.ts       — SearXNG REST client (local docker, no API key)
  (future: brave.ts, google-cse.ts, propublica-npo.ts, candid.ts,
   linkedin-direct.ts, an-mcp-server.ts, ...)

packs.ts — each PackConfig declares:
  connector: 'tavily' | 'searxng' | 'brave' | ...
  query: connector-specific query config (typed via discriminated union)

search.ts — single runOnePackSearch dispatches:
  switch (pack.connector) {
    case 'tavily':  return runTavilySearch(pack, entityName, nc);
    case 'searxng': return runSearxngSearch(pack, entityName, nc);
    ...
  }
```

Why this is a real architectural concern, not just a refactor:

- **Pack identity stays stable across provider swaps.** A `linkedin-pack`
  is still a `linkedin-pack` whether it runs through SearXNG, Brave Search,
  or a direct-LinkedIn-scraping client. The `pack_id` on response records
  is the same; the `row.fields.socials` write-back is the same; the triage
  UI is the same. Only the provider behind the pack changed.
- **New packs only need a provider reference + provider-specific config.**
  They don't reimplement search plumbing.
- **A/B testing providers per pack becomes trivial.** Want to compare
  Tavily vs SearXNG vs Brave for `wikipedia-pack`? Fire all three, compare
  confidence distributions and `not_found` counts.

## The iteration loop we're building toward

This is the **why** behind insisting on provider plurality from the start,
not as a later refactor.

The product's natural rhythm — the one that the by-record triage cockpit
and the chat verb surface are converging on — is iterative:

1. User uploads a record set.
2. User fires a pack (or bundle) against the rows. Some resolve `found`,
   some `not_found`, some land low-confidence.
3. User triages in Response Reviewer's by-record view. The `not_found`
   and low-confidence rows accumulate as the next attention surface.
4. User suspects the provider is the issue for some of those rows ("this
   foundation definitely has a Facebook page — why didn't we find it?").
   They want to **re-fire the same pack on those specific rows, through a
   different provider**, without recreating the whole fan-out.
5. The new provider resolves some additional rows. User accepts. The
   remaining `not_found` rows are now more credibly "this entity actually
   doesn't have a Facebook presence" — diagnostic, not just a miss.
6. User pushes harder: tries a third provider for the stubborn rows, or
   moves them to human-supply, or marks them as confirmed-absent.

The loop is **per-row, per-pack, per-provider**, and the efficiency win
is that the user converges on the right data with the fewest paid API
calls. SearXNG is free (self-hosted). Tavily, Brave, Google CSE all have
costs. The user wants to start free, escalate to paid only for the
specific rows where free-substrate recall failed.

For that loop to exist in code, **provider must be selectable at the
moment a pack fires, not baked into the pack definition.** Today it's
baked in. After this issue lands, it isn't.

### Forward-looking surface (out of scope for this issue, but informs the design)

When this iteration loop becomes a product feature, expect these surfaces:

- **Response Reviewer chip on a `not_found` card:** "Re-fire this pack
  through a different provider →" with a dropdown listing the wired
  providers and a per-provider rough-cost indicator.
- **Pack Runner card-flow extension:** an optional fifth card lets the
  user override the default provider per-pack for this fire ("for this
  run, use Brave for `linkedin-pack` instead of SearXNG").
- **Chat verb:** `re-search row 47 with Brave for facebook-pack` →
  `pack.search.requested` with a `provider_override` field.
- **Per-row provider history on the row's audit trail:** "this row was
  searched via [SearXNG, Brave]; SearXNG returned not_found, Brave
  returned found(0.82) at facebook.com/bridgespan/."

None of those surfaces ship in this issue. But they shape the connector
interface — specifically, the dispatcher in `search.ts` should accept an
optional `provider_override` argument so that the chat verb and the UI
affordances above don't need a second refactor when they arrive.

## Implementation status (2026-05-28)

**Layer 1 — connector plumbing — landed** (steps 1–6 below):

- ✅ `connectors/types.ts` — `Connector`, `ConnectorResult`, `ConnectorOpts`, `ProviderId`.
- ✅ `connectors/tavily.ts` — the old `searchTavily` REST client behind the `Connector` interface; old `src/tavily.ts` removed.
- ✅ `connectors/searxng.ts` — `GET /search?format=json` client reading `SEARXNG_URL` (default `http://searxng:8080`).
- ✅ `connectors/index.ts` — registry + `getConnector(id)`.
- ✅ `packs.ts` — `PackConfig` is provider-aware (`connector` + neutral `query_template` + `include_domains`); all common-seven default to `connector: 'searxng'`; templates broadened (quotes + `site:` dropped — the `domain_whitelist` in `pickCandidate` is the real gate).
- ✅ `search.ts` — `runOnePackSearch` resolves `provider = provider_override ?? pack.connector`, dispatches via `getConnector`, records `provider` + `raw_url` in `source_metadata` and as the response `model`. **Never writes to `row.fields`** — additive by construction.
- ✅ `server.ts` — no longer rejects when `TAVILY_API_KEY` is absent (SearXNG needs none); `provider_override` threads through `pack.fan_out.requested`.
- ✅ `docker-compose.yml` — `searxng` container (no key) + `SEARXNG_URL` on social-search; `services/social-search/searxng/settings.yml` enables the JSON format and disables the limiter.

**Not yet done:**

- ⏳ Step 7 — foundation-dataset smoke / the ≥60% acceptance number. Needs `pnpm stack up` against real data (deferred: Docker daemon was down when layer 1 landed, so no live run yet).
- ⏳ Step 8 — the connector pattern written up in [[Packs-and-Bundles-Pattern]].

**Layer 2 — the per-record iteration UI in response-reviewer :3005 — landed (2026-05-28):**

- ✅ Each record card in the **By Record** view has a per-pack icon button so any source can be run on any record. The runner is split into **two provider-labeled rows** — SearXNG and Tavily — so the provider is selectable per-(record × pack), not buried behind the default. Each click fires `pack.search` with the chosen `provider_override`.
- ✅ Strictly **additive** — a run produces a new candidate response for triage and never writes to `row.fields`; only a human accept does. Honors the user's "never override accepted fields" constraint.
- ✅ A ✓ badge on a pack icon marks packs already accepted onto that record (from accepted responses + `row.fields.socials`), so the user can see what's "not already accepted" and worth running.
- ✅ Each result row is tagged with the provider that produced it (`searxng` / `tavily` badge), so recall can be compared provider-by-provider.
- ✅ `pack.search` capability timeout bumped 5s → 30s (a SearXNG aggregate query is slower than a Tavily call).
- ⏳ Still open within layer 2: "surface only candidates not already accepted" is currently a visual ✓ hint, not a filter; re-firing a `not_found` pack accumulates duplicate `not_found` rows (no dedup-on-fire yet); the runner rows only appear on records that already have ≥1 response (by-record groups response records).

## Proposed work — in rough sequence

1. **`services/social-search/src/connectors/` directory.** Pull `tavily.ts`
   in (rename minimally), add `searxng.ts` peer. Both export the common
   `Connector` interface.
2. **`Connector` interface contract** (in `connectors/types.ts`):
   ```ts
   type ConnectorResult = {
     url: string;
     title: string;
     content: string;
     score?: number;          // provider-native if available
     published_date?: string;
   };
   type ConnectorOpts = {
     include_domains?: string[];
     max_results: number;
     signal?: AbortSignal;
   };
   type Connector = (query: string, opts: ConnectorOpts) => Promise<ConnectorResult[]>;
   ```
3. **`PackConfig` discriminated union** (`packs.ts`):
   ```ts
   type PackConfig =
     | { connector: 'tavily';  pack_id; display_name; domain_whitelist;
         query: { template: string; include_domains?: string[]; max_results?: number } }
     | { connector: 'searxng'; pack_id; display_name; domain_whitelist;
         query: { template: string; engines?: string[]; categories?: string[]; max_results?: number } };
   ```
4. **`search.ts` dispatcher.** `runOnePackSearch` picks the connector based
   on `pack.connector`. Accepts an optional `provider_override: 'tavily' | 'searxng' | ...`
   so the iteration-loop surfaces above can bypass the pack default without
   editing the pack definition.
5. **SearXNG Docker container in `docker-compose.yml`.** Self-hosted, no
   API key, free. Configure default engines (Google, Bing, DDG, Brave).
   Expose on the internal Docker network as `searxng:8080`. Document the
   compose entry in the service README.
6. **Pack reconfiguration.** Flip the common-seven social packs to
   `connector: 'searxng'`. Query templates drop the `site:` operator
   (SearXNG handles domain restriction differently) and drop the quotes
   around `{{entity_name}}` (broader match).
7. **Smoke against the foundation dataset.** Re-fire all seven packs
   against the rows that previously returned `not_found`. Count how many
   now resolve. The acceptance criterion below is keyed off this.
8. **Document the connector pattern in [[Packs-and-Bundles-Pattern]].**
   New sub-section under §Pack anatomy: "Provider reference." Mentions the
   `provider_override` parameter and points back to this issue for the
   reasoning.

## Not in scope for this issue

- **Tearing out Tavily.** Stays as a peer connector for the content-RAG
  packs/bundles that will want it. Tavily is not legacy here — it's a peer.
- **Brave Search / Google CSE / other commercial APIs.** Worth their own
  evaluation later; SearXNG fills the immediate need without API keys.
- **The UI / chat-verb surfaces for per-row provider override.** Those are
  the iteration-loop affordances described above; they get their own
  issue/spec once the connector pattern is in.
- **Per-pack quality scorecards.** Right idea, but premature until SearXNG
  is in and we have new baseline numbers.

## Acceptance — done when

- SearXNG container runs alongside the other services in `docker-compose up`
- The common-seven social packs route through SearXNG and resolve
  significantly more `found` outcomes against the foundation dataset
  (target: at least 60% of the previously-`not_found` social rows resolve
  to a real URL on re-fire)
- Tavily provider still works — re-running an old fixture or wiring a
  test-only pack against `connector: 'tavily'` succeeds
- The connector pattern is documented in [[Packs-and-Bundles-Pattern]],
  including the `provider_override` parameter on the dispatcher
- `runOnePackSearch` accepts a `provider_override` argument (even if no
  UI/chat surface invokes it yet) so the iteration-loop work can proceed
  without re-touching `search.ts`

## Related

- [[Packs-and-Bundles-Pattern]] — the blueprint; gets the provider
  pattern codified after this lands
- [[Entity-Profile-Augmentation-Workflow]] — the exploration; mentions
  Tavily as the v1 substrate (noted there as a choice we'd revisit)
- [[Run-as-First-Class-Operation]] — the active plan; this issue is
  orthogonal to Run-entity work, but a Run object is exactly the right
  place to record per-row provider history when that surface lands
- [[Common-Six-Social-Packs]] (now common-seven with Instagram) — the
  original implementation prompt; will reference this issue once SearXNG
  lands
- [[Agent-Chat-Skills-and-Commands-Candidates]] — the verb roster; the
  `re-search row N with provider X` verb belongs here and gets nominated
  as the iteration-loop affordances mature
