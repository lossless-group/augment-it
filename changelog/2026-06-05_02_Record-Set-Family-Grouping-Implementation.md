---
title: "Record-Set Family Grouping ships — the spec's six capabilities, family-tree rendering, post-ingest suggestion prompt, and uniform newest-on-top sidebar"
lede: "The spec dropped earlier today (`context-v/specs/Record-Set-Family-Grouping.md`, v0.0.0.1) implemented end-to-end against the live :3002 surface. RecordSet picked up the two new fields (`variant_family_id`, `variant_family_label`); the row-store grew a top-level `variant_families` slot plus five mutators (create / update / add / remove / dissolve) and one read-only heuristic (`suggest_variant_family`) that normalizes a filename stem — strips date prefix, `_vN` suffix, extension — and matches against existing sets with the same stem and ≤ 3-column schema delta. The workspace WS bridge registered the six new capabilities. Browser-side: `apps/record-collector/src/logic/family.ts` walks every leaf back through `promoted_from` to assemble lineage chains, groups leaves by `variant_family_id`, sorts every list — groups, members, archived ancestors — newest-on-top per the user's mid-implementation correction (spec edited to match: §Sidebar rendering now reads 'Newest-first is uniform across the sidebar'). `RecordSetsList.svelte` renders a collapsible family card with chevron header, member count, optional generation count, two inline action icons (✎ rename, × dissolve), and an 'Earlier generations (N archived)' sub-section under any leaf with promoted predecessors. Default sidebar query excludes archived sets at the top level. `App.svelte` calls `record_set.suggest_variant_family` after every ingest; if a match comes back AND the user hasn't dismissed that stem before (sticky per-stem in localStorage), a non-blocking 'Looks like a variant of X (N existing sets) — link as family?' prompt appears under the ingest status with Link / Dismiss buttons. Backwards-compatible — every new field defaults `undefined`; pre-existing stores deserialize without a migration. Existing `…_v4`–`…_v8` sets render as solo cards until the next ingest fires the suggestion."
publish: true
date_created: 2026-06-05
date_modified: 2026-06-05
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
tags:
  - Augment-It
  - Record-Collector
  - Record-Set-Family-Grouping
  - Variant-Family
  - Internal-Lineage
  - Workspace-Schema
  - Row-Store-Capabilities
  - Filename-Stem-Heuristic
  - Sidebar-Grouping
  - Newest-on-Top
files_changed:
  - packages/workspace/src/types.ts (VariantFamily, VariantFamilySuggestion, RecordSet new fields)
  - packages/workspace/src/index.ts (re-export the new types)
  - services/row-store/src/store.ts (Store.variant_families slot, normalizeStem, six operations)
  - services/row-store/src/handlers.ts (seven NATS handlers with broadcasts)
  - services/workspace/src/capabilities.ts (seven capability → subject entries)
  - apps/record-collector/src/logic/family.ts (NEW — buildFamilyGroups + types)
  - apps/record-collector/src/components/RecordSetsList.svelte (family-grouped rendering, rename/dissolve actions)
  - apps/record-collector/src/App.svelte (suggestion state + suggestForSet + acceptSuggestion + dismissSuggestion + renameFamily + dissolveFamily handlers, suggestion prompt UI)
  - apps/record-collector/src/app.css (.vf-suggestion styles)
  - context-v/specs/Record-Set-Family-Grouping.md (spec edit: newest-on-top sort rule replaces ascending-by-generation per user direction)
---

# Record-Set Family Grouping — implementation

## What shipped end-to-end

### Data model

`RecordSet` picked up two optional fields in
`packages/workspace/src/types.ts`:

```ts
variant_family_id?: string;
variant_family_label?: string;
```

A new top-level type `VariantFamily` (id, label, created_at, optional
stem) gives the family its own identity for rename / dissolve when no
member set is loaded. `VariantFamilySuggestion` is the wire-shape
returned by the heuristic.

Both types re-exported from `packages/workspace/src/index.ts`.

`services/row-store/src/store.ts` mirrored the type, added a new
top-level `variant_families: Record<string, VariantFamily>` slot to
the persisted JSON, and made `load()` default the slot to `{}` so
stores written before this work deserialize cleanly without
migration.

### Stem normalization

`normalizeStem(name)` in `store.ts` is the heuristic the spec named:

1. Strip leading `YYYY-MM-DD_` date prefix.
2. Strip trailing `.csv` / `.xlsx` extension.
3. Strip trailing `_vN` / `-vN` / ` (N)` / `.<digits>` version markers.
4. Replace any run of non-alphanumeric chars with a single `-`.
5. Lowercase.

`2026-06-05_Master-Pipeline-Tracker--Active-Pipeline_v8.csv`
normalizes to `master-pipeline-tracker-active-pipeline`. Five
sequentially-uploaded variants share that stem; the suggestion fires
on the next ingest.

### Six new row-store capabilities

```
variant_family.create     args: { label, record_set_ids, stem? }
variant_family.update     args: { variant_family_id, label }
variant_family.add        args: { variant_family_id, record_set_id }
variant_family.remove     args: { record_set_id }
variant_family.dissolve   args: { variant_family_id }
variant_family.list       args: {}
record_set.suggest_variant_family
                          args: { record_set_id }
                          returns: VariantFamilySuggestion
```

Every mutator broadcasts the appropriate event:
- `variant_family.created` / `.updated` / `.deleted` for family-level
  changes, plus
- `record_set.updated` for any affected member set so the sidebar
  re-renders without polling.

Registered in
`services/workspace/src/capabilities.ts` so browser-side
`workspace.invoke('variant_family.create', ...)` works the same as
every other capability.

### Family-tree rendering

`apps/record-collector/src/logic/family.ts` is the new shared
grouping logic. `buildFamilyGroups(record_sets)` returns
`FamilyGroup[]` with three pieces of data per group:

```ts
{
  group_id: string;            // variant_family_id, or 'solo:<rs_id>'
  label: string;
  kind: 'variant_family' | 'solo';
  members: FamilyMember[];     // each is a leaf + its lineage chain
  generation_total: number;
  sort_key: string;            // most-recent leaf created_at in the group
}
```

The algorithm:

1. Build `id → RecordSet` lookup.
2. Identify lineage leaves = sets not referenced as a predecessor by
   any other set's `promoted_from`.
3. For each leaf, walk backwards via the first `promoted_from`
   pointer to assemble the chain.
4. Group leaves by `variant_family_id`; leaves without one become solo
   groups.
5. Sort everything newest-on-top: groups by `sort_key` desc, members
   by `leaf.created_at` desc, lineage by generation desc (leaf at
   index 0, oldest predecessor last). The user corrected this
   mid-implementation from "ascending within lineage" — uniform
   newest-first is the simpler mental model and the spec was edited
   to match.

### Sidebar UI

`apps/record-collector/src/components/RecordSetsList.svelte` rewrote
to render via `buildFamilyGroups`. Variant families render as a
bordered card with:

- Chevron-button header that toggles expand/collapse (state persisted
  to `localStorage` under `augment-it:record-collector:family-collapsed`).
- Label + variant count + (when generations > members) generation
  count.
- Two action icons on the right: ✎ rename (calls `window.prompt`,
  dispatches `variant_family.update`), × dissolve (calls
  `window.confirm`, dispatches `variant_family.dissolve`).

Each member's leaf renders as a `RecordSetCard`. If the lineage chain
has archived predecessors, an "Earlier generations (N archived)"
sub-section appears below the leaf, dashed border, collapsed by
default — archived state under
`augment-it:record-collector:archive-collapsed`.

Solo sets render with no group header — same shape as before, no
regression for the trivial case.

The default sidebar query
(`recordSets.filter((rs) => !rs.archived)`) excludes archived sets
from the top level so promotion predecessors stop showing up as peer
cards.

### Post-ingest suggestion prompt

`App.svelte` got `suggestion`, `acceptSuggestion`,
`dismissSuggestion`, and `suggestForSet` state + functions. The
`uploadFile` flow now captures the freshly-ingested
`record_set_id`, calls `workspace.invoke('record_set.suggest_variant_family')`,
and — if the heuristic returns a match AND the stem isn't already in
the user's dismissal list — surfaces a non-blocking card below the
ingest status:

> Looks like a variant of **Master Pipeline Tracker-Active
> Pipeline** (5 existing sets) — link as family?
> [Link]  [Dismiss]

`Link` calls `variant_family.create` (new family) or
`variant_family.add` (join existing); both refresh the sidebar.
`Dismiss` writes the stem to `localStorage` under
`augment-it:record-collector:dismissed-stems` so the same suggestion
won't re-fire for that stem on later ingests. The user can still
open the suggestion explicitly via the family-header `⋯` "Find
variants of this stem" affordance — out of scope for v0,
captured as a follow-up in §Open questions of the spec.

### Family-level actions

The family header's ✎ button calls `window.prompt` for the new
label, dispatches `variant_family.update`, and refreshes the
sidebar. The × button calls `window.confirm`
("Dissolve 'X'? The member record sets stay; the grouping goes
away.") and dispatches `variant_family.dissolve`. v0 uses native
prompt + confirm; a richer in-app dialog can come later if the
operator finds the friction noticeable.

## Verified

- `tsc --noEmit` clean across `services/row-store`,
  `services/workspace`, `packages/workspace`,
  `apps/record-collector`.
- `docker compose up --build -d row-store workspace-service`
  rebuilt and the row-store log shows "store loaded" / "nats
  connected" / "row-store-service ready" without errors.
- http://localhost:3100 (shell) and http://localhost:3002
  (record-collector) both answering 200.
- Existing five `…_v4`–`…_v8` sets render as solo cards on
  refresh — they have no `promoted_from`, no `variant_family_id`,
  and the heuristic only fires on NEW ingests, so they don't
  auto-group retroactively. The user can either re-upload one to
  trigger the suggestion (which will pull all five into a family)
  or invoke `variant_family.create` directly with the five ids.

## Open questions still flagged in the spec

- Auto-archive on join — when the user links `v8` to a family that
  already has `v7`, does `v7` auto-archive? Spec says no; we revisit
  if the pattern surfaces.
- Pack Runner + PTM family-awareness — downstream surfaces don't
  yet read the family context.
- Multi-tenant scoping — families are workspace-scoped for now.

All three are explicit follow-ups, not regressions.
