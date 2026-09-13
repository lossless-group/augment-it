---
title: "The federal layer never shipped --space-*, --radius-* or --z-* — so ten members invented token names and let the fallback carry the value"
lede: "170 declarations across the federation reference tokens that do not exist. Each one silently ships its literal in all three modes."
date_created: 2026-09-13
date_modified: 2026-09-13
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5 (1M context)
semantic_version: 0.0.1.0
status: Proposed
tags:
  - Refactor
  - Augment-It
  - Design-System
  - Tokens
  - Federation
  - Platform-Engineering
site_uuid: dcdcea72-5d57-4193-adda-92fcca8d409b
hex_code: 777zap
date_authored_initial_draft: 2026-09-13
date_authored_current_draft: 2026-09-13
publish: true
---

# The federal layer never shipped `--space-*`, `--radius-*` or `--z-*`

## Why Care?

The first convergence sweep went looking for duplicated components. It found them.
But all four scanners independently surfaced the same deeper thing, and it
**reframes what the duplication is**:

```
--space-*    0 declarations in packages/theme/theme.css
--radius-*   0 declarations
--z-*        0 declarations
```

Members needed spacing, radii and layering. The federal vocabulary did not have
them. So members **invented the names they expected to exist** and let CSS's
fallback argument carry the real value:

| Phantom token | Declared | Source declarations | Members |
|---|---|---|---|
| `--font-sans` | **0** | 27 | 9 — `affiliation-rating-resolver`, `chat`, `enhanced-records-list`, `org-workbench`, `person-db-resolver`, `record-db-resolver`, `search-and-add`, `search-results`, `sort-filter-lens` |
| `--color-warn` | **0** | 48 | 3 — `chat`, `enhanced-records-list`, `sort-filter-lens` |
| `--radius-md` | **0** | 45 | 3 — `chat`, `enhanced-records-list`, `sort-filter-lens` |
| `--color-accent-bg` | **0** | 25 | 3 — `chat`, `response-reviewer`, `sort-filter-lens` |
| `--radius-sm` | **0** | 21 | 1 — `chat` |
| `--color-warning-bg` / `--color-warning-text` | **0** | 4 | 1 — `response-reviewer` |

**170 declarations, 10 of 19 members.** Every one resolves to its hardcoded
fallback, identically, in all three modes. They do not respond to the mode switch.
They cannot be re-skinned. They are invisible to the portal, to `design-drift.mjs`,
and to every agent that reads token names rather than computed values.

## This is not a discipline failure

It matters that the diagnosis is right, because the fix follows from it.

Nobody ignored the contract. **Members reached for a vocabulary that the federal
layer advertised the shape of and never delivered.** Three members' own file
headers assert that `--space-*` and `--radius-*` "come from `@augment-it/theme`" —
they were written by people who believed the scale existed.

The consequences are visible everywhere the sweep looked:

- **Four different radii for one control.** `5px`, `4px`, `3px`, `999px` for the
  same chip across members; `8px` / `6px` / `4px` for the same card.
- **Five different paddings for one button.** `5px 10px`, `0.6rem 1.2rem`,
  `0.3rem 0.7rem`, `0.55rem 1rem`, `0.25rem 0.6rem`.
- **158 button rule-sets and 34 badge treatments** federation-wide, none of them
  components. `response-reviewer` alone holds **16 ways to draw a button** and
  **12 distinct pill recipes**.
- **`sort-filter-lens` renders magenta-bordered chips on a blue fill** in every
  mode, because `var(--color-accent)` resolves to the federal electric-magenta
  while `var(--color-accent-bg, rgba(120,160,255,.12))` falls back to a blue
  literal the theme never chose.
- **Nine members render in a fallback font** for anything reading `--font-sans`,
  in a product whose stated identity is *"a dense monospace instrument panel."*

> **Promoting a component before shipping the scale would bake the drift in.** A
> promoted `Button` has to choose one radius and one padding. Choosing them from
> literals — rather than from a named scale — makes one member's accident into
> federal law. **The token families come first.**

## F4 is currently unsatisfiable

`F4` forbids raw `z-index` integers and requires the federal `--z-*` tokens. There
are **zero `--z-*` tokens**. The rule cannot be complied with by anyone.

It is enforced in two places — `scripts/design-drift.mjs` and
`packages/gallery/src/audit.ts` — so the federation ships a check that every member
must fail. The shell itself carries 5 `z-index` literals; `corpora-curator`'s
gallery catalog pre-emptively confesses to one.

**A rule that cannot be obeyed teaches people to ignore the checker.** That is a
worse outcome than not having the rule, and it puts every *other* F-rule finding
at risk of being skimmed past.

## `--focus-ring` is declared and almost unused

Declared in all three mode blocks. Consumed by **3 of 19 members** (`shell`,
`docs-portal`, `corpora-curator`) plus `packages/gallery`.

`packages/theme/theme.css` has **no global `:focus-visible` rule** outside its
`@media (forced-colors: active)` block, so every member pays for its own focus
styling and almost none do. Neither `packages/shared-ui` component defines one —
**the package that is supposed to model the contract fails the gallery's own Focus
check.**

One federal declaration fixes this in every member simultaneously:

```css
*:focus-visible { box-shadow: var(--focus-ring); outline: none; }
```

## The proposed work, in dependency order

**Phase 1 — ship the missing families.** `--space-*`, `--radius-*`, `--z-*` in
`packages/theme/theme.css`, derived from what members actually use today rather
than from a theoretical scale. The measured values are the requirements document:
radii cluster at 3/4/5/6/8/999, paddings at the five listed above. Round to a
scale that covers them; do not invent an eight-step ramp nobody asked for.

**Phase 2 — name the real tokens the phantoms were reaching for.** `--color-warn`
(48 uses) is the biggest: the federal names are `--color-warn-bg` /
`--color-warn-text`, and members wanted a single foreground. Decide whether to add
the alias or migrate the 48. `--font-sans` (27 uses, 9 members) needs a decision
about whether a sans face exists in this product at all — **if it does not, those
27 declarations are a bug in nine members, not a missing token.**

**Phase 3 — add the global `:focus-visible`.** One declaration, whole-federation
effect, and it unblocks the a11y floor F7 already requires.

**Phase 4 — migrate the 170 declarations**, member by member, each as its own
commit. Mechanical once the scale exists.

**Phase 5 — only then** revisit `ButtonRecipe` and `StatusBadge` as promotion
candidates. They are the two largest duplication surfaces in the product and both
are **blocked on Phase 1**, not on anyone's agreement.

## The second-order defect — discovered 2026-09-13, when the scales shipped

Shipping the token families fixed the first-order problem: 170 declarations that
resolved to a hardcoded fallback now resolve to a token. But it exposed a second
one that was invisible while the tokens were missing, and this one is more
interesting.

> **While a token is undefined, the fallback is the real declaration and the name
> is decorative.** An author writing `var(--radius-md, 6px)` was shipping `6px`;
> `--radius-md` was a label nobody could check, so they picked whichever name sat
> next to the pixel value they wanted. **The moment the token ships, the name
> becomes load-bearing — and every mismatch surfaces at once.**

`apps/chat` is the worked example, found during Phase 1's visual check. All
eleven of its radius declarations sit **one scale step below** the role DESIGN.md
§Shapes assigns them: seven `--radius-sm` uses are a small card, a panel, an input
and four buttons — every one of them `--radius-md` work — and its four
`--radius-md` uses are a bubble, a composer, a send button and a popover, all
`--radius-lg` work.

**The correction is pixel-neutral.** `sm`→`md` restores 4px; `md`→`lg` restores
8px. Chat renders identically and its vocabulary becomes true.

### Why this matters beyond chat

**All 22 radius declarations in the product carried a fallback** — there is not a
single bare `var(--radius-*)` anywhere. So the conditions that produced chat's
mismatch existed in every member that referenced a phantom token, across all six
phantom families and all 170 declarations. Chat is not special; it is the first
member anyone checked.

That reframes the remaining migration work:

- A member adopting the scales is **not** a find-and-replace. Every
  `var(--token, literal)` needs its *role* checked against the token's documented
  meaning, not just its pixel delta measured.
- **The pixel delta is the wrong diff to review.** Chat's most alarming change
  (4px → 2px, a visible flattening) was not the scale being wrong — it was the
  scale correctly revealing a wrong name. Reviewing only "did it move" would have
  concluded the scale was too tight and softened it, entrenching the bug.
- Some corrections will be pixel-neutral like chat's. Some will not, and those are
  the ones worth arguing about.

### What to do about it

Nothing federation-wide yet, deliberately. Each member's radius roles get checked
**when that member is migrated**, by the engineer already reading its CSS — which
is the cheapest possible moment and the only one where the context is loaded.
A pre-emptive sweep would produce a list nobody is positioned to act on.

Recorded here so that migration engineers are told to look, and so the next reader
does not repeat Phase 1's near-miss: reading the pixel change and concluding the
scale was wrong.

## A check that would have caught this

Phantom tokens are mechanically detectable: every `var(--x)` in a member, minus
every `--x:` declared in `packages/theme`, is the phantom set. That is a ~20-line
addition to `design-drift.mjs` and it would have fired on the first of these 170
declarations rather than the hundred-and-seventieth.

It is the same lesson as
[[../issues/Structural-Invariants-Live-In-Prose-So-Sweeps-Stop-Halfway]]: the
contract asserted a vocabulary, nothing compared the assertion to the runtime, and
the gap grew silently for months. `design-drift.mjs` compares CSS to CSS; **nothing
compares what members consume against what the theme provides.**

## Related

- [[../specs/Design-System-Convergence]] — the organ registry; several verdicts are blocked on Phase 1
- [[../loops/Converge-The-Federated-Design-System]] — the sweep that surfaced this
- [[The-Sort-Filter-Lens-Containment-Breach]] — the other federal defect from the same sweep
- [[../issues/Structural-Invariants-Live-In-Prose-So-Sweeps-Stop-Halfway]] — same disease, build config
- `DESIGN.md` §Token architecture · §The federation contract (F4, F7, F8, F11)
