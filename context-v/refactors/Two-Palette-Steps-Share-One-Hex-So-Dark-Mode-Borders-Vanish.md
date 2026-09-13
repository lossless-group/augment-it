---
title: "Two palette steps share one hex, so dark-mode borders measure 1.00:1"
lede: "graphite-700 and graphite-800 are both #232634. Four federal boundary findings came out of one member's probe; three survive adjudication and one does not."
date_created: 2026-09-13
date_modified: 2026-09-13
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5 (1M context)
semantic_version: 0.0.1.0
status: Open-Queued-Behind-Wave-4
tags:
  - Refactor
  - Augment-It
  - Design-System
  - Theme
  - Accessibility
  - Contrast
  - Design-Drift
site_uuid: e6d66f93-25f2-476e-959b-baf62fe2a850
hex_code: s2dx2n
date_authored_initial_draft: 2026-09-13
date_authored_current_draft: 2026-09-13
publish: true
---

# Two palette steps share one hex

## Why Care?

```css
--color__graphite-800:  #232634;
--color__graphite-700:  #232634;
```

Two named steps of the Tier 1 palette, one value. In dark mode
`--color-surface` resolves to graphite-700 and `--color-border` resolves to
graphite-800, so **a border drawn with `--color-border` on `--color-surface`
measures exactly 1.00:1 — it is not a faint hairline, it is not there.**

This is the failure mode the session has been naming all day, arrived at from the
other direction. The rule was *two hex declarations are two values and will
drift*. Here two names converged on one value, which is worse in a specific way:
the semantic distinction between *surface* and *border* survives in the source, in
the docs and in every review, and evaporates only at paint time.

It is dark-mode-only. Light measures 1.41:1 and vibrant 1.45:1, both inside the
1.2–1.5 band gate A22 documents as intended for a hairline. **Dark is supposed to
be in that band too and is not.**

## The four findings, adjudicated

A `corpora-curator` migration probe dumped resolved tokens off
`document.documentElement` in both modes and produced four federal boundary
claims. Three hold. One does not, and the one that does not is a mistake this
session has now made twice, so it is worth recording as carefully as the real
ones.

### 1 · CONFIRMED — the palette collision

Above. Fix is a Tier 1 edit: give graphite-700 a value distinct from graphite-800,
landing dark's border-on-surface in the same 1.2–1.5 band light and vibrant
already occupy. The palette's own ordering convention (higher number = darker)
says graphite-700 should be the lighter of the two, so it moves, not the border.

Blast radius: every member, every surface with a border. Confidence: **measured**
(and independently re-derived from the source hexes, not taken on report).

### 2 · REJECTED as stated — but it exposes a real narrower bug

The claim was that `--color-border-strong` fails F7's 3:1 control-boundary floor
in dark mode at 2.73:1, and therefore `Button`'s `secondary` and `outline`
variants fail in dark while passing in light.

**`secondary` does not fail.** It sets
`background: var(--color-surface-raised)`, so its border sits on
surface-raised, not on surface. Measured against the surface it actually uses:

| mode | `--color-border-strong` on `--color-surface-raised` | |
|---|---|---|
| dark | **3.53:1** | ✅ |
| light | **3.06:1** | ✅ |
| vibrant | **3.38:1** | ✅ |

The 2.73 figure comes from measuring against `--color-surface`. **This is the
identical error made earlier in the session** — and it is an easy one, because the
token is named for what it is, not for what it sits on.

**`outline` is a different story, and here the claim lands.** It sets
`background: transparent`, so its border genuinely sits on whatever the parent
painted:

| dark-mode parent | ratio | |
|---|---|---|
| `--color-background` | 3.44:1 | ✅ |
| `--color-surface-2` | 3.23:1 | ✅ |
| `--color-surface` | **2.73:1** | ❌ |

So an `outline` button placed on `--color-surface` in dark mode is under the
floor — and `--color-surface` is exactly where cards, panels and headers draw.
The variant passes or fails depending on where a member puts it, which no
component-level gate can catch and no member can be expected to reason about.

Fixing finding 1 changes this number, because graphite-700 is moving. **Re-measure
after, do not fix twice.**

Blast radius: federation-wide, contextual. Confidence: **measured**.

### 3 · CONFIRMED — `destructive` has no control boundary at all

```css
.ui-btn[data-variant='destructive'] {
  background: var(--color-error-bg);
  color: var(--color-error-fg);
}
```

No `border-color`, so it inherits `transparent` from the base. A filled
control's boundary is its fill against the surrounding, and `--color-error-bg`
measures **1.23:1** on the dark background, **1.02:1** on dark surface, **1.25:1**
and **1.32:1** in light. Against a 3:1 floor.

The text inside is fine — 7.19:1 dark, 4.89:1 light — which is precisely why this
survived nine migrations. Every contrast gate the federation runs is a
*text*-contrast gate. A destructive button is a red-tinted patch with legible
words on it and no perceivable edge, and the one control in the system where the
edge matters most is the one that deletes things.

Blast radius: federation-wide, every `destructive` call site across fifteen
members. Confidence: **measured**.

### 4 · CONFIRMED — `ghost` has no hover on a tinted surface

`ghost`'s hover is `--color-selected-tint`, which aliases
`--color-accent-bg`. Any chip, selected row or tinted panel is already painted
with it. Composited, hover-against-rest is **1.122:1** — technically present,
perceptually absent.

This is not hypothetical: `corpora-curator`'s tag chips host a `ghost` icon
button and are themselves `--color-selected-tint`.

Blast radius: federation-wide wherever a ghost control sits on a tinted host.
Confidence: **measured**.

## Why this is not being fixed right now

Four migration agents are in flight against `org-workbench`,
`response-reviewer`, `sort-filter-lens` and `shell` as this is written. All
four captured baseline gate numbers and are measuring before/after contrast in
their own probes.

**Editing `packages/theme/theme.css` mid-wave would move the federation number
under them and silently invalidate every contrast measurement they have taken.**
That is the same hazard as the parallel-migration gate drift the playbook already
warns about, except self-inflicted and worse, because a theme change is invisible
in a member's own diff.

Queued behind wave 4. The order when it opens:

1. Fix finding 1 (Tier 1, graphite-700).
2. **Re-measure finding 2** — the number changes because the surface moves.
3. Fix finding 3 (give `destructive` a border, or accept fill-only and say so
   explicitly in the contract).
4. Fix finding 4 (`ghost` hover needs a value that is not the tint it may be
   sitting on).
5. Re-run `design:drift` and the 30-pair contrast gate; expect movement.

## The gate-shaped hole underneath all four

Every one of these is a **control-boundary** failure and the federation has no
automated control-boundary check. The contrast gate walks 30 text pairs and passes
30 of 30 through every one of these findings.

F7 states a 3:1 boundary floor in prose. Nothing measures it. That is the same
shape as [[../issues/Structural-Invariants-Live-In-Prose-So-Sweeps-Stop-Halfway]],
and the same remedy applies: a check that resolves each variant's boundary colour
against each plausible parent surface, per mode, would have caught all four
findings the day they landed rather than on the fifteenth migration.

## Related

- [[../specs/Component-API-Contract-And-The-Control-Scale]] — F7 and the boundary floor
- [[../loops/Adopt-The-Shared-Button-In-One-Member]] — where the probe that found these is specified
- [[../issues/Structural-Invariants-Live-In-Prose-So-Sweeps-Stop-Halfway]] — the same shape, one layer up
- [[The-Federal-Layer-Never-Shipped-Space-Radius-Or-Z]] — the prior Tier 1 / Tier 2 repair
