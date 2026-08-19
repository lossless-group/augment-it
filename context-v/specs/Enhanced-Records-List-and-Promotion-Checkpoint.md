---
title: "Enhanced Records List — the Triage Checkpoint and the Promotion Loop"
lede: >-
  One record-grained view of a whole enrichment round: select the good rows, promote them to canonical, and the predecessors archive.
date_created: 2026-05-22
date_modified: 2026-05-25
date_completed: 2026-05-23
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
semantic_version: 0.0.0.2
status: Shipped
tags:
  - Spec
  - Augment-It
  - Enhanced-Records-List
  - Triage
  - Record-Identity
  - CRM-Enrichment
  - Pipeline-Checkpoint
site_uuid: e48c8513-61e1-4d2b-b51e-caad1f8f9eb0
hex_code: 50j5qo
date_authored_initial_draft: 2026-05-25
date_authored_current_draft: 2026-05-25
publish: true
---

# Enhanced Records List — the Triage Checkpoint and the Promotion Loop

## What this is

A new federated microfrontend in the augment-it shell, working name
**`enhanced-records-list`**. It is the **checkpoint surface** between
enrichment passes — the place a human reviews the *whole* outcome of an
enrichment round at once (not response-by-response), decides which records
are good enough to carry forward, and **promotes** that subset into the new
canonical record set for the next pass.

The Response Reviewer is response-grained — one fired response at a time.
This new surface is **record-grained** — one *record* (across versions) at
a time, with its current best-known state visible at a glance.

## Why now

The first end-to-end enrichment loop just happened: ~96 prospect records
got a `url` enrichment, were triaged in Response Reviewer (62 `good`, 34
`needs-human`), and links were captured along the way via the helpful-links
work. The human is done with that pass. The natural next thought is **"how
do I see all of this together and decide what's the new starting point?"**
That question is what this surface answers.

It also unlocks the iterative loop the whole walking skeleton is building
toward: enrich → triage → checkpoint → re-enrich on a cleaner base.

## The conceptual shift — from "derived record sets" to "canonical records"

Today's data model produces a new **derived record set** per enrichment
run. Run 1 against the parent set produces "Master Pipeline + url" with 25
rows. "Fire remaining" produces a second derived set with 182 rows. Three
sets now exist for what is conceptually the same 207 records.

This is correct as a persistence model (each derivation is auditable, no
data is overwritten), but it is wrong as a **human's mental model**.
The human thinks "I have 207 records, some of which now have a URL." They
do not think "I have one parent set and two derived sets that happen to
cover overlapping subsets." Today they have to reason about set lineage
to know "what's the latest version of record X?"

The spec introduces **`record_uuid`** — a stable identifier that follows a
single conceptual record across every derivation. Every row carries it.
Every prompt-runner derivation propagates it from parent to derived rows.
The `enhanced-records-list` surface groups rows by `record_uuid` and shows
the **latest version** of each, regardless of which record set it lives in.

## Data model changes

### `record_uuid` on every row

Add a `record_uuid` field to `Row.fields` (NOT `Row.fields.<csv-column>` —
it's a side-channel field like `helpful_links`, not a CSV-derived schema
column).

- **At ingest**: every newly-created row gets a fresh `record_uuid` (UUID
  v4 or a base36 nonce like `rec_<base36>`).
- **At derivation** (in prompt-runner's `run.ts`, where derived rows are
  built from parent rows): the derived row inherits the parent row's
  `record_uuid`. Already-enriched fields, edited cell values, and
  `helpful_links` carry forward by the existing parent-fields spread.
- **Backfill**: a one-shot migration assigns `record_uuid` to existing
  rows. Two routes —
  - **Parent rows**: each gets a fresh `record_uuid`.
  - **Derived rows**: matched to a parent by *position-in-set* (the
    derivation preserves order). The derived row inherits the matched
    parent's `record_uuid`.

  This is run by hand once via a script in `services/row-store/scripts/`,
  not by the runtime. After that, the runtime invariant holds.

### `archived` flag on record sets

Add `archived: boolean` to `RecordSet` (default `false`). The promotion
flow flips this to `true` on the predecessor sets. Archived sets:
- still load
- still appear in Record Collector under a collapsed "Archived" section
- are excluded from the default Request-Reviewer record-set picker
- their rows are excluded from the `enhanced-records-list` default view
  (since the canonical version is now in the promoted set)

### `promoted_from` on record sets

Add `promoted_from?: { record_set_ids: string[]; promoted_at: string;
record_count: number }` to RecordSet. Set when this record set was created
by a promotion action. Lets the lineage be reconstructed without parsing
names.

### `triage_states` on every row in a promoted set

Add `triage_states: Record<prompt_id, CementedTriage>` to `Row.fields`
where:

```ts
type CementedTriage = {
  flag: ResponseFlag | null;     // 'good' | 'partial' | 'wrong' | 'needs-human' | 'needs-rerun' | null
  accepted: boolean;
  response_id: string;            // provenance — which response produced this state
  cemented_at: string;            // promotion timestamp, ISO
};
```

Set at promotion time from the latest response per `(record_uuid,
prompt_id)`. Mutable on the *current* canonical set — re-flagging in
enhanced-records-list or Response Reviewer updates the entry in place,
so the table never lies about the freshest decision. Freezes only when
a NEW canonical set is promoted on top of this one.

### `archived` flag at the row level

Add `archived: boolean` (default `false`) to `Row.fields`. Distinct from
the set-level `archived`: this is per-record, set by a human via the
"Archive selected records" bulk action in enhanced-records-list. Archived
rows:
- Hide from the default enhanced-records-list view (a filter chip
  surfaces them on demand).
- Do NOT carry forward on promotion (the canonical set is built from
  non-archived rows only).
- Are visible in Record Collector when their parent set is opened.

This is the *only* signal that a record should be excluded from the
lineage going forward. Triage state alone never excludes.

## The `enhanced-records-list` microfrontend

### Surface

A federated remote at the next free port (likely 3006), wired into the
shell Deck alongside Record Collector, Prompt Templates, Request Reviewer,
Response Reviewer. The shell's `PAIRINGS` should pair it with Record
Collector (so you can flip between "all your data" and "the curation
checkpoint").

### Default view

A table, one row per `record_uuid`. Columns:

| column                | source                                                                 |
|-----------------------|------------------------------------------------------------------------|
| select ☐              | checkbox                                                               |
| record identity       | the CSV's first column (Prospect / Organization in current example)    |
| latest values         | one column per enriched field (currently just `url`)                   |
| triage state          | aggregated: see below                                                  |
| edited?               | ✓ if edited_text differs from response_text on the latest response     |
| 🔗N                   | `helpful_links.length` (popover on hover lists them)                   |
| origin set            | "parent" / "+ url (run 1)" / "+ url (run 2)" — which set is the source |
| age                   | when the latest version was produced                                   |

### Sorting

Default sort: **most attention-needed last** (so good records collapse
upward and the human's eye lands on the records that still need work).

The order, top → bottom:
1. `accepted` (this record's value already wrote to a cell)
2. `good` (flagged good but not yet accepted)
3. `partial`
4. unflagged (no human review yet)
5. `wrong`
6. `needs-human` (the human needs to make a call about what this even is)
7. `needs-rerun` (queue for the next enrichment pass)

Sort is user-overridable by column header click, but this is the default.

### Triage-state aggregation

A record may have multiple responses (re-runs, multiple prompts in the
future). For v1 (single prompt — `url`), the rule is simple: the record's
triage state = the latest response's flag. The aggregation gets a
multi-prompt rule later; spec it then.

### Helpful-links popover

Hover the `🔗N` cell → popover lists the link labels + notes. Click any
link to open in a new tab. The popover also has a `+ add link` shortcut —
useful when reviewing the whole list and remembering a link from a record
you saw before.

### Filtering

Top filter row (mirrors Response Reviewer's chip pattern):

`all` `unflagged` `good` `partial` `wrong` `needs-human` `needs-rerun`
`has-edits` `has-links` `archived`

`all`, `accepted` and the flag buckets are mutually exclusive; `has-edits`
and `has-links` are additive modifiers; `archived` is a separate toggle
that includes/excludes archived-set records.

### Bulk actions on the selection

Multi-select via the checkboxes (with `shift-click` to range-select). The
bottom action bar shows:

- **`↻ Queue for re-enrichment`** — flags every selected response as
  `needs-rerun`. The next "Fire remaining + include needs-rerun" in
  Request Reviewer will scoop them up.
- **`🗑 Archive selected records`** — sets `archived: true` at the **row
  level** (distinct from set-level archived). This is the *only* mechanism
  for a record to drop out of the canonical lineage at promotion time —
  use it for duplicates, not-real-prospects, identity-broken records the
  team decided to remove.
- **`✎ Re-flag …`** — bulk change of triage state for the selected rows
  (e.g. mark all of these `wrong` → `needs-human` after a team meeting).
  Updates the cemented `triage_states` field on each row.

The headline action — **`✓ Promote all to new canonical set`** — sits
separately (not gated on selection) because it operates on the whole
non-row-archived roster, not the multi-selection. See the "promotion
action" section below.

## The promotion action — a snapshot, not a filter

**Promotion carries ALL records forward.** It is not a filtering operation
where the human picks "the good ones" and discards the rest. It is a
**snapshot** that cements the entire roster's current state — including
each record's triage flag at the moment of promotion — into a new
canonical record set. The triage state moves from being a property of
*the response* to being a stored property of *the record in this set*.

### Why this matters (the workflow the human is actually living)

The human's loop is not "review → cull → re-enrich on the good subset."
It is:

1. **In between meetings**: continue enriching records that are *good
   enough to move forward with* (typically the `accepted` + `good`
   bucket). Fire next prompts only against that subset. The unclear
   records stay in the set, untouched, with their `needs-human` /
   `wrong` flag preserved so the human knows not to spend more LLM
   budget on them yet.
2. **In a team meeting**: open the same canonical set, filter to the
   problem buckets (`needs-human`, `wrong`), and walk the team through
   each — *"what the fuck were we even talking about with this one?"*
   The team clarifies the identity, re-flags it, or marks it archived.
3. **After the meeting**: re-enrich the newly-clarified records, or
   promote again to cement the team's decisions into the next version.

A "drop the bad ones at promotion time" model destroys this workflow.
The unclear records ARE the conversation material for the next team
meeting; deleting them is destroying the agenda.

### Mechanics

1. Click `✓ Promote to new canonical set` (single button, no selection
   modal). Optional name dialog (default `<lineage-name>_v<n>`).
2. **A new RecordSet is created in row-store** containing **every
   non-row-archived record** currently surfaced in
   `enhanced-records-list`:
   - `name`: from the dialog.
   - `schema.fields`: the **union** of all column names across the source
     rows (CSV originals first, then enrichment columns by name), PLUS
     the new side-channel fields below.
   - `schema.source`: `{ kind: 'promotion', promoted_from: [ids],
     promoted_at, count }`.
   - `row_ids`: N new rows, one per `record_uuid` visible at promotion
     time, where each row's `fields` are taken from the most-recently-
     derived version of that record_uuid. `record_uuid` carries forward.
     `helpful_links` carries forward. Edited cell values (from
     `response.accept`) carry forward.
3. **Each new row carries its cemented triage state** in
   `Row.fields.triage_states` — a map keyed by `prompt_id`:
   ```ts
   triage_states: {
     [prompt_id]: {
       flag: ResponseFlag | null;          // 'good' | 'needs-human' | ...
       accepted: boolean;
       response_id: string;                 // the response this state came from
       cemented_at: string;                 // promotion timestamp
     }
   }
   ```
   For v1 (single `url` prompt) there's one entry per row — but the map
   shape lets the next iteration (multiple prompts run per canonical set)
   plug in without remodelling. enhanced-records-list reads from this map
   to render the triage-state column.
4. **The predecessor record sets are flipped to `archived: true`** — the
   parent and any intermediate derived sets this promotion supersedes.
   They survive in row-store for audit; they hide from default UI.
5. **Row-archived records do NOT carry forward** — a row the human
   explicitly marked `archived: true` at the row level (see "Bulk
   actions" above) is skipped during promotion. This is the only way a
   record drops out of the canonical lineage. Triage-state alone never
   excludes a record from promotion.
6. **Broadcast** `record_set.created` + `record_set.archived` events.

### What the human sees after promotion

- enhanced-records-list: the table now reads from the new canonical set;
  every record is present, the cemented triage state shows in the triage
  column. Sorting still surfaces problems to the bottom and clean records
  to the top — same default ordering, but now driven by the *cemented*
  state, not the latest-response state.
- Record Collector: predecessor sets collapse into an "Archived" section;
  the new promoted set is the active one.
- Request Reviewer's record-set picker: the new set is highlighted; the
  archived ones don't show by default. **New**: a triage-state filter
  pre-scopes fires — `Fire only against records where triage = good ∪
  accepted` is what you'll click most often. (Spec the filter UI in
  Request Reviewer's own update; for v1 the human passes `row_ids` from
  enhanced-records-list directly.)
- Response Reviewer: shows responses against the new canonical set's
  rows. Historical responses against archived-set rows hide behind an
  `include-archived` toggle.

### Re-triaging after promotion

A cemented triage state on a row is not a frozen prison. The team meeting
scenario explicitly produces "actually, this record IS real, let me
re-flag it `good`" decisions. Two paths:

- **Re-fire** the enrichment for that row → new response in
  response-store keyed against the new canonical row_id → triage it via
  Response Reviewer as today. The cemented `triage_states[prompt_id]` on
  the row is now stale; either update it in place to the new triage, or
  treat the cemented field as the *promotion-time* value and read live
  triage from the latest response. **Decision (v1): update the cemented
  field in place** on triage change for the *current* canonical set, so
  enhanced-records-list always shows the freshest decision without
  needing a join.
- **Direct re-flag** in enhanced-records-list (or Response Reviewer) →
  same effect, updates the cemented field in place.

Either way, the cemented state is mutable for the active canonical set;
it freezes only when a *new* canonical set is promoted on top of it.

## The iterative loop

After promotion:
1. Open Request Reviewer.
2. Pick the new canonical set + the *next* prompt to run against it (e.g.
   "Find Executive Director name" or, eventually, the link-clustering
   prompts below).
3. Fire whole set. Same review-and-triage cycle as round one.
4. Open enhanced-records-list. See the new state.
5. Promote again. Continue.

Every iteration narrows the noise and deepens the signal per record. The
"corpus" the user mentioned in the genesis conversation builds up
organically as `helpful_links` accumulate and each successive enrichment
adds columns.

## Where this goes next — themed link clustering (v2+, own spec)

The user's research session that produced this spec also surfaced a richer
enrichment shape that **does not fit the one-column-per-prompt model**.
While manually searching for the unknown URLs the human kept finding
adjacent links that cluster into recognisable themes:

- `team_profiles` — LinkedIn pages, bio pages, team-page anchors
- `founder_origin` — interviews, press releases announcing the
  org's founding, the founder's other ventures
- `in_the_news` — recent press, op-eds by leadership, awards
- `grant_stories` — case studies of grants made or received, partner
  testimonials
- `entity_db_profiles` — Cause IQ, GuideStar, IRS 990 lookups, Crunchbase,
  ProPublica Nonprofit Explorer entries
- `reports_and_publications` — annual reports, impact reports, white
  papers, conference talks

### Each cluster is its own column — JSON array of structured link objects

The decision (per the spec author):

- **Per-theme column on the record**: `team_profiles`, `founder_origin`,
  `in_the_news`, `grant_stories`, `entity_db_profiles`,
  `reports_and_publications`. Each is its own field on `Row.fields`, the
  way `url` is today. Each value is a **JSON array of structured link
  objects**, not a single string.
- **Array, not object** — the contents are a *list* of links with
  per-item metadata (title, role for a person, date for an article,
  source-database for a 990 lookup). Variable cardinality (one person or
  ten; one report or thirty). An object only works if the theme had a
  fixed slot list, which none of these do.
- **One custom prompt per cluster** — each theme has its own prompt
  template tailored to what "good" looks like for that bucket. E.g.
  the `team_profiles` prompt has a different instruction set, a
  different few-shot, and a different verification criterion than the
  `entity_db_profiles` prompt.

### How `helpful_links` feed in

The `helpful_links` array the human accumulated during URL-triage (and any
future manual capture) gets injected into the themed prompt as **starting
points / must-includes**. Two routes:

- **All-links-in, LLM-clusters**: the prompt receives the row's full
  `helpful_links` set. The LLM decides which subset is relevant to the
  theme it's tasked with (e.g. the `team_profiles` prompt picks out the
  LinkedIn URLs and bio pages; the `in_the_news` prompt picks the press
  hits). Simple, no manual classification UI needed. Probably the right
  v2 start.
- **Pre-classified**: an extension to `HelpfulLink` adds an optional
  `theme?: string` (or `themes?: string[]` if a link belongs to multiple
  buckets). When the themed prompt fires, only links matching the theme
  are injected as must-includes. Requires a classification step somewhere
  (a one-time agent pass, or human tags during triage). v3, if v2's
  "let-the-LLM-decide" approach proves lossy.

The themed prompt's output writes to the per-theme column AND optionally
back-fills `helpful_links` with `source: 'enrichment'` so the next pass
sees what the agent found alongside what the human found.

### What needs to grow to support this (spec the changes in v2's own doc)

- **`PromptTemplate.output_column`** today targets a single string-valued
  cell. For themed clusters, the output is JSON. Either:
  - Add `output_shape: 'string' | 'json'` (or `'array-of-link'`) to the
    template, and have prompt-runner parse + validate accordingly.
  - Or keep the column as a string column holding stringified JSON, and
    have the consumer (enhanced-records-list, Dididecks deck-builder,
    etc.) parse it.

  Lean toward the former — explicit shape makes downstream consumers and
  the Response Reviewer's UI (which would need a structured-link editor
  for these responses) far cleaner.
- **`prompt-runner`** needs structured-output handling — pass a JSON
  schema to the model, validate the response against it, fail loudly
  (i.e. mark the response with `[error: ...]`) on schema-violation so the
  human sees it in triage.
- **Response Reviewer's `edited_text`** flow needs a structured editor
  for these responses, not a plain textarea — at minimum a list-of-objects
  view with per-row edit + add + remove (the same shape as the existing
  helpful-links list, but bound to the cluster column).

### This is a separate spec

See `[[Themed-Link-Cluster-Enrichment-via-Search-Agents]]` (to be written
once this checkpoint surface is built and the user has used it for one
real iterative loop). What that spec covers:

- The full data shape per theme — what fields a link object carries in
  each bucket (`team_profiles` link has `role`, `linkedin?`, `bio?`;
  `entity_db_profiles` link has `database_name`, `record_id?`,
  `last_verified?`; etc.)
- The structured-output prompt template for each theme
- The structured-output handling in `prompt-runner`
- The Response Reviewer's structured editor
- Whether each themed prompt fires its own agent (web-searching for that
  theme specifically) or whether one omnibus prompt produces all six
  themes at once — tradeoff is cost (one big call) vs. focus (six small
  calls)

### What this spec needs to do *for* that future work

Keep the v1 shape compatible:

- `HelpfulLink.source` is already `'manual' | 'distill' | 'enrichment'`
  — the themed agent writes with `source: 'enrichment'` when (or if) it
  reflects findings back into the unified `helpful_links` array.
- Don't add a `theme` field to `HelpfulLink` in v1 — premature. The
  themed columns ARE the typed homes; helpful_links stays the
  free-form scratch pad.
- Keep the per-record `helpful_links` shape stable so the themed prompt
  can consume it as input without remodelling.

## The bigger picture (recorded for context, not the build target)

The user's narrative explicitly framed what this tool is *for*: enriching
CRM / pipeline records — rough lists of prospective donors, grantmakers,
investors, partners — into actionable profiles. The target profile per
record includes:

- canonical website + LinkedIn + alt sites
- financial info, annual grantmaking (or fund size), top program areas
- mission, vision, geographic focus, target populations
- key people: roles, LinkedIn, location, bio, public-record signals
- recent grant stories / portfolio outcomes
- press, public statements, network signals
- and more, the corpus grows by domain

Augment-It as currently scoped is the **rig** that produces this. This
spec — the checkpoint and the iterative loop — is the **rhythm**. The
themed-link clustering is the **fuel**. The user-facing endgame is a deck-
or memo-grade profile per record, fed into Dididecks (slides) or MemoPop
(written memos) downstream.

That endgame is **not the v1 of enhanced-records-list**. v1 is the
checkpoint surface itself, the record_uuid plumbing, and the promotion
action. Everything in this section ("the bigger picture") is the *why*
that should inform but not over-shape the v1 design decisions.

## Open questions, to settle before build

1. **`record_uuid` shape**: `rec_<base36>` (matches existing id style of
   `pt_…`, `rsp_…`, `run_…`) vs RFC 4122 UUID v4 (more universally
   recognisable). Lean `rec_<base36>` for consistency.
2. **Promotion naming default**: `<source>_v<n>` (numeric) or `<source>_v<date>`
   (timestamped)? Numeric is cleaner for short lineages; date scales
   better. Use numeric for v1 and revisit when a user has 10+ versions.
3. **Multi-prompt aggregation rule for triage state** (when more than one
   prompt has been run against the canonical set): defer with a TODO in
   the v1 code. The single-prompt case is well-defined.
4. **Per-row archive vs set archive**: spec it as both — set-archive is
   the promotion side-effect, row-archive is the human's "this record
   isn't real" signal. They coexist; UI shows both reasons.

## Acceptance, when this is built

1. Every row in row-store has a `record_uuid` field. Newly-ingested rows
   get fresh ones. The one-shot backfill has been run against the existing
   ~96 records and ~232 derived rows, matching derived rows to their
   parents by within-set order.
2. The `enhanced-records-list` microfrontend loads in the shell, lists all
   records grouped by `record_uuid`, sorted by triage attention (clean
   records first, problem records at the bottom by default).
3. Helpful-links count + popover work; the popover lets you add a link
   without leaving the list.
4. Row-level archive works — `🗑 Archive selected records` flips
   `Row.fields.archived = true` on the multi-selection; archived rows
   hide from default view, surface via filter chip.
5. **Promotion carries every non-archived record forward**, not a
   selected subset. Clicking `✓ Promote all to new canonical set` creates
   a RecordSet with one row per non-archived `record_uuid` currently
   visible. Each new row's `triage_states[prompt_id]` is set from the
   latest response's flag, with `cemented_at` stamped. `helpful_links`,
   accepted cell values, edited-text all carry forward. The predecessor
   sets are flagged archived at the set level.
6. Re-flagging a record after promotion (either in enhanced-records-list
   or via the Response Reviewer flow producing a new response) updates
   the cemented `triage_states` entry in place on the *current* canonical
   set. The cemented entry freezes only when a NEW canonical set is
   promoted on top of it.
7. Request Reviewer's record-set picker defaults to non-archived sets;
   firing a prompt against the new canonical set creates the next derived
   set, with `record_uuid` carrying through into derived rows again.
   **New**: a triage-state filter in Request Reviewer lets the human
   scope a fire to "only records where triage = good ∪ accepted" — the
   "between meetings, only push forward the good ones" path.
8. The lineage chain is readable from any record set: `promoted_from`
   resolves back to all ancestors. The team-meeting workflow is supported
   end to end: open canonical set → filter to `needs-human ∪ wrong` →
   walk the team through; per-record actions (re-flag, archive, edit
   identity field, add helpful_link) all work inline without leaving the
   list.

## See also

- [[Helpful-Links-on-Records-Captured-During-Triage]] — the per-record
  link side-channel this builds on
- [[Response-Reviewer-and-Response-Store]] — the response-grained triage
  surface this complements
- [[Request-Reviewer-Pre-Flight-Surface]] — the firing-and-coverage
  surface that consumes the canonical set after promotion
- [[Original-and-Enhanced-Record-Instances]] — the record-instance fold
  reasoning that motivates the `record_uuid` and the canonical-set move
- [[Augment-It-as-CRM-Augmentation-Pipeline]] — the overarching framing
  this iterative loop instantiates
- `[[Themed-Link-Cluster-Enrichment-via-Search-Agents]]` — to-be-written
  v2 spec for the themed link gathering described in §"Where this goes
  next"
