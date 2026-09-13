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

1. `variant` + `size`
2. `radius="lg"` — a token NAME
3. `radius="lg/60"` — `calc(var(--radius-lg) * 0.6)`
4. `class=` + `data-deviation="reason"` — legal, declared, and it shows up in the
   member's catalog under *Deviations*

## Steps

1. **Read the member's CSS first, all of it.** You are about to delete from it.
2. **Add the dependency** — `"@augment-it/shared-ui": "workspace:*"`.
3. **Map each `<button>` to a variant** by what it *does*, not by how it looks.
   The accent-filled commit action is `primary`; the quiet default is `secondary`;
   a destructive action is `destructive` even if the member drew it grey.
4. **Replace, then delete.** Every recipe the replacement orphaned comes out.
   Verify with a search that nothing still references the class.
5. **Run the gates** (below) and stop.

## Gates

```
pnpm --filter @augment-it/<member> check     must be clean
pnpm design:drift --member <prefix>          must not INCREASE
pnpm design:drift                            federation count must not increase
```

The federation baseline is **93** as of 2026-09-13. Know the number before you
start and report it after. A count that moves without explanation is the finding.

## Judgement calls that are yours

- **Are the member's chips Buttons?** Toggles with an active state may be
  `variant="ghost"` plus `aria-pressed`, or may be a different organ entirely —
  `FilterChipRow` is registered separately. Decide, record why.
- **Does anything need an override?** Use rung 2 or 3 if so, and **say so in your
  report.** A recurring override is evidence for a missing variant, which is a
  finding rather than a failure.
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
