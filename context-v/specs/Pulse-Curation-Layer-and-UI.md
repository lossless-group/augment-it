---
title: "Pulse Curation Layer & UI — Three Layers per Category, Triage Per Item, Finalize on Demand"
lede: "Pulse-shaped bundles (Entity Pulse and its siblings) produce multi-item structured rollups that the human triages item-by-item. The data model needs three layers per category — an immutable `raw_output` from the LLM fan-out (audit trail), a live `curated_output` that updates as the user accepts to canonical, accepts to additional context, or discards each item, and an immutable `finalized_output` snapshot taken when the user marks the triage done. Re-firing a bundle later creates new raw + curated layers; the previous finalized is sticky. This spec codifies the three-layer pattern, the triage actions, the row schema, and the UI shape — the layer the Response Reviewer (per Decision §10) renders for pulse-shaped responses."
date_created: 2026-06-02
date_modified: 2026-06-02
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
semantic_version: 0.0.0.1
tags:
  - Spec
  - Augment-It
  - Curation
  - Triage
  - Response-Reviewer
  - Pulse-Bundles
  - Human-In-The-Loop
  - Data-Model
status: Draft
---

# Pulse Curation Layer & UI

## Why this exists

[[Entity-Pulse-Bundle]] (and the Pulse-shaped bundles that follow it)
fire a fan-out of source-bound packs whose outputs are aggregated by
agent-bound *rollup* packs into multi-item structured records — one
rollup per category, each carrying a synthesis (summary + themes) and
the constituent items that fed it. Multi-item structured outputs
break the existing write-back model.

Profile Builder's outputs are single records per pack (`{ url,
display_name, confidence }` for the LinkedIn pack, etc.), so the
write-back semantics there are simple — "accept" replaces
`row.socials[]` by pack_id. Pulse-shaped rollups carry **N items per
category** (anywhere from 3 to 240 depending on the entity's public
footprint), and the human triages them one by one. The data model
needs to:

1. **Preserve the LLM's raw output** as an audit trail — the
   `relevance_reasoning` the LLM gave for an item the human
   ultimately discarded is still valuable signal for tuning the
   `relevance_context` next time.
2. **Track the human's curation decisions** live, as they happen —
   accept-canonical, accept-additional-context, discard.
3. **Lock the curated state** when the human says "I'm done" — so
   the next re-fire doesn't blow away the work the human did
   last time.

This is the *Pulse Curation Layer*. The framing is locked from the
[[Entity-Pulse-Bundle]] philosophy: **LLMs fan out, humans filter
in.** This spec defines the *how* of "filter in."

## The three layers per category, per row, per run

```
row.<category>_pulse: {
  raw_output:        <Rollup>,            // immutable; LLM fan-out result
  curated_output:    <Rollup>,            // live; updates as user triages
  finalized_output?: <Rollup>,            // immutable; snapshot at finalize
  finalized_at?:     string,              // ISO-8601; when finalize was clicked
  finalized_by?:     string,              // user_id of the human who finalized
  run_id:            string,              // links back to the fan-out run
}
```

`<Rollup>` is the per-category rollup shape declared in the bundle's
spec (e.g. `OfficialUpdatesRollup` from Entity Pulse). Each layer
holds the **same shape**, but the `triage_state` field on each item
diverges across layers (see "Per-item triage state" below).

### `raw_output` — immutable; the LLM said this

Written once when the bundle's rollup-agent finishes pass 2. Never
modified. Carries:

- The full `items[]` list (no soft cap; cap only at the agent's
  side if the total exceeds payload limits — and even then, the cap
  is recorded in `meta`).
- The summary, themes, and per-item `relevance_reasoning` exactly as
  the LLM produced them.
- A timestamp + the model id that produced it (`generated_at`,
  `model_id`) for reproducibility.

The raw layer is the **answer to "what did the LLM find?"** — it
survives forever, even if the human later discards every item.

### `curated_output` — live; what the human is doing right now

Initialized as a deep copy of `raw_output` with every item's
`triage_state` set to `'pending'`. Updates as the human acts in the
Response Reviewer UI:

- Click *accept-canonical* on item #4 → that item's
  `triage_state` becomes `'accepted_canonical'` AND the canonical
  promotion logic runs (writes the relevant fields back to
  `row.fields.canonical` — see "Triage actions" below).
- Click *accept-additional-context* on item #7 → `triage_state`
  becomes `'accepted_context'`; the item is kept on the row in the
  curated layer but not promoted to canonical.
- Click *discard* on item #12 → `triage_state` becomes
  `'discarded'`; the item stays in `curated_output.items` (so the
  human can un-discard) but is filtered out of UI views.

The curated layer is the **answer to "what does the human think so
far?"** — it's the working view, always reflects the latest click.

The `summary` and `themes` in `curated_output` MAY regenerate as the
human curates (if the human discards 80% of the items, the original
summary no longer reflects the kept set). v1 keeps the raw summary;
v2 candidate adds a "refresh summary" action that re-runs the LLM
against the curated subset.

### `finalized_output` — immutable; the human signed off

When the human clicks the **Finalize** action on the category, a
snapshot of `curated_output` is taken and written to `finalized_output`
with `finalized_at` + `finalized_by`. From that moment:

- `curated_output` becomes read-only.
- Re-firing the bundle later creates a NEW `run_id` + NEW
  `raw_output` + NEW `curated_output` (initialized again with
  `pending` triage state). The previous `finalized_output` is
  preserved as the historical artifact; the new run is what the human
  works on.
- Canonical promotions from `finalized_output` stay in
  `row.fields.canonical`. New items the human promotes in the new
  run merge in (with sensible conflict resolution — see Open
  questions).

The finalized layer is the **answer to "what did the human keep,
and when did they sign off?"** — it's the durable curation outcome.

### Multiple runs per row over time

```
row.official_updates_pulse: {
  current: {
    raw_output, curated_output, run_id, ...
  },
  history: [
    { raw_output, finalized_output, finalized_at, run_id, ... },
    { raw_output, finalized_output, finalized_at, run_id, ... },
  ],
}
```

`current` is the active run (raw + curated, optionally finalized).
`history` is the immutable trail of past runs. When the user
re-fires, the *previous* `current` (assuming it had been finalized)
moves into `history` and a new `current` is created.

Open question: cap on `history` length per row. Lean: no cap; users
can prune from the UI if storage becomes a concern. The history is
small (per row × number of re-fires; most rows will re-fire a
handful of times over a project lifecycle).

## Per-item triage state

Each item in a rollup's `items[]` array carries:

```ts
export type TriageState =
  | 'pending'              // raw_output default; not yet curated
  | 'accepted_canonical'   // promoted to row.fields.canonical
  | 'accepted_context'     // kept as additional context, not canonical
  | 'discarded';           // human said no; stays in raw, hidden in curated views

export type ItemTriage = {
  triage_state: TriageState;
  triaged_by?: string;     // user_id
  triaged_at?: string;     // ISO-8601
  triage_note?: string;    // optional human comment ("kept for the 2023 grant context")
};
```

Items in `raw_output` carry `triage_state: 'pending'` and the other
ItemTriage fields unset.

Items in `curated_output` carry whichever state the human's last
action set; `triaged_by` + `triaged_at` are filled on first action;
the note is optional.

## The three triage actions

### `acceptCanonical(item, target_field?)`

Promotes the item into `row.fields.canonical` — the authoritative
knowledge base for the row. Different categories promote into
different fields:

| Category | Default canonical target |
|---|---|
| OfficialUpdates | `row.fields.canonical.official_links[]` |
| MediaMentions | `row.fields.canonical.media_links[]` |
| SocialsMentions | `row.fields.canonical.socials_mentions[]` |

The action also marks the item `accepted_canonical` in
`curated_output`.

`target_field` lets the human override the default — e.g. promote a
news mention into `row.fields.canonical.investor_communications[]`
instead. The available targets are declared per-category in the
bundle spec.

### `acceptAdditionalContext(item, context_bucket?)`

Keeps the item as supporting evidence — it stays on the row, it's
discoverable in the curated layer, but it doesn't enter the
canonical fields. The natural home is:

```
row.additional_context.<category>.<bucket>[]
```

Default `context_bucket` is the item's `content_type` (e.g.
`'official_blog_entry'`) so the additional-context store is
indexed by the LLM's classification.

Used for items that are valuable for downstream analysis or
contextual color but shouldn't be elevated to the "this is the
canonical truth" tier — e.g. a thematic-inclusion media piece that
gives useful background but isn't core to the entity's profile.

### `discard(item, reason?)`

Marks the item `discarded` in `curated_output`. The item stays in
`raw_output.items` (audit trail) and in `curated_output.items` (so
un-discard is possible) but is filtered from default views.

`reason` is optional but useful — feeds the future tuning of the
`relevance_context` brief ("LLM kept returning sports coverage;
adjust the brief to exclude that").

### Bulk variants

For high-volume entities, per-item clicking is untenable. The UI
exposes:

- `acceptAllInBucket(category, content_type)` — e.g. *"accept all
  press releases to canonical."*
- `discardAllBelowConfidence(category, threshold)` — e.g. *"discard
  every item with confidence < 60."*
- `discardAllBelowRelevance(category, threshold)` — symmetric.
- `acceptAllInTopN(category, view, N, target)` — e.g. *"accept the
  top 5 by most_relevant to canonical."*

Each bulk action writes the same triage-state updates per item;
they're shortcuts, not a different write path. Audit trail
preserves which action ran.

## The Finalize moment

When the human clicks **Finalize <Category>**, the system:

1. Snapshots `curated_output` to `finalized_output` (deep copy).
2. Writes `finalized_at` (now) and `finalized_by` (current user).
3. Locks `curated_output` to read-only.
4. **No new canonical writes happen at finalize.** Canonical writes
   happen per-click during curation; finalize is the audit moment,
   not the persistence moment.
5. The UI surfaces a "View finalized" toggle that swaps
   `curated_output` and `finalized_output` so the human can compare
   their final state.

A category can be re-fired without finalizing — but the unfinalized
curated state moves into history *as-is* (with `finalized_at: null`)
when the re-fire happens, so the audit trail still captures it.

Open question: should re-firing require the previous run to be
finalized, or warn-but-allow? Lean: **warn-but-allow.** The human
knows their data; forced finalization is paternalistic.

## Row schema integration

```ts
// Extended row.fields:
row.fields.canonical: {
  // The promoted canonical values across categories
  official_links: Array<{ url, title, confidence, content_type, ... }>;
  media_links:    Array<{ url, title, source, confidence, ... }>;
  socials_mentions: Array<{ url, platform, ... }>;
  // ... other canonical fields from other bundles
};

// New top-level row state:
row.additional_context: {
  official_updates: { /* buckets per content_type */ };
  media_mentions:   { /* buckets per content_type */ };
  socials_mentions: { /* buckets per platform */ };
};

// Per-category pulse state:
row.official_updates_pulse: PulseCategoryState<OfficialUpdatesRollup>;
row.media_mentions_pulse:   PulseCategoryState<MediaMentionsRollup>;
row.socials_mentions_pulse: PulseCategoryState<SocialsMentionsRollup>;

// The shared wrapper:
type PulseCategoryState<R> = {
  current: {
    run_id: string;
    raw_output: R;
    curated_output: R;
    finalized_output?: R;
    finalized_at?: string;
    finalized_by?: string;
  };
  history: Array<{
    run_id: string;
    raw_output: R;
    finalized_output?: R;
    finalized_at?: string;
    finalized_by?: string;
  }>;
};
```

## UI shape — Response Reviewer's pulse-bundle view

Decision §10 in [[Shell-and-Micro-Frontend-UX-Coherence]] established
that Request Reviewer becomes a composite slot that adapts to the
request type. Response Reviewer (the *post*-flight surface) has the
same logic to grow: when the response is a pulse-shaped rollup, render
the Pulse Curation surface.

### Per-category card

One card per category (OfficialUpdates, MediaMentions,
SocialsMentions). Card header carries:

- Category label.
- Counts: total items, accepted-canonical, accepted-context,
  discarded, pending. (Color-coded chips per principle §2.)
- View switch: **All** | **Most Recent** | **Most Relevant** |
  **Pending Only** (default = Pending Only so the human can drive
  through what's left to curate).
- The relevance_context brief used (collapsed by default; expandable
  for inspection / one-click "re-fire with new brief").
- **Finalize** button (disabled until at least one item is curated).

### Per-item row

Each item renders with:

- Confidence pill + Relevance pill (the existing pill UI from
  Profile Builder).
- Title + source/domain + age ("3 days ago" / "3 years ago" — the
  human eye reads this faster than dates).
- Snippet (collapsed to ~150 chars; expandable).
- `relevance_reasoning` (collapsed; expandable) — so the human can
  audit the LLM's call.
- Three triage buttons: ✓ canonical / + context / ✗ discard.
- Optional note field (appears on action; auto-saves).

### Bulk controls

A bulk-actions row at the top of each card (per "Bulk variants"
above). Disabled until the human has filtered the view.

### Finalized review

After finalize, the card switches to a read-only "finalized" mode
with a "View raw output" link that pops the immutable LLM output side
by side for comparison.

### History panel

A small "Run history" disclosure per category shows previous runs as
timeline entries: `2026-05-12 — finalized by Michael — 24 items kept
canonical, 8 to context, 31 discarded.` Clicking opens that run's
finalized_output as read-only.

## Open questions

- **History storage strategy.** Per-row growth concern at scale. Cap
  per row? Soft-delete past raw_outputs after N months? Lean: no cap
  for v1; revisit when storage becomes a real concern.
- **Re-fire merge resolution.** When a new run produces an item with
  the same URL as a previously-finalized canonical entry, what
  happens? Options: (a) auto-skip in the new raw_output (the human
  already decided); (b) include but mark `previously_accepted` in
  metadata; (c) include without flag. Lean: (b) — preserves audit
  trail, doesn't pretend the LLM didn't find it again.
- **Summary regeneration on heavy curation.** v1 keeps the raw
  summary in `curated_output`; v2 candidate is "refresh summary"
  action. Open: is this automatic when discarded fraction crosses
  a threshold, or manual?
- **Cross-category promotion.** Can an item in MediaMentions be
  promoted to canonical via a target that lives in another
  category's field tree? Probably yes (the user knows where it
  belongs); how does the UI surface that? Lean: a small "Promote
  to other category" dropdown on each item; surfaces uncommon but
  matters for power users.
- **Finalize-without-curation.** If the human clicks Finalize without
  triaging any item, what happens? Lean: warn ("you haven't curated
  any items; finalize anyway?") and allow.
- **Bulk action audit detail.** A bulk action that discards 47
  items at once — do we log it as 47 individual triage events
  (audit-trail purity) or 1 bulk event (storage)? Lean: 1 bulk event
  + 47 item-state updates referencing the bulk event id.
- **Profile Builder retroactive adoption.** `row.socials` is half-an-
  instance of this pattern today (curated state but no raw_output
  preservation, no finalize moment). Should it migrate to this
  spec's shape? Lean: yes, in a separate pass, once this spec ships
  for Entity Pulse.

## Composability with bundles

- **[[Entity-Pulse-Bundle]]** — the first instance; three categories
  (OfficialUpdates, MediaMentions, SocialsMentions), three rollups,
  three curation states per row.
- **[[../blueprints/Packs-and-Bundles-Pattern]]** — needs a section
  named "Pulse-shaped bundles" describing the rollup + curation
  pattern when this spec lands. Candidate addendum.
- **Profile Builder** — retroactive adoption candidate (see Open
  questions).

## Related

- [[Entity-Pulse-Bundle]] — the bundle this spec serves; defines the
  per-category rollup shapes referenced here.
- [[Connector-Inventory-and-Per-Record-Palette]] — adds the per-
  record palette as a fourth triage-action sibling (refire). Re-fire
  is additive: it never overwrites items the human has already
  curated; it appends new items to `raw_output.items[]` with their
  originating `connector_id` and `triggered_by: 'human-refire'`.
- [[Shell-and-Micro-Frontend-UX-Coherence]] §Decision §10 — adaptive
  Request Reviewer; Response Reviewer's pulse-curation surface is its
  *post*-flight sibling.
- [[Response-Reviewer-and-Response-Store]] — where the Per-category
  card chrome lives; the existing surface gets a new "pulse" view
  type when this spec ships.
- [[../blueprints/Packs-and-Bundles-Pattern]] — the parent pattern
  this spec extends with pulse-shaped semantics.
