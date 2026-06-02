---
title: "Entity-Pulse Bundle — Press Releases, News Mentions, and the Social Voice of a Record"
lede: "Profile Builder finds the canonical accounts an entity lives at. Entity Pulse finds what that entity has been *saying* and what's been said *about* it lately. Three packs, three shapes — a site-scrape pack that walks the entity's own domain for press / blog / updates links, a news-API pack that queries Google News (and other free APIs) for outside coverage, and an agent-bound pack that consumes the accepted social account links from a prior Profile Builder run to scan recent posts and summarize the entity's own voice with links back. Augmenting a record set with this bundle answers 'what's the current shape of this entity's public conversation?' in one fire."
date_created: 2026-06-01
date_modified: 2026-06-01
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
semantic_version: 0.0.0.3
revisions:
  - 2026-06-01 — Initial draft (0.0.0.1).
  - 2026-06-02 — SerpApi added as a peer provider; news pack stays on the free path. Lock: Google News RSS as the v1 default for `news-mentions-pack` (with GDELT immediate peer); SerpApi `engine: 'google_news'` is available behind `provider_override` but never default. `official-site-updates-pack` provider section split into find-index vs extract-posts stages — SerpApi (`engine: 'google'` with `site:`-restrict) is the strongest find-index option; Firecrawl stays for extract-posts. Provider-override shape grows from a single string to `{ find?, extract? }` to match the two-stage economy. New open question: per-bundle cost budget (surfaces in Decision §10's adaptive RR as a candidate pre-fire estimate line). Resolved open question: news provider priority.
  - 2026-06-02 — Engineering-handoff sharpening, two pieces locked: (a) every returned item carries two independent 0-100 scores — `confidence` (Profile-Builder-style: link valid + informative) and `relevance` (LLM-scored against a `relevance_context` brief). Each has a 90-100 / 51-89 / 0-50 tier with semantics tied to triage default-accept / human-review / default-skip behaviour. Worked example (Reach University's apprenticeship-degrees fundraise) shows how a 3-year-old article can score higher on relevance than yesterday's news. (b) No hard cap on returned items — structured response wraps `all` (master, sorted by combined score), `most_recent` and `most_relevant` (each soft cap 20). Sort and tie-break rules locked; per-fire `provider_override.score: 'llm' | 'keywords-only' | 'none'` escape hatch added. Cost discipline section names the batching + cheap-model + pre-filter pattern that keeps LLM scoring viable at fan-out scale.
  - 2026-06-02 — Added top-level **Philosophy** section locking Augment-It's stance on LLM web research: leverage LLM speed/breadth/randomness AND keep quality-gating + relevance-sorting with the human in the loop. Frames the two-score + no-hard-cap + provider-override choices as instances of one principle — *LLMs fan out, humans filter in*. Candidate cross-cutting principle for the Packs-and-Bundles-Pattern blueprint.
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

## Philosophy — LLM web research with human-in-the-loop gating

Augment-It's philosophy on LLM-driven web research (locked
2026-06-02 by the user, applies across every bundle and is a
candidate cross-cutting principle for
[[../blueprints/Packs-and-Bundles-Pattern]]):

> *"LLM web research is helpful but needs to be carefully quality-
> assured by human in the loop, and that needs to be filtered and
> saved by human in the loop. So, the important thing is to take
> advantage of the benefits of LLM web research — speed, breadth,
> randomness — while giving the human in the loop quality control
> gating, relevance sorting UI."*

The three benefits we want from the LLM side: **speed** (scan more
sources than a human ever could in the same time), **breadth** (look
at all of LinkedIn / X / news / press / a fortune-five-hundred
foundation's own site in one fire), and **randomness** (the LLM
notices things a search-engine ranker buried, including the
serendipitous "huh, this isn't what I was looking for but it changes
the narrative" find).

The two responsibilities we keep with the human: **quality gating**
(does this result actually belong in our knowledge base? did the LLM
hallucinate the date / source / connection?) and **relevance sorting**
(does this matter *for the work I'm doing right now?* — a question
only the human knows the full answer to).

This shapes the entire Entity-Pulse design:

- **Two scores, not one** (confidence + relevance) — because the
  LLM's "I think this is relevant" must be inspectable + overridable
  by the human, not collapsed into a single number that hides the
  judgment.
- **`relevance_reasoning` on every item** — one-line "why" so the
  triage human can verify or reject the LLM's call quickly.
- **No hard cap on `all`** — never silently drop a result the human
  didn't choose to drop.
- **Two ranked views (`most_recent`, `most_relevant`)** — the human
  picks which sort to triage by, not the bundle.
- **Default-accept / default-skip tiers** keyed off confidence and
  relevance ranges — *fast* gating for the obvious cases, *slow*
  human review for the ambiguous middle. The triage default never
  *commits* anything; the human still clicks accept.
- **Provider plurality + provider-override per row** — the human can
  re-fire a row through a different provider when they suspect the
  first cut was off.
- **`provider_override.score: 'none'`** — escape hatch to bypass LLM
  scoring entirely when the human wants raw recency without
  algorithmic judgment.

The pattern this bundle (and every future bundle) instances:
**LLMs fan out, humans filter in.** Augment-It is not a "trust the
LLM" surface; it's a "leverage the LLM, decide the data" surface.

## Two scores per item — confidence and relevance

Every item this bundle returns (whether it's an official-site post, a
news mention, or a recent social post inside the social-pulse
aggregate) carries **two independent 0-100 scores**. They answer
different questions, they sort differently, and they can disagree —
that's the point.

### `confidence: number` (0-100)

*"How sure are we that this is a valid, informative link to the right
entity?"* Mirrors Profile Builder's confidence semantics (the
existing pill UI in Response Reviewer already speaks this scale, so
the same UI lights up for Entity-Pulse items at zero design cost):

- **90-100 — high.** Verified valid (link resolves, content matches
  the entity beyond ambiguity), informative (it's actually about the
  entity, not a passing mention in a roundup of fifty orgs). The
  triage default-accept tier.
- **51-89 — medium.** Probably valid; the link works, the entity is
  in the content, but the article is loosely about it (e.g. a
  byline-only mention or a single quote). Worth a human glance.
- **0-50 — low.** Either unverified (404, paywall we can't see
  through, redirect to a generic page) or clearly off-target (a
  same-named entity, a stale page that no longer exists). Default-
  skip in triage; surfaced anyway for completeness.

### `relevance: number` (0-100)

*"How aligned is this with what we actually care about right now?"*
This is a different dimension from confidence because **a perfectly
valid, three-year-old article can still be highly relevant**, and a
breaking news item from yesterday can be irrelevant noise. The
scoring is done by the LLM against a **`relevance_context`** brief
that the user (or the record set, or the bundle) supplies at fire
time.

Worked example — Reach University's fundraise:

> `relevance_context: "Reach University offers low-cost
> 'apprenticeship degrees' that help working-class professionals
> finish or advance credentials in frontline roles like nursing and
> teaching. We're researching philanthropic funders who support
> workforce-development, education access for adult learners,
> credentialing reform, or rural/underserved healthcare. Items
> describing the funder's grants, strategy, or programs in any of
> those areas are highly relevant; items about the funder's CEO
> getting a public award are not."

Under that brief: a Walton Family Foundation press release from 2023
about a $50M commitment to apprenticeship pathways scores **95
relevance** even though it's three years old; a 2026 LinkedIn post
from the same foundation announcing a new logo scores **15
relevance** even though it's last week.

Score guidelines:

- **90-100 — high.** Directly addresses one or more themes in
  `relevance_context`. Default-accept tier in triage UX.
- **51-89 — medium.** Tangentially related; useful for picture-
  building but not load-bearing for the fundraise narrative. Worth
  a glance.
- **0-50 — low.** Not aligned. Default-skip; still returned so the
  user can see we found *something* (and can tune the
  `relevance_context` if the LLM is scoring poorly).

### Why both, and why not a single combined score

A single score would force the bundle to *pick a tradeoff for the
user*. The user has explicitly said the tradeoff is theirs to make:
*"recency is about understanding what that organization has been up
to ... relevance is related to our specific fundraise efforts ...
relevant content from 3 years ago is still relevant."* Two scores +
two sort orders preserve that agency. The Response Reviewer (and the
adaptive RR per Decision §10) gets to render either or both.

Implementation note: the LLM scoring step is *not free*. At fan-out
scale this is non-trivial cost. See §"LLM-scored relevance — cost
discipline" below.

## Recency vs relevance — no hard cap, two ranked views, structured response

User-locked 2026-06-02: **no hard cap on items returned.** The
tradeoff is asymmetric across entity sizes (a large philanthropic
foundation has hundreds of mentions per quarter; a small family
foundation has a handful per year), and clipping both to the same
ceiling would over-serve the small and under-serve the large.

Instead — return everything we found that clears a quality floor, and
present **two ranked views** plus an `all` master list. If a soft cap
is needed (UI density, response payload size), it's **20 most recent +
20 most relevant** with overlap allowed.

### Structured response shape for list-shaped packs

The pack-1 (`official-site-updates-pack`) and pack-2
(`news-mentions-pack`) outputs are wrapped in a structured response
rather than a bare array. Sketch:

```ts
type EntityPulseListResponse<T extends EntityPulseItem> = {
  // The complete deduped, scored, sorted-by-combined-score set.
  // The default "everything we found" array — no cap unless the
  // provider hard-limits us. Always render first.
  all: T[];

  // Top-N by published_date, descending. Soft cap 20 — populated only
  // if `all.length > 20`; otherwise omitted (the UI can sort `all`
  // itself).
  most_recent?: T[];

  // Top-N by relevance score, descending. Soft cap 20. Same rule:
  // omitted when the master list is small enough to sort in place.
  most_relevant?: T[];

  meta: {
    // What was scored against; surfaces in Request Reviewer per §10.
    relevance_context: string;
    // Raw count BEFORE any soft cap or quality-floor filter.
    total_found: number;
    // Items dropped by quality-floor (confidence < 30, etc.).
    dropped_low_confidence: number;
    // What the bundle thinks of the entity's volume — useful for UI
    // expectation-setting ("we found 9 items; that's normal for a
    // small organization" vs "we found 240 items; here are the top
    // 20 by each ranking").
    activity_volume: 'sparse' | 'moderate' | 'high';
    // Per-provider attribution — which connectors fed how many items
    // into `all`. Lets the user diagnose "did GDELT get throttled?"
    by_provider: Record<string, number>;
  };
};

// The per-item base — `confidence` and `relevance` are first-class.
type EntityPulseItem = {
  url: string;
  title: string;
  snippet: string;
  published_date: string;       // ISO-8601; required (we filter out items we can't date)
  age_days: number;             // computed at fan-out time so the UI can sort without re-parsing
  confidence: number;           // 0-100, per scale above
  relevance: number;            // 0-100, per scale above
  relevance_reasoning?: string; // one-line "why" from the LLM scoring step; useful in triage
};

// Pack 1 extension
type OfficialUpdateItem = EntityPulseItem & {
  content_type: 'press' | 'blog' | 'update' | 'rss-item';
  source_index_url?: string;    // which index page surfaced this item
};

// Pack 2 extension
type NewsMentionItem = EntityPulseItem & {
  source: string;               // publication / domain
  sentiment?: number | null;    // -100 to 100; v1: null
};
```

### Structured response shape for pack 3 (social-pulse)

Pack 3 produces a single record per row, not a list — but the per-
`recent_posts[]` entries inside it carry the same `confidence` +
`relevance` per item, and the surrounding aggregate carries an
overall `relevance_summary` brief. Updated shape lives in the pack-3
section below.

### Sort and tie-break rules

`all` is sorted by **combined score** — a simple weighted sum
`0.4 * (100 - age_days_normalized) + 0.6 * relevance` by default. The
weight is tunable per fire; the default leans on relevance because
the user told us that's the load-bearing dimension when the two
diverge. Ties break by `confidence` descending, then `published_date`
descending.

`most_recent` sorts on `published_date` only (with `confidence`
as the tie-break — we don't surface unverified recent items above
verified ones).

`most_relevant` sorts on `relevance` only (with `published_date` as
the tie-break — when two items score the same on relevance, the
fresher one wins).

### LLM-scored relevance — cost discipline

Computing `relevance` requires reading the snippet (and ideally the
page body) and asking an LLM "how does this map to the
`relevance_context`?" That's a per-item LLM call. At entity-pulse
fan-out scale (3 packs × 67 rows × ~10-20 items each), naive scoring
runs ~2000-4000 LLM calls per fan-out — non-trivial.

Disciplines, in priority order:

1. **Score in batches per row.** One LLM call per row per pack
   takes all that row's items and returns scores together. Reduces
   call count by ~15×.
2. **Keyword pre-filter cheap-rejects.** Build a small keyword set
   from `relevance_context` (LLM-generated once per fan-out, cached);
   items with zero keyword hits skip the LLM call and get
   `relevance: 0` with `relevance_reasoning: "no terms from brief
   present in snippet."` Human can override in triage.
3. **Use a cheap model.** Haiku-class for scoring; the heavy-context
   reasoning isn't needed — "does this snippet relate to this brief"
   is a simple judgment.
4. **Surface the budget pre-fire.** Decision §10's adaptive Request
   Reviewer renders the LLM call estimate alongside the fan-out
   payload before the user clicks Fire.

`provider_override.score?: 'llm' | 'keywords-only' | 'none'` is the
per-fire seam if the user wants to skip scoring entirely (and get
ranked-by-recency-only).

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
  // Free-text brief that the LLM scoring step uses to compute the
  // `relevance` score per item. Resolution order at fire time:
  //   1. Per-fire override (typed in Pack Runner / Request Reviewer).
  //   2. record_set.research_context (when the record set carries one).
  //   3. This bundle-default value (the fallback for cold-start fires).
  // If none is present, relevance is set to null per item and the
  // structured response surfaces a warning in `meta`.
  relevance_context_default: undefined,
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

**Output:** a single JSON record. Posts inside it carry the same
`confidence` + `relevance` pair as items in packs 1 and 2 (see §"Two
scores per item" above):

```jsonc
{
  "summary": "Brief paragraph in the entity's voice describing the public posture across platforms.",
  "themes": ["theme tag 1", "theme tag 2", ...],
  "summary_relevance": 78,           // 0-100; relevance of the overall summary to relevance_context
  "summary_confidence": 92,          // 0-100; signal strength of the underlying corpus
  "recent_posts": [
    {
      "platform": "linkedin",
      "url": "https://...",
      "posted_at": "2026-05-28",
      "age_days": 5,
      "excerpt": "...",
      "engagement_hint": "...",
      "confidence": 95,              // platform handle resolved + post visible
      "relevance": 88,               // matches fundraise context
      "relevance_reasoning": "explicit grant announcement for workforce training"
    }
  ],
  // Top recent posts across all scanned platforms, soft cap 20
  "most_recent": ["post_url_1", "post_url_2", ...],
  // Top relevant posts across all scanned platforms, soft cap 20
  "most_relevant": ["post_url_3", "post_url_4", ...],
  "platforms_scanned": ["linkedin", "x", "youtube"],
  "platforms_skipped": [{ "platform": "instagram", "reason": "private profile" }],
  "meta": {
    "relevance_context": "[the brief used for scoring]",
    "total_posts_scanned": 47,
    "dropped_low_confidence": 3,
    "activity_volume": "moderate"
  }
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
