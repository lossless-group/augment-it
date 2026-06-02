---
title: "Entity-Pulse Bundle — Press Releases, News Mentions, and the Social Voice of a Record"
lede: "Profile Builder finds the canonical accounts an entity lives at. Entity Pulse finds what that entity has been *saying* and what's been said *about* it lately. Three categories — **Official Updates** (blog + press release + entity's own social posts), **Media Mentions** (news coverage + thematic inclusion + deep analysis), **Socials Mentions** (third-party mentions across platforms) — fan out across seven source-bound packs in pass 1 and aggregate via three agent-bound rollup packs in pass 2. Each item carries two 0-100 scores (confidence + relevance against a fundraise brief); each category lands as a three-layer Pulse Curation state (immutable raw_output / live curated_output / immutable finalized_output snapshot) so the human gates every item with full audit trail. Augmenting a record set with this bundle answers 'what's the current shape of this entity's public conversation, and what survives our curation?' in one fire."
date_created: 2026-06-01
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
semantic_version: 0.0.0.4
date_modified: 2026-06-02
revisions:
  - 2026-06-01 — Initial draft (0.0.0.1).
  - 2026-06-02 — SerpApi added as a peer provider; news pack stays on the free path. Lock: Google News RSS as the v1 default for `news-mentions-pack` (with GDELT immediate peer); SerpApi `engine: 'google_news'` is available behind `provider_override` but never default. `official-site-updates-pack` provider section split into find-index vs extract-posts stages — SerpApi (`engine: 'google'` with `site:`-restrict) is the strongest find-index option; Firecrawl stays for extract-posts. Provider-override shape grows from a single string to `{ find?, extract? }` to match the two-stage economy. New open question: per-bundle cost budget (surfaces in Decision §10's adaptive RR as a candidate pre-fire estimate line). Resolved open question: news provider priority.
  - 2026-06-02 — Engineering-handoff sharpening, two pieces locked: (a) every returned item carries two independent 0-100 scores — `confidence` (Profile-Builder-style: link valid + informative) and `relevance` (LLM-scored against a `relevance_context` brief). Each has a 90-100 / 51-89 / 0-50 tier with semantics tied to triage default-accept / human-review / default-skip behaviour. Worked example (Reach University's apprenticeship-degrees fundraise) shows how a 3-year-old article can score higher on relevance than yesterday's news. (b) No hard cap on returned items — structured response wraps `all` (master, sorted by combined score), `most_recent` and `most_relevant` (each soft cap 20). Sort and tie-break rules locked; per-fire `provider_override.score: 'llm' | 'keywords-only' | 'none'` escape hatch added. Cost discipline section names the batching + cheap-model + pre-filter pattern that keeps LLM scoring viable at fan-out scale.
  - 2026-06-02 — Added top-level **Philosophy** section locking Augment-It's stance on LLM web research: leverage LLM speed/breadth/randomness AND keep quality-gating + relevance-sorting with the human in the loop. Frames the two-score + no-hard-cap + provider-override choices as instances of one principle — *LLMs fan out, humans filter in*. Candidate cross-cutting principle for the Packs-and-Bundles-Pattern blueprint.
  - 2026-06-02 — Major restructure to v0.0.0.4: **two-pass orchestration across three categories**. Pass 1 grows from three packs to seven, decomposed into OfficialUpdates (blog + press_release + own-social), MediaMentions (news_coverage + thematic_inclusion + deep_analysis), and SocialsMentions (third-party mentions across platforms with `row.socials` filter-out). Pass 2 adds three agent-bound rollup-agents that synthesize per-category Rollup records. The Rollup shape is "true rollup" — carries every constituent item plus indexed views (`by_content_type`, `most_recent`, `most_relevant`) referencing items by index rather than copying. Target columns become `official_updates_pulse / media_mentions_pulse / socials_mentions_pulse`. Each rollup lands in a `PulseCategoryState<Rollup>` wrapper with the three-layer curation model from the NEW sibling spec [[Pulse-Curation-Layer-and-UI]] — immutable `raw_output`, live `curated_output`, immutable `finalized_output` snapshot when the human marks the category done. Three triage actions (accept-canonical / accept-additional-context / discard) plus bulk variants. Migration plan re-sequenced across multiple PRs given the larger scope; first concrete step is now `media-news-coverage-pack` standalone against Google News RSS, with no LLM scoring, no curation layer, just the pack-runner ergonomics smoke. Legacy per-pack detail sections removed (note left in place explaining the decomposition).
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

Three *categories* — OfficialUpdates (the entity's own voice),
MediaMentions (outside voice about the entity), and SocialsMentions
(third-party mentions across social platforms) — cover that
question between them. A bundle is the right abstraction because
they fire as a unit against the same row, and a **two-pass**
bundle is the right shape because each category needs both
source-bound fan-out (pass 1) AND agent-bound synthesis across
those sources into a per-category rollup (pass 2). The output of
this bundle is three rollups per row, each with its own three-
layer Pulse Curation state per [[Pulse-Curation-Layer-and-UI]].

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

### Structured response shape — pass-1 packs (list-shaped)

Each pass-1 pack returns an `EntityPulseListResponse<ItemType>` —
its contribution to the eventual category rollup. The pass-2
rollup-agent merges these.

```ts
type EntityPulseListResponse<T extends EntityPulseItem> = {
  items: T[];          // every item this pack found (no soft cap at pack level)
  meta: {
    relevance_context: string;
    total_found: number;
    dropped_low_confidence: number;
    by_provider: Record<string, number>;
    pack_id: string;
    generated_at: string;
  };
};

// The per-item base — confidence and relevance are first-class.
type EntityPulseItem = {
  url: string;
  title: string;
  snippet: string;
  published_date: string;       // ISO-8601; required
  age_days: number;             // computed at fan-out time
  confidence: number;           // 0-100
  relevance: number;            // 0-100
  relevance_reasoning?: string;
};

// OfficialUpdate items — three content_types across three packs.
type OfficialUpdateItem = EntityPulseItem & {
  content_type:
    | 'official_blog_entry'        // on entity's own domain
    | 'official_press_release'     // on wire-service URL, verbatim
    | 'official_social_post_item'; // on entity's own social account
  source_index_url?: string;       // index page that surfaced it (blog packs)
  wire_service?: string;           // 'prnewswire' | 'businesswire' | ... (PR pack)
  platform?: string;               // 'linkedin' | 'x' | ... (own-social pack)
};

// MediaMention items — three content_types across three packs.
type MediaMentionItem = EntityPulseItem & {
  content_type:
    | 'news_coverage'              // standard article about the entity
    | 'thematic_inclusion'         // entity is one of N examples in a trend piece
    | 'deep_analysis';             // entity IS the story; long-form
  source: string;                  // publication / domain
  sentiment?: number | null;       // -100 to 100; v1: null
  is_long_form?: boolean;          // word_count > threshold
};

// SocialsMention items — third-party mentions on social platforms.
type SocialsMentionItem = EntityPulseItem & {
  platform: 'linkedin' | 'x' | 'bluesky' | 'youtube' | 'facebook' | 'instagram' | 'other';
  author_url?: string;             // who posted the mention (NOT the entity)
  engagement_hint?: { likes?: number; reposts?: number; replies?: number };
};
```

### Structured response shape — pass-2 rollups

Each rollup-agent produces a single `*Rollup` record per row, per
category. The rollup carries **every item** (the "true rollup"
framing) plus the synthesis layer and indexed views:

```ts
// Shared rollup base — all three categories share this shape.
type PulseRollup<T extends EntityPulseItem> = {
  // Synthesis layer — LLM-produced over the items.
  summary: string;                    // one-paragraph synthesis
  themes: string[];                   // top-level themes
  summary_confidence: number;         // 0-100; signal strength of underlying corpus
  summary_relevance: number;          // 0-100; relevance of overall summary to relevance_context

  // The true-rollup part: every item that fed the synthesis.
  items: T[];

  // Indexed views — references into items[] by index, not copies.
  by_content_type: Record<string, number[]>;  // content_type → indices
  most_recent: number[];                       // soft cap 20, indices into items
  most_relevant: number[];                     // soft cap 20, indices into items

  meta: {
    relevance_context: string;
    total_found: number;                       // raw across all contributing packs
    dropped_low_confidence: number;
    dropped_duplicates: number;
    activity_volume: 'sparse' | 'moderate' | 'high';
    by_provider: Record<string, number>;       // attribution per connector
    by_pack: Record<string, number>;           // attribution per pass-1 pack
    generated_at: string;                      // when the rollup-agent ran
    model_id: string;                          // LLM used for synthesis + scoring
  };
};

type OfficialUpdatesRollup  = PulseRollup<OfficialUpdateItem>;
type MediaMentionsRollup    = PulseRollup<MediaMentionItem>;
type SocialsMentionsRollup  = PulseRollup<SocialsMentionItem>;
```

### Why indexed views (not copies)

The `most_recent` and `most_relevant` arrays hold *indices* into
`items[]`, not full item objects. Three reasons:

1. **No duplication.** A single item appears in multiple views (it
   can be both recent AND relevant) but exists once in storage.
2. **Curation coherence.** When the human discards item #7, every
   view that referenced index 7 reflects the discard automatically.
3. **Cheaper persistence.** The curation layer's three layers (raw /
   curated / finalized) each carry a `Rollup`; indexed views keep
   the JSON payload bounded.

### Sort and tie-break rules

`items` is sorted by **combined score** = `0.4 * (100 -
age_days_normalized) + 0.6 * relevance` by default. Weight tunable
per fire; default leans on relevance per the user's framing. Ties
break by `confidence` desc, then `published_date` desc.

`most_recent` sorts on `published_date` (tie-break: `confidence`
desc — don't surface unverified recent items above verified).

`most_relevant` sorts on `relevance` (tie-break: `published_date`
desc — when two items tie on relevance, the fresher one wins).

### LLM-scored relevance — cost discipline

Computing `relevance` requires the LLM to map a snippet (and ideally
page body) against `relevance_context`. At entity-pulse fan-out
scale (7 pass-1 packs × 67 rows × ~10-20 items each, plus 3 rollup
synthesis calls), naive scoring runs many thousands of LLM calls per
fan-out. Four disciplines apply, in priority order:

1. **Score in batches per row per pack.** One LLM call per row per
   pack scores all of that row's items together. ~15× reduction.
2. **Keyword pre-filter cheap-rejects.** LLM-generate a keyword set
   from `relevance_context` once per fan-out (cached); items with
   zero keyword hits skip the LLM call and get `relevance: 0` with
   `relevance_reasoning: "no terms from brief present in snippet."`
   Human can override in triage.
3. **Use a cheap model.** Haiku-class for scoring — "does this
   snippet relate to this brief" is a simple judgment.
4. **Surface the budget pre-fire.** Decision §10's adaptive Request
   Reviewer renders the LLM call estimate alongside the fan-out
   payload before the user clicks Fire.

`provider_override.score?: 'llm' | 'keywords-only' | 'none'` is the
per-fire seam if the user wants to skip scoring entirely.

## Bundle shape

### Two-pass orchestration

The bundle is **two-pass** per the orchestration pattern named in
[[../blueprints/Packs-and-Bundles-Pattern]]:

- **Pass 1** — seven source-bound packs across three categories.
  Each pack fetches from one source and returns typed items.
- **Pass 2** — three agent-bound *rollup* packs. Each consumes the
  pass-1 output for its category and produces a single Rollup
  record (synthesis + the constituent items + ranked views) that
  lands in the row.

```ts
export const ENTITY_PULSE: BundleConfig = {
  bundle_id: 'entity-pulse',
  display_name: 'Entity Pulse',
  description: 'What this entity has been saying + what is being said about them — press, news, social',
  passes: 2,
  target_columns: [
    'official_updates_pulse',
    'media_mentions_pulse',
    'socials_mentions_pulse',
  ],
  members: [
    // --- Pass 1: source-bound packs ---
    // OfficialUpdate packs — what the entity says about itself
    { pack_id: 'official-blog-pack',          default: true, pass: 1, required: false },
    { pack_id: 'official-pressrelease-pack',  default: true, pass: 1, required: false },
    { pack_id: 'official-social-posts-pack',  default: true, pass: 1, required: false },
    // MediaMention packs — what others say about the entity
    { pack_id: 'media-news-coverage-pack',    default: true, pass: 1, required: false },
    { pack_id: 'media-thematic-pack',         default: true, pass: 1, required: false },
    { pack_id: 'media-deep-analysis-pack',    default: true, pass: 1, required: false },
    // SocialsMention pack — third-party mentions on social platforms
    { pack_id: 'socials-mentions-pack',       default: true, pass: 1, required: false },
    // --- Pass 2: agent-bound rollups ---
    { pack_id: 'official-updates-rollup-agent', default: true, pass: 2, required: true,
      depends_on: ['official-blog-pack', 'official-pressrelease-pack', 'official-social-posts-pack'] },
    { pack_id: 'media-mentions-rollup-agent',   default: true, pass: 2, required: true,
      depends_on: ['media-news-coverage-pack', 'media-thematic-pack', 'media-deep-analysis-pack'] },
    { pack_id: 'socials-mentions-rollup-agent', default: true, pass: 2, required: true,
      depends_on: ['socials-mentions-pack'] },
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

**Target-column semantics.** Each rollup-agent's output lands in
its `<category>_pulse` column — but per
[[Pulse-Curation-Layer-and-UI]] the column doesn't hold a bare
Rollup; it holds a `PulseCategoryState<Rollup>` wrapper with three
layers (raw / curated / finalized). The bundle's writes always
target the `current.raw_output` slot; the curated and finalized
layers are managed by the Response Reviewer triage actions.

### Pass-1 pack roster — three categories

| Category | content_type | Pack | Source |
|---|---|---|---|
| **OfficialUpdates** | `official_blog_entry` | `official-blog-pack` | Entity's own domain (find-index + extract via SerpApi + Firecrawl, RSS where available) |
| OfficialUpdates | `official_press_release` | `official-pressrelease-pack` | Wire services (PRNewswire, BusinessWire, GlobeNewswire) via news-API or SerpApi |
| OfficialUpdates | `official_social_post_item` | `official-social-posts-pack` | Walks `row.socials[]` (entity's accepted social accounts) for that entity's *own* posts |
| **MediaMentions** | `news_coverage` | `media-news-coverage-pack` | News APIs (Google News RSS default, GDELT peer) |
| MediaMentions | `thematic_inclusion` | `media-thematic-pack` | News APIs filtered for trend-piece patterns ("among", "including", listicles) |
| MediaMentions | `deep_analysis` | `media-deep-analysis-pack` | Long-form sources (Substack, industry publications, academic indexes) |
| **SocialsMentions** | per platform | `socials-mentions-pack` | SerpApi with `engine: 'google'` site-restrict per platform; filters out posts FROM `row.socials[]` accounts |

Each pass-1 pack returns `EntityPulseListResponse<ItemType>` where
ItemType is the per-category item discriminated by content_type.
Details per pack below.

### Pass-2 rollup-agent roster

| Category | Rollup type | Agent depends on |
|---|---|---|
| OfficialUpdates | `OfficialUpdatesRollup` | All three OfficialUpdate pass-1 packs |
| MediaMentions | `MediaMentionsRollup` | All three MediaMention pass-1 packs |
| SocialsMentions | `SocialsMentionsRollup` | The single socials-mentions pass-1 pack |

Each rollup-agent's job: read all pass-1 items for its category,
dedupe across the constituent packs, run the per-item LLM scoring
(see "LLM-scored relevance — cost discipline" above), generate a
summary + themes, build the `most_recent` / `most_relevant` indexed
views, and emit the typed `*Rollup` record.

The Rollup carries **every constituent item** (the user's "true
rollup" framing — has the synthesis AND the items, not just the
synthesis), with the index-based views referencing items rather than
duplicating them.

**Three target columns, one per category.** Each *rollup-agent*
writes to its own `<category>_pulse` column (so the row carries
three independent pulse states per [[Pulse-Curation-Layer-and-UI]]).
A user triages one category at a time in Response Reviewer.

**All three pass-2 rollup-agents marked `required: true`.** The
pass-1 source-bound packs are individually `required: false` — any
one of them missing is fine; the rollup-agent gracefully aggregates
across whichever packs succeeded. But the rollup-agent itself failing
means the category produced no synthesized record, which IS a bundle-
level failure to report.

## Curation layer

Outputs land in `row.<category>_pulse` as a `PulseCategoryState<Rollup>`
wrapper per [[Pulse-Curation-Layer-and-UI]]. The bundle's writes
always target the `current.raw_output` slot; the curated and finalized
layers are managed by the Response Reviewer triage actions. Triage is
**per item, with three actions** (accept-canonical / accept-context /
discard) plus bulk variants. Finalize is per-category.

This bundle is the **first instance** of the Pulse Curation pattern.
The pattern itself is bigger than this spec's scope — it covers any
bundle whose output is a multi-item structured rollup, and a future
retroactive adoption candidate is Profile Builder (whose `row.socials`
is half-an-instance today).

## Pass-1 pack details

### OfficialUpdates packs (three; share `OfficialUpdateItem`)

#### `official-blog-pack` — `content_type: 'official_blog_entry'`

**Input:** `row.url` (entity's primary website).
**Mechanic:** two-stage find-index + extract-posts.

*Find-index:* SerpApi (`engine: 'google'`) with `site:<row.url>
press OR blog OR news OR updates` to surface canonical index pages;
fallback to path-guessing (`/press`, `/news`, `/blog`, `/updates`,
RSS at `/feed`, `/rss`, `/atom.xml`, homepage).

*Extract-posts:* Firecrawl (lean for v1; production-grade), or
Tavily-crawl, or hand-rolled (HTTP + Cheerio + small RSS parser).
RSS wins when present.

**Provider-override seam:** `{ find?: 'serpapi' | 'self'; extract?:
'firecrawl' | 'tavily' | 'self' }` — split-stage because the
economies differ.

**Failure modes:** no robots.txt-allowed pages → `not_found`. 404 on
every candidate → `not_found`. JS-only sites with no SSR → v1
`not_found`; Firecrawl handles some.

#### `official-pressrelease-pack` — `content_type: 'official_press_release'`

**Input:** `entity_name` + optional `row.url` (helps disambiguate).
**Output:** entries on PR wire services (PRNewswire, BusinessWire,
GlobeNewswire, etc.) that are the entity's verbatim release —
NOT third-party coverage.

**Mechanic:** query each wire service for `"<entity_name>"`, filter
results where the *byline* is the entity (or its PR team / agency
of record). Wire-service detection is URL-pattern based
(`prnewswire.com/news-releases/...`, etc.).

**Providers, free first:** Google News RSS site-restricted to wire
services; GDELT with publisher-filter; SerpApi (`engine: 'google'`
with site-restrict) as paid override.

**Failure modes:** zero releases → `not_found`. Wire-service block /
paywall → `not_found` per source, continue across the others.

#### `official-social-posts-pack` — `content_type: 'official_social_post_item'`

**Input:** `row.socials[]` — the entity's accepted social account
URLs (from a prior Profile Builder run).
**Output:** the entity's *own* recent posts across those platforms.

**Mechanic:** walk each social URL; fetch recent posts (most-recent
20 per platform); normalize into `OfficialUpdateItem` with
`platform` field set.

**Providers:** firecrawl or per-platform scraping. The
`platforms_skipped[]` field captures platforms that block scrapers
(private profiles, geo-blocked, paywall).

**Failure modes:** `row.socials` empty → `not_found` with hint
("run Profile Builder first"). All platforms inaccessible →
`error`. Some platforms inaccessible → emit in `platforms_skipped`,
continue.

### MediaMention packs (three; share `MediaMentionItem`)

#### `media-news-coverage-pack` — `content_type: 'news_coverage'`

**Input:** `entity_name` + optional `entity_type`.
**Output:** standard news articles ABOUT the entity (the entity is
the primary subject).

**Mechanic:** query news APIs, classify each result for primary-
subject vs. passing-mention (LLM step or heuristic: title contains
entity_name, snippet's first sentence references entity). Pass
items classified as primary-subject; emit the rest as zero relevance
with reasoning.

**Providers, free first:** Google News RSS (v1 default), GDELT,
NewsAPI.org; SerpApi `engine: 'google_news'` as paid override.

#### `media-thematic-pack` — `content_type: 'thematic_inclusion'`

**Input:** `entity_name` + `relevance_context` (the brief; needed
for thematic detection).
**Output:** articles where the entity is *one of several* examples
in a broader trend piece (listicles, "among other foundations",
sector roundups).

**Mechanic:** query news APIs broadly, then run LLM detection on
each candidate: "is the entity a primary subject, or one of many
examples?" Items in the latter bucket pass to this pack; others
fall to `media-news-coverage-pack`.

**Providers:** same as news-coverage (same connectors, different
post-classification step).

**Why separate from news-coverage:** thematic inclusion is often
*more* relevant to a fundraise context than direct coverage —
"the foundation funded apprenticeship programs" inside a list of
seven similar foundations is exactly the relevance signal Reach
University would want. The split lets the user triage by intent.

#### `media-deep-analysis-pack` — `content_type: 'deep_analysis'`

**Input:** `entity_name`.
**Output:** long-form pieces where the entity IS the story —
profiles, investigative work, in-depth analysis.

**Mechanic:** query long-form-leaning sources (Substack search,
The Atlantic, ProPublica, industry journals, academic indexes);
filter by `word_count > 1500` heuristic; LLM-confirm "is this a
deep treatment of the entity?"

**Providers:** SerpApi `engine: 'google'` site-restricted to
long-form publishers; Google Scholar for academic-leaning;
Substack-specific search. None free-tier-perfect; this is the
expensive pack of the bundle.

**Failure modes:** zero matches → `not_found` (deep analysis is
rare and that's fine).

### SocialsMentions pack (one; uses `SocialsMentionItem`)

#### `socials-mentions-pack` — third-party mentions across platforms

**Input:** `entity_name` + `row.socials[]` (to filter OUT the
entity's own posts).
**Output:** posts that mention the entity but were NOT posted by
the entity's own accounts. One pack handles all platforms; the
`platform` field discriminates per item.

**Mechanic:** for each platform in scope (`linkedin`, `x`, `bluesky`,
`youtube`, `facebook`, `instagram`), construct a query with
`"<entity_name>"` quoted + platform restriction (SerpApi
`engine: 'google'` with `site:<platform>` is the cheapest path).
Filter results where the author URL matches any URL in
`row.socials[]` — those are the entity's own posts, exclude them
(they belong to the OfficialUpdate category, not here).

**Providers:** SerpApi default (Google site-restricted across
platforms in parallel). Per-platform native APIs as future peers
where they exist and are affordable.

**Failure modes:** zero mentions → `not_found`. Platform rate-limit
→ partial; record the throttled platform in `meta.by_provider`.

## Pass-2 rollup-agent details

Each rollup-agent is an LLM-orchestrated process, not a single API
call. The agent:

1. Reads all pass-1 results for its category (e.g. for
   `official-updates-rollup-agent`: the outputs of the three
   OfficialUpdate packs).
2. Dedupes items by canonical-URL + title-similarity (per Open
   question on the algorithm).
3. Runs per-item LLM scoring against `relevance_context` (per the
   cost-discipline pattern; batched per row).
4. Generates `summary` + `themes` via a second LLM call that reads
   the deduped, scored items.
5. Builds the indexed views (`by_content_type`, `most_recent`,
   `most_relevant`).
6. Emits the typed Rollup record into `row.<category>_pulse.current.raw_output`.

**Failure modes:** any single pass-1 pack failing is graceful — the
rollup still produces a Rollup from the surviving inputs, with the
failed pack recorded in `meta.by_pack` (count = 0). All pass-1 packs
in a category failing → the rollup-agent emits `error` and the
bundle reports the category as failed.

**Provider-override:** rollup-agents respect `provider_override.score:
'llm' | 'keywords-only' | 'none'` for the scoring step. The
synthesis step (summary + themes) is LLM-only; it skips entirely if
`scoring: 'none'` is set, with a reasoned warning in `meta`.

<!-- Legacy per-pack detail sections (`official-site-updates-pack`,
     `news-mentions-pack`, `social-pulse-pack`) removed 2026-06-02.
     The new per-category framing is in "Pass-1 pack details" above
     (seven packs across three categories) and "Pass-2 rollup-agent
     details" (three rollup agents). The legacy `social-pulse-pack`
     decomposed into `official-social-posts-pack` (entity's own posts
     in OfficialUpdates) and `socials-mentions-pack` (third-party
     mentions in SocialsMentions). -->

> *Per-pack detail sections for the legacy `official-site-updates-pack`,
> `news-mentions-pack`, and `social-pulse-pack` were removed in the
> 2026-06-02 restructure. The new per-category framing lives in
> "Pass-1 pack details" and "Pass-2 rollup-agent details" above. The
> legacy `social-pulse-pack` decomposed into
> `official-social-posts-pack` (entity's own posts — OfficialUpdates
> category) and `socials-mentions-pack` (third-party mentions —
> SocialsMentions category).*
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
  Mentions vs … the working name captures both directions (the
  entity's voice + outside voice). Confirm or rename.
- ~~**One target column or three?**~~ — RESOLVED 2026-06-02 as
  **three target columns**, one per category, each holding a
  `PulseCategoryState<Rollup>` per [[Pulse-Curation-Layer-and-UI]].
  The three-layer curation state argues against collapsing.
- ~~**News provider priority.**~~ — RESOLVED 2026-06-02 as Google
  News RSS first, GDELT immediate peer; SerpApi available behind
  override but never default.
- ~~**Agent-pack pattern formalization.**~~ — Now affirmed and
  expanded by the 2026-06-02 restructure: this bundle has FOUR
  agent-bound packs (one pass-1 — `official-social-posts-pack`
  walks `row.socials` with LLM extraction — plus all three pass-2
  rollup-agents). The
  [[../blueprints/Packs-and-Bundles-Pattern]] addendum becomes a
  blocker for ship; needs to formalize agent-pack semantics
  (dependencies, retry, partial-failure, the LLM step) before this
  bundle's pass-2 is implementable.
- **Per-bundle cost budget.** Same fan-out-arithmetic concern as
  before but multiplied by the 7+3 structure. At the new shape:
  7 pass-1 packs × 67 rows × ~10-20 items each + 3 pass-2 rollup
  syntheses × 67 rows = LLM scoring on the order of 7,000-14,000
  cells + 200 syntheses. Cost discipline (batching, keyword
  pre-filter, Haiku-class) keeps it viable but a pre-fire estimate
  in Decision §10's RR becomes much more load-bearing. v1 ships
  without budget enforcement.
- **Skill registration.** Three candidate chat verbs now —
  `/entity-pulse` (whole bundle), `/voice-of-entity` (just
  OfficialUpdates), `/who-mentions-us` (MediaMentions +
  SocialsMentions). Decide as the bundle ships.
- **Recency window per pack.** Defaults per the legacy version
  (12mo official, 6mo news) carry across to the renamed packs;
  per-fire override surface is v2 candidate.
- **Sentiment in `media_news_coverage`.** v1 leaves null; v2
  candidate.
- **De-dup across packs WITHIN a category.** The rollup-agent
  dedupes by canonical-URL + title-similarity inside its category
  (e.g. a press release picked up by both
  `official-pressrelease-pack` AND `media-news-coverage-pack`
  appears once in the OfficialUpdates rollup, once in the
  MediaMentions rollup — two different categories, two
  different rollups, and that's intended). Cross-category dedupe
  is not done; the human triages each category independently and
  can recognize cross-category duplicates if it matters.
- **De-dup ACROSS pack runs (re-fire).** New question raised by
  the Pulse Curation Layer: when a re-fire produces an item with
  the same URL as a previously-finalized canonical entry, the
  rollup-agent should mark `previously_accepted: true` in the new
  raw_output's `meta` per item, so the curation UI can de-emphasize
  but not silently drop. Aligns with the curation spec's "Re-fire
  merge resolution" open question — same question, two-spec
  resolution.
- **`relevance_context` resolution UX.** The three-tier resolution
  (per-fire → record_set → bundle default) is locked in the bundle
  config, but Pack Runner / Request Reviewer chrome for editing /
  inheriting / overriding hasn't been designed. UX work belongs in
  [[Pulse-Curation-Layer-and-UI]]'s sibling spec — or here as
  this bundle's Request Reviewer view.

## Migration / first concrete implementation step

The 2026-06-02 restructure makes the bundle a meaningfully bigger
landing — 7 pass-1 packs + 3 pass-2 rollup-agents + a curation
layer + three new connectors. Smallest-shippable now sequences
across several PRs:

1. **`media-news-coverage-pack` standalone** (free path only: Google
   News RSS). Single-pack mini-bundle `news-pulse`. Output type
   `MediaMentionItem[]` (no rollup yet; just the list per pack-1).
   No curation layer yet; just write to a transient column. Purpose:
   get the pack-runner UI exercised against a non-`socials` target
   column; signal "is this useful?" without paying for any LLM
   scoring (`provider_override.score: 'none'`).
2. **Add `confidence` scoring** to pack-1 output. Still no LLM
   relevance; confidence is verification-driven (URL resolves, entity
   in snippet). v1 of the confidence pipeline.
3. **Pulse Curation Layer minimum** ([[Pulse-Curation-Layer-and-UI]]).
   Three layers (raw_output / curated_output / finalized_output) for
   the single existing category. Response Reviewer surface gets per-
   category card chrome and the three triage actions. Profile Builder
   retroactive adoption STAYS OUT — it's the cleanest test of the
   pattern in isolation first.
4. **Add `media-thematic-pack` + `media-deep-analysis-pack`** and the
   `media-mentions-rollup-agent` (pass 2). Now the bundle has one full
   category with rollup synthesis. Decision §10's adaptive RR ships in
   parallel to handle the bundle-request JSON view.
5. **Add OfficialUpdates packs** (blog + pressrelease + own-socials)
   and `official-updates-rollup-agent`. Multi-category curation.
6. **Add SocialsMentions pack + rollup-agent.** Full bundle.
7. **(Parallel)** SerpApi connector lands when first needed (likely
   in step 4 for the long-form sources of `media-deep-analysis-pack`).

Per the branch-cadence rule: trunk for single-file additions
(connectors, types) and small spec edits; named branch + PR for any
PR-shaped feature step above. The Pulse Curation Layer (step 3) is
unambiguously a branch.

## Related

- [[Pulse-Curation-Layer-and-UI]] — the three-layer (raw /
  curated / finalized) data model + per-item triage UX this
  bundle's outputs live in. Entity Pulse is the first instance.
- [[../blueprints/Packs-and-Bundles-Pattern]] — the pattern this
  bundle instances. Pulse-shaped bundles (rollups + curation +
  agent packs + two-pass) are a candidate addendum to the
  blueprint when this lands.
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
