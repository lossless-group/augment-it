---
title: "Record-Set Family Grouping — internal lineage vs. external-variant families in the Record Collector sidebar"
lede: "The Record Collector sidebar lists every record set as a peer, which makes a tracker uploaded as v4 / v5 / v6 / v7 / v8 look like five unrelated CSVs and an in-app promotion chain look the same as a fresh upload. Two distinct family signals deserve first-class representation: the **internal-lineage family** (already in the data model via `promoted_from`) and the **external-variant family** (not modeled — separate uploads the user explicitly groups, or whose filenames share a stem). This spec defines the field, the grouping mechanism, the sidebar rendering, and the interaction with [[Enhanced-Records-List-and-Promotion-Checkpoint]] and the new two-CTA `Augment this Set` panel."
date_created: 2026-06-05
date_modified: 2026-06-05
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
semantic_version: 0.0.0.1
status: Draft
tags:
  - Spec
  - Augment-It
  - Record-Collector
  - Record-Set
  - Lineage
  - Family-Grouping
  - Sidebar
  - Workspace-Schema
---

# Record-Set Family Grouping

## What this is

A definition of **record-set families** in Augment-It — how the Record
Collector sidebar should group related sets so the user sees one family
(with its members) instead of a flat list of look-alike rows.

The current sidebar (`apps/record-collector/src/components/RecordSetsList.svelte`)
sorts every `RecordSet` by `created_at` descending and renders each as a
peer card. With a real working corpus that loses information in two
distinct ways:

1. **Internal promotions.** When the human promotes a triaged subset in
   [[Enhanced-Records-List-and-Promotion-Checkpoint]], a new `RecordSet`
   is created with `promoted_from.record_set_ids` populated and the
   predecessors get `archived: true`. The sidebar should hide archived
   sets by default; once it does, this case is largely invisible to the
   user — *except* when they want to walk back through a chain or compare
   against a specific generation, in which case the chain should still
   be reachable.

2. **External variants.** The case captured in the screenshot that
   prompted this spec: five CSVs uploaded over several days, each named
   `…_Master-Pipeline-Tracker--Active-Pipeline_v{4,5,6,7,8}.csv`. None
   of them know about each other — `promoted_from` is empty on every
   one. The shared filename stem is the only signal they belong
   together, and that signal currently does nothing.

Both cases produce a **family**: a directed (lineage) or undirected
(variant set) cluster of `RecordSet`s the user thinks of as
"the same thing, different versions." The spec gives both first-class
treatment.

## Why now

Three forcing functions:

- The Master-Pipeline-Tracker CSVs above are the *active working
  corpus* — every working session of augment-it right now spends time
  re-finding which version is current, and the sidebar is noisy.
- The new `Augment this Set` panel (the two-CTA panel that replaced the
  single button per [[Flow-for-Bundles-Packs]]) needs to act on a
  well-defined target. If the user augments `v7.csv` instead of `v8.csv`
  because the sidebar didn't make the relationship obvious, the
  enrichment pass goes against stale data.
- The internal-lineage primitive in the data model
  (`packages/workspace/src/types.ts` — `RecordSet.promoted_from`) has
  been load-bearing since [[Enhanced-Records-List-and-Promotion-Checkpoint]]
  shipped but has no surface. This spec is the place that surface lands.

## Two distinct family signals

This is the load-bearing distinction in the spec — both deserve UI, but
they are not the same thing, and conflating them produces wrong answers
(e.g., a fresh upload that shares a filename stem with a promoted chain
must not silently graft itself onto the chain's history).

### Signal 1 — internal lineage (already modeled)

Created by `record_set.promote` in `services/row-store/src/store.ts`.
Each promoted set carries:

```ts
// packages/workspace/src/types.ts (existing)
promoted_from?: {
  record_set_ids: string[];   // predecessor IDs merged into this one
  promoted_at: string;
  record_count: number;
};
schema.source = {
  kind: 'promotion';
  promoted_from: string[];
  promoted_at: string;
  record_count: number;
};
archived: boolean;            // true on the predecessors after promote
```

A **lineage family** is the transitive closure of `promoted_from`
pointers: walk back from any leaf to all ancestors, walk forward by
finding every set whose `promoted_from` includes a known member.

The order within a lineage family is **strict** — each member has a
generation index (number of promote steps from the root), and only the
unarchived leaf is the *current* version. Archived members are reachable
but visually de-emphasized.

### Signal 2 — external-variant family (new — to be modeled)

Created when the user uploads multiple CSVs that represent the same
external dataset evolving over time, but where no in-app promotion ever
linked them. Today this signal does not exist in the data model.

A **variant family** is an **unordered, user-curated set** of
`RecordSet`s. There is no canonical "current" member — the user picks
which one is the working leaf. Sets can be added to or removed from a
variant family at any time, and a single `RecordSet` can belong to at
most one variant family.

A variant family **may also contain lineage families**. Example: the
user uploads `…_v7.csv`, runs three promote rounds against it producing
a 4-generation lineage, then later uploads `…_v8.csv` from the external
source and links it as a variant of the v7-rooted lineage. The variant
family now contains two members from the user's perspective (v7 and v8)
but five `RecordSet` records from the data model's perspective (v7 plus
its three promoted descendants, plus v8). The sidebar must render this
correctly — see [§Sidebar rendering](#sidebar-rendering).

## Data-model decisions

### Decision 1 — add a `variant_family_id` to `RecordSet`

New field on `RecordSet` in `packages/workspace/src/types.ts`:

```ts
variant_family_id?: string;   // null/undef = not in a variant family
variant_family_label?: string; // user-editable display name
```

Convention for `variant_family_id`: `vf_{base36-timestamp}_{rand}`,
generated at first-link time. Stable; never reassigned. A `RecordSet`
joins a family by acquiring its id; leaves by clearing it.

The label is owned by the family's *first* member and stored on every
member (denormalized, so any single-row read renders the family name
without a second lookup). Renaming the family updates the label on
every member in a single transaction.

### Decision 2 — variant families are explicit, not heuristic

Filename stems like `_v8.csv` / `_v7.csv` are a *suggestion*, never an
automatic grouping. The Record Collector surfaces a "Looks like a
variant of [N] existing set(s) — link as family?" prompt when a fresh
upload matches an existing stem heuristic (see
[§Variant detection heuristic](#variant-detection-heuristic)), and the
user accepts or dismisses. Auto-linking is rejected because filenames
in the working corpus are not reliable — a CSV named `…_v8.csv` can
legitimately be the start of a brand-new pipeline rather than the next
version of an existing one, and silently grafting it produces wrong
enrichment targets.

### Decision 3 — lineage families remain implicit (computed at read time)

No new field needed for lineage families. The relationship is already in
`promoted_from`. The workspace service grows one helper:

```ts
// services/row-store/src/store.ts (new)
function lineageFamily(rootOrLeaf: string): RecordSet[];
```

returning every set transitively reachable via `promoted_from` from the
input, ordered by generation. The sidebar calls this once per visible
leaf at render time.

### Decision 4 — variant_family scope, not record scope

`variant_family_id` lives on `RecordSet`, not on `Row` or `record_uuid`.
Cross-set record identity is already handled by `record_uuid` per
[[Enhanced-Records-List-and-Promotion-Checkpoint]] §4. The two systems
compose but stay separate: `record_uuid` tells you *the same record*
across a lineage, `variant_family_id` tells you *the same dataset*
across user intent.

## Sidebar rendering

The Record Collector sidebar becomes family-grouped.

```
┌─────────────────────────────────────────────┐
│ RECORD SETS                       [refresh] │
├─────────────────────────────────────────────┤
│ ▾ Master-Pipeline-Tracker (5 variants)      │
│   ● 2026-06-05_…_v8.csv      30 cols · 96 r │  ← active leaf
│   ○ 2026-05-28_…_v7.csv      30 cols · 96 r │
│   ○ 2026-05-28_…_v6.csv      30 cols · 96 r │
│   ○ 2026-05-28_…_v5.csv      28 cols · 96 r │
│   ○ 2026-05-23_…_v4.csv      27 cols · 96 r │
├─────────────────────────────────────────────┤
│ ▸ Donor-Lineage-Demo (1 variant, 4 gens)    │  ← variant w/ lineage
├─────────────────────────────────────────────┤
│ Reach DC Invite — RSVP List.xlsx            │  ← ungrouped
│                              6 cols · 39 r  │
└─────────────────────────────────────────────┘
```

Rules:

- **Family group header** shows family label, variant count, and (if
  any lineage inside) generation count. Expanded by default; collapse
  state persisted in `localStorage` per `variant_family_id`.
- **Active leaf** (current selected set) gets a filled marker (`●`) and
  emphasized name. Other members get an outline marker (`○`).
- **Archived lineage members** render in a secondary, indented section
  inside the family group titled "Earlier generations (archived)",
  collapsed by default. The user can expand to walk back through them.
- **Ungrouped sets** (no `variant_family_id`, no `promoted_from`)
  render as top-level cards just like today — no regression for the
  trivial case.
- **Per-set actions** (`↓ CSV`, `×` delete) stay per-card. Family-level
  actions (rename, dissolve, ungroup-one) live in a `⋯` menu on the
  family header.
- **Sort within family**: variant siblings sort by `created_at`
  descending. Lineage descendants of any variant sort by generation
  ascending (oldest generation on top of that sub-list) — so the user
  reads "this leaf came from that root."
- **Sort across families**: family groups sort by the `created_at` of
  their *most recent* member descending. Ungrouped sets interleave by
  their own `created_at`.

## The Augment-this-Set CTA targets the leaf, not the family

The two-CTA panel introduced by the previous patch
(`Augment this Set` → `Run a Prompt →` / `Run a Bundle / Packs →`) acts
on the **active leaf**, never on the family as a whole. Enrichment is a
single-set operation; there is no defined semantics for "augment all
variants in this family" and we should refuse the affordance rather
than invent one.

The panel stays anchored in the rows pane (it does today). The family
group header in the sidebar gets a small "augmenting →" indicator next
to the active leaf so the user can confirm at a glance which member is
the augmentation target.

## Variant detection heuristic

Triggered on every `record_set.ingest` and `record_set.ingest.xlsx`.
After the new set persists, the service computes a *suggested family
match* and emits it as a one-shot event the Record Collector surfaces as
a non-blocking prompt:

```
"Looks like a variant of Master-Pipeline-Tracker (5 existing sets) —
 link as family?  [link]  [dismiss]"
```

Match algorithm:

1. Extract a normalized stem from the new filename:
   - Strip leading `YYYY-MM-DD_` date prefix.
   - Strip trailing `_v\d+`, `_V\d+`, `-v\d+`, `-V\d+`, ` (\d+)`, or
     `\.\d+` version markers.
   - Strip the extension.
   - Replace any run of non-alphanumeric chars with a single `-`.
   - Lowercase.
2. Compare against the same-normalized stems of every existing
   `RecordSet` not in the archive.
3. If ≥1 match exists with the same `schema.fields.length` ± 3 columns
   (allow modest schema evolution between exported versions), suggest
   the family.
4. If exactly one existing variant family already contains a matching
   stem, suggest joining it. Otherwise suggest creating a new family
   with the matched sets.

The heuristic is *suggestion-only*. Auto-link is rejected per
[Decision 2](#decision-2--variant-families-are-explicit-not-heuristic).
The dismiss action is sticky per stem — dismissing a suggestion for
`master-pipeline-tracker` means the prompt does not reappear for that
stem until the user explicitly opens "Find variants of this set" from
the family-header `⋯` menu.

## Capabilities to add to the workspace

```ts
// services/row-store/src/store.ts — new capabilities
'variant_family.create'   args: { label: string; record_set_ids: string[] }
                          returns: { variant_family_id: string }
'variant_family.update'   args: { variant_family_id: string; label?: string }
'variant_family.add'      args: { variant_family_id: string; record_set_id: string }
'variant_family.remove'   args: { record_set_id: string }
'variant_family.dissolve' args: { variant_family_id: string }
'record_set.suggest_variant_family'
                          args: { record_set_id: string }
                          returns: { match?: { variant_family_id?: string; stem: string; record_set_ids: string[] } }
```

All five mutate-emit a `variant_family.{created|updated|deleted}` or
`record_set.updated` broadcast on the workspace bus so any mounted
consumer (the sidebar, the Enhanced Records List, future surfaces)
re-renders without polling.

## Migration

- The new fields default to `undefined` on every existing `RecordSet`
  read from the store — backwards-compatible, no migration required for
  pre-existing data.
- A one-off `scripts/suggest-variant-families.ts` can sweep the current
  workspace, emit suggestions per the heuristic, and write a JSON
  proposal the user reviews. Out of scope for v0; mentioned so future
  work has a landing place.

## Open questions

- **Cross-tenant**: variant families are scoped to the workspace's user
  for now. If/when multi-user workspaces arrive, families likely become
  shared-by-default — out of scope here, but the `variant_family_id`
  shape already accommodates it.
- **Auto-archive on join**: when a user links `v8.csv` to a family that
  already contains `v7.csv`, should `v7.csv` archive automatically the
  way a promoted predecessor would? Spec says **no** — variant families
  are explicit and external, archival is the lineage-family concept.
  But we should watch whether users hit "I always want the prior
  variant out of sight" and treat that as a follow-up if so.
- **Pack Runner & PTM family-awareness**: do downstream surfaces show
  the family context when an enrichment target is set? Probably yes in
  a future spec; out of scope for the storage + sidebar work here.

## See also

- [[Enhanced-Records-List-and-Promotion-Checkpoint]] — defines `record_uuid`,
  `promoted_from`, and the archival semantics on predecessors.
- [[Original-and-Enhanced-Record-Instances]] — the generational model
  this builds on.
- [[Flow-for-Bundles-Packs]] — defines the `Augment this Set` two-CTA
  panel whose target is constrained here.
- [[Per-Record-Iteration-as-Primary-Surface-for-Pack-Fires]] — the
  single-record `enrich ›` path, unchanged by this spec.
