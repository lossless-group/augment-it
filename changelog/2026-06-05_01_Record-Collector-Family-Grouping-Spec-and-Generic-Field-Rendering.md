---
title: "Record Collector renders every field regardless of type, splits the Augment-this-Set CTA into Prompt vs Bundle/Packs, and drops a spec for record-set family grouping"
lede: "Three things shipped in one short session against the live :3002 surface. First, the per-record field renderer in Record Collector stopped silently hiding structured values — arrays and objects now serialize through the same path as the CSV export (`logic/format.ts`, mirroring `download.ts:csvEscape`), and any empty value (scalar `''`, `null`, `undefined`, `[]`, `{}`) renders a muted italic `(empty)` placeholder so the operator can confirm the prior enrichment pass populated the field before kicking off the next one. The 11px muted JSON style bumped to a readable 12px, normal weight, on the field background. Second, the single `Augment This Set →` button became a small `Augment this Set` header with two stacked CTAs — `Run a Prompt →` (navigates to `promptTemplateManager`) and `Run a Bundle / Packs →` (navigates to `packRunner`) — so the user picks the divergence at the Record Collector surface instead of landing on a default and toggling in-slot. The set-header also restacked vertically so long versioned filenames (`2026-06-05_Master-Pipeline-Tracker--Active-Pipeline_v8.csv`) wrap above the CTA panel instead of squeezing it offscreen. Third, when the operator surfaced that the sidebar treats five sequentially-uploaded variants of the same external tracker (`…_v4.csv` through `…_v8.csv`) as five unrelated peers, that produced `context-v/specs/Record-Set-Family-Grouping.md` (v0.0.0.1, Draft) — a spec that separates internal-lineage families (already in `promoted_from`) from external-variant families (new `variant_family_id` field), names five new workspace capabilities, defines the suggestion-only filename-stem heuristic, and locks that the Augment-this-Set CTAs target the active leaf, never the family."
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
  - Field-Rendering
  - Generic-Data
  - Augment-this-Set
  - Run-a-Prompt
  - Run-a-Bundle-Packs
  - Spec
  - Record-Set-Family-Grouping
  - Lineage
  - Variant-Family
files_changed:
  - apps/record-collector/src/App.svelte
  - apps/record-collector/src/app.css
  - apps/record-collector/src/logic/format.ts (new)
  - context-v/specs/Record-Set-Family-Grouping.md (new)
---

# Record Collector renders every field, the Augment-this-Set CTA splits in two, and a spec lands for grouping variants of the same set

## What shipped

### 1. Every field renders, no matter the type

`apps/record-collector/src/logic/format.ts` is a new shared
`formatFieldValue(value)` that mirrors the CSV export's `csvEscape`
(`apps/record-collector/src/logic/download.ts:7`). It returns
`{ text, isStructured, isEmpty }`:

- `string` → `text` is the value as-is; `isEmpty` is `length === 0`.
- `number` / `boolean` → coerce to `String()`; never empty.
- `null` / `undefined` → `text` is `''`; `isEmpty` is `true`.
- `Array` / `Record` → `text` is `JSON.stringify(value)`;
  `isStructured` is `true`; `isEmpty` is `true` iff the result is
  `'[]'` or `'{}'`.

The Record Collector field-row template (`App.svelte:286`) now drives
both branches from that single formatter. Structured values render in
the `.field-value-json` style; empty values (in either branch) get the
new `.field-value-empty` modifier — italic, muted — and the
contenteditable branch shows a `(empty)` placeholder via
`[contenteditable]:empty::before { content: attr(data-placeholder); }`.

`.field-value-json` itself got readable: 11px → 12px, dropped the
muted color so JSON is legible at a glance, kept the existing scroll
clamp for long values.

**Why this matters operationally**: the next augmentation step always
requires the previous one. The operator was looking at empty boxes for
`socials`, `official_updates_index_url`, and `official_updates_index_urls`
on a row where the per-record connector pass had actually populated
data — the renderer was just hiding it. After this fix the operator
sees either the JSON or an explicit `(empty)` indicator and can decide
whether to re-fire the connector before kicking off the next pass.

### 2. The Augment-this-Set CTA splits — Prompt vs Bundle/Packs

The single `Augment This Set →` button in
`apps/record-collector/src/App.svelte` (`set-header` at line 237)
became:

```
Augment this Set
[ Run a Prompt → ]
[ Run a Bundle / Packs → ]
```

`augmentThisSet(rs, target)` now takes
`target: 'promptTemplateManager' | 'packRunner'` and dispatches
`augment-it:navigate { remoteId: target }`. The shell's existing
`compositeFor(detail.remoteId)` path
(`shell/src/App.svelte:263`) recognizes either id as a member of the
`augment` composite, calls `setCompositeMember` to flip the in-slot
active member first, then focuses the slot. The user lands directly on
the chosen tool — no default-and-toggle.

Both buttons still write the canonical `augment-it:active-record-set`
key and broadcast `augment-it:active-record-set-changed`, so the
destination surface targets the same set.

The set header restacked from horizontal-flex to vertical-flex because
the working corpus filenames are long enough
(`2026-06-05_Master-Pipeline-Tracker--Active-Pipeline_v8.csv`) that a
side-by-side layout squeezed the CTA panel off the rows pane.
`.set-header` is now `flex-direction: column`, filename wraps via
`overflow-wrap: anywhere`, and the CTA panel sits below at full width.

### 3. Record-Set Family Grouping spec lands

`context-v/specs/Record-Set-Family-Grouping.md` (v0.0.0.1, Draft) is
the design produced when the sidebar showed five sequentially-uploaded
variants of the same external tracker as five unrelated peer cards.

The spec distinguishes two distinct family signals:

- **Internal-lineage family** — already in the data model via
  `RecordSet.promoted_from.record_set_ids` (set by
  `record_set.promote` in `services/row-store/src/store.ts:642`),
  with `archived: true` on predecessors. Computed at read time from
  the existing pointers; no new field.
- **External-variant family** — the new concept. Two new fields on
  `RecordSet`: `variant_family_id` and `variant_family_label`.
  Explicit, user-curated. A variant family may contain lineage
  families (a v8 upload that the user links to a v7-rooted lineage
  family produces one variant family with two user-visible members
  and N data-model members across the lineage chain).

Decisions locked in the spec:

- Variant families are **explicit, never auto-linked from filenames**.
  Filename-stem matching surfaces a one-shot "Looks like a variant of
  Master-Pipeline-Tracker (5 existing sets) — link as family?" prompt
  that the user accepts or dismisses. Dismissal is sticky per stem.
- Sidebar renders families as collapsible groups; archived lineage
  members tuck into an "Earlier generations (archived)" sub-group
  collapsed by default; ungrouped sets render as today.
- The Augment-this-Set CTAs target the **active leaf** of the
  variant family, never the family as a whole. Augmenting all
  variants together has no defined semantics, so we refuse the
  affordance rather than invent one.
- Five new workspace capabilities:
  `variant_family.create / update / add / remove / dissolve` and
  `record_set.suggest_variant_family`.
- Backwards-compatible — new fields default `undefined`, no migration.

The spec cross-references `Enhanced-Records-List-and-Promotion-Checkpoint`
(for `record_uuid` and the archival semantics it inherits),
`Original-and-Enhanced-Record-Instances` (the generational model this
builds on), `Flow-for-Bundles-Packs` (whose two-CTA panel the spec
constrains), and
`Per-Record-Iteration-as-Primary-Surface-for-Pack-Fires` (the
single-record `enrich ›` path, unchanged here).

## What's next

Implementation of the spec begins immediately on this branch — the
two new fields on `RecordSet`, the five capabilities, the
suggestion heuristic, and the sidebar family rendering. Tracked in
the spec's §Capabilities to add and §Sidebar rendering sections;
follow-ups (auto-archive on join, Pack Runner / PTM family-awareness,
multi-tenant scoping) stay flagged as open questions for a future pass.
