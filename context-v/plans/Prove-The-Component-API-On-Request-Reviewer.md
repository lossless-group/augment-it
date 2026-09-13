---
title: "Prove the component API end-to-end on request-reviewer — ship the scales, build Button, migrate one member, and verify by measurement"
lede: "If this loop closes once it closes eighteen more times. One member, nine buttons, and a measurable accessibility delta."
date_created: 2026-09-13
date_modified: 2026-09-13
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5 (1M context)
semantic_version: 0.0.1.0
status: Ready-For-Handoff
tags:
  - Plan
  - Augment-It
  - Design-System
  - Component-Library
  - Tokens
  - Microfrontends
site_uuid: aeec3a77-f9fc-4f80-adb9-fc3f197784ec
hex_code: dgyr79
date_authored_initial_draft: 2026-09-13
date_authored_current_draft: 2026-09-13
publish: true
---

# Prove the component API on `request-reviewer`

> **Read [[../specs/Component-API-Contract-And-The-Control-Scale]] first.** It is
> the contract — token names, the Button API, the override ladder, and every
> deviation from shadcn. This plan does not restate it. Where the two disagree,
> **the spec wins** and the disagreement is a bug in this plan.

## Why this member

`request-reviewer` was chosen because the result will be **measurable rather than
asserted**:

```
  1 component          (App.svelte, 458 lines)
237 CSS lines, 49 rule-sets, ZERO hex literals   ← most token-pure in its cluster
  9 <button> elements
  4 button/chip recipes  (.req-app button, :disabled, .chip, .chip.active)
  1 aria-* attribute in the entire member
  0 role= attributes
```

Most token-pure member in its cluster, and the least accessible. Its `.chip` and
bare `button` base recipes are **byte-identical to `response-reviewer`'s**, so
this is genuine cross-member duplication, not a local quirk.

It is also small enough that a mistake costs an afternoon.

## Acceptance — the loop that must close

All six, in order. **Phase gates are not optional; a phase that cannot pass its
gate stops and escalates rather than proceeding.**

1. The scales exist in `packages/theme` and resolve in all three modes
2. `<Button>` exists in `packages/shared-ui` with the spec's API
3. `request-reviewer` consumes it and **its local button recipes are deleted**
4. A gallery catalog for the member renders Button with its states
5. The gallery audit passes for that specimen — contrast, target size, accessible name, focus, F1a/F2/F3/F4/F8
6. `pnpm design:drift` shows the member's button rule-sets **gone**, with no new findings

## Ownership — read this before touching anything

| You own | I own — do not edit |
|---|---|
| `packages/theme/theme.css` | `apps/docs-portal/src/members.ts` |
| `packages/shared-ui/**` | `apps/docs-portal/rsbuild.config.ts` |
| `apps/request-reviewer/**` | any other member's directory |

Those two `docs-portal` files are the only cross-member contention points in the
whole rollout. **They are mine so that eighteen future migrations cannot race on
them.** If a phase needs them changed, stop and say so.

**Commits:** author the work, run the gates, then **stop and report**. I commit.
One phase per commit, so the history stays bisectable when something goes wrong
three members from now.

## Phase 1 — the scales

Add `--radius-*`, `--space-*`, `--control-h-*`, `--control-px-*` and `--z-*` to
`packages/theme/theme.css`, exactly as named in the spec.

**Declare them once, in `:root` — not in each of the three mode blocks.** These
are dimension, not colour; they do not change between light, dark and vibrant.
`DESIGN.md` anticipated this in *"Where Tier 1 is required, and where it is
noise"*: brand choices need a Tier-1 name, dimensional scales do not. Triplicating
them would imply a variance that does not exist.

**Gate:**
- `node scripts/design-drift.mjs --resolve` lists every new token
- `pnpm design:structure` still passes
- **`pnpm design:drift` finding count does not increase** (it sits at 99 today —
  memorise that number; this phase must not move it)

## Phase 2 — federal focus

Add to `packages/theme/theme.css`:

```css
*:focus-visible { box-shadow: var(--focus-ring); outline: none; }
```

`--focus-ring` is already defined in all three modes and consumed by 3 of 19
members. This is one declaration with whole-federation effect.

**Gate:** `pnpm design:drift` finding count still does not increase. Visually
confirm a focus ring appears on a tabbed-to control in `request-reviewer`.

## Phase 3 — `<Button>`

`packages/shared-ui/src/Button.svelte`, Svelte 5 runes, implementing the spec's
`variant` × `size` API and override ladder rungs 1–3.

Hard requirements, each of which is a bug found in the sweep:

- **No literal colours.** Every `color` on a filled variant comes from a
  `-foreground` token. The bug this prevents: `.pdr-btn-primary { color: #fff }`.
- **`:focus-visible` in the component**, so it is correct even where a member
  overrides the federal rule.
- **Accessible by construction** — `type="button"` by default, real `disabled`
  rather than a class, and `size="icon"` **requires** an `aria-label` (fail loudly
  in dev if absent; the sweep found unlabelled icon-only buttons in four members).
- **SVG icons, never glyphs.** The product has 35 bare `'✓'` characters and no
  icon system. Do not add a 36th.

Add the package to `request-reviewer`'s `package.json` as `workspace:*`, matching
how `response-reviewer` already consumes `shared-ui`.

**Gate:** `pnpm --filter @augment-it/shared-ui check` clean; the component renders
in all six variants × four sizes.

## Phase 4 — migrate the member

Replace all 9 `<button>` elements in `App.svelte` with `<Button>`, then **delete
the now-dead recipes** from `app.css`: `.req-app button`, `.req-app
button:disabled`, and the `.chip` pair if the chips become Buttons.

**Deleting the CSS is the point of the phase.** A member that adopts the component
and keeps its recipes has added a dependency and removed nothing.

Two judgement calls that are genuinely yours — make them, record the reasoning,
and flag them in your report:

- **Are the `.chip` filter controls Buttons, or a different organ?** They are
  toggles with an active state. `variant="ghost"` plus `aria-pressed` may be
  right; a separate `ToggleChip` may be righter. The registry lists
  `FilterChipRow` as a distinct organ.
- **Does anything need an override?** If a button genuinely needs a value the
  variants do not cover, use rung 2 or 3 — **and say so in your report, because a
  recurring override is evidence for a missing variant** and that is a finding,
  not a failure.

**Gate:** `pnpm --filter @augment-it/request-reviewer check` clean; the member
builds; `pnpm design:drift --member req` shows the button rule-sets gone.

## Phase 5 — the catalog

Give `request-reviewer` a gallery catalog: `src/gallery/catalog.ts`,
`src/gallery/mount.ts`, the `'./gallery'` expose in `rsbuild.config.ts`, and the
`galleryRequested()` branch in `index.ts`. `apps/corpora-curator/src/gallery/` is
the only existing example — read it before writing.

**The import order is load-bearing and fails silently:** `@augment-it/gallery`
before `../app.css`, or specimens render unstyled. It is documented defensively in
four places because it is a footgun.

> **Write this one by hand, deliberately.** A `pnpm gallery:scaffold` codemod is
> coming for the other eighteen, and **doing it manually once is how we learn what
> the codemod should generate.** Note anything that felt mechanical — that list is
> the codemod's requirements document, and it is a real deliverable of this phase.

Use whatever the `Fixture` type is called today. A `fixtures` → `stories` rename
is under consideration and is **not this plan's job**.

**Gate:** the catalog loads; the Button specimen renders in all three modes; the
Audit tab is clean for that specimen.

## Out of scope — do not do these

- Any other member. Eighteen are waiting; this plan proves the loop on one.
- Promoting the status pill, `ConnectorChip`, or any other organ.
- The `gallery:scaffold` codemod itself.
- Migrating the other 170 phantom-token declarations.
- Touching `sort-filter-lens`.

**If you finish early, stop.** Scope creep here costs more than the time it saves,
because the whole value of this plan is a clean, attributable answer to "does the
loop close."

## Rollback

Every phase is its own commit. Phases 1 and 2 are additive to `theme.css` and
revert cleanly. Phase 4 is the only destructive one — it deletes CSS — and it
reverts with the commit. Nothing here touches a running service or a deploy.

## Report back with

1. Each gate's result, with the actual command output — **not "it passed"**
2. The `pnpm design:drift` finding count before and after (it is 99 today)
3. The two judgement calls from Phase 4 and your reasoning
4. Anything in Phase 5 that felt mechanical — the codemod's requirements
5. **Anything in the spec that was wrong, ambiguous, or made the work harder.**
   The spec was written without building against it; you are the first to do so,
   and that feedback is worth more than a clean run.

## Related

- [[../specs/Component-API-Contract-And-The-Control-Scale]] — the contract
- [[Design-System-Convergence]] → registry; Button is the first PROMOTE
- [[../refactors/The-Federal-Layer-Never-Shipped-Space-Radius-Or-Z]] — why the scales are missing
- `studies/frontend-ui-kits-component-libraries/shadcn-ui` — the reference Button
