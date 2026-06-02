---
title: "Entity Pulse step 1 — official-blog-pack standalone + iso-helper for date normalization across packs"
lede: "First implementation step of the Entity-Pulse-Bundle spec lands as a working two-stage pack (find-index → extract) plus a generic ISO-8601 normalizer that solves date extraction across heterogeneous web sources. Smoke-tested against reach.edu: 5 real blog posts pulled end-to-end with ISO publish dates + computed age_days in 4.4s. SerpApi + Firecrawl wired as new connectors; new NATS subject `pack.entity_pulse.requested`; standalone CLI driver for one-off fires and future Agent Chat integration."
publish: true
date_created: 2026-06-02
date_modified: 2026-06-02
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
tags:
  - Augment-It
  - Entity-Pulse
  - Official-Blog-Pack
  - ISO-Helper
  - SerpApi
  - Firecrawl
  - Two-Stage-Extract
files_changed:
  - services/social-search/src/entity-pulse/types.ts
  - services/social-search/src/entity-pulse/packs/official-blog-pack.ts
  - services/social-search/src/entity-pulse/bundles.ts
  - services/social-search/src/lib/helpers/iso-helper.ts
  - services/social-search/src/connectors/serpapi.ts
  - services/social-search/src/connectors/firecrawl.ts
  - services/social-search/src/connectors/index.ts
  - services/social-search/src/connectors/types.ts
  - services/social-search/src/server.ts
  - services/social-search/scripts/fire-official-blog.ts
  - .env.example
---

## What landed

**Step 1 of the [[../context-v/specs/Entity-Pulse-Bundle]] migration plan** — `official-blog-pack` standalone, single-pack mini-bundle `entity-blog`, no rollup, no curation, no LLM scoring. The job: prove the find-index → extract two-stage pattern end-to-end on a real domain.

- **Find-index** — SerpApi (`engine: 'google'` with `site:` restrict) when keyed, with path-guess fallback (`/feed`, `/rss`, `/atom.xml`, `/blog`, `/news`, `/press`, `/updates`, ...). Reach.edu had no SerpApi key set; path-guess hit `/feed` and the rest of the pipeline ran from there.
- **Extract** — Firecrawl scrape on each index page (`formats: ['markdown', 'links', 'rawHtml']`), heuristically pick post-shaped outbound links, scrape each post for title + body + structured metadata.
- **NATS subject** — `pack.entity_pulse.requested` on `services/social-search`. Reply carries the full `EntityPulseListResponse<OfficialUpdateItem>` JSON. No response-store write yet — that lands with the Pulse Curation Layer (spec step 4).
- **CLI driver** — `services/social-search/scripts/fire-official-blog.ts`. Imports the pack handler directly (no NATS). The path Agent Chat will eventually wrap when it can call packs as tools.

## The iso-helper pattern

`services/social-search/src/lib/helpers/iso-helper.ts` is the architectural piece worth highlighting. The web returns dates in every form imaginable; the rest of the system should only ever see ISO-8601. One generic normalizer (`toIso()`) accepts `Date`, number (epoch s or ms), or string in any common form (ISO-8601, RFC 2822 / RSS `pubDate`, "Month DD, YYYY", "YYYY-MM-DD", "DD Month YYYY"). Never throws — bad input returns null so callers can stack fallbacks without try/catch noise.

The pack uses four fallback strategies, all routed through `toIso`:

1. `metadata.publishedTime` from Firecrawl (when the page emits `<meta property="article:published_time">`)
2. RSS `pubDate` map built from the index scrape when the source is a feed (`parseRssFeed(xml)` → `Map<url, iso>`)
3. JSON-LD `datePublished` (or `dateCreated` / `uploadDate` / `pubDate`) extracted from rawHtml (`extractIsoFromJsonLd`)
4. First date-shaped pattern in the markdown byline area (`extractIsoFromText`)

Reach.edu was a clean test case: HubSpot CMS sets `og:type: article` but omits the matching `article:published_time` tag. The dates live in JSON-LD (`"datePublished" : "2026-05-14T13:00:04.000Z"`) and in the RSS feed pubDates. The fallback stack found all 5 dates without intervention.

This helper is shared infrastructure. Every future pack that returns dated items routes through here.

## Verified

`pnpm tsx services/social-search/scripts/fire-official-blog.ts --url=https://reach.edu`:

- 5 items returned in 4.4s
- All 5 have ISO `published_date` and computed `age_days`
- Source indexes: `/feed`, `/rss`, `/atom.xml` (path-guess fallback; no SerpApi key)
- by_provider: 9 path_guess candidates queued; 8 Firecrawl scrapes total (3 index + 5 post)

## What's not in this commit

- **SerpApi find-index** — connector + registry are wired; an actual SerpApi key isn't set, so path-guess carried the find-index stage. Both paths work; production fires want a key.
- **Confidence + relevance scoring** — left null per spec step 1 (`provider_override.score: 'none'` semantics).
- **Pulse Curation Layer write** — the reply is the structured JSON; response-store integration comes with [[../context-v/specs/Pulse-Curation-Layer-and-UI]] (spec step 4).
- **Rollup-agent** — Phase 2 of the four-phase DAG. Lands when the OfficialUpdates source-pack roster is complete.
- **Other OfficialUpdates packs** — `official-pressrelease-pack` and `official-social-posts-pack` are step 2 of the migration plan.
- **Date extraction edge cases** — reach.edu's HubSpot shape worked clean. Second-domain validation (a different CMS — WordPress / Drupal / custom) will surface gaps before this is locked.

## Related

- [[../context-v/specs/Entity-Pulse-Bundle]] (v0.0.0.5) — the spec driving this work
- [[../context-v/specs/Connector-Inventory-and-Per-Record-Palette]] (v0.0.0.1) — next up after step 2 of this arc
- [[../context-v/reminders/Pickup-2026-06-02]] — session map for this arc
- [[2026-06-01_01_SearXNG-Joins-as-Peer-Provider]] — the connector-registry pattern this extends
