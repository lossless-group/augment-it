---
title: "Response Reviewer Shell and Content-Reader Mode — Response Reviewer becomes a wrapper whose inner review UI swaps based on what the bundle that fired actually produced"
lede: "Response Reviewer was built to answer one question, well: 'is this URL the right one?' That's the right question for socials packs (linkedin, x, wikipedia, bluesky) — the candidate is a single URL, the action is accept-or-reject. It's the wrong question for content-shaped packs (official-blog, official-pressrelease, official-social-posts, future YouTube / podcast / RSS packs). The unit of work there is an *article* the operator wants to *read*, not a URL to triage — and the recently-shipped audit (1,109 OfficialPulse responses, 3 accepts, 99.7% reject rate) is what that mismatch looks like at scale. This spec splits Response Reviewer into a **shell** (entity selector, pack-filter chips, navigation, response-store connection) and a swappable **review mode** mounted inside the shell. The bundle that fired the responses declares which mode it pairs with — `profile-builder` → `candidate-triage` (today's UI), `entity-pulse` → `content-reader` (new). The content-reader's job is to show the operator what was found and let them include / exclude items from a downstream Jina ingest queue, not to accept individual URLs into row columns. First slice ships the shell pattern + the content-reader mode for `official-blog-pack` + `official-pressrelease-pack` against funder blog / press / RSS sources — articles only, no video / no social posts yet, expanding to those modes in follow-up. Composes with [[Per-Client-Privacy-and-the-Path-Off-Local]] (the Jina-ingested content lands in `clients/reach-edu/corpus/`), [[OfficialPulse-URLs-Appear-as-Junk-in-Promoted-Versions]] (this is the audit's prescribed replacement for per-URL triage on the OfficialPulse packs), and [[Packs-and-Bundles-Pattern]] (the bundle definition grows a `review_mode` field). Treats [[Response-Reviewer-and-Response-Store]] as the prior art whose shell scaffolding gets refactored, not replaced."
date_created: 2026-06-05
date_modified: 2026-06-05
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
semantic_version: 0.0.0.2
revisions:
  - 2026-06-05 — Initial draft (0.0.0.1).
  - 2026-06-05 — Operator direction on Open Q3 (lazy vs eager Jina) and the interaction shape. **Lazy + per-record trigger + preview-then-add.** Closes Q3 and Q5 (no `ingest_state` field on ResponseRecord — the corpus markdown file's existence IS the include signal; absence is the absence of an add decision; no separate "exclude" state needed in v0.0.1). New §[Per-record preview and add](#per-record-preview-and-add) describes the actual interaction. New §[Corpus markdown shape](#corpus-markdown-shape) declares the frontmatter contract — title (operator-editable), exact_url, fetched_at, plus an `extra_metadata` catchall for whatever Jina returns that we don't have a slot for, plus operator-added tags. New capability list (`content_ingest.preview`, `corpus.add`, `corpus.list_for_record`) replaces the earlier "Option A — new column on ResponseRecord" lean — corpus is the source of truth, response-store doesn't grow new state. §[Ingest-queue state](#ingest-queue-state-superseded) marked superseded; bulk-action affordances pulled back from v0.0.1 (operator-curates-per-item-with-tags is the explicit unit of work, not bulk-pipe-to-queue). §First slice tightened to match.
tags:
  - Spec
  - Augment-It
  - Response-Reviewer
  - Shell-Pattern
  - Pluggable-Review-Mode
  - Content-Reader
  - Candidate-Triage
  - Entity-Pulse
  - Funder-Corpus
  - Jina-Ai
  - Bundle-Declaration
  - Articles
  - Blog-Posts
  - RSS
status: Draft
---

# Response Reviewer Shell and Content-Reader Mode

## What this is

A refactor of Response Reviewer into a **shell + pluggable review
mode** plus a NEW review mode (`content-reader`) for content-shaped
pack responses.

The shell stays anchored where Response Reviewer lives today
(`apps/response-reviewer/`) and owns the parts that don't depend on
what the bundle produced:

- Entity selector + per-entity response counts.
- Pack-filter chip row (the bs / yt / f / wp / ig style chips visible
  in the current UI — extends to entity-pulse packs).
- Connection to response-store (`response.list`, `response.flag`,
  `response.accept`, `response.delete`).
- Navigation between entities; "next entity with unreviewed
  responses" affordance.
- Where the rendered selection state persists (per-entity, per-pack
  filter, per-mode).

The review mode is mounted **inside** the shell as a swappable
component and owns everything that depends on what was produced:

- The unit of work (URL? article? video?).
- The presented metadata (chip, title, snippet, date, thumbnail,
  ...).
- The action verbs (accept-reject, include-exclude, queue-for-ingest,
  needs-review, ...).
- How the inner list paginates / filters / bulk-acts.

The bundle that fired the responses declares which mode the shell
mounts. Two modes ship in v0.0.1:

1. **`candidate-triage`** — today's UI, renamed and lifted into a
   sibling component. Paired with `profile-builder` and the per-pack
   social bundles. No semantic change; just refactored into the
   shell.
2. **`content-reader`** — NEW. Paired with `entity-pulse`. First
   slice covers blog posts and press releases.

## Why now

Three forcing functions, all named in other artifacts this session:

1. **The audit.** 1,982 responses in response-store; 1,109 (56%) from
   the three OfficialPulse packs; combined 3-accept rate. The
   audit ([[OfficialPulse-URLs-Appear-as-Junk-in-Promoted-Versions]])
   established that the URL-as-unit-of-work is the wrong question
   for content-shaped packs — the operator doesn't want to triage
   1,109 URLs, they want to read what's behind them and decide
   what to ingest into a corpus.
2. **The per-client corpus direction.**
   [[Per-Client-Privacy-and-the-Path-Off-Local]] §Path D commits to
   a Jina-pull-to-markdown pipeline that writes content to
   `clients/<slug>/corpus/`. That pipeline needs a feeder. The
   content-reader mode IS the feeder: the operator browses what was
   found, marks items "include", and a downstream worker reads the
   include list, fires Jina against each URL, dedupes, writes
   markdown. Without the content-reader UI, the operator has no way
   to curate the seed list.
3. **The two-units-of-work mismatch.** Today's Response Reviewer
   shows `official-pressrelease` candidates as URLs with accept /
   reject / partial buttons — the same affordance as a LinkedIn
   pack candidate. That works for "is this the LinkedIn page for
   Annie E. Casey?" (binary, structural). It does NOT work for
   "is this press release relevant to Annie E. Casey?" (semantic,
   requires reading). Building one surface that does both well is
   the right move; building one surface that does both poorly is
   the current state.

## The shell — what stays

Refactored, not rewritten. Today's response-reviewer App.svelte
gets split into:

```
apps/response-reviewer/
  src/
    App.svelte               // shell mount, layout, mode resolution
    components/
      EntityHeader.svelte    // entity selector + count + pack chips
      ModeHost.svelte        // the swap surface — mounts one mode
      NavFooter.svelte       // next-entity, prev-entity, "all done"
    modes/
      candidate-triage/      // today's UI lifted here
        TriageList.svelte
        TriageRow.svelte
        accept.ts
      content-reader/        // NEW (this spec)
        ContentList.svelte
        ContentRow.svelte
        ingest-queue.ts
    state/
      reviewer.svelte.ts     // entity, pack-filter, mode resolution
      ingest-queue.svelte.ts // include / exclude / pending sets
    logic/
      mode-for-bundle.ts     // bundle_id → review_mode lookup
```

The shell handles:

- Loading `response.list` for the active entity.
- Computing the bundle distribution (which bundle_ids appear in the
  response set for this entity).
- Resolving the dominant bundle's `review_mode` (see
  §[Mode resolution](#mode-resolution)).
- Mounting `ModeHost` with the resolved mode + the filtered
  responses + a callback set for accept / reject / include /
  exclude that routes through the response-store capabilities.
- Persisting per-entity selection state in `localStorage` so a
  partial session survives reload.

The entity header (chip row + count) stays effectively unchanged
from today's UI. The pack-filter chips gain `bg` (official-blog),
`pr` (official-pressrelease), `sp` (official-social-posts) as new
entries beside the existing `in` / `x` / `bs` / `yt` / `f` / `wp` /
`ig`. New abbreviations follow the existing two-letter convention.

## Mode resolution

Each bundle declares its review_mode. A new field on the bundle
definition:

```ts
// services/social-search/src/entity-pulse/bundles.ts (extend)
type Bundle = {
  bundle_id: string;
  label: string;
  pack_ids: string[];
  // NEW
  review_mode: 'candidate-triage' | 'content-reader';
};
```

Default for any bundle that omits `review_mode` is
`candidate-triage` — backwards-compat, no migration of existing
bundles needed at the data-model level.

For v0.0.1 the assignment is:

| bundle | review_mode |
|---|---|
| `profile-builder` | `candidate-triage` |
| `entity-pulse` | `content-reader` |
| (any future bundle) | `candidate-triage` until it declares otherwise |

If a single entity's response set contains responses from MULTIPLE
bundles (the current corpus does — a row often has both profile-builder
socials AND entity-pulse content responses), the shell shows a
**mode-tab row** above the ModeHost:

```
┌──────────────────────────────────────────┐
│ ENTITY: Annie E. Casey · 38 responses    │
│ [in] [x] [bs ✓] [yt ✓] [f ✓] [wp] [ig] │  ← pack-filter chips
│                                          │
│ ┌─[Socials (17)]─[Content (21)]──────┐ │  ← mode tabs
│ │ <ModeHost mounts active mode>      │ │
│ └────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

Selecting a tab switches the mounted mode. Tab order: candidate-triage
first (it's the faster decision), content-reader second.

## Mode 1 — candidate-triage (existing, refactored)

What it owns:

- One row per response. Each row shows: pack chip (`linkedin`,
  `bluesky`, `wikipedia`, ...), confidence pill (0-100), URL
  (clickable), title from `structured.display_name` or
  response-store metadata.
- Action buttons: ✓ (flag good + accept), ✗ (flag wrong),
  ~ (flag partial), → accept (write to row, set `accepted: true`).
- Filter affordances: by pack chip in the header, by flag state.

Routes to the same response-store capabilities as today:
`response.flag`, `response.accept`, `response.set_text`,
`response.set_structured`. No store-side changes; just relocation
of the component into `modes/candidate-triage/`.

## Mode 2 — content-reader (NEW)

The interesting half of this spec.

### Unit of work

One *article* (or feed item, or press release) — not one URL. The
display foregrounds the content metadata, the action verbs are
about ingestion, and the URL is a clickable but not primary affordance.

### What shows per row

```
┌──────────────────────────────────────────────────────────────┐
│ [pressrelease] [aecf.org]            Atlanta Beltline …     │
│ 2024-09-18 · 4-min read · prnewswire.com                     │
│                                                              │
│ The Annie E. Casey Foundation announced today that…          │
│ (excerpt — first 200 chars from Jina-fetched markdown if      │
│  available, otherwise from response.structured.snippet, else  │
│  empty)                                                       │
│                                                              │
│ [↗ open]  [+ include]  [− exclude]  [? needs review]         │
└──────────────────────────────────────────────────────────────┘
```

- **Pack chip** — `bg` / `pr` / `sp` mirroring the header
  filter chip.
- **Source-domain chip** — `prnewswire.com`, `news.google.com`,
  `aecf.org`, etc. Helps the operator scan domain at a glance.
- **Title** — from `response.structured.display_name` if present,
  fallback to `response_text` first line, fallback to the URL.
- **Publish date** — best-effort, from `structured.source_metadata.published_at`
  if set; surfaced in `YYYY-MM-DD` form so the eye can sort by
  recency.
- **Reading-time estimate** — computed from the Jina-fetched
  markdown's word count, or omitted if Jina hasn't fired yet.
- **Source-domain** — the response URL's hostname, second mention
  in the row but useful for the date+domain compact summary line.
- **Excerpt** — first ~200 chars of the body. Comes from
  Jina-fetched markdown when available (cached per response); falls
  back to `response.structured.snippet`; renders muted "no excerpt
  yet" if neither is present.
- **Actions** — ↗ open (new tab), + include, − exclude, ? needs
  review. Each writes to a *separate state* from
  `response.accepted` — see §[Ingest-queue state](#ingest-queue-state).

### Per-record preview and add

The load-bearing interaction shape. **Lazy** + **per-record
trigger** + **preview-then-add with operator-edited title and tags**.

Sequence per operator step:

1. **Operator is on a record.** Either viewing the row in
   records-surface or having drilled into one entity inside
   content-reader.
2. **Operator clicks "Preview content."** Per-record button. The
   shell fires `content_ingest.preview { record_id }` which kicks
   off Jina fetches for every content-reader-mode response tied to
   that record (i.e., responses whose `pack_id` is in a bundle
   declaring `review_mode: 'content-reader'`). Background-batched
   on the server, returns as each fetch completes via the existing
   event broadcast pattern (`content_ingest.preview.ready` with
   the response_id and the rendered preview).
3. **Previews render progressively.** Each response that comes
   back populates: editable title (Jina-extracted, operator can
   correct), excerpt (first ~500 chars of the markdown body),
   `exact_url`, `fetched_at`, source-domain chip, reading-time
   estimate, a tags input pre-filled with any auto-detectable tags
   (none in v0.0.1), and the `+ add to corpus` button.
4. **Operator reviews each preview.** Edits title if needed.
   Adds tags (free-text input, comma- or enter-separated, sticky
   so the same tag added on multiple items is one click each).
   Clicks `+ add to corpus`.
5. **The add fires `corpus.add { client_id, record_id, response_id,
   title, tags }`.** The server reads the cached Jina markdown
   for that response (still warm from the preview fetch), composes
   the frontmatter, writes the markdown file to
   `clients/<slug>/corpus/<funder-slug>/<YYYY-MM-DD>_<title-slug>.md`,
   commits to the per-client repo (or stages — see Open Q on commit
   cadence). UI updates the row to show an "in corpus" badge.
6. **Operator moves on.** Items they don't add to corpus simply
   aren't added — no explicit "exclude" verb, no "needs review"
   state. The absence of a corpus file is the absence of a
   decision-to-add. If the operator returns to the record later
   and re-triggers preview, the same responses re-render; the
   "in corpus" badge is computed by `corpus.list_for_record` and
   draws from the file system.

### Why no ingest-queue state on ResponseRecord

(This section supersedes the v0.0.0.1 lean on Option A.)

The corpus markdown file IS the include signal. The file system
under `clients/<slug>/corpus/<funder-slug>/` is the source of
truth for "what's been added." Response-store doesn't grow new
columns; the shell queries `corpus.list_for_record` to mark
which responses already have a corpus entry. If the operator
later wants to re-evaluate a previously-skipped response, they
re-trigger preview — there's no stuck "exclude" state to clear.

This collapses the spec significantly. Trade-offs accepted:

- No history of "operator considered and rejected." If we later
  want to track skip-decisions (so the operator doesn't waste time
  re-reviewing the same junk on every preview pass), a
  `responses_skipped.json` log next to the corpus directory is the
  follow-up. Not v0.0.1.
- No batch / bulk-action affordances in v0.0.1. The operator's
  unit of work IS one preview at a time with custom tags — bulk
  actions on a tag-and-edit workflow don't compose cleanly. If a
  bulk shape emerges (e.g., "add all funder-domain results with
  no editing"), it's an additive v0.0.2 affordance.
- The 1,109 OfficialPulse responses already in the store work
  with this model with zero migration — they just show up
  un-badged when their record is previewed.

### Corpus markdown shape

The file written by `corpus.add` has frontmatter + body. The
frontmatter declares what was fetched, when, from where, and with
what operator-supplied tags + title. An `extra_metadata` catchall
holds whatever Jina (or the upstream pack response) returned that
the schema doesn't have an explicit field for — so we never lose
useful data even when the field set evolves.

```markdown
---
title: "Operator-edited title here"
exact_url: "https://aecf.org/blog/2024-09-18-new-grants-announced"
fetched_at: 2026-06-05T22:15:33Z
record_id: row_rs_promoted_mq1cuz03_0fcghc_7
response_id: rsp_mpm0mu7b_e55rqn
client_id: reach-edu
funder_slug: annie-e-casey
pack_id: official-blog-pack
tags:
  - K-12-education
  - urban-equity
extra_metadata:
  source_published_at: 2024-09-18
  reading_time_minutes: 4
  jina_status: 200
  content_hash: sha256:9f8a7e6d…
  source_metadata:        # whatever pack-level metadata came in
    rss_guid: "https://aecf.org/?p=12345"
    feed_url: "https://aecf.org/feed/"
---

<the Jina-fetched markdown body, verbatim>
```

Field rules:

- **`title`** — operator-editable at preview time. Defaults to
  the Jina-extracted page title (`<h1>` or `<title>`). Free text.
- **`exact_url`** — the URL Jina was called against, not a
  canonicalized form. The canonical form lives in
  `extra_metadata.canonical_url` when known. Preserves what
  actually got fetched so failures are reproducible.
- **`fetched_at`** — ISO 8601 timestamp of the Jina call. Used by
  the dedup logic (a later re-fetch of the same URL with a newer
  `fetched_at` becomes a *new* file, not an overwrite; old file
  stays as historical record).
- **`record_id` / `response_id`** — both pointers back. record_id
  for "which funder row drove this add," response_id for "which
  pack response surfaced this URL." Either could be looked up via
  the other in future, but storing both keeps the markdown
  self-contained.
- **`client_id` + `funder_slug`** — denormalized for at-rest
  discoverability. A file dropped into a search tool without a DB
  still tells you whose corpus it belongs to.
- **`pack_id`** — provenance: which pack returned the URL. Useful
  later when we want to evaluate which packs produce
  actually-ingested content.
- **`tags`** — operator-added array. Free-form for v0.0.1;
  controlled vocabulary (per-client tag taxonomy) is a follow-up
  if/when the operator hits friction.
- **`extra_metadata`** — catchall map. Anything Jina returns
  that we don't have a top-level field for (canonical_url,
  source_published_at, reading_time_minutes, jina_status,
  content_hash) lives here. Nested `source_metadata` carries the
  pack-response's `structured.source_metadata` as-is — RSS guid,
  feed URL, etc.

Filename: `<YYYY-MM-DD>_<title-slug>.md`. Date is `fetched_at`
truncated to a day. Title slug is the operator-edited title
lower-cased, non-alphanumerics → `-`, clipped to 60 chars. If
two files would collide (same date, same slug), append a short
random suffix.

### New capabilities

This spec adds three; nothing on response-store needs to change.

```ts
// services/content-ingest (NEW service, sibling to row-store / response-store)
'content_ingest.preview'
  args:    { record_id: string; force_refetch?: boolean }
  returns: { previews: Array<{
              response_id: string;
              status: 'fetching' | 'ready' | 'failed';
              title?: string;
              excerpt?: string;
              fetched_at?: string;
              exact_url: string;
              extra_metadata?: Record<string, unknown>;
              error?: string;
            }> }
  // Broadcasts content_ingest.preview.ready events per response_id
  // as each Jina fetch resolves.

'corpus.add'
  args:    {
             client_id: string;
             record_id: string;
             response_id: string;
             title: string;
             tags: string[];
           }
  returns: { corpus_path: string; written_at: string }
  // Reads the cached Jina markdown for response_id (warmed by
  // content_ingest.preview), composes frontmatter, writes the file
  // under clients/<client_id>/corpus/<funder_slug>/...

'corpus.list_for_record'
  args:    { client_id: string; record_id: string }
  returns: { entries: Array<{
              corpus_path: string;
              response_id: string;
              exact_url: string;
              fetched_at: string;
              title: string;
              tags: string[];
            }> }
  // Reads the per-client corpus directory; filters to entries
  // whose frontmatter.record_id matches. Used by the UI to draw
  // "in corpus" badges and to dedup re-previews.
```

The new `content-ingest` service owns the Jina round-trips and
keeps a short-lived cache of `(exact_url → markdown body, fetched_at)`
so the `corpus.add` immediately following `content_ingest.preview`
doesn't have to re-fetch. Cache TTL: 30 minutes (long enough for
operator review of one record's previews; short enough that re-trigger
genuinely re-fetches).

### What does NOT show

Deliberately:

- No per-URL accept-to-row-column affordance. That's
  candidate-triage's job; mixing them in one UI is the current
  problem.
- No Jina-fetched full-body inline by default. Expanding to read
  the full markdown is a click into a detail pane / drawer; the
  list view stays scannable.
- No edit-the-response-text affordance. The candidate-triage mode
  has `response.set_text` for that; content-reader is read +
  queue, not edit.

## First slice — what ships in v0.0.1

To stay shippable:

- The shell refactor (App.svelte split, EntityHeader, ModeHost,
  NavFooter).
- The candidate-triage mode lifted into `modes/candidate-triage/`
  with no semantic change.
- The content-reader mode for `official-blog-pack` and
  `official-pressrelease-pack` responses only. Articles + press
  releases against the funder's own site or RSS — the simplest
  case the user explicitly named.
- The per-record **"Preview content"** trigger button — fires
  `content_ingest.preview { record_id }` and surfaces previews
  as they resolve.
- The per-preview **edit title + add tags + `+ add to corpus`**
  interaction.
- The new `content-ingest` service running Jina against
  `r.jina.ai/<url>` with the 30-minute preview cache.
- The three new capabilities (`content_ingest.preview`,
  `corpus.add`, `corpus.list_for_record`).
- The corpus markdown frontmatter contract (§[Corpus markdown
  shape](#corpus-markdown-shape)).
- The "in corpus" badge in the preview list, driven by
  `corpus.list_for_record`.
- The mode-tabs row when an entity has responses from multiple
  bundles.
- The bundle definition's `review_mode` field, plus the v0.0.1
  assignments (`profile-builder` → candidate-triage,
  `entity-pulse` → content-reader).

What's deferred to follow-ups (named here so the next session has
landing spots):

- The Jina ingest worker itself — its own spec under
  `clients/reach-edu/` once that submodule has its first commit.
- A `youtube-reader` mode for `youtube-pack` + `official-social-posts-pack`
  YouTube responses — title, thumbnail, channel, runtime; same
  include / exclude affordances, but tuned for video-shaped
  content.
- A `social-post-reader` mode for X / Bluesky / Facebook /
  Instagram pack responses — single-post focus, embed view, same
  include / exclude.
- A `corpus-browser` surface — separate microfrontend that shows
  what's been ingested per client, search across the corpus, drill
  into a single .md. Reads from `clients/<slug>/corpus/`, not
  response-store.
- Multi-bundle mode-tab UX refinements (drag-to-reorder tabs,
  collapse-when-only-one, etc.). v0.0.1 ships the simplest version.

## What this is NOT trying to decide

- The Jina pipeline mechanics (URL canonicalization rules, content-hash
  dedup approach, RSS feed expansion, retry behavior). All sibling
  spec.
- Where the corpus lives — already decided by
  [[Per-Client-Privacy-and-the-Path-Off-Local]] §Path D:
  `clients/<slug>/corpus/`.
- The corpus query / retrieval surface — sibling spec.
- The candidate-triage UX (today's UI keeps its current semantics
  exactly; only the file location moves).
- Whether the OfficialPulse-pack response volume that ALREADY exists
  in response-store (1,109 responses) gets auto-included in the first
  ingest pass or whether the operator triages them through
  content-reader first. Default: operator triages, since most of the
  volume IS noise (news.google.com weakly bound).

## Open questions

1. **Bundle vs pack as the declaration unit.** Today the bundle
   declares the review_mode. But a future bundle might bundle packs
   that warrant different modes (e.g., a `whole-presence` bundle
   that runs both `linkedin-pack` and `official-blog-pack`). Should
   the *pack* declare its preferred mode and the bundle inherit?
   Lean: bundle declares, the mode-tabs row handles mixed bundles.
   Re-examine when a real mixed-mode bundle ships.
2. **Multi-entity preview.** v0.0.1 fires Jina per-record on
   explicit operator trigger — clean for one entity, slow for a
   batch. Does a "preview all entities in this record set" affordance
   make sense later? Defer until the operator hits the friction.
3. ~~**Pre-Jina excerpt source.**~~ **Resolved 2026-06-05 (v0.0.0.2):**
   lazy + per-record trigger. Operator clicks "Preview content"
   for one record; Jina fires for that record's content-reader-mode
   responses; previews render as fetches resolve.
4. **Reading the full body.** Where does the expand-to-read-full
   click land — a side drawer in the reviewer, a new route, a new
   microfrontend (`corpus-reader`)? v0.0.1 lean: side drawer; a
   real corpus-reader is the follow-up surface that reads from
   `clients/<slug>/corpus/`.
5. ~~**Excluded items.**~~ **Resolved 2026-06-05 (v0.0.0.2):**
   no `ingest_state` on ResponseRecord; corpus markdown file
   existence IS the include signal; absence is the absence of an
   add decision. If skip-history becomes useful later (so the
   operator doesn't re-review the same junk), a `responses_skipped.json`
   log next to the corpus directory is the follow-up.
6. **Commit cadence in the client repo.** `corpus.add` writes a
   markdown file. Does each write also `git commit` (one file per
   commit; very high commit volume), or stage in a working tree
   and the operator commits explicitly when they're done with a
   record (one commit per record; commit message = record name +
   N files)? Lean: stage-and-explicit-commit. v0.0.1 surfaces a
   "Commit corpus changes" button on the record once `corpus.add`
   has fired at least once. Tracked here so the next session has
   a decision-point.
7. **Tag controlled vocabulary.** v0.0.1 ships free-text tags.
   Per-client tag taxonomies (a `tags.yaml` in the client repo
   declaring which tags are sanctioned) become useful when the
   corpus crosses a threshold where free-text drifts (variant
   spellings, synonyms, etc.). Defer until the friction shows.
8. **Re-fetch semantics.** `content_ingest.preview` accepts
   `force_refetch`. The default is "use cache if warm." But what
   if the URL's content has changed since the original fetch?
   v0.0.1 says: operator's job to re-trigger with force_refetch
   when they suspect change. A periodic re-fetch loop (cron) is
   the follow-up if the operator finds themselves doing it often.

## See also

- [[Response-Reviewer-and-Response-Store]] — the original
  Response Reviewer spec; this spec evolves the shell layer
  defined there but inherits the response-store contract whole.
- [[Why-Response-Reviewer-and-Highlight-Collector-Exist]] — the
  conceptual ancestor; explains why response-store-as-first-class
  is what makes this swap-the-UI move cheap in the first place.
- [[OfficialPulse-URLs-Appear-as-Junk-in-Promoted-Versions]] §What
  is actually wrong (still) — the audit that motivated this spec;
  names the URL-as-unit-of-work mismatch this spec resolves.
- [[Per-Client-Privacy-and-the-Path-Off-Local]] §Path D — where
  the Jina-ingested content this spec feeds eventually lands;
  `clients/<slug>/corpus/`.
- [[Packs-and-Bundles-Pattern]] §Row write-back — the existing
  bundle definition that gets the new `review_mode` field.
- [[Entity-Pulse-Bundle]] — the bundle that pairs with the new
  content-reader mode; sibling work, shipped in the recent arc.
- [[Per-Record-Iteration-as-Primary-Surface-for-Pack-Fires]] —
  the records-surface per-URL fire path; complementary, not
  overlapping. That surface fires packs and collects per-row
  acceptances; this surface reviews what packs produced.
- [[Connector-Inventory-and-Per-Record-Palette]] — the registry
  that knows which packs exist; the content-reader's pack-chip
  filter row reads its list from here.
- [[Flow-for-Bundles-Packs]] — the higher-level flow that this
  spec lives inside; Response Reviewer is one of the two destinations
  (along with Records Surface) for post-fire review.
