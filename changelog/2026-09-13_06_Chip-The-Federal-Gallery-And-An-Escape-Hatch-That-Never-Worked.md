---
title: "Chip, the Federal Gallery, and an Escape Hatch That Never Worked"
lede: "Twelve units in one evening, deviations from eight to one, and the gallery caught a contrast defect in the page that documents contrast."
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
  The second primitive across the federation, and the first day the system began
  correcting itself faster than it could be broken. Chip lands in 12 units at 100
  call sites; federation-wide declared deviations drop from 8 to 1. Authoring it
  surfaced two federal scales that DESIGN.md had specified and never shipped — a
  type scale and an info tone — and the rollout then found three defects in the
  primitives themselves, every one caught by an engineer measuring rather than
  reading. The federal gallery finally exists, and its own audit found a contrast
  failure on the page that documents contrast. And rung 4 of the override ladder,
  the escape hatch the whole governance model counts on, turned out never to have
  worked — because in nineteen members it had never once been used.
site_uuid: f945a3de-37b9-4590-88be-3a9833fd620d
hex_code: homyhv
files_changed:
  - packages/shared-ui/src/Chip.svelte
  - packages/shared-ui/src/gallery/
  - packages/theme/theme.css
  - packages/gallery/src/audit.ts
  - context-v/decisions/The-List-Surface-Paradigm-CardRow-ListContainer-And-Selection.md
  - apps/
  - shell/
tags:
  - Changelog
  - Augment-It
  - Design-System
  - Component-Library
  - Accessibility
  - Loop
---

# Chip, the Federal Gallery, and an Escape Hatch That Never Worked

## Why Care?

| | |
|---|---|
| Units with `Chip` | **12** |
| `<Chip>` call sites | **100** |
| Declared deviations, federation-wide | **8 → 1** |
| CSS, net | **−171 lines** (151 added, 322 deleted) |
| Commits in the arc | 24 |
| Federation gate | 71, contrast 30/30, S1–S5 pass |

The single deviation that remains is a real one — a colour case where the variant
enum genuinely has no `success` member. **It is now visible because nothing is
crowding it**, which was the entire point of adding rung 0 this morning.

## Chip found what Button could not

Buttons diverge in *shape*. Chips diverge in **meaning**, and that turns out to be
where the damage lives.

- **`docs-portal`'s contrast report was itself unreadable.** 75 of 150 grid cells
  measured **2.11:1**. The surface that displays the design system's contrast
  ratios was failing them.
- **An outcome of "skipped" was painted green**, using the high-confidence token.
  The one outcome meaning *we did not look* read exactly like *we looked and it
  was good*.
- **`enhanced-records-list` rendered four of five connection states
  identically.** `closed` and `error` — the two meaning the surface is dead —
  drew exactly like `connecting`, the benign one.
- **`pack-runner` collapsed four different reasons-you-cannot-fire into one
  grey**, and two of the four labels were wrapping to two lines at 26px against a
  sibling's 14px.
- **A failed corpus add was drawn in amber.**

And convergence, measured rather than asserted: `response-reviewer` went from
**10 chip heights to 1, 7 font sizes to 1, 3 radii to 1**.

## Three members, no shared code, one identical mistake

`org-workbench`, `record-collector` and `chat` had each drawn
`connection_status` the same wrong way — five states rendered as three
appearances, with `connecting` and `auth_required` sharing one undifferentiated
grey. Independently. Byte-for-byte the same recipe.

That is the eleven-renderings-of-one-value problem in miniature, and it is the
clearest evidence yet for the `StatusIndicator` organ.

## Authoring the primitive found two scales that had never shipped

`Chip` needed a font size, and there were none. In the wild: **251 declarations
of `11px`, 123 of `12px`, 114 of `10px`**, plus the rem spellings of all three.

I reached for `--text-xs` and `--text-sm` and **was wrong**. `DESIGN.md`
already specified this scale and explicitly rejects that naming *by name*, because
*"which small?"* is the question that produced 35 font sizes. The shipped scale is
the doc's own, role-named: `micro · label · meta · body · emphasis · heading ·
display`.

**That is the third time a primitive has revealed a federal scale proposed in the
doc and never written to `theme.css`.** Space and radius were the first two.
Checking the doc before inventing is now reflex.

The scale shipped at **seven** steps, not the doc's six, on the operator's call
and for a better reason than the doc's own: folding `12px` into `--text-body`
is a **1px increase across 130 declarations** of dense table content. The token
indirection makes that trade unnecessary — `--text-label: var(--text-meta)` is a
one-line merge if we later decide we only wanted one. **Converging later costs
nothing; reflowing every dense table now costs something.**

## Then the rollout found three defects in the primitives

Every one caught by an engineer *measuring*, not reading:

1. **`Chip`'s `accent` tone failed at 4.43:1 in light** — the floor its own
   header promises. Two agents measured it independently. The contrast gate passed
   30/30 straight through it, because it walks **text** pairs and a chip paints
   its own ground.
2. **The dismiss was a target *reduction*** — 28px → 24px, sitting *on* the WCAG
   floor where the `Button` it replaced sat clear of it.
3. **The hover was correct and imperceptible.** Moved that morning to a
   surface-independent wash, which fixed a real bug — then measured at 1.22–1.47:1.
   *Correct is not the same as perceptible.*

## The escape hatch had never been pulled

Rung 4 of the override ladder — the declared, countable way a member overrides a
federal component — **does not work as specified.** Svelte compiles the
component's rules to `.ui-btn.svelte-<hash>`, specificity `(0,2,0)`. A member's
rung-4 class is `(0,1,0)` and loses every property the component sets, **while
rendering perfectly and looking like a working override.**

Dropping our own selector to `:where()` does not fix it — Svelte still appends
the hash, producing a *tie*, and a tie resolves by stylesheet order, which under
Module Federation is chunk load order across independently deployed remotes. **A
nondeterministic override is worse than one that reliably loses**, because it
works in dev and differs in production.

Rung 4 is now an inline `style=`, which wins regardless of load order.

**Why nineteen members never hit it: rung 4 has zero real call sites.** The escape
hatch the governance model treats as its detection mechanism had never once been
exercised. *An unused escape hatch is indistinguishable from a working one.*

## The gallery exists, and audited itself

388 call sites across 19 units and neither primitive had a specimen page anywhere.
You could not see six Button variants side by side without reading source — which
is how eleven renderings of one status value happened.

`packages/shared-ui/src/gallery/` now ships: 5 sections, 29 fixtures, **169 live
primitive instances measured in a browser**, not inferred. `request-reviewer`'s
library is visible for the first time — it had a catalog, an expose *and* a
standalone route, and no portal row, so it had been invisible since it was
written.

**On its first run the gallery's own Audit tab found a 3.68:1 contrast defect in
the classification tree — on the page that documents the audit.** Fixed to 5.47
before it shipped.

## The incident, and the rule it produced

A verification probe wrote a real file into a live client's corpus. The engineer
had aliased the workspace to a fixture stub precisely so no write could reach
anything real — and **`rsbuild` 2.x accepts `source.alias`, ignores it, and
reports a successful build.**

Three engineers hit it. Every other probe trap produces an empty page or an error;
*this one produces production.* One reported 866 buttons from a four-row fixture.
Another rendered 1,982 real responses and caught it only because the numbers were
too round.

> **A sandbox that is not asserted is not a sandbox.**

The fix is a sentinel string grepped out of the built bundle before any number is
trusted — the only check that fails loudly and does not depend on getting a config
key right. The file was removed; blast radius was one file and one NATS event,
verified rather than assumed.

## What is not done

- **`CardRow`, `SelectWrapper`, `ListContainer`** — 16 of 18 members are the
  same shape (controls up top, generated list below) and three pilots are running
  against the first primitives now.
- **`--color-surface` in dark mode** still puts `outline`'s border at 2.73:1.
- **`ConfidencePill` violates three federal rules** it predates.
- **F7 has no mechanical check.** Every control-boundary defect this week was
  found by an engineer with a browser. The contrast gate walks 30 *text* pairs.
  This is the highest-value gate left to build.

## Related

- [[2026-09-13_05_The-Button-Rollout-And-The-Loop-That-Turned-Out-To-Be-The-Product]]
- [[../context-v/decisions/The-List-Surface-Paradigm-CardRow-ListContainer-And-Selection]]
- [[../context-v/issues/A-Silently-Ignored-Alias-Pointed-A-Probe-At-Production]]
- [[../context-v/loops/Adopt-The-Shared-Chip-In-One-Member]]
