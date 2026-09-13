---
title: "Issues raised by the migration subagent while converging request-reviewer"
lede: "Findings surfaced while doing something else. Raised, not chased — the diff stays clean and the finding stays reviewable."
date_created: 2026-09-13
date_modified: 2026-09-13
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5 (1M context)
semantic_version: 0.0.1.0
status: Open
tags:
  - Issue
  - Augment-It
  - Design-System
  - Subagent-Findings
  - Request-Reviewer
site_uuid: 6b2b494a-fb95-45d5-bc5d-051589a6cd1c
hex_code: kr2qdy
date_authored_initial_draft: 2026-09-13
date_authored_current_draft: 2026-09-13
publish: true
---

# Issues raised while converging `request-reviewer`

> Collected per [[../loops/Converge-The-Federated-Design-System]] §*Bugs found
> along the way — raise, don't chase*. The engineer migrating this member reports
> what it finds and keeps going; nothing here was fixed inside a migration diff.
> **Appended across phases**, not per agent run.

## Why this file exists per-member

Nineteen members will pass through this loop. Per-member files make two things
legible that one pile would bury: which members are actually in trouble (file
length says so at a glance) and **which findings repeat** — the same defect raised
independently in five member files is the strongest promotion evidence the loop
can produce.

This file is also what `request-reviewer` takes with it when it leaves the
monorepo: a standing record of what is known-wrong in the surface its new owners
inherit.

---

## 1 — `chat`'s 11 radius declarations sit one scale step below their roles

**Phase:** 1 (eyeball) · **Blast radius:** this member visually, **the pattern is
federation-wide** · **Confidence:** measured

**Where:** `apps/chat/src/app.css` — `--radius-sm` at `:198, :208, :218, :249,
:266, :285, :298`; `--radius-md` at `:115, :345, :359, :405`

**What.** Every one of chat's seven `--radius-sm` uses is `--radius-md` work by
DESIGN.md §Shapes' own role column, and all four `--radius-md` uses are
`--radius-lg` work:

| Selector | Uses | DESIGN.md role says |
|---|---|---|
| `.proposal-card`, `.draft-body` | `sm` (2px — *"tight inline, tag stamps"*) | `md` — *"small cards"* |
| `.run`, `.decline`, `.submit-refine`, `.draft-actions button` | `sm` | `md` — *"buttons"* |
| `.refine-row textarea` | `sm` | `md` — *"inputs"* |
| `.bubble`, `.commands-popover` | `md` (4px) | `lg` — *"panels, dialogs"* |
| ~~`.send`, `.composer`~~ | | ⚠️ **corrected — see below** |

> ⚠️ **This table was wrong in two rows, and the error is instructive.** It
> originally listed `.send` and `.composer` under *"panels, dialogs"* → `lg`.
> `.send` is a **button** and `.composer`'s element is a **textarea**, and
> DESIGN.md §Shapes puts *"buttons, inputs, chips, small cards"* at `md`. Both
> already carried an 8px fallback, so the table was restoring the pre-token
> **pixels** at the cost of the **role** — which inverts the very rule this
> finding exists to make. The engineer migrating `chat` checked each row against
> §Shapes before acting, followed the rule rather than the table, and rendered
> `.send` at `md`.
>
> **The real `md`→`lg` set is two, not four**, and the pixel-neutral claim holds
> only for the corrected set. A role table assembled by reading fallbacks is the
> same mistake as picking a token by appearance, one level up.

**How found.** Building the old-vs-new harness for Phase 1's eyeball, then
comparing each selector's role against §Shapes rather than only its pixel delta.

### The mechanism, which is the actually-important part

> **While a token is undefined, the fallback is the real declaration and the name
> is decorative.** An author picks whichever token name happens to sit next to the
> pixel value they want. The moment the token ships, the name becomes
> load-bearing — and every mismatch surfaces at once.

This is a **second-order effect of the phantom-token defect**, and it was invisible
until the scales shipped. It is not a chat-specific bug; it is what happens to any
member that wrote `var(--token, literal)` against a token that did not exist.

**All 22 radius declarations in the product carried a fallback**, so the
conditions for this mismatch existed everywhere. Chat is simply the first member
where it was checked.

### The fix is free, which is why this is worth doing

Correcting chat's names to their DESIGN.md roles **restores the exact pixels chat
renders today**: 7 × `sm`→`md` lands back on 4px, 4 × `md`→`lg` lands back on 8px.
Zero visual change, correct vocabulary.

So the 4→2px flattening — the one change the engineer said it would least defend —
is not a cost of shipping the scale. It is a pre-existing bug in chat that the
scale exposed, with a pixel-neutral correction available whenever chat is
migrated.

**Do not fix here.** Chat is a different member; this belongs to chat's migration.

---

## 2 — `sort-filter-lens`'s affected selectors are unprefixed (F3)

**Phase:** 1 (eyeball) · **Blast radius:** federation-wide · **Confidence:**
measured for the selectors, **suspected** for cross-remote collision

**Where:** `apps/sort-filter-lens/src/app.css:50, 69, 162, 192, 275, 289, 338,
394, 407, 460` — `.picker-btn`, `.picker-popover`, `.error`, `.pending-item`,
`.row-add-input`, …

**What.** Every selector whose radius changed in Phase 1 is a bare top-level
class descending from no root class. `.error` and `.pending-item` are generic
enough to restyle any remote sharing the document.

**How found.** Mapping each affected declaration back to its selector during the
eyeball.

This is the same breach already filed as
[[Structural-Invariants-Live-In-Prose-So-Sweeps-Stop-Halfway|gh #103]] and written
up in [[../refactors/The-Sort-Filter-Lens-Containment-Breach]] — **61 leaked class
names, `.error`/`.row`/`.muted` colliding with 16/19/14 other surfaces.** This
finding independently re-derived it from a different direction, which is
corroboration rather than news.

**Not fixed here.** `sort-filter-lens` is explicitly out of scope for this plan.

---

## 3 — dimension tokens are absent from the `@property` floor

**Phase:** 1 · **Blast radius:** federation-wide, gate **A20** ·
**Confidence:** measured

**Where:** `scripts/generate-token-baseline.mjs:97`

**What.** The baseline generator reads the same mode-block-derived `tier2` map
that `design-drift.mjs` does, so it never sees a token declared in bare `:root`.
`pnpm tokens:check` stayed green at **35 tokens while 43 now exist** — it did not
notice because it cannot.

Consequence: none of the new dimension tokens are in `token-baseline.css`, the
`@property` floor that keeps a member legible when it outruns the deployed shell.
A member deployed against an older shell gets `height: var(--control-h-sm)` →
invalid → **no fallback at all.** That is worse than a colour going wrong, because
the layout collapses rather than looking off.

**Owner: platform (me), not this migration.** Rides with the `--resolve`
dimension-tier gap.

---

---

## 4 — double focus indicator on `<select>` / `<input>`, in two different colours

**Phase:** 2 (visual gate) · **Blast radius:** this member for the doubling,
**federation-wide as a pattern** · **Confidence:** measured for the doubling,
**suspected** for prevalence

**Where:** `apps/request-reviewer/src/app.css:74`

```css
.req-app input:focus { outline: 1px solid var(--color-accent-2); }
```

**What.** Specificity `(0,2,1)` against the federal `*:focus-visible` at
`(0,1,0)`, so the federal `outline: none` loses and the member's **cyan 1px
outline paints on top of the federal magenta ring**. Both read off the live
element together: `box-shadow: rgb(199,91,251)…` **and**
`outline: solid 1px rgb(91,188,251)`.

It is also `:focus`, not `:focus-visible`, so it does not inherit the federal
rule's click-safety — a mouse click paints it.

**How found.** Phase 2's visual gate — tabbed to the first control and read
`getComputedStyle`, rather than trusting the screenshot.

**Why it is a pattern candidate, not just a bug.** Phase 2 shipped a universal
`:focus-visible` rule to all nineteen members simultaneously. **Any member
carrying a local `:focus` outline at class specificity now has the same
doubling.** Three members were known to consume `--focus-ring` before Phase 2;
nothing is known about how many hand-rolled a local focus style instead.

**Held, per the loop's triage rule** — this is a pattern candidate, and the fix's
shape depends on how many members carry it. One member is an edit; eight is a
sweep with a codemod. The count is not known yet, so nothing federation-wide
happens until a finding like this reaches its third member file.

**The local instance is different**, because it has a natural owner already in the
file: the recipe is dead weight in `request-reviewer` once Button lands, and it is
deleted in Phase 4 alongside the button recipes the plan enumerates. That is not
"fixing a finding early" — it is the migration removing CSS the migration made
redundant.

---

## 5 — no gate in the repo can see CSS source order

**Phase:** 2 · **Blast radius:** federation-wide (tooling) · **Confidence:**
measured

**Where:** `scripts/design-drift.mjs` (absence), `packages/gallery/src/audit.ts`
(absence)

**What.** Phase 2 nearly shipped a regression that no check in the repository
could have caught. Two `*:focus-visible` rules at identical specificity, where
source order alone decides the winner and the loser leaves Windows High Contrast
users with **no focus indicator at all**. `design:drift` parses declarations, not
ordering; the gallery audit reads computed style in one mode at a time and would
not have exercised `forced-colors`.

**How found.** Placing the federal focus rule and checking what it would override.

**Why it matters beyond this instance.** The same shape as finding 1: *the thing
that bites is the rule you cannot see from the value.* A declaration can be
individually correct, pass every check, and still be wrong because of where it
sits. The federal layer now has two ordering constraints — this one, and the
`@augment-it/gallery`-before-`app.css` import order that renders specimens
unstyled — and **neither is enforced by anything but a comment.**

**Owner: platform (me).** Not this migration.

## Already filed elsewhere

Raised by this engineer, tracked as platform work:

- **`F8` hex check matches `{#each`** — `scripts/design-drift.mjs:323`. The regex
  `#[0-9a-fA-F]{3,8}` matches `#eac` inside `{#each`. Every "hardcoded hex" finding
  on a `.svelte` file is suspect until re-checked; `request-reviewer`'s is a
  confirmed false positive.
- **`design:drift` never sweeps `packages/shared-ui`** — DESIGN.md registers it
  under `libraries:` and `runMemberChecks` only walks `members:`. `Button.svelte`'s
  CSS will be invisible to F1a/F4/F8, so the gallery audit and human review are its
  only quality bar.

## Related

- [[../loops/Converge-The-Federated-Design-System]] — the raise-don't-chase rule
- [[../plans/Prove-The-Component-API-On-Request-Reviewer]] — the migration
- [[../refactors/The-Federal-Layer-Never-Shipped-Space-Radius-Or-Z]] — the first-order defect these are downstream of
- [[../refactors/The-Sort-Filter-Lens-Containment-Breach]] — finding 2's home
