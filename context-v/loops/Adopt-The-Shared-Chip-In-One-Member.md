---
title: "Adopt the shared Chip in one member"
lede: "The per-member executor for the Chip rollout. Inherits every probe and verification rule from the Button loop; what differs is the judgement about what a chip even is."
date_created: 2026-09-13
date_modified: 2026-09-13
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5 (1M context)
semantic_version: 0.0.1.0
status: Untested
tags:
  - Loop
  - Augment-It
  - Design-System
  - Component-Library
  - Chip
  - Accessibility
site_uuid: 83f8aafc-2e03-438f-ab12-34c422be825a
hex_code: 3c8vs6
date_authored_initial_draft: 2026-09-13
date_authored_current_draft: 2026-09-13
publish: true
---

# Adopt the shared Chip in one member

## Read this first

**Everything mechanical is inherited from
[[Adopt-The-Shared-Button-In-One-Member]] and is not repeated here.** The probe
recipe, the `resolve.alias` safety rule and its sentinel check, the
measure-the-before discipline, the gate capture, the raise-don't-chase rule, the
override ladder including rung 0 — all of it applies unchanged. That loop was run
nineteen times and revised four times from engineer reports; this one is a
*delta*, not a replacement.

Read that loop in full, then read this for what is different.

## What is different: the classification comes first

Button's hard question was *which variant*. Chip's hard question is **whether the
thing is a Chip at all**, and getting it wrong is how this rollout would undo the
last one.

```
Is it clickable?
├─ IT IS AN <a href> DRAWN AS A CHIP → not a Chip (it acts), not a Button
│        (it navigates, and variant="link" is for a <button> that reads as a
│        link). LEAVE IT RAW and raise it. This is the INTERACTIVE BADGE organ:
│        record-collector's .social-chip is its link shape and org-workbench's
│        .ow-kind-editable is its button shape. Two members, two shapes, one
│        missing organ.
│
├─ YES → it is a Button.  variant="secondary" + aria-pressed for a toggle.
│        Nineteen members already made this mapping. DO NOT convert a
│        <Button> back into a <Chip>. DO NOT give a Chip an onclick.
│
└─ NO  → is it a small labelled token — tag, badge, pill, status, count?
         ├─ YES → Chip.
         │        · dismissible? → <Chip dismissible dismissLabel="…">
         │        · otherwise    → <Chip tone size>
         └─ NO  → not this rollout. Raise it.
```

**The single most likely error in this rollout is converting an interactive
control into a Chip because it looks like one.** A filter chip that toggles a
filter is a Button that happens to be chip-shaped. It stays a Button.

### Tone is semantic, never decorative

Pick `tone` by what the label **means**, not by the colour the member drew.

| the label means | tone |
|---|---|
| a category, a tag, a count, a plain fact | `neutral` |
| selected, current, the thing in focus | `accent` |
| succeeded, connected, healthy, verified | `ok` |
| degraded, pending-with-risk, deprecated | `warn` |
| failed, disconnected, rejected, blocked | `error` |
| informational, a hint, a provenance note | `info` |

**A tag with no state is `neutral` even if the member drew it green.** The
original sweep found seventeen of nineteen packages observing one
`connection_status` and rendering it eleven ways, precisely because tone was
being picked by eye. If you preserve the member's colour choice you preserve the
divergence.

When the member's colour and the label's meaning disagree, **the meaning wins and
you note it in the report** — that is a finding about the member, not a reason to
deviate.

### The nested-interactive bug this component exists to fix

`sort-filter-lens` shipped a `<span role="button" tabindex="0">` nested inside a
`<button>`. Interactive content may not contain interactive content — invalid
HTML.

**Corrected, measured at the call site:** an earlier version of this loop said the
outer control's accessible name *"absorbs the glyph"*. It does **not** — that
button carries an explicit `aria-label`, so its name was always correct. Do not go
looking for a name defect on the outer control. The real defects were HTML
validity, an inner control whose accessible name was literally `"×"`, and a target
measuring **14 × 14 — 196px² against a 576px² floor, 34% of WCAG 2.2 SC 2.5.8.**

Wherever you find *"a chip you can click, with an × you can also click"*, the
answer is **not** a Button wrapping a Button. It is one of:

- a `<Chip dismissible>` — if the chip body is a label and only the × acts; or
- a `<Button>` and a sibling `<Button size="icon">` in a wrapper — if both act.

Never nest them. If you cannot tell which shape the member wants, **leave it and
raise it** — this is exactly the case where guessing ships an a11y regression.

## If the member reveals its dismiss on hover

Some members rest micro-affordances invisible and reveal them on hover or row
focus — that is a real, specified discipline
([[../specs/Entity-Card-Edit-And-Remove-Affordances]] D5), and Chip's dismiss is
always-visible by default.

**Pass `revealOnHover`.** Do not reach into `.ui-chip__dismiss` from member CSS —
that is selecting a component's internals and has no rung on the ladder.

Default is OFF on purpose: **a hover-only affordance does not exist on a touch
device.** The implementation reveals on `:hover` OR `:focus-within`, keeps the
control's box either way so revealing never reflows the row, and forces it visible
under `@media (hover: none)`.

## Rung 0 has a Chip-specific regression mode

**A Chip in a column-flex parent stretches to the column width**, and
`--radius-pill` makes that far more visible than a small-radius badge ever was —
one measured at **854px wide**. It stretched before the migration too; a 3px band
reads as a band and an 854px pill reads as a mistake. Fix it on the parent or a
wrapper, rung 0. Only a before/after probe catches it.

## Two more traps that produce a clean-looking wrong answer

**`color-mix()` serialises to `color(srgb r g b / a)`.** A contrast parser that
only knows `rgba()` returns **1.00** for every hover measurement — indistinguishable
from a hover that paints nothing.

**Svelte syntax, twice:** `{@const}` is only legal as an immediate child of a block
or component tag, so the obvious `tone={MAP[x ?? 'default']}` next to
`{x ?? 'default'}` will not compile inside a plain `<div>`. And
`{#each [...] as const as s}` is unparseable — Svelte splits the each expression on
` as `. Hoist the tuple to module scope.

## The gate cannot see this work

`design:drift` is as blind to Chip as it was to Button. A member can delete ten
chip rule-sets and the number will not move — one member's gate went 7 → 6 only
because a deleted rule happened to contain a hex literal. **An agent optimising
for the gate deletes nothing.** The deliverable is the diff and the measurements,
not the number.

## Two probe traps specific to this rollout

**Your probe entry must import the member's `app.css` itself.** `src/index.ts`
imports it; `App.svelte` does not. Without it the DOM is completely correct and
every computed style reads unstyled — one run reported every chip at
`background: rgba(0,0,0,0)`, `border-width: 0`, `padding: 0`, and it looked
exactly like a real finding. Chip work is almost entirely computed-style work, so
this trap is far more dangerous here than it was for Button.

**`git archive HEAD apps/<member>/src` takes the path relative to the REPO ROOT**,
not the member directory. Run from inside `apps/<member>` it fails with *pathspec
did not match* — which at least fails loudly.

## What Chip does NOT have, on purpose

- **No `onclick`.** It is a span.
- **No `size="lg"`.** Two sizes. A chip larger than `md` is a card or a banner.
- **No confidence tone.** `ConfidencePill` already exists and speaks that
  vocabulary. Do not re-implement it as a Chip — `record-collector`'s
  `.social-confidence` is a documented case of someone re-deriving it and
  landing a hair off.
- **No status dot as the only signal.** `dot` is `aria-hidden`; the text must
  carry the meaning too, or it is WCAG 1.4.1 all over again.

## The a11y delta to measure, in order

Same ordering lesson the Button rollout learned the hard way — **aria is third**:

1. **Dismiss target size.** Every `dismissible` chip's × must be ≥24px. This is
   the defect class most likely to be present: the Button rollout found dismiss
   glyphs at 7.2 × 17.4px and 12.5 × 11.8px.
2. **Text contrast on the chip's own ground**, not on the page. A chip paints its
   own background, so the pair to measure is tone-fg against tone-bg. All six
   tones ship ≥4.5:1 in all three modes; a member that was drawing its own is
   the thing to check.
3. **Colour-alone encoding.** A chip whose *only* difference from its neighbour is
   hue fails 1.4.1. The text must differ too.
4. **aria.** Usually flat, and that is usually correct — a label needs no role.

## Judgement calls that are yours

- **A chip row that is really a listbox.** Several members render a row of
  selectable tags with no `role`, no `aria-selected` and no keyboard handling.
  Chips will not fix that. Convert the *labels* and raise the *widget*.
- **A badge that is really a count.** Fine as `neutral`, but if it also acts as
  a live region (`queue-badge`, `outcome-badge`), check whether removing the
  member's CSS drops an `aria-live` behaviour.
- **A token *inside* a control's label stays raw.** The tree's `NO →` branch says
  "small labelled token → Chip", which points the wrong way for a rank circle or a
  count badge sitting inside a `<Button>`'s label. Those are painted against the
  *control's* surface and usually inherit `currentColor` from its variant; a Chip
  paints its own ground from page-level tokens and would erase the selected-state
  cue. Leave them and raise the count-slot organ.
- **A "chip" that wraps.** Chip is `white-space: nowrap` by construction. A
  multi-line label is not a chip — it is a card or a note. Raise it.

## Gates

Unchanged from the Button loop:

```
node scripts/design-drift.mjs --member <prefix>   # read the prefix from DESIGN.md first
node scripts/design-drift.mjs
pnpm --filter <pkg> check
pnpm --filter <pkg> build
```

## Related

- [[Adopt-The-Shared-Button-In-One-Member]] — the parent loop; everything mechanical lives there
- [[../plans/Tidy-Every-Consumer-Onto-The-Shared-Primitives]] — the rollout this executes
- [[../specs/Component-API-Contract-And-The-Control-Scale]] — the contract and the ladder
- [[../specs/Design-System-Convergence]] — the organ registry
