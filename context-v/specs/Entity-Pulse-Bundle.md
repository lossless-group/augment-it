---
title: "Entity-Pulse Bundle — Press Releases, News Mentions, and the Social Voice of a Record"
lede: "Profile Builder finds the canonical accounts an entity lives at. Entity Pulse finds what that entity has been *saying* and what's been said *about* it lately. Three packs, three shapes — a site-scrape pack that walks the entity's own domain for press / blog / updates links, a news-API pack that queries Google News (and other free APIs) for outside coverage, and an agent-bound pack that consumes the accepted social account links from a prior Profile Builder run to scan recent posts and summarize the entity's own voice with links back. Augmenting a record set with this bundle answers 'what's the current shape of this entity's public conversation?' in one fire."
date_created: 2026-06-01
date_modified: 2026-06-01
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
semantic_version: 0.0.0.2
revisions:
  - 2026-06-01 — Initial draft (0.0.0.1).
  - 2026-06-02 — SerpApi added as a peer provider; news pack stays on the free path. Lock: Google News RSS as the v1 default for `news-mentions-pack` (with GDELT immediate peer); SerpApi `engine: 'google_news'` is available behind `provider_override` but never default. `official-site-updates-pack` provider section split into find-index vs extract-posts stages — SerpApi (`engine: 'google'` with `site:`-restrict) is the strongest find-index option; Firecrawl stays for extract-posts. Provider-override shape grows from a single string to `{ find?, extract? }` to match the two-stage economy. New open question: per-bundle cost budget (surfaces in Decision §10's adaptive RR as a candidate pre-fire estimate line). Resolved open question: news provider priority.
tags:
  - Spec
  - Augment-It
  - Bundle
  - Packs
  - News-API
  - Web-Crawling
  - Agent-Pack
  - Social-Aggregation
  - Profile-Continuation
status: Draft
---

# Entity-Pulse Bundle

## Why this exists

After a Profile Builder run (or after a human manually pasted canonical
account URLs into `row.socials`), the record knows *where* an entity
lives on the public web. The next question — and the one most users
will reach for in a discovery / refresh cycle — is: **what has this
entity been doing or saying lately?** That's a different operation
from "find the LinkedIn URL." It needs different sources, different
mechanics, and a different unit of result (a *feed*, not a *profile*).

Three sources cover that question between them, and a bundle is the
right abstraction because they fire as a unit against the same row.

## Bundle shape

```ts
export const ENTITY_PULSE: BundleConfig = {
  bundle_id: 'entity-pulse',
  display_name: 'Entity Pulse',
  description: 'What this entity has been saying + what is being said about them — press, news, social',
  passes: 1,
  target_columns: ['official_updates', 'news_mentions', 'social_pulse'],
  members: [
    { pack_id: 'official-site-updates-pack', default: true,  pass: 1, required: false },
    { pack_id: 'news-mentions-pack',         default: true,  pass: 1, required: false },
    { pack_id: 'social-pulse-pack',          default: true,  pass: 1, required: true  },
  ],
};
```

**Three target columns, one per pack.** Each pack writes to its own
output column so a user can triage one source at a time in Response
Reviewer (*"accept the news mentions but skip the social pulse"*).
Open question: collapse to a single `pulse` JSON column for simpler
schema? Default = three for the per-source-accept UX; revisit when
the triage surface gives us a feel.

**Single-pass.** No carry-forward between packs in v1. v2 candidate:
two-pass where social-pulse uses official-site-update mentions as
priors.

**Pack 3 (`social-pulse-pack`) marked `required: true`** because the
output is what users will read most. Failing silently on the social
voice while still claiming "we found the pulse" is misleading; if the
agent pack errors, the bundle reports failure.

## The three packs

### 1. `official-site-updates-pack` — what the entity says about itself

**Input:** `row.url` (the entity's primary website, populated either
manually or by an earlier `url-finder` pack).
**Output:** an array of `{ url, title, published_date, snippet,
content_type }` for recent posts on the entity's own domain. v1
returns up to 10; v2 picks a cap by recency.
**Output column:** `official_updates`.

**Mechanic:**

1. From `row.url`, derive candidate index pages: `/press`, `/news`,
   `/blog`, `/updates`, `/insights`, `/posts`, RSS at `/feed`,
   `/rss`, `/atom.xml`, and the homepage.
2. Fetch each (small concurrency, polite delays, cache by URL).
3. Parse for `<article>` / `<a>`-with-date heuristics, JSON-LD
   `Article` schema, and standard RSS / Atom feeds. RSS wins when
   present — saves parsing.
4. Filter to posts within a recency window (default: last 12 months;
   per-fire override candidate).
5. Per item, emit `{ url, title, published_date, snippet
   (extracted summary or first paragraph), content_type ('press'
   | 'blog' | 'update' | 'rss-item') }`.

**Provider:** the mechanic is two-stage: **find index pages**, then
**extract posts from them**. Different providers shine at different
stages.

*Find-index stage* candidates:
- **SerpApi** (`engine: 'google'`) with `site:<row.url> press OR blog
  OR news OR updates`. Cheap per-request, returns ranked URLs +
  snippets without scraping. Doesn't fetch bodies — that's the next
  stage. The strongest option for *finding* the right pages because
  Google has already indexed them.
- **Path-guessing** (the homepage walk listed in the mechanic above).
  Zero-cost but misses non-standard URL structures.

*Extract-posts stage* candidates:
- **Firecrawl** (already wired in the MCP server set; production-
  grade extraction; paid per request). Lean for v1: yes.
- **Tavily**'s `crawl` endpoint — already a peer provider in
  augment-it for search; reusing it here makes provider-plurality
  fall through naturally (per
  [[../issues/Search-Providers-as-First-Class-SearXNG-Default]]).
- **Hand-rolled** (HTTP + Cheerio + a small RSS parser). Cheap, no
  external dependency, fragile against single-page-app sites.

**Recommended composition:** SerpApi for find-index (one cheap call
per row) → Firecrawl for extract-posts (~1-3 calls per row after
recency filter). Falls back to homepage-walk + hand-rolled when
provider override or budget says so.

Provider-override seam is `provider_override?: { find?: 'serpapi' |
'self'; extract?: 'firecrawl' | 'tavily' | 'self' }` — split-stage
because the two phases have independent provider economies.

**Failure modes:** no robots.txt-allowed pages → outcome `not_found`
(NOT `error`; the entity just doesn't blog). 404 on every candidate
→ `not_found`. Network timeout / 5xx after retries → `error`.
JS-only sites with no SSR → `not_found` for v1; firecrawl handles
some of these.

### 2. `news-mentions-pack` — what others say about the entity

**Input:** `entity_name` (resolved per Decision §9's auto-inference)
+ optional `entity_type` (from the active bundle or row).
**Output:** an array of `{ url, title, source, published_date,
snippet, sentiment? }` for recent news articles mentioning the
entity. Default cap: 15 most-recent.
**Output column:** `news_mentions`.

**Mechanic:**

1. Construct a query: `"<entity_name>"` quoted, optional
   site-restrict to a curated list of news sources by entity_type.
2. Fire against the active news-API provider.
3. Filter to a recency window (default: last 6 months for orgs,
   12 months for individuals).
4. De-dupe by canonical URL + title-similarity.
5. Per item, emit normalized record. Optional sentiment is left
   `null` in v1; v2 candidate to run a tiny classifier on the
   snippet.

**Provider stance — news stays free.** Unlike the social packs (where
SerpApi joins as a paid quality-leader peer), news has a strong free
path and the cost calculus says use it. The user's framing
2026-06-02: *"Google News feels like we can do free and separate."*
This pack keeps free-tier providers as the primary, with paid options
explicitly available via override but never the default.

**Provider candidates, free first:**
- **Google News RSS** — undocumented but stable; query-by-RSS
  (`news.google.com/rss/search?q=...&hl=en-US&gl=US`). Free, no
  auth, geo-aware. v1 first-choice for "free and separate" per the
  user's framing.
- **GDELT** — fully open, no auth, global news index, recency
  excellent. Strong v1 alternative or peer.
- **NewsAPI.org** — free tier with attribution requirement +
  rate limits. Easy JSON; useful as a third peer when the first
  two miss.
- **Bing News Search API** — free tier via Azure, generous limits,
  has gone through deprecation rumors — verify viability before
  building against it.

**Available but NOT the default for this pack — `SerpApi`
(`engine: 'google_news'`)** returns the highest-quality Google News
results structurally, but it's paid per request. Available behind
`provider_override` for the per-row iteration loop or when a user
opens the "force quality" escape hatch on a specific row. Not the
pack's default because the free path is good enough at fan-out
scale.

Pack carries a `connector` field defaulting to `google-news-rss`;
`provider_override` lets the per-fire surface swap to GDELT,
NewsAPI, or — explicitly — SerpApi when paying for quality is
warranted. Start with one free option (Google News RSS) for v1; add
the second as the second consumer; SerpApi joins behind the
provider-override seam without ever becoming the default.

**Failure modes:** zero results → `not_found`. Rate-limit hit →
provider auto-falls-through to the next in priority order
(matches the social-search pattern). Persistent failure → `error`.

### 3. `social-pulse-pack` — the entity's own voice across platforms

**The interesting one.** This pack is *not* source-bound the way
LinkedIn-pack or Wikipedia-pack is. Its input is **the accepted
output of a prior Profile Builder run** — specifically
`row.socials[]` — and its job is to walk each accepted social
profile URL and summarize what the entity has been posting lately.
Plus return the source links for human review.

**Input:**
- `entity_name` (for context in the LLM prompt).
- `row.socials[]` — the array of accepted `{ pack_id, url,
  display_name, confidence }` from a Profile Builder run. If
  `row.socials` is empty, the pack returns `outcome: 'not_found'`
  with a hint: *"no accepted socials yet — run Profile Builder
  first."*

**Output:** a single JSON record:
```jsonc
{
  "summary": "Brief paragraph in the entity's voice describing the public posture across platforms.",
  "themes": ["theme tag 1", "theme tag 2", ...],
  "recent_posts": [
    {
      "platform": "linkedin",
      "url": "https://...",
      "posted_at": "2026-05-28",
      "excerpt": "...",
      "engagement_hint": "..."
    }
  ],
  "platforms_scanned": ["linkedin", "x", "youtube"],
  "platforms_skipped": [{ "platform": "instagram", "reason": "private profile" }]
}
```

**Output column:** `social_pulse` (single JSON column — unlike packs
1 and 2 which write arrays of items).

**Mechanic — this is where it diverges from prior packs:**

1. The pack body is **an agent skill**, not a single API call.
2. The agent reads `row.socials`, walks each URL with a content-
   fetcher (firecrawl or an MCP-driven scraper), extracts the
   most recent N posts per platform.
3. Per platform: dedupe, normalize the excerpt, attach the URL.
4. Aggregate across platforms into the structured response.
5. Run a small LLM step to produce `summary` + `themes` from the
   raw excerpts. The model id is configurable per-fire (same seam
   as Prompt Templates).

**Why this is a new pack *type* worth naming.** Existing packs in
[[../blueprints/Packs-and-Bundles-Pattern]] are *provider-bound*:
one source, one connector, one query. This one is *agent-bound*:
the pack is a skill that orchestrates multiple fetches + an LLM
summarization. It depends on prior accepted data (`row.socials`).
That's a meaningful evolution of the pack concept and the
blueprint should grow a section for it when this spec lands —
"Agent packs" or "Composite packs." Flagged below in Open
questions.

**Failure modes:** `row.socials` empty → `not_found` with hint.
Some platforms inaccessible (private, geo-blocked) → emit them in
`platforms_skipped` with reason; not a pack-level failure unless
ALL platforms are inaccessible. LLM step errors → `error`. Total
silent failure across all sources → `error` with diagnostic.

## Request Reviewer view for this bundle

Because this bundle ships AFTER Decision §10 (adaptive Request
Reviewer), the bundle review for Entity Pulse should follow that
spec. Specifically:

- Fan-out payload at the top: `{ pack_ids, bundle_id: 'entity-pulse',
  record_set_id, row_ids, … }`.
- Sample resolved queries — for the official-site pack, show the
  candidate URLs that will be fetched per row; for news, show the
  exact query string; for social-pulse, show the list of
  `row.socials[]` URLs being walked.
- Provider per pack.
- The "intimidating-but-recognizable JSON" presentation per
  Decision §10's framing.

This bundle is also a good driver to *test* §10's adaptive RR
because the three packs have visibly different shapes — a good
debugging surface.

## Composability + sequencing

Entity Pulse depends on `row.socials` being populated for the
social-pulse pack to be useful. The Augment composite's UX already
nudges users through `Augment This Set →` → Profile Builder first,
which fills `row.socials`. The Pack Runner could surface a small
hint when Entity Pulse is selected and `row.socials` is empty on a
significant fraction of rows: *"social-pulse will skip for N rows
that don't have accepted socials yet. Run Profile Builder first?"*

Open: should this be a hard prerequisite (Entity Pulse refuses to
fire until Profile Builder has been run against ≥X% of the set),
or a soft hint? Lean: soft hint; the user knows their data.

## Open questions

- **Bundle naming.** Entity Pulse vs Recent Activity vs Voice &
  Mentions vs … the working name is Entity Pulse because it
  captures both directions (the entity's voice + outside voice
  about the entity). Confirm or rename.
- **One target column or three?** v1 says three for per-source
  accept granularity in Response Reviewer. If the triage surface
  groups by pack already, three columns might be redundant. Revisit
  after the triage surface gets its next pass.
- ~~**News provider priority.**~~ — RESOLVED 2026-06-02 as
  **Google News RSS first**, GDELT as immediate peer. SerpApi's
  `google_news` engine is available behind `provider_override` but
  never the default (free path is good enough at fan-out scale).
- **Per-bundle cost budget.** New question surfaced 2026-06-02 by
  SerpApi joining the registry. Fan-out arithmetic at the entity-pulse
  shape is significant — 3 packs × 67 rows = 201 cells. If a user
  toggles `provider_override.serpapi` for the whole fan-out, the cost
  jumps from ~zero to ~$2-4 at SerpApi's entry-tier rate. Worth a
  pre-fire cost estimate line in the Request Reviewer (Decision §10's
  adaptive RR is a natural surface for it). v2 candidate; v1 ships
  without budget enforcement and lets the user notice from their
  monthly bill.
- **Agent-pack pattern formalization.** The social-pulse pack is
  the first agent-bound pack. The blueprint
  [[../blueprints/Packs-and-Bundles-Pattern]] should grow a
  section formalizing this pattern when this spec lands: agent
  packs are skill-driven, depend on prior accepted data, and the
  fan-out semantics are different (agent runs N sub-fetches; the
  pack-level outcome aggregates).
- **Skill registration.** The social-pulse pack is also a candidate
  chat verb (`/voice-of-entity`?). Decide whether it registers as
  a verb when it ships, or after.
- **Recency window per pack.** Defaults named above (12mo official,
  6mo news, configurable for social). Per-fire override surface
  candidate; not v1.
- **Sentiment in `news_mentions`.** v1 leaves `null`; v2 candidate.
- **De-dup across packs.** A press release from the entity's own
  site that also got picked up in news mentions — does Pack 2 dedupe
  against Pack 1? Lean: no in v1; let the triage surface handle it.
  The user reviewing news_mentions can recognize and skip the
  duplicate.

## Migration / first concrete implementation step

When picked up, the smallest shippable v1 is:

1. **The `news-mentions-pack` standalone**, against **Google News
   RSS** (free, no auth, geo-aware — the locked v1 default per the
   2026-06-02 resolution above), with `target_columns:
   ['news_mentions']` and a single-pack bundle `news-pulse` for
   testing. This gets the pack-runner UI exercised against a
   non-`socials` target column and provides a quick "is this useful?"
   signal — *without paying for SerpApi to get the first signal.*
2. **Add `official-site-updates-pack`** behind firecrawl. Now two-
   pack bundle.
3. **Add `social-pulse-pack`** as the agent-bound pack. By this
   point Decision §10's adaptive Request Reviewer should be
   shipping in parallel so the JSON-view review can be tested on
   this bundle's shape.

Each ships against `feat/<pack-name>` (or trunk per the new branch-
cadence rule — single-file additions to a service can land direct).

## Related

- [[../blueprints/Packs-and-Bundles-Pattern]] — the pattern this
  bundle instances. The agent-pack subtype this spec proposes is
  a candidate addendum to that blueprint.
- [[Shell-and-Micro-Frontend-UX-Coherence]] §Decision §10 — the
  adaptive Request Reviewer that should render this bundle's
  fan-out payload + sample queries in the JSON view.
- [[Shell-and-Micro-Frontend-UX-Coherence]] §Decision §9 — the
  target-column display surface in Pack Runner; this bundle's
  three-target shape will exercise the union rendering for the
  first time.
- [[Response-Reviewer-and-Response-Store]] — where this bundle's
  per-pack outputs land for triage; the per-column accept UX is
  scoped there.
- [[../issues/Search-Providers-as-First-Class-SearXNG-Default]] —
  provider-plurality pattern that the news pack and the
  official-site pack both inherit.
- [[In-App-Chat-v0-0-1-for-Augment-It]] — the chat verb registry
  that may eventually carry `/voice-of-entity` or
  `/entity-pulse` as a one-shot verb.
