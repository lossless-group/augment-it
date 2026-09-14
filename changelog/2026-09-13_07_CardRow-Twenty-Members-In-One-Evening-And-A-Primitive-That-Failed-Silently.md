---
title: "CardRow: Twenty Members in One Evening, and a Primitive That Failed Silently"
lede: "The third primitive reached every member in a night. Three engineers independently proved one of them was keyboard-dead, then came back and adopted it once it worked."
publish: true
date_authored_initial_draft: 2026-09-13
date_authored_current_draft: 2026-09-13
date_work_started: 2026-09-13
date_work_completed: 2026-09-13
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5 (1M context)
summary: >-
  CardRow and two SelectWrapper variants across all twenty members in a single
  evening — 60 call sites, zero surviving named wrappers, zero rung-4 escapes. The
  API grew four props during the sweep, every one added only after two independent
  members hit the same gap. One primitive shipped broken in a way that rendered
  perfectly and passed every gate: display:contents made its button unfocusable, so
  Tab skipped every row. Three engineers measured it independently, backed out, and
  re-adopted it after the fix. Also: one federal token had been under the
  accessibility floor on the surface it is actually used on, found by five
  migrations that never compared notes.
site_uuid: 96974dbf-5445-4e58-80e9-2d3e7c2d4ac1
hex_code: b7nskf
files_changed:
  - packages/shared-ui/src/CardRow.svelte
  - packages/shared-ui/src/SelectWrapper--ClickBody.svelte
  - packages/shared-ui/src/SelectWrapper--ClickPrimary.svelte
  - packages/theme/theme.css
  - scripts/verify-federation.mjs
  - context-v/decisions/The-List-Surface-Paradigm-CardRow-ListContainer-And-Selection.md
  - apps/
tags:
  - Changelog
  - Augment-It
  - Design-System
  - Component-Library
  - Accessibility
  - CardRow
---

# CardRow: Twenty Members in One Evening

## Why Care?

| | |
|---|---|
| Members on `CardRow` | **20** |
| `<CardRow>` call sites | **60** |
| `SelectWrapper` call sites | 14 `--ClickBody` · 6 `--ClickPrimary` |
| Surviving `CardRow--<Kind>` wrappers | **0** |
| Surviving rung-4 escapes | **0** |
| Federation-wide deviations | **5** (two are comments) |
| Member diff | ` 56 files changed, 1457 insertions(+), 732 deletions(-)` |
| Federation gate | 71 · contrast 30/30 · S1–S5 pass · **22/22 units verify** |

Sixteen of eighteen members turned out to be the same shape — controls up top, a
generated list below — so this was never "the next component." It was the shape of
the product, and it took one evening.

## The primitive that failed silently

`SelectWrapper--ClickBody` shipped with `display: contents` on its `<button>`.
Chromium generates no layout box for that, so **the button was not focusable.**

It reported `tabIndex="0"`. It carried a correct accessible name. It hit-tested
perfectly with a mouse. It passed `svelte-check`, the build, and every design
gate. **And Tab skipped every row in every list that used it.** WCAG 2.1.1 Level
A — strictly worse than the raw buttons it replaced.

**Three engineers found it independently**, none of whom had seen the others'
reports. The cleanest statement came as a three-way controlled experiment:

| | rows reachable by Tab |
|---|---|
| before migration | **7 of 7** |
| with `--ClickBody` | **0 of 7** |
| forcing `display: flex` | **7 of 7** |

A fourth measured tab stops going 37 → 29 — *exactly* the eight `--ClickBody`
instances. A fifth noted it also reports a **0×0 target rect**, so every
automated WCAG target-size checker reads the row's primary control as zero-sized.

Each engineer backed out, shipped the conservative variant, and **wrote into the
code that it was a fallback rather than a choice.** One put it: its member
*"wanted click-the-body and got click-the-primary."*

The fix landed. They were told. **They came back and adopted what they wanted in
the first place** — and the comments in that diff changed from *"here is why I
could not use this"* to *"here is why this surface wants it."* That is the
difference between a workaround and a decision, and nobody adjudicated it.

## The API grew four times, never speculatively

Each prop was added **only after two independent members hit the same gap**:

- **`direction`** — the base was horizontal; stacked rows needed `column`. Two
  members wrote byte-identical `CardRow--Stacked` wrappers whose entire content
  was one layout property. Both deleted when the prop landed.
- **`as`** — 16 of 20 members render rows as `<li>`, and a `<ul>` permits only
  `<li>`. Shipping div-only meant sixteen independent rediscoveries of the same
  workaround.
- **`tone`** — one member spent rung 4 on a row's error boundary *and said plainly
  that meant the API was wrong*; another refused to mint a second deviation and
  left its row raw. Both halves of the evidence in one sweep.
- **A hover cue** — one member spent its only rung-4 escape restoring the
  `li:hover` its own stylesheet used to provide.

## D1 is answered, and the reason beats the answer

**One component with props.** Zero surviving named wrappers across 20 members.

But the *reason*, from the engineer who converted nine surfaces: **`CardRow`
covered every kind because it contributes no layout to any of them.** Its
`display: flex` sits at `(0,2,0)` in scoped style and a member class is
`(0,1,0)`, so every conversion put real layout on an inner element the member
owns — **9 of 9**, spanning flex rows, a 3-track grid and a 4-track grid.

The named-wrapper convention is what made *starting* cheap. The population it
hedged against simply did not appear.

## Two things a table and a tile settled

**A table row is a different organ** — measured, not asserted. Three treatments of
the same four-column row: a real `<tr>` renders at 31.7px with cells aligned;
`CardRow` inside `<tbody>` **renders without erroring** at 710px inside a 1248px
table, aligned to no column; inside a `colspan` cell it is +61% vertical with
children at completely different x-positions from their own headers. Both failures
produce a plausible-looking page.

**A tile is not.** Four treatments of *identical children* across a grid track and
a full-width list: three render cleanly, and the one that breaks is the wrong
argument to the right component. The decisive observation is that `direction` is
determined by **the container's width and never by the card's content** — which
makes it `ListContainer`'s business, not a per-call-site choice.

## The token that was under the floor

`--color-border-strong` measured **2.73:1** against `--color-surface`, under F7's
3:1 control-boundary floor. The theme's own comment cited 3.44:1 — true against
the *background*, but `CardRow` paints `--color-surface` **inside** that border,
so the boundary a person actually reads was never the one documented.

**Five independent migrations reported the same number without comparing notes.**
Now 3.52:1, matching light exactly; only dark was ever short.

**And one regression was mine.** The hover cue I added used the *faint* token, so
hovering an interactive row dropped its boundary from 2.73:1 to **1.34:1**. A
hover cue that reduces contrast is worse than none. It shipped because *"add a
hover state"* was reasoned about and never measured — the exact failure this
practice exists to catch, committed by the person writing the practice.

## `pnpm verify` — because Monday matters

Eight agents, fourteen members, one evening. The existing gates proved a unit
typechecks and builds; they never answered *which member broke, and at which
commit.*

`pnpm verify` walks every unit independently, prints a table, and **exits with
the failure count** so `git bisect run pnpm verify` works directly. `--fast`
skips builds for a pre-commit check; `--since HEAD~5` scopes to touched units —
with one deliberate exception: **any change under `packages/` widens back to
everything**, because a federal component can break any consumer.

## What is not done

- **`ListContainer`** — now well-evidenced and unbuilt. It should own `direction`.
- **`SelectWrapper--Checkbox`** — five members share the shape; one has a
  **13×13** checkbox, 54% of the target floor.
- **`CardRow--Link`**, **`DisclosureRow`**, **`MenuItem`**, **`Selector`** — all
  sighted, none built. `Selector` still carries the sharpest number in the
  system: **six `role="menu"` declarations, zero arrow-key handlers.**
- **The BEM rollup under-reports tags.** A Svelte tag must be a valid identifier,
  so `rg 'SelectWrapper--'` finds 2 imports against 14 call sites. The convention
  holds for filenames and breaks for tags.
- **F7 still has no mechanical check.** Every boundary defect this week was found
  by an engineer with a browser.

## Related

- [[2026-09-13_06_Chip-The-Federal-Gallery-And-An-Escape-Hatch-That-Never-Worked]]
- [[2026-09-13_05_The-Button-Rollout-And-The-Loop-That-Turned-Out-To-Be-The-Product]]
- [[../context-v/decisions/The-List-Surface-Paradigm-CardRow-ListContainer-And-Selection]]
- [[../context-v/loops/Adopt-CardRow-And-A-SelectWrapper-In-One-Member]]
