---
title: "Adopt the shared Button in one member — the per-member executor for the Button rollout"
lede: "One member per run, never a sweep. Replace the buttons, delete the recipes they made redundant, raise everything else."
date_created: 2026-09-13
date_modified: 2026-09-13
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5 (1M context)
semantic_version: 0.0.1.0
status: Draft
tags:
  - Loop
  - Augment-It
  - Design-System
  - Component-Library
  - Microfrontends
site_uuid: e2865d13-48ce-4ee2-8a67-7b1817ee6ae0
hex_code: lj2bo3
date_authored_initial_draft: 2026-09-13
date_authored_current_draft: 2026-09-13
publish: true
---

# Adopt the shared Button in one member

> **One member per run. Never a sweep.** The contract is
> [[../specs/Component-API-Contract-And-The-Control-Scale]]; this is the executor.
> Where they disagree, the spec wins and the disagreement is a bug in this loop.

## What you are doing

Replacing a member's hand-rolled buttons with `@augment-it/shared-ui`'s `Button`,
and **deleting the CSS that replacement made redundant.**

> **The deletion is the point of the job.** A member that adopts the component and
> keeps its recipes has added a dependency and removed nothing. If your diff has
> no red in it, you have not finished.

## The rollout, in numbers

302 `<button>` elements across 18 members. Five members carry **zero `aria-*`
attributes** — `org-workbench` has 61 buttons and not one. Button is accessible by
construction: `type="button"` by default, real `disabled` rather than a class,
`:focus-visible` that will not double-paint against the federal rule, and
`size="icon"` refusing to render without an accessible name. **Those five members
gain the most and will show the largest measurable delta.**

## The API you are adopting

```svelte
<Button variant="primary" size="md">resolve →</Button>
```

`variant`: `primary` · `secondary` · `outline` · `ghost` · `destructive` · `link`
(default `secondary`)
`size`: `sm` · `md` · `lg` · `icon` (default `md`)

Override rungs, in order of preference — **never a raw value**:

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

1. `variant` + `size`
2. `radius="lg"` — a token NAME
3. `radius="lg/60"` — `calc(var(--radius-lg) * 0.6)`
4. `class=` + `data-deviation="reason"` — legal, declared, and it shows up in the
   member's catalog under *Deviations*

## Steps

1. **Read the member's CSS first, all of it.** You are about to delete from it.
2. **Check the dependency.** `@augment-it/shared-ui` has been pre-installed into
   every member — if it is already in your `package.json`, skip this step and do
   **not** edit the file. If it is somehow missing, add — `"@augment-it/shared-ui": "workspace:*"` — then run
   `pnpm install`. **Do not stage `pnpm-lock.yaml`**: it is shared, every
   concurrent migration writes it, and the manager stages it once.
3. **Map each `<button>` to a variant** by what it *does*, not by how it looks.
   The accent-filled commit action is `primary`; the quiet default is `secondary`;
   a destructive action is `destructive` even if the member drew it grey.

   > **Preserving the member's current appearance is not a goal.** If the new
   > variant looks different from what the member drew, *that is the migration
   > working.* An agent's default instinct is to keep the pixels, and keeping them
   > is how a member that was drawn by eye manufactures false evidence for a
   > variant nobody needs.

4. **Replace, then delete.** Every recipe the replacement orphaned comes out.
   Verify with a search that nothing still references the class.

   **Look past the button recipes.** In the first migration the highest-value
   deletion was not a button rule at all — it was
   `.member select:focus, .member input:focus { outline: … }`, made redundant by
   the *federal focus ring* and actively painting a second ring in a second colour
   over it. A local `:focus` rule at class specificity beats `*:focus-visible`.
   Check for one.

   **Count the recipes yourself.** A central sweep undercounts: the first member's
   plan said four, the real number was eight.

5. **Run the gates** (below), **verify what you cannot see**, and stop.

## Gates

```
pnpm --filter @augment-it/<member> check     must be clean
pnpm --filter @augment-it/<member> build     a typecheck is not a build
pnpm design:drift --member <prefix>          must not INCREASE
pnpm design:drift                            federation count must not increase
```

> ⚠️ **Do not trust a baseline written in this document.** It has moved five times
> in one day — 99, 93, 56, 69, 72 — as checks were fixed and invisible members
> were registered. **Measure it yourself at the top of your run** and report
> before-and-after. The gate is *relative*: the number you measured must not go
> up. An absolute number here would have given one engineer 21 points of slack it
> did not know it had.

> ⚠️ **The federation count is not attributable to you while other migrations are
> running.** Several members migrate in parallel in one working tree, so
> `git status` will show files that are not yours and the federation number
> reflects everyone. **The member-scoped count is your attributable gate.** Report
> both, and name exactly which files are yours.

### The drift gate is blind to the actual deliverable

**`design:drift` has no button check at all.** A member can delete fourteen
rule-sets and seventy-seven lines and the gate will not move a single point.

Say that plainly to yourself before you start, because it has a sharp edge: **an
agent optimising for the gate would delete nothing.** The gate proves you did no
*harm*; only the diff proves you did the *work*. Report both, and treat a net
diff that is not strongly negative as a sign you have not finished.

### One browser, several agents

Under parallel migration the Playwright browser is **shared**, and other agents
will navigate your tab out from under you. This has happened: an `evaluate` ran
against the wrong member's DOM and returned another member's markup **while the
tab title still said the right thing** — a failure that produces confidently
wrong verification rather than an error.

**Make navigate-and-assert atomic — and the MCP browser cannot do this.**
`browser_navigate` and `browser_evaluate` are separate tool calls, so there is
always a window for another agent to move your tab. One engineer was navigated
away *mid-evaluate* and received a different member's DOM.

**Launch your own headless chromium from a node script via Bash instead.** Fully
isolated, and navigate + assert + measure genuinely is one call. Gotcha:
`chromium.launch()` may fail with *"Executable doesn't exist at
…chromium_headless_shell-…"* — pass `executablePath` pointing at an installed
revision under `~/Library/Caches/ms-playwright/`.

Either way, **assert on the member's root class inside the evaluate**, never the
tab title. A title can be right while the DOM is someone else's.

**Reaching buttons behind `{#if}`.** Rendering leaf components with fixture props
only reaches the leaves. The high-leverage move for data-driven members is to
**alias `@augment-it/workspace` to a fixture stub** in the probe's
`resolve.alias` — every capability call funnels through `workspace.invoke()`, so
one small stub renders the member's *real* `App.svelte` end-to-end. Two traps: a
probe outside the pnpm workspace cannot resolve `@augment-it/*` at all (use
relative paths), and fixture shapes must match `packages/workspace/src/types.ts`
exactly.

**Put the probe outside `apps/`.** `design:drift` treats any directory there as a
member and will silently add an F6 to the federation count. Delete it before your
final measurement either way.

### Verify what you cannot see

Most members hide most of their buttons behind `{#if}`. In the first migration
**six of nine** never rendered without NATS and seven Docker services running.

An agent told to "run the gates and stop" will report success having *seen* three
of nine. **State your visual coverage explicitly** — how many buttons you actually
looked at, and how.

Where a button will not render, the probe technique that works: a throwaway
rsbuild app aliased at the member's real sources, importing the member's own
`app.css`, rendering the components directly with fixture props. Delete it
afterwards.

## Judgement calls that are yours

- **Are the member's chips Buttons?** The first migration answered **yes**, and
  the reasoning generalises: a chip is a button with a variant, a size, a focus
  ring and a disabled state. What makes a chip *row* a separate organ is the
  **group** behaviour — single-selection, roving tabindex, arrow keys — which
  lives in the row. So `FilterChipRow` composes Buttons rather than replacing
  them.

  **Use `aria-pressed`, not `role="tab"`.** Correct tab semantics needs
  `aria-controls`, `role="tabpanel"` and arrow-key handling; half-implemented
  tabs are worse for a screen reader than honest toggle buttons. Full
  radiogroup/tab semantics is a `FilterChipRow` job, not yours.
- **Does anything need an override?** Use rung 2 or 3 if so, and **say so in your
  report.** A recurring override is evidence for a missing variant, which is a
  finding rather than a failure.
- **Can a rung-4 override even reach it?** Mechanical test, check it before you
  start: a member's global class lands at `(0,1,0)`; anything `Button` declares
  inside its own scoped `<style>` lands at `(0,2,0)` after Svelte hashing. **If
  the property you need to change is one `Button` sets, rung 4 cannot win** —
  and the next move is `!important`, which is how a component becomes
  decorative. A control that needs to fight the component is a **missing organ**,
  not a deviation. Say so and move on.
- **Count the properties you would have to override.** Past roughly four, you are
  re-drawing the control. `chat`'s `.command-row` needed eight — `display`,
  `height`, `width`, `text-align`, `white-space`, `padding`, `border-radius`,
  `border` — at which point `Button` contributes only `type="button"`, which the
  element already had.
- **Check the neighbours before committing to `ghost` or `link`.** A role-correct
  variant can still destroy the member's only interactivity cue: one migration
  mapped a dismissal to `ghost` and rendered it indistinguishable from a
  non-interactive muted span doing the same job one section below. Correct by
  role, a regression in fact.

- **Is a button actually a link?** `variant="link"` exists; an `<a>` styled as a
  button is a different fix and may be out of scope.

## Raise, don't chase

You will find things that are wrong and not your job — dead CSS, an `aria-*` that
lies, a swallowed error, a token used against its documented role. **Report them.
Do not fix them.**

Rogue debugging costs three things at once: the commit stops being attributable,
the gate stops meaning what it said, and the finding stops being reviewable
because it arrives already fixed.

**The line:** *if removing it is part of the migration, remove it. If fixing it is
a separate act of repair, raise it and move on.*

For each finding give: **what** (one sentence) · **where** (`path:line`) · **how
found** · **blast radius** (this member, or federation-wide?) · **confidence**
(measured, or suspected?).

## Hard rules

1. **Touch only your member**, plus its `package.json`. Not `packages/`, not
   `shell/`, not another member, not `apps/docs-portal/src/members.ts`.
2. **Do not commit.** Author, run the gates, report. The manager commits — one
   member per commit, so the history stays bisectable across eighteen migrations.
3. **Never a raw value in an override.** A literal is how the 170 phantom
   declarations happened.
4. **Pick tokens by role, not appearance.** A button is `--radius-md` because
   DESIGN.md §Shapes says buttons are, regardless of what looks right to you. This
   is not hypothetical — `chat` has eleven declarations one scale step off because
   someone picked by eye.

## Related

- [[../specs/Component-API-Contract-And-The-Control-Scale]] — the contract
- [[Converge-The-Federated-Design-System]] — the governance loop this serves
- [[../plans/Prove-The-Component-API-On-Request-Reviewer]] — the proof case this generalises
- `packages/shared-ui/src/Button.svelte` — the component, read its header
