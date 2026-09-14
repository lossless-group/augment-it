---
title: "The component API contract and the control scale — inspired by shadcn, with sprinkles of Tailwind, derived from what members already built"
lede: "Members were already converging on Tailwind's radius scale by instinct. They just had no token to spell it with."
date_created: 2026-09-13
date_modified: 2026-09-13
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5 (1M context)
semantic_version: 0.0.1.0
status: Draft
tags:
  - Spec
  - Augment-It
  - Design-System
  - Component-Library
  - Tokens
  - Platform-Engineering
site_uuid: 0a5d27c0-a281-4b3a-b303-0ed0e0435ea2
hex_code: xp5rg6
date_authored_initial_draft: 2026-09-13
date_authored_current_draft: 2026-09-13
publish: true
---

# The component API contract and the control scale

> **The stance.** We are not adopting a UI kit. We are deriving a vocabulary from
> kits our agents already know, and documenting every place we depart from them.
> *Inspired by shadcn, with sprinkles of Tailwind — full docs below.*
>
> The reason is legibility, not laziness. A foundation model reads `variant`,
> `size` and `--primary-foreground` without being taught. A syntax invented here
> has to be written, read, and remembered before anyone — human or agent — can
> use it. That is the same argument `DESIGN.md` already makes for the two-tier
> token split under *"Why two tiers — AI collaboration."* This applies it one
> layer up.

## Why Care?

The convergence sweep counted **158 button rule-sets and 34 badge treatments,
none of them components**, and **170 declarations across 10 members reaching for
tokens that do not exist**. The diagnosis was not indiscipline — the federal layer
never shipped a spacing, radius or layering scale, so there was nothing to
converge on.

This spec ships that scale, and the component API that consumes it.

## The finding that decided the scale

Before proposing values, we measured every `border-radius` in member CSS:

| Value in use | Occurrences | Tailwind's own scale |
|---|---|---|
| `3px` | 296 | — |
| `4px` | 251 | ✅ `--radius-sm: 0.25rem` |
| `999px` | 109 | (pill) |
| `6px` | 106 | ✅ `--radius-md: 0.375rem` |
| `8px` | 37 | ✅ `--radius-lg: 0.5rem` |
| `2px` | 22 | ✅ Tailwind `--radius-xs: 0.125rem` → ships as our `--radius-sm` |

> **Four of the five most-used radii are exactly Tailwind's steps.** Members were
> not drifting randomly. They were converging on the best-known scale in the
> field, by instinct, and had no token to spell it with.
>
> That is the empirical case for borrowing rather than inventing: **the
> convention was already here.** It just wasn't named, so every session
> re-derived it and landed a pixel or two off.

> ⚠️ **Corrected 2026-09-13.** A first draft of this section used these counts to
> argue for a 6px `--radius-md`, against DESIGN.md §Shapes' 4px. The counts were
> inflated threefold by `dist/` artifacts — the command that produced them piped
> match-only output into a filename filter, so nothing was ever filtered. Real
> source counts are 11 and 4, **exactly what DESIGN.md measured** before calling
> the split a live defect: *one name, two radii, depending which app you are
> looking at.* The federal scale shipped unchanged. Left in place rather than
> deleted, because the failure mode — building an argument on a bad measurement
> and then overriding a document with it — is the one this spec exists to prevent.

Font sizes tell the density story: members cluster at **10 / 11 / 12 / 13px**,
roughly 2px below Tailwind's smallest step. augment-it is a dense monospace
instrument panel, and the scale has to respect that.

## Tier 2 additions — the scales

Three families, all absent today. They join the existing two-tier spine: Tier 1
named palette → Tier 2 semantic. These are Tier 2.

### `--radius-*`

Enumerated, not derived. shadcn computes its steps from one `--radius` knob via
`calc()`; our measured set (`2, 3, 4, 6, 8`) is not a clean geometric series, and
forcing it into one would move ~800 existing declarations for no benefit.

```css
--radius-sm:    2px;    /* tight inline elements, tag stamps */
--radius-md:    4px;    /* HOUSE DEFAULT — buttons, inputs, chips, small cards */
--radius-lg:    8px;    /* cards, panels, dialogs */
--radius-pill:  999px;  /* pills, confidence badges, corpus chips */
--radius-round: 50%;    /* avatars, dots, icon circles */
```

**Deviation from shadcn, stated:** they derive, we enumerate. Recorded because
the `/N` modifier below recovers most of what derivation buys.

### `--space-*`

```css
--space-hairline: 1px;  --space-3xs: 2px;   --space-2xs: 4px;
--space-xs:  6px;       --space-sm:  8px;   --space-md:  10px;
--space-lg:  12px;      --space-xl:  16px;  --space-2xl: 24px;
--space-3xl: 32px;
```

Denser at the low end than Tailwind's 4px-increment scale, because the measured
control paddings bottom out at `1px 6px` (the status pills) and cluster around
`4–8px` vertical.

### `--control-h-*` and `--control-px-*`

Named for **controls**, not for buttons — the input beside a button must match its
height, and a `--button-lg` token would leave that input inventing its own.

```css
--control-h-sm:  24px;   /* THE FLOOR — WCAG 2.2 2.5.8 target minimum */
--control-h-md:  28px;
--control-h-lg:  32px;

/* No --control-px-*. Horizontal padding comes from --space-sm/md/lg (8/10/12).
   The control group is heights only: an input beside a button must match its
   height, but its padding is spacing and belongs on the spacing scale. */
```

**Deviation from shadcn, stated:** their sizes are `h-8 / h-9 / h-10`
(32/36/40px). Ours run a consistent **~8px denser**, derived from measured
paddings and the 11–12px type. Same scale positions, different values — which is
the whole point of borrowing positions rather than pixels.

### `--z-*`

F4 already forbids raw `z-index` and mandates these. **They have never existed**,
so the rule has been unsatisfiable and enforced in two places.

```css
/* Banded by OWNERSHIP, not by a flat ladder — remotes deploy independently, so
   ranges are reserved in advance. Remotes use the four remote-local tokens and
   nothing else. */
--z-base: 0;  --z-raised: 10;  --z-sticky: 30;  --z-remote-overlay: 60;   /* remote-local */
--z-slot-peek: 900;  --z-slot-hover: 910;  --z-slot-focus: 920;           /* shell-assigned */
--z-shell-chrome: 1000;  --z-flow-widget: 1100;  --z-overlay: 1200;
--z-modal: 1300;  --z-tooltip: 1400;  --z-toast: 1500;                    /* shell chrome */
```

## The foreground-pairing convention

Adopted wholesale from shadcn, and it is the single highest-value borrowing here.
**Every surface token gets a named partner for text drawn on it.**

```css
--color-primary / --color-primary-foreground
--color-surface / --color-surface-foreground
--color-destructive / --color-destructive-foreground
```

We have exactly one such pair today (`--color-on-accent`), and its absence
elsewhere is why `.pdr-btn-primary` hardcodes `color: #fff` — **there was no named
token for "text on this," so someone reached for a literal.** Make the pairing
total and the literal has no reason to exist.

**Deviation, stated:** shadcn names the accent-filled variant `default`. We use
`primary`, matching Tailwind and MUI. `default` is less legible to both humans and
agents when five other variants exist.

## The Button API

```svelte
<Button variant="primary" size="md">resolve →</Button>
```

| Prop | Values | Default |
|---|---|---|
| `variant` | `primary` · `secondary` · `outline` · `ghost` · `destructive` · `link` | `secondary` |
| `size` | `sm` · `md` · `lg` · `icon` | `md` |

Mirrors shadcn's `variant` × `size` shape exactly, minus their `default` naming.
Two enums, not ten props.

## The override ladder

Escape hatches are where design systems die — both ways. No hatch and members fork
the component; unrestricted hatch and the component is decorative. **shadcn's own
answer does not transfer**: they pass `className` and resolve conflicts with
`tailwind-merge`, which works because Tailwind classes are atomic. We have no
Tailwind, so a raw class passthrough gives specificity wars, not merging.

Four rungs, each more visible than the last, none of them blocked:

### 0 — layout is the parent's job, and is not a deviation

**A Button never positions itself.** If it needs to sit at the end of a row, align
to a baseline, right-align in a grid column, or stop stretching in a column-flex
container, that is the *container's* concern.

Two spellings, both free:

```css
/* the parent owns alignment */
.my-row { display: flex; align-items: flex-end; }

/* or wrap it — a plain div, usually zero CSS */
<div class="my-row-end"><Button …>Not now</Button></div>
```

> **This rung exists because the absence of it was measured.** Five layout-only
> overrides appeared across three independent migrations —
> `margin-inline-start: auto`, `justify-self: end`, `align-self: center`, and
> twice "a Button inside a column-flex container stretches to full width." Every
> one carried a `data-deviation` reading some variant of *"the ladder has no rung
> for layout."*
>
> **Placement is not a design departure**, and routing it through rung 4 puts it
> in the member's catalog under *Deviations*, where it buries the real ones. A
> deviation section listing five margin adjustments teaches a reader to skim it.

**Why it happens:** `Button` sets a `height` and never a `width`, so in a
`flex-direction: column` container it stretches. That is correct component
behaviour — a control that pinned its own width could not be used in a toolbar —
and the container is the only place that knows what the right answer is.

### 1 — `variant` + `size`
The sanctioned API. Covers the large majority.

### 2 — named token overrides

```svelte
<Button variant="primary" size="lg" radius="lg" />
```

**Overrides take token names, not values.** `radius="lg"` resolves to
`--radius-lg`. Never `radius="11px"`.

### 3 — the `/N` modifier

```svelte
<Button radius="lg/60" />   →  calc(var(--radius-lg) * 0.6)
```

Tailwind's `/` means *"this token, at N percent"* (`bg-primary/90`). Today it is
opacity-only; we extend the same reading to dimension.

**This is not a new concept.** shadcn already computes
`--radius-sm: calc(var(--radius) * 0.6)` — a `/60` modifier is that exact
operation exposed at the call site instead of baked into a scale step. An agent
that knows Tailwind reads it correctly with no documentation.

**Why it earns its risk.** A flat scale expresses a value but not a
*relationship*. Nested radii (inner = outer − padding) and optical rather than
metric alignment are exactly where a six-step scale is right for consistency and
wrong for the last two pixels. Responsive design pulls toward generics precisely
where a detail-oriented eye pulls away from them.

**Why it does not become the new literal.** It is **countable**. A raw `11px` is
invisible to tooling; `radius="lg/60"` appearing in six members is a measurable
argument for shipping `--radius-ml`. The escape hatch is also the detection
mechanism for a missing scale step.

**Scope:** dimension only (`radius`, spacing). On colour, `/N` keeps its Tailwind
meaning — opacity. **`/` is never overloaded for per-side**; Tailwind uses
prefixes for axis, and giving one borrowed separator two meanings destroys the
legibility we borrowed it for.

### 4 — `class` passthrough, declared
Legal, but requires a `data-deviation` reason and surfaces in the member's catalog
under *Deviations* (F9). And forking the component entirely is always legal per
sovereignty — recorded in the registry as `sanctioned`, not as a failure.

> **The cautionary read:** MUI's `sx` prop is the most-studied case of an override
> that did not stay contained — it became *the* way people write MUI, and the
> theme went decorative. It is pinned in
> `studies/frontend-ui-kits-component-libraries/material-ui`. Read it before
> loosening any rung.

## Focus is not optional

The base recipe carries `:focus-visible` using `--focus-ring`, which exists in all
three modes and is consumed by **3 of 19 members**. A federal base rule lands the
rest in one declaration:

```css
*:focus-visible { box-shadow: var(--focus-ring); outline: none; }
```

> ⚠️ **Corrected 2026-09-13, after three independent engineers flagged it.** The
> spacing, control and layering tables above originally carried values I derived
> from measuring member CSS, written before I had read `DESIGN.md`'s own §Spacing,
> §Sizing and §Layering sections — which already proposed all three, better
> reasoned. Every name in the spacing family was shifted one step, so an agent
> sizing from this document landed one step off; `--control-h-sm` was 22px, below
> the WCAG 2.2 floor the same document commits to; and `--control-px-*` was
> specified but never shipped.
>
> The tables now match `packages/theme/theme.css` exactly. **Where this spec and
> the runtime disagree, the runtime is right** — this document has been the stale
> artifact twice, and the loop's "where they disagree, the spec wins" rule is
> about the *contract* (the API, the override ladder, the naming), not about
> values that can be read off the theme in one command.

## Proving it

A contract nobody has built against is a proposal. The first implementation is
tracked separately in
[[../plans/Prove-The-Component-API-On-Request-Reviewer]], which closes the loop
end-to-end on one member: scales ship, `<Button>` lands, a member adopts it and
deletes its local recipes, its catalog renders the states, the audit passes, and
`design:drift` confirms the rule-sets are gone.

**Feedback from that build belongs here.** This spec was written without anyone
implementing against it; the first engineer to do so will find the parts that are
ambiguous or wrong, and those corrections land in this document rather than in
the plan.

## Open, and deliberately not decided here

**What platform packages become when members leave the monorepo.** Everything is
`workspace:*` today. A submodule at `apps/org-workbench` still resolves in the
monorepo checkout, because the workspace globs are directory globs — but a
standalone clone by the owning team has no parent workspace and cannot resolve
`@augment-it/theme` at all. Publish, git dependency, or vendor changes what
"promote to `shared-ui`" *means*, and it is not an agent's call.

## Rung 4 is `style=`, not `class=` — corrected 2026-09-13

The ladder shipped saying rung 4 was `class=` + `data-deviation`. The first time
anyone actually exercised it — building the federal gallery — it did not work, and
the way it failed is the part worth keeping.

Svelte compiles a component's scoped rules to `.ui-btn.svelte-<hash>`, specificity
**(0,2,0)**. A member's rung-4 class is **(0,1,0)**. It loses every property the
component sets, **while rendering perfectly and looking like a working override** —
the gallery's first rung-4 fixture showed `justify-content: center` and read as a
success.

**Dropping our own selector to `:where(.ui-btn)` does not fix it.** Svelte still
appends the hash, so the component lands at (0,1,0) and *ties* the member's class.
A tie resolves by stylesheet order, which under Module Federation is chunk load
order across independently deployed remotes — not decidable. **A nondeterministic
override is worse than one that reliably loses**, because it will work in dev and
differ in production.

So rung 4 is an **inline `style=`**, which beats every class rule regardless of
load order. It is still declared, still requires `data-deviation`, still surfaces
in the member's catalog under Deviations, and is if anything uglier at the call
site — appropriate for the last rung.

`class=` still passes through and is still a declared deviation, but it can only
win for properties the component does **not** set. Use it for a member hook; use
`style=` to actually override.

**Why nineteen members never hit this:** rung 4 has **zero real call sites**. The
escape hatch we have been treating as the detection mechanism had never once been
exercised — which is its own finding about escape hatches.

## Related

- [[../refactors/The-Federal-Layer-Never-Shipped-Space-Radius-Or-Z]] — the measured gap this closes
- [[Design-System-Convergence]] — the organ registry; Button is the first PROMOTE
- [[../loops/Converge-The-Federated-Design-System]] — the loop
- `studies/frontend-ui-kits-component-libraries` — the pinned sources every claim here is drawn from
- `DESIGN.md` §Token architecture · §The federation contract (F1, F4, F7, F8, F11)
