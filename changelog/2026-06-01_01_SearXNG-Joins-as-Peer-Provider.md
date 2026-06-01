---
title: "SearXNG joins as a peer provider — social packs default to the free metasearch container; Tavily stays for content-RAG; provider_override seam wired through the stack"
lede: "The reframe that took shape in late May lands as code: search-provider choice is now an architectural axis of the stack, not a Tavily-vs-anything-else swap. SearXNG arrives as a self-hosted container peer to Tavily, with its own connector under a new connector registry; the common-seven social packs flip their default to SearXNG (no key needed); Tavily stays wired in as the peer for content-RAG packs that need it; and a `provider_override` parameter threads from the response-reviewer's per-record buttons through workspace and social-search so the user can fire any pack through either provider on any row without touching the pack definition. The pre-flight surface for per-row iteration is now in place — the iteration loop itself still pending."
publish: true
date_created: 2026-06-01
date_modified: 2026-06-01
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
tags:
  - Augment-It
  - Social-Search
  - SearXNG
  - Tavily
  - Provider-Plurality
  - Connector-Registry
  - Response-Reviewer
  - Per-Row-Iteration
  - Architectural-Seam
files_changed:
  - services/social-search/src/connectors/index.ts
  - services/social-search/src/connectors/types.ts
  - services/social-search/src/connectors/searxng.ts
  - services/social-search/src/connectors/tavily.ts
  - services/social-search/src/tavily.ts
  - services/social-search/src/packs.ts
  - services/social-search/src/search.ts
  - services/social-search/src/server.ts
  - services/social-search/src/scoring.ts
  - services/social-search/searxng/settings.yml
  - services/social-search/searxng/uwsgi.ini
  - services/workspace/src/capabilities.ts
  - apps/response-reviewer/src/App.svelte
  - apps/response-reviewer/src/app.css
  - docker-compose.yml
  - scripts/dev.sh
  - .env.example
  - README.md
  - context-v/issues/Search-Providers-as-First-Class-SearXNG-Default.md
---

## Why care?

A week ago the social-search service had exactly one provider — Tavily — and the decision in front of the team was framed as "should we swap to SearXNG?" The reframe captured in the issue doc on 2026-05-27 rejected that framing: **the architectural concern is provider plurality, not a swap.** Different pack workloads have different shapes (social profile pages need metasearch breadth across Google/Bing/DDG/Brave; content-RAG packs need an index over actually-readable documents), and the right move is to wire the dispatcher so any pack can be fired through any compatible provider on any row.

This commit makes that reframe real on disk. The connector layer is now a registry, SearXNG sits alongside Tavily as a peer, the social packs flip to SearXNG by default (no key needed, the JSON API runs against the self-hosted container at `http://searxng:8080`), Tavily stays in place for the content-RAG packs that need its index, and the `provider_override` parameter threads from the by-record triage buttons through the workspace dispatcher into `runOnePackSearch` so a researcher can re-fire LinkedIn against a row through Tavily — or fire Wikipedia through SearXNG and Tavily side-by-side and compare recall. That last bit is the seam the per-row iteration loop will ride on; the loop itself isn't yet here, but the surface it needs is.

The dev story improves at the same time: `pnpm stack up` brings up a tenth container (`searxng/searxng:latest` mounted with our `settings.yml` for the JSON API + limiter-off), the `TAVILY_API_KEY` becomes optional rather than required (the stack runs fine without it; only Tavily-routed packs will error), and `SEARXNG_SECRET` joins `.env.example` with a working dev default baked into compose so a fresh clone is one command away from working SearXNG queries.

## What's new

### Connector registry — `services/social-search/src/connectors/`

The single-file `tavily.ts` at the service root is gone; in its place a connectors directory with four files:

- `types.ts` — `ProviderId = 'searxng' | 'tavily'`, the `Connector` interface (query → `ConnectorResult[]`), `ConnectorOpts` (signal, max_results, include_domains).
- `tavily.ts` — Tavily implementation, unchanged behavior, just moved here.
- `searxng.ts` — new. Hits `${SEARXNG_URL}/search?q=…&format=json`, maps SearXNG's `results[]` into the shared `ConnectorResult` shape (url, title, content, score, published_date). Domain restriction is left to the pack's downstream `domain_whitelist` (SearXNG doesn't support `include_domains` server-side the way Tavily does).
- `index.ts` — the registry. `getConnector(id)` resolves a `ProviderId` to the right function; the dispatcher in `search.ts` reads from here so adding a third provider is one file + one registry line.

### Packs default to `searxng`; dispatcher honors `provider_override`

`services/social-search/src/packs.ts` — all seven social packs (linkedin, x, bluesky, youtube, facebook, wikipedia, instagram) now declare `connector: 'searxng'`. The pack's default was the only thing that needed to flip; the pack's verification + scoring + extraction layers are provider-agnostic.

`services/social-search/src/search.ts` — `runOnePackSearch` resolves provider as `args.provider_override ?? pack.connector`. The `provider` is recorded on every published response (as `model` for legacy compatibility) so the by-record UI can render the badge accurately. Network errors and missing keys are caught and surfaced as `outcome: 'error'` rather than crashing the cell.

`services/social-search/src/server.ts` — both NATS subjects (`pack.search.requested` for one cell, `pack.fan_out.requested` for the M × N grid) accept an optional `provider_override` on the inbound payload and pass it through to `runOnePackSearch`. The fan-out logs include the override so the trace makes the choice visible.

### SearXNG container + settings

`docker-compose.yml` — a new `searxng` service running `searxng/searxng:latest`, depended on by `social-search`, with `services/social-search/searxng/` mounted at `/etc/searxng:rw`. The dev port `8080:8080` is exposed for direct JSON-API debugging. `SEARXNG_SECRET` comes from the environment with a baked-in dev default.

`services/social-search/searxng/settings.yml` + `uwsgi.ini` — the SearXNG instance config. JSON API enabled in `search.formats` (the upstream image doesn't enable it by default); limiter disabled (also default-on upstream) so programmatic access works; a non-default secret and a permissive UA-allow rule for the service hostname.

`services/workspace/src/capabilities.ts` — already-wired `pack.search` + `pack.fan_out` capability mappings now carry the new optional `provider_override` field through without any signature change.

### Per-record per-pack-per-provider triage in Response Reviewer

`apps/response-reviewer/src/App.svelte` + `app.css` — the by-record view gains a per-record source-runners block: two rows (one per provider) of pack-icon buttons. Click LinkedIn in the SearXNG row to fire that pack on that record through SearXNG; click it in the Tavily row to fire the same pack on the same record through Tavily. Each in-flight button gets its own spinner keyed `${row_id}::${pack_id}::${provider}` so the user can fire multiple provider/pack combinations in parallel without ambiguity. The result lands as a new candidate row beneath, with the provider stamped on the badge.

The two arrays that make this real:
- `PACKS_META` — pack_id + label + glyph + accent, mirroring the pack roster in social-search/packs.ts. The glyph + color live in the UI because federation round-trips for icon metadata aren't worth the latency.
- `PROVIDERS` — the two wired providers, each with a label and a hint that explains the trade-off ("free metasearch" vs "content-RAG, needs key").

### Dev experience

`scripts/dev.sh` — the `backend_up` echo now mentions the SearXNG dev URL so the operator knows the JSON API is reachable at `http://localhost:8080`.

`.env.example` — `TAVILY_API_KEY` becomes optional with a comment explaining when it's needed (only Tavily-routed packs); `SEARXNG_SECRET` joins with a default-baked dev value.

`context-v/issues/Search-Providers-as-First-Class-SearXNG-Default.md` — the issue doc gets the small follow-ups from this landing (status touches, the per-row iteration loop framing for the row-by-row workflow this seam unlocks).

## What's not in this commit

- **The per-row iteration loop** — the natural surface the `provider_override` seam was built for ("re-fire LinkedIn on row Y through Tavily because SearXNG returned `not_found`") is not yet wired as a workflow UI. The seam exists; the loop is a follow-up.
- **Content-RAG packs** — Tavily is wired in as a peer connector, but the content-RAG packs that would naturally use it (SEC filings, Crunchbase, etc.) haven't been written yet. Tavily currently has no default consumers.
- **A third connector** — adding one would be one file in `connectors/` + one line in `index.ts`. Not in scope here.

## Related

- [[../context-v/issues/Search-Providers-as-First-Class-SearXNG-Default]] — the issue doc that reframed the decision and sequenced this work
- [[../context-v/blueprints/Packs-and-Bundles-Pattern]] — the pattern blueprint the provider plurality slots into
- [[../context-v/plans/Run-as-First-Class-Operation]] — the broader plan; this commit doesn't ship Part 4 but the `provider` on every response is the data the Run entity will roll up
- [[2026-05-26_02_Packs-and-Bundles-End-to-End]] — the two-day arc that produced the Tavily-only v1 this commit extends
