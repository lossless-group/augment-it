---
title: "Tidy every consumer onto the shared primitives"
lede: "Button is done across nineteen units. This sequences what is left: Chip everywhere, the stale annotations, and the three containment jobs that are not component work at all."
date_created: 2026-09-13
date_modified: 2026-09-13
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5 (1M context)
semantic_version: 0.0.1.0
status: Active
tags:
  - Plan
  - Augment-It
  - Design-System
  - Component-Library
  - Chip
  - Federation
site_uuid: 2eb33c4e-d223-464a-8735-9930f2310467
hex_code: pwj7pg
date_authored_initial_draft: 2026-09-13
date_authored_current_draft: 2026-09-13
publish: true
---

# Tidy every consumer onto the shared primitives

## Where this starts

`Button` is adopted in **19 of 19 units** — 297 call sites, 39 declared
holdouts, 824 net lines of CSS deleted, and **not one member needed an override
rung above `variant`+`size`**. The loop that did it has been run nineteen times
and revised four times from its own engineers' reports.

The federal layer moved underneath it today too: the Tier 1 palette collision is
repaired, `destructive` has a boundary, `ghost` and `outline` have a
surface-independent hover, and the **type scale and info tone shipped** — both of
which had been proposed in `DESIGN.md` and never written to `theme.css`.

So the primitives are real. This plan is about the consumers.

## Phase 1 — Chip, everywhere (this wave)

Twelve units carry chip-shaped markup, across roughly forty distinct class names
(`cc-tag`, `cc-pill`, `ow-chip`, `cr-domain-chip`, `srq-chip`, `badge`,
`source-badge`, `pe-affiliation-pill`, …).

Executor: [[../loops/Adopt-The-Shared-Chip-In-One-Member]]. One agent per group,
one commit per member, issues raised not chased.

| Group | Units |
|---|---|
| A | `response-reviewer`, `search-results` |
| B | `corpora-curator`, `sort-filter-lens` |
| C | `org-workbench`, `record-collector` |
| D | `chat`, `pack-runner`, `search-and-add` |
| E | `docs-portal`, `enhanced-records-list`, `shell` |

**The classification risk is the whole risk.** A filter chip that toggles a filter
is a Button that happens to be chip-shaped, and nineteen members already made that
call. The most likely way this wave does damage is by converting interactive
controls *back* into spans. The loop leads with the decision tree for that reason.

## Phase 2 — the stale annotations (this wave, folded in)

**Seven `data-deviation` declarations are now wrong.** They live in
`person-enrichment`, `records-surface` and `search-and-add`, all migrated
*before* rung 0 existed, and every one says some version of *"the ladder has no
rung for layout."* It has one now.

These are not defects — they are annotations that outlived their reason, and they
are actively harmful because the Deviations catalog is supposed to be short enough
to read. Remove the attribute; keep the layout fix; if the fix is a member class
on a wrapper, that is still rung 0 and still not a deviation.

After this, the federation's deviation count should be **1**.

## Phase 3 — containment, which is not component work

Three jobs that keep surfacing in migration reports and do not belong in a
component diff. Named here so they stop being rediscovered.

1. **`docs-portal` styles its guests.** It mounts other members' galleries into
   its own document while carrying bare `section` / `h2` / `code` selectors
   and generic `.cell` / `.chip` / `.grid` classes. A member can be entirely
   inside its own boundary and still restyle its neighbours. *(The `shell`, by
   contrast, was measured clean: 141 selectors, every one hashed.)*
2. **`sort-filter-lens` leaks 49 class names.** Down from 61 incidentally via the
   Button work. The live-collision names — `.row`, `.error`, `.muted`,
   `.empty` — are all still there. Its own refactor doc has the phases.
3. **Bare element selectors, federation-wide.** `.X-app h2`, `code`, `pre`,
   `textarea`, `input[type=file]`. Each reaches past every component boundary
   beneath it. One of these was silently widening every control in
   `record-collector` by 8px.

## Phase 4 — the next organs, in evidence order

Not started. Listed so the ordering argument is on the record rather than
re-litigated.

| Organ | Sightings | Note |
|---|---|---|
| **ListRow / SelectableRow** | **5+ members** | Far past the three-member threshold. The single most-cited holdout of the Button rollout: full-bleed, wrapping, variable-height rows measured at 39, 56, 89, 93px against a 32px control |
| **MenuItem** | 3 | `response-reviewer`, `shell`, `sort-filter-lens` — and two of them declare `role="menu"` with no `menuitem` children and no arrow keys |
| **StatusIndicator** | 16 units observe `connection_status` | Rendered eleven ways. Phase 1's Chip covers the *label*; the *widget* is separate |
| **Combobox** | 2 | Tag-suggest surfaces with no listbox semantics at all |
| **ToggleGroup** | 2 | Segmented controls; also where confidence-as-a-control would live |

## Standing decisions, so nobody re-opens them

- **Layout stays with consumers.** [[../issues/The-Federation-Has-No-Layout-Layer]].
  Not drift — the platform never posed the question, so there is nothing to
  promote. Expires when three members reach for the same shape; the list-row
  organ is already past it.
- **Literals are ignored for now.** F8 reports one hit per file, and
  `var(--token, #fallback)` is a documented member convention. Fixing it turns
  72 into ~700.
- **F7 has no mechanical check**, and every control-boundary defect this week was
  found by an engineer with a browser. The contrast gate walks 30 *text* pairs.
  This is the highest-value gate to build and it is not in this plan.

## Decisions saved for the operator

Flagged rather than blocking; the wave proceeds with the stated assumption.

1. **`--color-surface` in dark mode.** `outline`'s border measures 2.73:1 on it,
   under F7's floor. Fixing the palette collision did not move this, because it is
   a property of `graphite-700`. Changing `--color-surface` touches every
   member. *Assumption: leave it; `outline` is rare on that surface.*
2. **Is `ConfidencePill` a Chip tone?** It predates Chip and speaks a vocabulary
   Chip deliberately lacks. *Assumption: keep it separate; do not merge.*
3. **The 1px type-scale cost.** Folding `12px` into `--text-body` (13px)
   increases dense table text and can reflow fixed-width columns.
   *Assumption: the scale ships as DESIGN.md specifies; members snap
   deliberately, not in this wave.*

## Related

- [[../loops/Adopt-The-Shared-Chip-In-One-Member]] — the Phase 1 executor
- [[../loops/Adopt-The-Shared-Button-In-One-Member]] — the proven parent loop
- [[../specs/Component-API-Contract-And-The-Control-Scale]] — the contract
- [[../issues/The-Federation-Has-No-Layout-Layer]] · [[../issues/A-Silently-Ignored-Alias-Pointed-A-Probe-At-Production]]
- [[../refactors/Two-Palette-Steps-Share-One-Hex-So-Dark-Mode-Borders-Vanish]] · [[../refactors/The-Sort-Filter-Lens-Containment-Breach]]
