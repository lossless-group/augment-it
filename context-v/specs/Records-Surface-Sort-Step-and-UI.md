---
title: "Records Surface sort step and UI — sort ships as part of the **Sort & Filter Lens**, the second lens in step 2's default set (alongside the existing **Pack Firing Lens**); `lens` is the architectural primitive this spec introduces and lenses are *swappable* (one active per step at a time), not stackable; each step ships with a small curated default lens set and the registry stays *open* so new lenses can join without architecture changes"
lede: >-
  Sort ships as the second swappable lens on step 2 — and the lens registry is open, so a new lens is a manifest drop, not an enum edit.
date_created: 2026-06-09
date_modified: 2026-06-09
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
semantic_version: 0.0.0.3
revisions:
  - "2026-06-09 — Initial draft. Written immediately after [[../explorations/Operator-Built-Flows-Beyond-The-Universal-Pipeline]] landed and the same-session ship of `/promote-snapshot` made the system columns sortable. Operator framing: *\"how do you include it in the flow? Where? Is in the Header step by step ui somehow? Do I just tell the agent to insert an intermediary?\"* The spec scopes sort narrowly and treats the placement question as deliberately open."
  - "2026-06-09 — Reframed as the first **Lens** on step 2 of the FLOW header. The v0.0.0.1 draft missed that the FLOW stepper already exists in the shell (`1 2 3 4 5` with step 2 = *rows to fire against*) and that step 2 is sort's natural home. Operator pushback: *\"theoretically this is just a mod on step 2, or an alternate view on step 2... maybe we introduce mods or something?\"* Pushed the conversation onto the real architectural gap: sort doesn't fit any existing primitive (verb, pack, bundle, microfrontend, view-as-implemented). This revision named the new primitive (`lens`), established it on the back of sort being its first instance, and reframed the spec's UX section as a stackable-toolbars model."
  - "2026-06-09 — **Switched lenses from stackable to swappable.** Operator's actual UX instinct: *\"I want to change a lens on a step ... make the step counter in the Header allow me to swap one step from the default lens to another lens\"* + *\"a default list of named lenses that typically could show at each step ... I don't want to hardcode an architecture that prevents the addition of other lenses, or users thinking outside our boxes.\"* One lens active per step at any moment, not many. The step counter in the FLOW header is the swap UI (right-click → menu). The registry is open: dropping a manifest adds a lens. Today's step 2 UI is named the **Pack Firing Lens** and becomes the explicit default for step 2; sort and filter collapse into a single **Sort & Filter Lens** that ships as the second default (sort first per the operator's original ask, filter follows in v0.0.0.4 without changing the lens identity). The `/sort` verb still composes the sort-spec from natural language; a new `/lens` verb swaps which lens is active. The stackable-order machinery from v0.0.0.2 is removed (no `order` field on the manifest, no toolbar stacking)."
tags:
  - Spec
  - Augment-It
  - Records-Surface
  - Sort
  - Lens
  - Architectural-Primitive
  - Operator-UX
  - Augmentation-State
  - Tier-1
status: Draft
site_uuid: 25f77a05-71f7-45d1-bf5e-01ff32b0bf06
hex_code: nq3njl
date_authored_initial_draft: 2026-06-09
date_authored_current_draft: 2026-06-09
publish: true
---

# Records Surface sort step and UI

## Why this spec exists

The audit on 2026-06-09 surfaced a hard number: 17 of 96 prospects have corpus content, 79 are blank. Today's `/promote-snapshot` ship put that state in two visible places — a per-row chip on the by-record view, and four new columns (`corpus_count`, `corpus_funder_slug`, `corpus_last_updated`, `corpus_by_pack`) in v9. The operator now *sees* the gap. What they can't *do* yet is re-order the list so that, e.g., the records most likely to yield manual-research returns float to the top.

The exploration that motivates this spec ([[../explorations/Operator-Built-Flows-Beyond-The-Universal-Pipeline]] §"The concrete scenario") names the immediate move: sort by `corpus_count` ascending, optionally filtered to records with URL + socials. The resulting list *is* the tier-2 worklist — the 50-ish records where a human-with-a-search-engine can outperform our automated fan-out in two minutes per record.

Sort is the cheapest move to unlock that. It rides on top of state we already have (v9 system columns + spine columns); it doesn't need new infrastructure; it's the foundational primitive every later tier (filter, views, playbooks, agent-composed view-specs) builds on.

This spec scopes sort *only*. Filter ships in a sibling spec. View persistence ships after that. The three together form the [[../explorations/Operator-Built-Flows-Beyond-The-Universal-Pipeline]] §Tier-1 deliverable.

## Scope of this spec

In scope:

- A **sort-spec JSON shape** that the inline UI emits, that future view-persistence reads, and that the agent-chat can compose. One shape across all callers — a load-bearing decision from the exploration.
- **Always-on inline sort controls** on the by-record view of `apps/response-reviewer` (Records Surface) — column-header click toggles sort direction; shift-click adds a secondary key.
- **A defined set of sortable columns** spanning spine columns (Prospect / Organization, Stage, Total Commitment), v9 system columns (`corpus_count`, `corpus_last_updated`, etc.), and **derived virtual columns** the sort layer computes at render time without storing (`has_url`, `has_socials`, `socials_count`, `augmentation_tier`).
- **Sort persistence in localStorage** scoped per-record-set, so the operator's last sort survives a page reload without leaking across record sets.
- **A `/sort` chat verb** that takes a natural-language description ("sort by lowest corpus first, then alphabetical") and emits a sort-spec the UI applies. The verb is the first instance of the agent-as-intermediary pattern the open-thinking section discusses.

Out of scope:

- **Filter.** Filter lands in v0.0.0.4 of *this same spec*, inside the same Sort & Filter Lens — the lens identity stays stable, the `filter_spec` field joins `sort_spec` inside `sort_and_filter_state`. The original v0.0.0.1 plan was a sibling spec; the swappable-lens model makes "two lenses for two concerns that share intent" feel wrong (operator wants one menu entry, not two). Same lens, two state shapes, two chat verbs (`/sort`, `/filter`), one component.
- **View persistence.** Sort-spec lives in localStorage in v1; survives a reload, not a tab close. The named-views story is deferred to a third sibling spec (`Operator-Built-Views-Persistence.md`).
- **Playbooks** (sequenced verbs against views). Tier 2 of the exploration; gated on the filter + view-persistence specs landing.
- **The augmentation-state register.** Sort reads filesystem-derived state via the existing `corpus.list_for_record` capability (already used by the per-row chip); doesn't yet require the register the [[../plans/Augmentation-State-Preservation-and-Snapshot-Promotion]] plan deferred.
- **Sort on Content Reader view, single-response view, or the request-reviewer surface.** Records Surface is the immediate need; other views inherit later via the same sort-spec contract.
- **Cross-record-set sort** (e.g. "sort across all my clients"). Single-client surface today; the sort-spec is record-set-scoped.
- **A standalone `Lens-Architecture.md` spec.** Lens is defined in §"Lens — the architectural primitive" below as a section of *this* spec because sort is its first and only instance today. When filter ships and validates the abstraction across two instances, the lens definition graduates to its own sibling spec — *show the second instance, then extract the abstraction*, not the other way around.

## Lens — the architectural primitive

A **Lens** is a small composable unit that modifies the operator's view of a FLOW step without firing capabilities and without mutating row-store data. It is the architectural answer to *"where do sort, filter, tier-classification, and bulk-action live?"* — none of those fit the existing primitives cleanly.

### Why a new primitive

| Existing primitive | Fits sort? | Why / why not |
|---|---|---|
| Verb / capability | No | Verbs fire and produce side effects (responses, files on disk, NATS broadcasts). Sort reorders a view; no side effect, no response, no broadcast. |
| Pack | No | Packs produce response candidates from queries. Sort produces nothing — it's a lens on existing rows, not a fetcher. |
| Bundle | No | Bundles compose packs. Sort isn't pack-shaped, so it can't compose into one. |
| Microfrontend | Awkward | Sort is a small toolbar that modifies an existing surface (step 2's row table), not a new federated surface. Wedging it into module-federation is the heaviest possible answer for the smallest possible unit. |
| View (as implemented) | Overloaded | The hardcoded `single / by-record / content-reader` toggle in response-reviewer is layout-only and binary. Sort is *same data, different presentation* — the spirit of "view" — but the current implementation isn't composable. |

Lens fills the gap. It composes with what exists rather than replacing it.

### Shape

A lens declares:

- **Mount targets** — the FLOW step(s) it can mount on (`steps: [2]` for Sort & Filter; a debug-style lens could declare `steps: [1, 2, 3, 4, 5]`).
- **Name** — slug-like, snake_case (`sort_and_filter`, `pack_firing`, `tier_classification`).
- **Display name + description** — operator-readable; surfaces in the lens menu (`"Sort & Filter"`, `"Pack Firing"`).
- **State slot** — a named field in the step's state slab. The state persists, is agent-composable, can be shared across UI surfaces. Sort & Filter's slot is `sort_and_filter_state`; Pack Firing's is `pack_firing_state`.
- **UI component** — a Svelte component the step's render pipeline mounts when this lens is active. Owns the step's primary content area.
- **Chat verbs (optional list)** — verbs the lens contributes. Sort & Filter contributes `/sort` (writes `sort_spec` inside its state slot) and `/filter` (writes `filter_spec` inside its state slot). A separate `/lens <name>` verb is owned by the registry and swaps which lens is active.

### Rules

- **Non-destructive.** A lens never mutates row-store data. State lives in lens-owned slots only.
- **Swappable, not stackable.** Exactly one lens is active per step at any moment — the step's *active lens*. Swapping is the operator's (or agent's) explicit act. There is no "multiple lenses stacked on top of each other" concept.
- **Default lens per step.** Each step ships with one named default. Today step 2's default is `pack_firing`. A step never has zero lenses; the default is what the step shows when nothing else is selected.
- **State coexists across swaps.** Each lens's state slot lives independently. Swapping from Pack Firing to Sort & Filter preserves both `pack_firing_state` and `sort_and_filter_state`; swapping back restores the prior lens's UI from its preserved state. Toggling between lenses doesn't lose anyone's work.
- **Step-scoped persistence.** Lens state and the active-lens choice are stored in localStorage keyed by `augment-it:step<N>:<slot>:<record_set_id>`. Survives reload, doesn't leak across record sets. Migration to the augmentation-state register (deferred by [[../plans/Augmentation-State-Preservation-and-Snapshot-Promotion]]) is a future concern.
- **Open registry.** Adding a new lens means dropping a manifest into `apps/.../lenses/<name>/` (v1) or `packages/lenses/<name>/` (v2). New lenses appear in their declared step's menu automatically. The default set per step is a *curated opinion the app ships with*, not the *closed universe of possible lenses*. Operators or third-party authors can author lenses; the registry treats them like any other.

### Packaging

Three landing zones, sequenced by need:

| When | Where the lens lives | Why |
|---|---|---|
| v1 (this spec) | `apps/response-reviewer/src/lenses/<name>/` | In-app. No federation. Each lens directory has `manifest.ts`, `Lens.svelte`, and the state-shape module. Cheapest move; defers the cross-app question. |
| v2 (filter ships, or a new lens lands) | `packages/lenses/<name>/` | Once a second microfrontend (record-collector?) wants the same lens, graduate to a shared package the workspace's existing `packages/` directory hosts. Imports cross apps. |
| v3+ (only if a real dynamic-load use case appears) | Federated module | YAGNI today. Reserve the option; don't build it pre-emptively. The architecture must not *prevent* this; v1 doesn't *deliver* it. |

### The lens registry

A small module at `apps/response-reviewer/src/lenses/registry.ts`. Loaded at app boot. Discovers lenses via compile-time imports — explicit registration keeps the dependency graph legible. Exposes:

- `lensesForStep(step: number): LensManifest[]` — all lenses that can mount on this step (in registration order; the menu may re-order alphabetically or by default-first).
- `activeLensForStep(step: number): LensManifest` — the currently-active lens for the step (defaults to that step's default lens if nothing has been chosen).
- `swapLens(step: number, name: string)` — set the active lens for the step. Persists the choice to localStorage. Throws if `name` isn't registered for `step`.
- `lensState(step: number, name: string): WritableSlot` — the read/write handle into a lens's state slot, callable from the lens's Svelte component or from a chat-driven capability.

The registry deliberately does NOT do file-scan magic or dynamic imports in v1. Compile-time imports are boring and traceable; the demo value of Lens is in *naming the seam*, not in plumbing a discovery system. New lenses authored by anyone in v1 land via PR to the registry's import list — the open-registry rule is about *the shape allowing it*, not about runtime discovery being live on day one.

### The default lens set today

Each step gets a small curated default set. The lens at the top of each list is the step's default — what loads when the operator hasn't explicitly swapped.

| Step | Default set (v1) | Notes |
|---|---|---|
| 1 — Ingest | (today's ingest UI, named **Ingest Lens**) | One lens; no swap UI surfaced because there's nothing to swap to yet. |
| 2 — Rows to fire against | **Pack Firing Lens** *(default)*, **Sort & Filter Lens** | Pack Firing = today's UI (bundle picker, roster, fire button). Sort & Filter = this spec's contribution; sort lands in v0.0.0.3, filter in v0.0.0.4. |
| 3 — (whatever step 3 is today) | (today's UI, named accordingly) | Single lens; lens menu shows it but no swap. |
| 4 — (whatever step 4 is today) | (today's UI, named accordingly) | Single lens. |
| 5 — Promote | **Promote Lens** (today's `/promote-snapshot` result) | Single lens for now. |

Only step 2 has more than one lens in v1. Other steps get the lens primitive (naming + slot persistence + a one-item menu that just shows the current lens) so the operator's mental model is consistent across the FLOW header — every step has *a* lens; some steps have *more than one*.

The architecture allows operators to add a Sort & Filter lens to step 3 (or a debug lens to all steps, or anything else) by dropping a manifest. The default set per step is what *augment-it ships*; what the operator builds on top of it is theirs.

## The sort-spec JSON shape

The load-bearing artifact. The inline UI emits this shape, future named-views persist it, the agent-chat composes it. One shape across all callers.

```json
{
  "sort": [
    { "column": "corpus_count", "direction": "asc", "empty_position": "last" },
    { "column": "Prospect / Organization", "direction": "asc", "empty_position": "last" }
  ]
}
```

Field rules:

- **`sort`** — array. Order is significant: index 0 is the primary key, index 1 the secondary, and so on. v1 supports up to **3** sort keys (operator-visible affordance for ≤3 keeps the UI legible; the spec doesn't reject 4+ from the underlying engine).
- **`column`** — string. Either a spine-column name (verbatim from the CSV header, including spaces — e.g. `"Prospect / Organization"`), a v9 system column (`"corpus_count"`, `"corpus_last_updated"`, etc.), or a derived-virtual column name (snake_case — `"has_url"`, `"socials_count"`, `"augmentation_tier"`). See §"Sortable columns" for the inventory.
- **`direction`** — `"asc"` or `"desc"`. No third "natural" value.
- **`empty_position`** — `"first"` or `"last"`. Defaults to `"last"`. Empty = `""`, `null`, `undefined`, or `0` for derived booleans. The default puts records with missing data at the bottom — matches the operator's instinct that "records with corpus_count=0 should bubble up, but records with corpus_last_updated=blank should sink to the bottom of a sort-by-last-updated."

Validation rules:

- Unknown columns are *dropped from the sort array with a console warning*, not rejected. A sort-spec that names a column from a previous schema (e.g. a v8 column the operator removed in v9) should silently degrade rather than fail.
- An empty `sort` array is valid — that's "natural CSV order, no sort applied."
- Sort-specs are **idempotent on identical input**: a stable sort, deterministic on ties.

## Sortable columns

Three classes, each with comparison rules.

### Spine columns (from the CSV header)

Sortable: every column whose name appears in the active record set's schema. Comparison defaults to **case-insensitive string compare with natural-number runs** (so "v10" sorts after "v9", not before). Numeric columns are detected by sampling: if ≥80% of non-empty values in the visible page parse as `Number(val)`, the column gets numeric compare for that view.

Carve-outs:

| Column | Special handling |
|---|---|
| `Prospect / Organization` | string compare, default sort |
| `Stage` | string compare today; *should* be ordinal (`Money In > Final Phase > Mid-stage > Early > New > Dropped`) but ordering authority lives in the operator's pipeline language. v1 ships string-sort; v2 adds an optional `stage_order` config on the record set. |
| `Total Commitment ($)`, FY columns | numeric — `$250,000` parses by stripping `$,`. Cell-level parser shared with the value-formatter the existing render uses. |
| `Last Contact/Update`, `Next Step Due` | date — parse to ISO; missing dates sort per `empty_position`. |

### System columns (added by `/promote-snapshot` v9+)

The reason this spec exists. Sortable today; comparison is straightforward because the promoter writes them in stable shapes.

| Column | Type | Notes |
|---|---|---|
| `corpus_count` | integer | the obvious one |
| `corpus_funder_slug` | string | sort by slug groups same-foundation records together |
| `corpus_last_updated` | ISO 8601 string | lexical sort = chronological |
| `corpus_by_pack` | string (semicolon-encoded map) | not natively sortable; the sort UI hides this column from the sort menu in v1 |
| `augmentation_snapshot_at` | ISO 8601 string | same-cohort grouping |
| `augmentation_snapshot_version` | string (`v9`, `v10`, ...) | natural-number-aware compare so v10 > v9 |

### Derived virtual columns

Not in the CSV. Computed at render time. Available for sort without being stored. **These are the columns the tier-2 scenario most needs.**

| Column | Derived from | Semantics |
|---|---|---|
| `has_url` | spine `url` column | boolean: `true` if non-empty and not `"unknown"` |
| `has_socials` | spine `socials` column | boolean: `true` if the JSON-shaped value contains ≥1 platform entry |
| `socials_count` | spine `socials` column | integer: count of platform entries (`twitter`, `linkedin`, etc.) |
| `helpful_links_count` | spine `helpful_links` column | integer: array length |
| `augmentation_tier` | combination | enum: `rich` (corpus_count ≥ 5), `middle` (has_url AND has_socials AND corpus_count < 5), `sparse` (corpus_count < 5 AND (has_url OR has_socials)), `private` (no URL, no socials, no corpus). Thresholds operator-configurable in a sibling sort-config block; defaults named here. |

The `augmentation_tier` value itself is sortable using the implied ordering `rich → middle → sparse → private` (or `desc` for the reverse). Empty / unresolvable rows sort per `empty_position`.

Derived columns are virtual — they don't appear in the CSV the operator exports unless `/promote-snapshot` is taught to emit them. v1 keeps them sort-only; v2 (post-filter spec) may surface them as columns in the view.

## The Sort & Filter Lens — UX (sort in v0.0.0.3; filter follows in v0.0.0.4)

### The lens manifest

```ts
// apps/response-reviewer/src/lenses/sort-and-filter/manifest.ts
import type { LensManifest } from '../registry';
import SortAndFilterLens from './SortAndFilterLens.svelte';

export const manifest: LensManifest = {
  name: 'sort_and_filter',
  steps: [2],                         // rows to fire against
  display_name: 'Sort & Filter',
  description: 'Re-order and narrow the records to focus your attention before firing.',
  state_slot: 'sort_and_filter_state',
  component: SortAndFilterLens,
  chat_verbs: ['/sort', '/filter'],   // both write into the lens's state slot
};
```

When the operator (or agent) swaps step 2's active lens to `sort_and_filter`, the `SortAndFilterLens.svelte` component takes over the step's content area — the bundle picker / roster / fire button (the Pack Firing Lens) yields the screen to the sort + filter workspace. The operator's pack-firing selections aren't lost; they're preserved in `pack_firing_state` and restored when the operator swaps back.

### Lens swap UI — the step counter in the FLOW header

The existing FLOW header (`1 2 3 4 5`) gets a small affordance per step number:

- **The active lens's short name renders next to the step number.** Step 2 shows `2 · Pack` when Pack Firing is active, `2 · Sort & Filter` when the Sort & Filter lens is active.
- **Right-click (or long-press on touch) on the step number opens a lens menu** for that step. The menu lists all lenses registered for the step, with the active one checked, and a one-line description per lens.
- **Clicking a lens in the menu swaps the active lens.** The current lens's UI tears down; the new lens's UI mounts. State for both lenses persists; the operator can swap back any time without losing work.
- **A tiny chevron icon next to the step number** signals "this step has multiple lenses" — absent when the step has only one lens (no swap available), present when there are 2+.

### Sort toolbar inside the Sort & Filter Lens

The `SortAndFilterLens.svelte` component renders a toolbar at the top of the step area when active. Two affordances for sort (filter affordances land in v0.0.0.4):

1. **Column-header click in the existing record-card list.** Each visible column in the card header (or in the by-record table when that view ships) becomes click-sortable. Click once → asc. Click again → desc. Click a third time → remove from sort.
2. **"Sort by…" pill in the toolbar** for columns that aren't in the visible card header. Opens a small popover listing all sortable columns (grouped: Spine / System / Derived) with asc/desc toggles.

Visual indicators:

- Active sort columns show a small ↑ / ↓ chip next to the column name in the card or in the toolbar.
- Secondary sort key shows the same chip with a `2` superscript; tertiary with `3`.
- When *any* sort is active, the toolbar shows a "Reset" button that clears the sort array (back to natural CSV order).

The toolbar is also where the **derived columns** become operator-visible — they aren't in the card UI by default, so the popover is the only place the operator discovers `has_url`, `socials_count`, `augmentation_tier`. Worth surfacing them in the toolbar with one-line tooltips ("`augmentation_tier`: rich / middle / sparse / private — computed from corpus + URL + socials").

### Persistence

The Sort & Filter Lens's state is stored in `localStorage` keyed by `augment-it:step2:sort_and_filter_state:<record_set_id>`. Inside the slot, the v0.0.0.3 shape is `{ "sort_spec": { ... } }`; v0.0.0.4 will add `"filter_spec": { ... }` alongside. The slot is per-record-set so switching v8 → v9 doesn't carry sort settings across record sets with different schemas.

The active-lens choice per step is also persisted: `augment-it:step2:active_lens:<record_set_id>` holds the name string (`pack_firing` or `sort_and_filter`). If absent, the step renders its default lens (Pack Firing). If invalid (refers to a lens no longer registered), the registry silently falls back to the default and logs.

### Chat surfaces — two verbs for two distinct actions

The Sort & Filter Lens contributes `/sort` (and later `/filter`) for *composing the lens's state*. The registry owns `/lens <name>` for *swapping which lens is active*. These are different actions and should stay separate verbs.

**`/sort` writes state INSIDE the currently-active lens.** Operator types `/sort by lowest corpus first, then alphabetical` (or just `/sort by corpus_count`). The chat composes a sort-spec via Claude's structured-output pattern, dispatches `records_surface.lens_state.update` to write the spec into step 2's `sort_and_filter_state.sort_spec` field. If Sort & Filter isn't the active lens, the chat first proposes swapping to it: *"You're on Pack Firing. Swap to Sort & Filter and apply the sort?"* — one-click accept.

**`/lens <name>` swaps the active lens.** Operator types `/lens sort` (or `/lens pack`, or just *"let me sort these records"*). The chat dispatches `records_surface.swap_lens` with `{ step: 2, lens: 'sort_and_filter' }`. The registry persists the choice and the response-reviewer re-renders step 2 with the new lens active. The operator's prior lens's state is preserved.

Both verbs run workspace-side (UI state, no row-store mutation). The capabilities publish `lens_state.updated` / `lens_swapped` messages that the response-reviewer subscribes to. Cross-microfrontend state is out of scope today; only response-reviewer listens.

### Placement — answered

The v0.0.0.1 draft punted on *"is sort an inline control, a header step, or an agent-inserted intermediary?"* The Lens primitive collapses those positions into one answer with two surfaces:

- **One position.** Sort lives inside the Sort & Filter Lens, which lives at step 2 of the existing FLOW header. The header stepper isn't a Tier-2 hypothetical — it's the shell's existing artifact (`1 2 3 4 5`).
- **Two surfaces, same state.** The toolbar UI (human author) and the `/sort` chat verb (agent author) both write the same `sort_spec` field in the same lens state slot.
- **Swap is its own action.** Operator picks which lens is active for the step via the header step-counter menu (right-click on `2`) or via the `/lens` chat verb. Swap doesn't write any lens's state — it picks which one is rendered.
- **Agent-as-intermediary is a special case of the chat verbs.** When the agent notices the operator about to fire on 96 rows with mostly-cold corpus, it proposes a swap-then-sort via `chat_propose`: *"swap step 2 to Sort & Filter and sort by corpus_count ascending?"* — pre-filled, one-click accept. Not a new position; just composed verbs.

## Files changed

| File | Change |
|---|---|
| `apps/response-reviewer/src/lenses/registry.ts` | NEW — lens registry: compile-time imports of all registered lens manifests, `lensesForStep(step)`, `activeLensForStep(step)`, `swapLens(step, name)`, `lensState(step, name)`. The shell-step-N render pipeline consumes from this. |
| `apps/response-reviewer/src/lenses/step-config.ts` | NEW — small module that declares each step's default lens (`{ 1: 'ingest', 2: 'pack_firing', 5: 'promote', ... }`). Lives apart from registry so a third-party lens can change the default by composing a different step-config without touching the registry source. |
| `apps/response-reviewer/src/lenses/pack-firing/manifest.ts` | NEW — declares `name: 'pack_firing'`, `steps: [2]`, names the existing step-2 UI as a Lens. Points at a `PackFiringLens.svelte` wrapper that hosts today's bundle/roster/fire UI unchanged. |
| `apps/response-reviewer/src/lenses/pack-firing/PackFiringLens.svelte` | NEW — thin wrapper around the existing step-2 UI; reads + writes `pack_firing_state`. Moves the current code into a lens-shaped component without changing what it renders. |
| `apps/response-reviewer/src/lenses/sort-and-filter/manifest.ts` | NEW — declares `name: 'sort_and_filter'`, `steps: [2]`, `display_name: 'Sort & Filter'`, `state_slot: 'sort_and_filter_state'`, `chat_verbs: ['/sort']` (v0.0.0.3); `/filter` joins in v0.0.0.4. |
| `apps/response-reviewer/src/lenses/sort-and-filter/SortAndFilterLens.svelte` | NEW — the lens's UI: sort toolbar (active sort chips + "Sort by…" popover + Reset) above a row list that reads from `byRecord` with the sort applied. |
| `apps/response-reviewer/src/lenses/sort-and-filter/sort-spec.ts` | NEW — pure module: sort-spec validation, sort-spec → comparator function, derived-virtual-column resolvers (`has_url`, `socials_count`, `augmentation_tier`). Standalone-testable. |
| `apps/response-reviewer/src/App.svelte` | Step 2 render block asks the registry for the active lens and mounts its component. The current step-2 inline UI is replaced by `<PackFiringLens />` (the default lens). |
| `apps/response-reviewer/src/app.css` | Lens-content shared styles; lens-specific styles live inside each lens's Svelte component. |
| `apps/shell/src/FlowHeader.svelte` *(or equivalent path)* | Step counter shows active-lens short name (`2 · Pack`, `2 · Sort & Filter`) when the step has >1 lens; renders a chevron icon to signal "multiple lenses available." Right-click / long-press opens the lens menu component. |
| `apps/shell/src/LensMenu.svelte` | NEW — popover that lists `lensesForStep(N)` with the active one checked; clicking swaps. |
| `services/workspace/src/capabilities.ts` | NEW capabilities: `records_surface.lens_state.update` (writes a named lens's state into the step-scoped slab) and `records_surface.swap_lens` (sets the active lens for a step). UI-only, workspace-side. |
| `services/workspace/src/chat.ts` | `V001_CHAT_VERBS` gains `/sort` (writes sort_spec inside the active Sort & Filter Lens) and `/lens <name>` (swaps the active lens). Recognition shortcuts: `sort by`, `order by` → `/sort`; `switch to sort lens`, `swap to pack firing`, `change lens` → `/lens`. |
| `apps/chat/src/ChatSurface.svelte` | COMMANDS popover registry gains `/sort` and `/lens`. |
| `apps/chat/src/ResponseModeRenderer.svelte` | Result-bubble branches for both new capabilities: one shows the composed state-spec, the other confirms the swap with old → new lens names. |

## Open questions

### Lens-primitive questions (swappable model)

- **Step ids: number or slug?** v1 uses `steps: [2]`. A slug (`steps: ['rows-to-fire-against']`) reads better and survives renumbering, but couples the registry to the shell's step naming. Lean: number for v1 (the shell stepper already shows numbers `1 2 3 4 5`); slug becomes worth the cost when a second app reuses the lens registry against a differently-numbered stepper.
- **How does the registry discover lenses?** v1 = compile-time imports listed explicitly in `registry.ts`. No file-scan, no dynamic registration. The demo value of Lens is in *naming the seam*, not in plumbing discovery. Revisit when a lens has to ship without the response-reviewer's build seeing it. The architecture allows it (the manifest contract is the seam); v1 doesn't deliver it.
- **What's the menu interaction model — right-click, hover-popover, dedicated icon button, or all three?** Right-click is precise but discoverability is poor. A small chevron next to the step number signals "more options" without a hover. Hover-popover risks pickiness on touch. Lean: chevron icon next to the step number triggers the menu on click; right-click on the step number also triggers it (alternate path). Touch: long-press.
- **Should the active-lens short name render in the step counter when there's only one lens for that step?** Lean: no — it adds clutter (`1 · Ingest`, `5 · Promote` for single-lens steps). Only render the short name when the step has ≥2 lenses available, where the name communicates *which is currently chosen*. Single-lens steps render as just the number.
- **What about lenses that can mount on multiple steps?** A debug lens might declare `steps: [1, 2, 3, 4, 5]`. It appears in every step's menu. Operator can have it active on step 2 while step 3 runs its default. The lens's state slot is per-step or shared — needs a manifest field (`state_per_step: boolean`). Lean: default `true` (separate state per step the lens is active on); a few rare lenses opt out.
- **Can a lens be the default for a step it didn't declare itself the default of?** Lean: no — defaults are owned by `step-config.ts` (the curated opinion), separate from the lens's manifest. A third-party lens declares its capability ("I can mount on steps 2 and 3"); the step-config decides whether it's the *default* for either.
- **Should the lens registry have a chat-introspection verb (`/lenses`)?** Operator types `/lenses` and the chat lists which lens is active on each step, plus all available lenses per step. Useful and worth a sketch alongside `/lens <name>` — same surface, different angle (browse vs swap). Lean: ship `/lenses` together with `/lens` in v0.0.0.3.
- **Cross-microfrontend lens state.** If the workspace eventually knows what's active and proposes verbs based on it, lens state needs a shared bus. v1 scopes lens state to response-reviewer only; cross-mfe is a YAGNI item.
- **What about a "third-party lens" ergonomics path — how does someone outside the core team add a lens?** v1: drop a directory under `apps/response-reviewer/src/lenses/<name>/`, add an import in `registry.ts`, ship a PR. Not friction-free but legible. v2 (post-validation): the directory drop is enough; a build-time scan picks it up. Vendor-side / user-customized lenses are *possible by architecture*, not *productized* in v1. Worth a separate exploration once a real third-party-lens request appears.

### Sort-specific questions (from v0.0.0.1, lightly amended)

- **Should `/sort` also accept a structured argument, not only natural language?** E.g. `/sort {"sort":[{"column":"corpus_count","direction":"asc"}]}`. Lean: yes — it's free, and tests easier. Document but don't promote in the popover.
- **How does sort interact with grouping?** Records Surface today renders by `record_set_id` via `byRecord` (each record gets one card). No grouping beyond that. Once filter ships and the operator can filter to a subset, sort applies to the subset. No special "sort within group" semantics needed in v1.
- **What happens when the operator changes record sets mid-sort?** Per the localStorage-keyed-by-record-set-id rule: v8's sort is preserved in its key; switching to v9 reads v9's saved sort (or starts blank). No transfer.
- **Does sort affect the per-row connector palette's firing order?** Today the palette fires per-record; the operator clicks a chip on the card. Sort changes card order, so yes — the operator naturally fires in sorted order. No additional contract.
- **Numeric detection threshold.** ≥80% of non-empty values must parse as numbers for the column to get numeric sort. Lean: keep at 80%. Lower invites false positives ("v10" string columns flipped to numeric); higher misses legitimate numeric columns with a stray non-numeric row.
- **`augmentation_tier` thresholds.** Rich = corpus_count ≥ 5, middle = has_url AND has_socials AND corpus_count < 5, sparse = (has_url OR has_socials) AND corpus_count < 5, private = no URL, no socials, no corpus. These are *opinions*, not facts. Should they be operator-configurable? Lean: yes, in v2 via a sort-config block on the record set; defaults named here for v1.
- **Should `/sort` show a propose-style confirmation before applying, like `/inbox` does for ambiguous URLs?** Lean: no for explicit `/sort` verbs (the operator typed sort syntax — confidence high). Yes when sort is proposed *inside another verb's flow* (e.g. the agent suggests sort before `/fire pack`) — that's the propose-an-action chat pattern, opt-in by design.
- **Does the v9 emit need an opt-in to write derived columns?** `has_url`, `socials_count`, `augmentation_tier` aren't in v9 today. A future `/promote-snapshot --include-derived` (or a config flag) could emit them so the CSV the operator hands to a colleague carries the tier classification. v1 keeps them sort-only.
- **Cross-microfrontend sort.** If shell-level sort becomes a thing (e.g. the workspace knows the active sort and proposes verbs based on it), this capability needs a real owner. v1 scopes it to response-reviewer only.
- **What about Stage sort?** The current spine column is string-shaped. Real operator value comes from ordinal sort. v1 ships string-sort (cheap, mostly-good); v2 adds `stage_order: ["New", "Early", "Mid-stage", ...]` config.

## See also

- [[../explorations/Operator-Built-Flows-Beyond-The-Universal-Pipeline]] — the parent exploration. This spec implements §Tier 1's *sort* primitive; filter + view-persistence specs follow.
- [[../plans/Augmentation-State-Preservation-and-Snapshot-Promotion]] — the plan that just shipped (v0.0.0.2). The v9 system columns this spec sorts on are the artifact that plan produced.
- [[../specs/Funder-Content-Corpus-Workflow]] — Rule 5 (operator authority per item) is what makes operator-driven sort ideologically aligned, not a deviation from a "system-recommended order."
- [[../specs/Chat-Context-Awareness-Architecture]] — the `/sort` chat verb is the next instance of the derived-verb-registry pattern this spec's v0.0.2 names. Sort is bounded enough to be a good early test of agent-composed structured output.
- [[../specs/Shell-and-Micro-Frontend-UX-Coherence]] — the existing FLOW header stepper (`1 2 3 4 5`) is where Lenses mount. This spec doesn't change the stepper's shape, but it introduces the first artifact (the sort Lens) that *lives inside a step rather than being a step itself*. The shell spec should grow a §"Lenses on steps" note when this spec lands.
- [[../specs/Response-Reviewer-Shell-and-Content-Reader-Mode]] — Records Surface lives in this app; sort UX adds to its existing view-mode controls without replacing them.
- [[../specs/Connector-Inventory-and-Per-Record-Palette]] — the per-record palette fires in sorted card order; no new contract, but the composition is worth flagging.
- [[../../changelog/2026-06-09_01_Inbox-PDFs-Land-as-Binaries-Plus-Chat-Commands-Popover]] — today's ship. The COMMANDS popover this spec extends with `/sort`.
