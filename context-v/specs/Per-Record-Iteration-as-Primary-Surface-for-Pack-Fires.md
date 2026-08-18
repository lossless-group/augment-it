---
title: "Per-Record Iteration as the Primary Surface for Pack and Bundle Fires — The Flow Rearranges Per Fire Type"
lede: >-
  A pack fired across 96 rows returned 0 found — so per-record iteration becomes primary and bulk fan-out waits until a chain is proven.
date_created: 2026-06-02
date_modified: 2026-06-02
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
semantic_version: 0.0.0.2
revisions:
  - 2026-06-02 — Initial draft (0.0.0.1).
  - 2026-06-02 — Added §"Request inspection — pre-fire preview + post-fire receipt" (0.0.0.2). Per-row, per-connector request shape must be inspectable both before firing (preview) and after firing (receipt). If SerpApi + Firecrawl + GDELT all fail across 96 records, the problem is almost certainly in the REQUEST shape — query construction, URL normalization, max_results cap, site-restrict operator — not in the connectors themselves. Without surfacing the actual request the user has no way to diagnose whether to fix the pack, the row data, or their own expectations. Extends Decision §10's Adaptive Request Reviewer concept from "per-fire pre-flight" to "per-row × per-connector inspection at any time."
tags:
  - Spec
  - Augment-It
  - Per-Record-Iteration
  - Pack-Fires
  - Bundle-Fires
  - Adaptive-Flow
  - Connector-Palette
  - Inline-Results
  - Records-Surface
  - UX-Rearchitecture
status: Draft
site_uuid: cb0ba020-5da6-4230-a1dc-0d41a707e71f
hex_code: 2omskw
date_authored_initial_draft: 2026-06-02
date_authored_current_draft: 2026-06-02
---

# Per-Record Iteration as the Primary Surface for Pack and Bundle Fires

## Why this exists

The 2026-06-02 session that tried to actually use the new Entity Pulse
Phase-1 packs (`official-blog-pack`, `official-pressrelease-pack`,
`official-social-posts-pack`) surfaced an architectural mismatch that the
previous specs missed because they hadn't been tried live yet.

The user fired Entity Blog on 96 rows. The fan-out reported "all settled."
Of those 96 fires:

| Outcome | Count |
|---|---|
| `found` | 0 |
| `not_found` | 90 |
| `error` | 6 |

The fire was a complete miss on the dataset because `official-blog-pack`'s
fallback discovery strategy (path-guessing `/feed`, `/rss`, `/blog`,
`/news`, `/press`) doesn't work on real foundation websites — they bury
content under custom slugs like `/grants-news`, `/our-work/stories`,
`/publications`. SerpApi `site:` search would solve it, but
`SERPAPI_API_KEY` wasn't set.

The user's lived experience:

1. Spent ~2 minutes assembling and firing the bundle.
2. Spent ~30 seconds navigating through Augment → (empty) Request
   Reviewer → Response Reviewer.
3. Saw 96 empty `not_found` rows mixed with pre-existing Profile Builder
   responses.
4. Had no way to tell at a glance whether ANY row had succeeded.
5. Had no per-record affordance to try a different connector when the
   first one failed.

The structural complaints in the user's own words:

> *"When I run a bundle/packs, I expect to see a certain Response Reviewer
> UI that ONLY SHOWS the target data in question. So, the UI from a
> previous run, or another bundle/pack run should not only not show at
> all, it should not even have to be hidden. There needs to be a DIRECT
> LINE from the bundle/packs creating the request, to the response
> reviewer."*

> *"Running 96 records is cool, but only after it's worked on 4–8
> individual records and target column values are coming back magically."*

> *"What would work better instead is if I sat there and ran, on the
> record itself, API calls that could plausibly solve for a missing or
> target field/column. Run SerpApi, error/blank/wrong → run again using
> Firecrawl. One by one, by hand."*

> *"I feel like this is a different remote. What we are doing is unseating
> some or rearranging some in a sequence based on the bundle/pack/prompt
> fired."*

This spec describes the system that addresses those complaints.

## What stays good — the lessons NOT to undo

The Response Reviewer for the Profile Builder socials bundle **worked
beautifully** by the end of the 2026-05 arc. The by-record card layout,
the per-(row × pack × provider) chip pattern, the inline URL editing,
the ✓-accepted badges, the per-pack-aware-accept handler that routes
into `row.socials.add` — all of that is correct UX for prompt-template-
style fires where you fan out across N rows and then triage the
candidate responses.

This spec does NOT touch that surface. The Profile Builder flow stays as
it is. The architectural problem is that the same Flow chrome was
applied to a fire type (pack/bundle) it was never designed for, and the
mismatch only became visible once a list-shaped pack actually fired
against real data.

The fix is **adaptive Flow sequencing**, not a single replacement.

## The new model — record-centric per-pack iteration

### Mental model

The previous mental model: *the user fires a bundle and triages
responses.* Records are the input; responses are the output; the user
moves through Augment (compose) → Request Reviewer (preview) → Response
Reviewer (triage) in a strict pipeline.

The new mental model for pack/bundle fires: *the user fills in missing
column values on records, one row at a time, by trying connectors until
one succeeds.* The record is both the input AND the surface where the
output appears. The flow is record → connector → result inline → next
connector or next record. Iteration over a small set is the natural
operation; bulk fan-out is a scale-up after the chain is proven.

### The new remote — Records Surface

Working name: **Records Surface** (the actual remote name TBD; could be
`apps/records-surface/` or could subsume an existing remote — see
"Migration / remote topology" below).

Per-record list scoped to the active pack/bundle. Each row shows:

- **Identity columns** — entity name, primary URL, anything else the
  pack needs to read from the row. Resolved per pack via a small
  `relevant_fields_for(pack_id)` lookup so different packs surface
  different identity columns (an org pack might show "Name + Website";
  a person pack might show "Name + LinkedIn URL").
- **Target column(s)** — the column(s) the pack is meant to fill. Shows
  the current value (often empty) and the place where new values land
  on a successful fire. For `official-blog-pack` that's
  `row.official_updates_pulse.blog_entries[]` (or whatever the curation
  shape lands as). For `linkedin-pack` it's `row.socials[linkedin]`.
- **Connector palette** — one chip per connector that can plausibly
  fill the target column for THIS pack. Default click fires through
  the pack's preferred connector chain; long-press picks an explicit
  connector. Same shape as the per-record palette per
  [[Connector-Inventory-and-Per-Record-Palette]].
- **Inline result block** — when a fire returns items, they render
  IN-PLACE on the row, not in a separate panel. The user reviews,
  accepts what's good, discards the rest, and the accepted values land
  in the target column directly.
- **Per-row history toggle** — the row remembers which connectors have
  been fired against it for the active pack and shows their outcomes
  (✓ found N / ✗ not_found / ⚠ error / ⏱ rate-limited). Re-fire is
  always allowed.

Every other column on the record is **hidden by default** but available
behind a per-row "show all fields" toggle. The default view is the
narrowest possible — just what's relevant to the pack the user is
operating on.

### Per-record fire-and-fallback loop — the killer interaction

The reason this surface exists. Walking a typical interaction:

```
Row: "Walton Family Foundation"
  Identity: name + url(waltonfamilyfoundation.org)
  Target:   official_updates_pulse.blog_entries[]
  Palette:  [serpapi] [firecrawl-map] [google-news-rss] [gdelt]

  → User clicks [serpapi]
  → Spinner spins for 2s
  → Result block renders inline: 7 candidate index URLs, all on
    waltonfamilyfoundation.org. The top one is /news. User clicks ✓.
  → official_updates_pulse.blog_index_url ← "https://waltonfamilyfoundation.org/news"
  → Row now shows the accepted value with the [serpapi] chip lit "found"
```

OR:

```
Row: "Charles Koch Foundation"
  Identity: name + url(charleskochfoundation.org)
  Palette:  [serpapi] [firecrawl-map] [google-news-rss] [gdelt]

  → User clicks [serpapi]
  → not_found / 0 candidates
  → Chip flips to "not_found" state
  → User clicks [firecrawl-map]
  → Result block renders inline: site map with 47 URLs. User scans, sees
    /our-work/news-publications, clicks it. Inline preview opens.
  → User clicks ✓
  → official_updates_pulse.blog_index_url ← that URL
```

OR:

```
Row: "Some Obscure Family Foundation"
  → User tries [serpapi] → not_found
  → User tries [firecrawl-map] → site has no news page
  → User tries [google-news-rss] → no coverage
  → User clicks "this entity has no blog" → row marked as no-data,
    won't surface in any "missing values" filter, audit trail records
    that all 3 connectors were tried
```

The pattern: **connector → inline result → accept-or-try-next → next row**.
No round-trip to a separate triage surface. No mixing with prior fires.
No bulk waste.

## Request inspection — pre-fire preview + post-fire receipt

A first-class affordance the previous specs missed, surfaced by the
2026-06-02 live test. When the user fires `[serpapi]` on a row and
gets back `not_found`, then fires `[firecrawl-map]` on the same row
and ALSO gets back `not_found`, then fires `[gdelt]` and also nothing
— and this pattern repeats across 96/96 records — the failure is NOT
in any one connector. The failure is in the **request shape** that
all three are receiving.

Without seeing the actual request that went out, the user cannot
distinguish between:

- The pack's query template is wrong (`site:row.url press OR blog OR
  news OR updates` versus a different operator construction)
- The row's URL field is malformed (`waltonfamilyfoundation.org` vs
  `https://www.waltonfamilyfoundation.org` vs trailing-slash variants
  vs http-not-https variants)
- The connector's per-call configuration is wrong (`max_results: 3`
  hiding the actual blog index past position 3; `engine: 'google'`
  when the operator wanted `engine: 'google_news'`)
- The pack handler is reading the wrong field off the row (looking for
  `url` when this dataset has `website`)
- The connector is silently rate-limited and returning empty (GDELT's
  throttle response that looks like 200-success-with-empty-results)
- The user's expectation is wrong (this entity genuinely has no public
  blog at all)

All five are recoverable failures. None are recoverable without
**seeing what was sent**.

### What gets surfaced

For every chip in the per-row palette, two affordances:

**Pre-fire preview** (hover / long-press / right-click on the chip BEFORE
firing). Renders the request that WILL be sent if the user clicks. Per
the chip's resolved connector, shows:

```
serpapi · about to send
─────────────────────────
endpoint: https://serpapi.com/search.json
params:
  engine:       "google"
  q:            'site:waltonfamilyfoundation.org press OR blog OR news OR updates'
  num:          10
  api_key:      (set)
estimated_cost: 1 credit
```

The user can scan this, notice that `q` is missing a quote around the
phrase, or that the site-restrict has a typo, or that `num` is too low
— and either fix the pack template, fix the row's URL, or override the
specific param before firing.

**Post-fire receipt** (click on the chip's status badge AFTER firing).
Renders the EXACT request that was sent and the raw response that came
back:

```
serpapi · last fire 23s ago · not_found
────────────────────────────────────────
REQUEST
  endpoint: https://serpapi.com/search.json
  params:   { engine: "google", q: "site:waltonfamilyfoundation.org press OR blog OR news OR updates", num: 10 }
  fired_at: 2026-06-02T21:14:33.829Z

RESPONSE  (raw, 247ms)
  organic_results: []
  search_information: { total_results: 0 }
  search_metadata: { json_endpoint: "https://serpapi.com/searches/abc123.json" }

PACK INTERPRETATION
  candidates_extracted: 0
  outcome:             "not_found"
  reason:              "no organic_results returned"
```

The raw response is the load-bearing piece. If SerpApi returned 7
organic_results but the pack interpreted 0, the bug is in the pack's
extraction logic — not in SerpApi. If SerpApi returned 0 with
`total_results: 0`, the request itself was the problem. The user can
tell which.

### Pre-fire preview as the systemic-failure detector

The single most important use case: **before bulk-firing, scan the
pre-fire previews across the first 4–8 rows**. If every row's preview
shows a `q` field that looks malformed (the site-restrict isn't pinning
the right domain; the search operators got escaped wrong), the user
catches the systemic failure in 10 seconds — before burning 96 ×
N-connector calls on a busted query template.

This is the affordance that closes the loop the user named:
*"If SerpApi and Firecrawl are failing to surface a 'feed/' 'blog/'
or 'news/' there is a failure in the request. That shouldn't happen
across every record object."*

The systemic-failure detector for a 96-row run is: hover over the
first 4 rows' chips, eyeball the previews, notice the bug.

### Persistence + audit trail

Post-fire receipts persist per-row, per-connector, per-fire-timestamp.
The connector_history slot on the row's metadata (per
[[Connector-Inventory-and-Per-Record-Palette]] §"connector_history per
record per intent") grows to carry the request payload + raw response
+ pack interpretation alongside the existing outcome / result_count /
fired_at fields. Trade-off: each row's history grows by ~5–20KB per
fire receipt. Worth it for diagnosis; bounded by capping history to
the last N fires per (row × intent) pair.

### Connection to Decision §10 — the Adaptive Request Reviewer

Decision §10 of [[Shell-and-Micro-Frontend-UX-Coherence]] introduced
the Adaptive Request Reviewer as a per-fire pre-flight surface. This
section extends that concept from "one preview per fire" to
"**per-row × per-connector inspection at any time**" — same idea, much
finer granularity. The Adaptive RR remains the home for prompt-template
fires (where the request IS one big assembled prompt+context); the
per-row preview is the home for pack/connector fires (where the
request is N small connector calls, each inspectable independently).

Both are surfaces for "show me what's about to be sent" — the spec
unifies them under one mental model.

### Bulk-fire as the secondary mode

Bulk fan-out across N rows isn't removed. It moves to a secondary
affordance:

- "Fire on all visible rows" button at the top of the records list,
  available after the user has accepted at least one per-record fire
  (i.e., after the chain is proven on this dataset)
- Each row in scope fires in parallel using the same chain that worked
  on the validated rows
- Results land inline on each row, NOT routed to a separate triage
  surface
- The user can interrupt the bulk run if it's failing (the first 4–8
  rows give a clear signal); cancellation is a first-class affordance

Bulk-fire is "scale up what worked," not "try it and see."

## Adaptive Flow — same chrome, different active members per fire type

The shell's numbered Flow (1 → 2 → 3 → 4 → 5) stays. What changes is
the active member at each step depending on what kind of fire is in
progress.

### Per-fire-type sequences

| Step | Prompt-template fire | Pack/Bundle fire |
|---|---|---|
| 1 | Record Collector — pick records | Record Collector — pick records |
| 2 | Augment / Pack Runner — compose prompt + roster | Records Surface — pick pack/bundle, scope to records |
| 3 | Request Reviewer — preview prompt with row variables | (skipped — or compressed into step 2's roster picker) |
| 4 | Response Reviewer — triage candidate responses | (skipped — results landed inline on records in step 2) |
| 5 | Promote — canonical the curated set | Promote — canonical the curated set |

For pack/bundle fires the meaningful work happens **at step 2** on the
Records Surface. Steps 3 and 4 either compress into 2 or are skipped
entirely; the Flow chrome auto-advances past them on completion.

### How the shell knows which sequence

The active record set carries a hint about what was last fired against
it (in `localStorage` for v1, in workspace state for v2). The Flow
chrome reads that hint and renders the appropriate step labels +
active-member resolution. A user who switches mid-stream (started a
pack fire, decides to compose a prompt instead) just clicks the step
they want and the chrome re-orients.

### Why the same step numbering

Two reasons. First, the user's spatial memory of "step 4 means review"
or "step 5 means promote" is real and worth preserving. Second, the
"Promote" step at the end of the Flow is shared across both fire types
— that's the canonical promotion of accepted values into the working
record set, which works the same whether the source was a prompt or a
pack.

## What this means for the existing remotes

### Response Reviewer (`apps/response-reviewer`) — stays for prompt-template fires

Continues to be the triage surface for prompt-template responses. The
by-record card pattern, the inline editing, the per-(row × pack ×
provider) chip grid — all stay. The per-record connector palette
recently added in `feat/bundle-media-packs` stays too, as the
re-fire-after-triage affordance.

What changes: Response Reviewer should **scope by fire context**. When
a user navigates here from the Flow, the active filter should be
"responses from the current fire" (the prompt-template apply that just
ran), not "every response that has ever been written to this record
set." This is the "direct line from request to response" the user
asked for, applied to the existing surface.

### Pack Runner (`apps/pack-runner`) — refactors into "Records Surface"

The remote that currently handles bundle composition + bulk fan-out
becomes the Records Surface for pack/bundle fires. The bulk-fire button
moves to the top of the records list (secondary mode). The per-record
palette (in-progress on this branch) becomes the primary interaction.

The bundle picker + roster panel stay — they tell the surface WHICH
pack(s) define "relevant/visible" fields and WHICH connectors populate
the palette. They move from being prerequisites for bulk fan-out to
being the per-record context selector.

### Request Reviewer (`apps/request-reviewer`) — narrowed scope

Stays as the pre-flight preview surface for prompt-template fires
(where the prompt + record variables + model picker actually need a
review step). Hidden / skipped entirely for pack/bundle fires.

### Augment (the composite slot in the shell) — adaptive composite

The shell's "Augment" composite slot at step 2 resolves to either Pack
Runner (today's) or Records Surface (new) based on the active fire
type's intent. This is the existing composite-slot pattern from
[[Shell-and-Micro-Frontend-UX-Coherence]] Decision §10 (the Adaptive
Request Reviewer) extended one step earlier.

## Inline result rendering — what success looks like on a row

When a connector fires successfully on a row, the result MUST render
inline on the row, not in a panel. The visual shape:

```
┌─ Row card ──────────────────────────────────────────────────┐
│ Walton Family Foundation                                    │
│ url: https://waltonfamilyfoundation.org                     │
│                                                             │
│ Palette:  [serpapi ✓ 7]  [firecrawl-map]  [google-news-rss] │
│                                                             │
│ ▼ serpapi · 7 candidates                                    │
│   ┌─ ✓ /news ─ "Reach News Hub"                  [accept] ─┐│
│   │   confidence: 92                                       ││
│   └────────────────────────────────────────────────────────┘│
│   ┌─ /press-releases ─ "Press"                  [accept] ─┐│
│   │   confidence: 78                                       ││
│   └────────────────────────────────────────────────────────┘│
│   ... (5 more)                                              │
│                                                             │
│ Target: official_updates_pulse.blog_index_url               │
│ Current: (empty)                                            │
└─────────────────────────────────────────────────────────────┘
```

Accept on a candidate → target field flips from `(empty)` to that
value, palette chip goes to "accepted" state, the results block
collapses. The user moves to the next row.

If the user wants to try another connector even after accepting (e.g.
the SerpApi result was OK but Firecrawl might find more), the chip
stays clickable. The accepted value isn't overwritten — per the
existing "additive enrichment never overrides accepted" memory rule —
but new candidates can be reviewed and additional values accepted into
the target column when the column is array-shaped.

## What about responses that don't fit a record? — entity-pulse list shape

The Entity Pulse packs return list-shaped output (N items per fire).
For per-record iteration this shape is fine: the result block on the
row is a list of items, the user accepts the ones they want, the rest
discard. The Pulse Curation Layer's three-layer (raw / curated /
finalized) model per [[Pulse-Curation-Layer-and-UI]] still applies —
the row's `official_updates_pulse` column holds the curated list, and
the raw fire output is stored in the response-store audit trail.

What the dispatch shim built in `feat/bundle-media-packs` does today
(flatten each item to its own ResponseRecord) becomes unnecessary in
the per-record-iteration model: the result block on the row already
shows the list, and the user accepts items directly into the row's
target column. The ResponseRecord-per-item shim is only useful for the
existing Response Reviewer surface, which for pack/bundle fires this
spec deprecates as the primary triage surface.

## What about the chrome the user is already in? — the "active fire" concept

The shell needs to track an **active fire** state — what was last
fired, when, what bundle/pack, against what record set. This drives:

- Flow step labels (which sequence applies)
- Records Surface scoping (which rows + which target columns to surface)
- Response Reviewer filtering (when prompt-template fires use it)
- The fire-completion feedback the user noted was missing ("Fired 96
  cells: 0 found, 90 not_found, 6 errors — here are the records, sorted
  with errors first")

The active-fire state lives in workspace state (server-side), broadcast
to all open remotes via the existing event bus. Each remote subscribes
to active-fire changes and re-renders.

## Migration / build sequence

This is a large rearchitecture, so the sequence matters.

1. **Land the active-fire state in workspace** — server-side tracking
   of "last fire" per record set + per session. Broadcasts on change.
   Foundation for everything else.
2. **Records Surface — read-only first.** New remote (or repurposed
   Pack Runner) that renders the per-record list scoped to the active
   bundle, with the connector palette per row but FIRE-DISABLED.
   Validates the layout, the relevant-fields-per-pack lookup, the
   collapsed-by-default columns. No code paths can break.
3. **Wire per-row fire to the existing `pack.search` subject.** The
   chips become firable. Results render inline. The dispatch shim
   already exists; what's new is the inline rendering on the row.
4. **Adapt the Flow chrome.** Step 2 in the shell's composite slot
   resolves to Records Surface when the active fire's intent is
   bundle/pack; resolves to Pack Runner (legacy) when it's a
   prompt-template fire. Steps 3 + 4 hide/skip based on active fire.
5. **Move bulk fire to secondary affordance.** The "Fire on N rows"
   button moves from primary to a button at the top of the records
   list, only enabled after at least one per-record fire has succeeded.
6. **Scope Response Reviewer to active fire.** When navigated to from
   the Flow, Response Reviewer filters to responses from the active
   fire by default. The all-responses view stays available behind a
   "show all" toggle for audit / triage-across-fires.
7. **Deprecate the dispatch shim's per-item ResponseRecord publish.**
   Once Records Surface renders inline results, the shim can be
   removed. Items live in the row's target column directly + the
   audit trail in response-store carries the raw fire result.
8. **Retire the legacy two-row provider grid** in Response Reviewer
   (already done on `feat/bundle-media-packs`; mentioned here for
   completeness).

Each step is independently shippable. The user can use the legacy
surfaces until each step lands.

## What this spec deliberately does NOT do

- Does not change the connector registry pattern from
  [[Connector-Inventory-and-Per-Record-Palette]]. The registry is the
  right shape. The palette pattern lifts directly into the new surface.
- Does not change the Entity Pulse pack handler signatures from
  [[Entity-Pulse-Bundle]]. The packs return what they return; the
  Records Surface renders the result inline.
- Does not displace Response Reviewer as the surface for
  prompt-template triage. The socials triage workflow stays exactly
  as it was.
- Does not specify the visual design language beyond the inline-result
  block shape. The Theme System + design tokens carry that.

## Open questions

- **Where does the new surface live?** Three credible options:
  (a) Refactor Pack Runner in-place — same port, same federation
  remote, evolved UX.
  (b) New remote `apps/records-surface/` — fresh port, parallel to
  Pack Runner during migration.
  (c) Merge Pack Runner + Response Reviewer's by-record view into one
  new remote that owns both fire and inline triage.
  Lean: (a) — the rearrangement is non-trivial but the federation slot
  + the WebSocket connection + the localStorage keys all stay
  consistent. Less churn for users mid-session.
- **Relevant fields per pack — declared where?** Options: (a) on
  `PackConfig` itself as `relevant_row_fields: string[]`; (b) on the
  bundle config (so a bundle can override per-pack); (c) inferred from
  the pack's runtime inputs (what fields the pack handler actually
  reads). Lean: (a) declared on PackConfig, overridable on
  BundleMember.
- **Result block layout for list-shaped vs single-shaped packs.**
  Single-result packs (Profile Builder) return one candidate per fire;
  list packs return N. The result block shape should differ slightly:
  single → flat row with accept/reject; list → expandable section
  with per-item accept. Spec out the two shapes before building.
- **Cost surfacing per fire.** A SerpApi call costs N credits, a
  Firecrawl scrape costs M, an LLM scoring call costs O. The per-row
  palette should expose the cost of each chip click pre-fire (tooltip
  or chip-color cue). This is more important per-record than per-
  bulk-fire because every click is a deliberate choice.
- **Bulk fire when the proven chain has multiple connectors.** If the
  user accepted SerpApi results on row 1, Firecrawl on row 2, and
  GDELT on row 3, what does "Fire on remaining rows" use? Lean:
  walks the pack's `preferred_connectors` chain per row (each row
  finds its own first-success connector). The user's per-row
  acceptances inform the priority order via a small learned
  re-weighting.
- **Pack-aware accept handler routing.** The existing accept handler
  in response-store forks on `pack_id` to route into `row.socials.add`
  for socials packs. New packs need new routes (e.g.
  `row.official_updates_pulse.blog_entries.add`). The pattern is
  established but the routes need to land per-pack.
- **What happens to bundles fired from chat?** The In-App Chat path
  (`prompts.apply`-style invocation) doesn't go through the Flow.
  When a chat verb fires `entity-pulse`, where do the results land
  visually? Lean: the chat surface shows a summary, and a "see
  results in Records Surface →" link routes the user there. The
  active-fire state binds them.

## Related

- [[Connector-Inventory-and-Per-Record-Palette]] — the registry +
  chip palette pattern this spec extends to be the primary surface
- [[Entity-Pulse-Bundle]] — the bundle whose live test surfaced
  the gap this spec addresses; the pack handlers remain valid
- [[Pulse-Curation-Layer-and-UI]] — the curation model that
  describes what the row's target column actually holds; this spec
  describes the surface where curation happens
- [[Shell-and-Micro-Frontend-UX-Coherence]] §Decision §10 — the
  Adaptive Request Reviewer concept; this spec extends adaptivity
  upstream to the composite slot at step 2
- [[Response-Reviewer-and-Response-Store]] — the existing triage
  surface that stays for prompt-template fires
- [[Augment-It-as-CRM-Augmentation-Pipeline]] — the broader pipeline
  framing this spec slots into
- [[../issues/Troubleshooting-UI-for-Official-Blogs]] — the session
  troubleshooting doc that named the gap this spec fills
- [[../reminders/Pickup-2026-06-02]] — the session map
- Existing memory:
  *"Additive enrichment never overrides accepted"* — per-record
  iteration must respect this; re-fires surface new candidates,
  never clobber accepted values
