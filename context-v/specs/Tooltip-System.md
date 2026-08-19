---
title: "Tooltip System — A Versatile First-Class Family, Plus a Walkthrough for New and Returning Users"
lede: >-
  Apps fail at orientation, not functionality — so tooltips become a first-class family, not the browser's half-working `title=`.
date_created: 2026-06-01
date_modified: 2026-06-01
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
semantic_version: 0.0.0.2
revisions:
  - 2026-06-01 — Initial stub (0.0.0.1). Framed the gap (native `title=` is unreliable) and the migration order.
  - "2026-06-01 — Sharpened by the user (0.0.0.2). Added: the **subcomponent family** (Tooltip--Simple, Tooltip--Rich, Tooltip--Popover) rather than one component; the **`from` directionality prop** with cardinal + diagonal placements and an arrow/triangle connector; the **`distance` rem prop** with a small default; and the **Tooltip-Walkthrough** surface for new- and returning-user orientation. Framing locked: apps succeed at onboarding/orientation, not at functionality."
tags:
  - Spec
  - Augment-It
  - Tooltip
  - Shell
  - Shared-UI
  - Accessibility
  - Affordance-Pattern
  - Onboarding
  - Walkthrough
  - First-Class
status: Draft
site_uuid: 071eca80-b2ed-4efa-a195-f1e7c0a515d9
hex_code: l0haq1
date_authored_initial_draft: 2026-06-01
date_authored_current_draft: 2026-06-01
publish: true
---

# Tooltip System

## Why this exists

[[Shell-and-Micro-Frontend-UX-Coherence]] principle §8 says
*"icon-with-tooltip is the standard small-control affordance"*, and
across the refactor's six phases the pattern lands in at least four
places that are now load-bearing: the enrichment composite header, the
Flow widget (five bubbles + Split/Full + position-toggle), and Pack
Runner's `change ›`. The audit promoted the pattern to a principle on
the bet that *the affordance will read correctly when invoked*. Today
the affordance only sometimes reads, because every consumer uses the
native HTML `title=` attribute — uncontrollable delay, no styling, no
rich content, patchy touch / screen-reader support, overlap problems on
dense surfaces, and zero ability to sequence them for onboarding.

The framing this spec proceeds from:

> Most apps don't succeed or fail at functionality. They succeed or
> fail at **onboarding, orientation, and re-orientation when a
> returning user comes back to find things have moved**.

Better if the app is so simple it doesn't even need orientation —
but even then, there is usually still a "new user" and a "returning
user" experience, and the closer the app gets to "doing complex things
simply," the more those moments earn their keep. Tooltips are the
load-bearing affordance for all three.

So the gap isn't "the tooltip implementation is unreliable." The gap is
**we don't have a Tooltip *system***. A system has a family of
primitives at the leaf, shared geometry across them, and a higher-level
surface (the Walkthrough) that composes them. This spec scopes all
three.

## The subcomponent family

One component is the wrong abstraction — the cases differ in *content
shape*, and forcing one component to handle them all either bloats the
API or pushes complexity to every call-site. The right shape is a tiny
family of components in `packages/shared-ui/`. Following the BEM-ish
file convention already established by
`ToggleHeader__PromptOrPackage--Icons.svelte`:

### `Tooltip--Simple.svelte` — the 90% case

A one-line tooltip. Plain text, no icon, no actions. This is what every
current `title=` becomes when the migration runs. The composite header's
✎/⊞ icons, the Flow widget's bubble strip, Pack Runner's `change ›` —
all of them. **Default; reach for this first.**

```svelte
<Tooltip--Simple content="Custom prompt — author a free-text LLM prompt">
  <button aria-label="Custom prompt">✎</button>
</Tooltip--Simple>
```

### `Tooltip--Rich.svelte` — when one line isn't enough

Multi-line. Optional leading icon, an `<strong>`-able title line, a
secondary muted line, an optional keyboard-shortcut chip. Still
*non-interactive* — same a11y rules as Simple. Good for the Flow
widget's bubbles when the tooltip should show step name + short
description + "step 3 of 5" position, or for Pack Runner's bundle
description when hovering the Bundle select.

```svelte
<Tooltip--Rich
  title="Profile Builder · Nonprofit"
  body="Common-five + Wikipedia, biased for org-shaped entities"
  shortcut="3"
  from="bottom"
>
  <li class="bubble">3</li>
</Tooltip--Rich>
```

### `Tooltip--Popover.svelte` — the boundary case

When the floating panel needs to **carry interactive content**, it's
no longer a tooltip; it's a Popover. Same geometry primitives (`from`,
`distance`, arrow), different a11y story (`role="dialog"`, focus
management, ESC + outside-click dismissal, keyboard trap if modal). The
Walkthrough below is the first consumer.

```svelte
<Tooltip--Popover from="top-left" distance={1.25}>
  <h4>This panel moved</h4>
  <p>The Flow widget is now hierarchical — bubbles for steps, icons for layout.</p>
  <div class="actions">
    <button onclick={next}>Got it</button>
    <button onclick={skip}>Skip the tour</button>
  </div>
</Tooltip--Popover>
```

Naming alternative considered: `--Simple` / `--Base` / `--Complex`.
Rejected — *Simple/Rich/Popover* names the **content shape** at each
level; *Simple/Base/Complex* names a vague complexity axis that doesn't
tell the consumer when to reach for which. Pick the one the API
documents itself with.

## Shared geometry — what every tooltip in the family agrees on

### `from`: directionality from the trigger

Where the tooltip is positioned relative to the trigger element, and
where the arrow attaches. Cardinal directions are the floor; diagonals
let the arrow point at a corner of the trigger.

| `from` value | Tooltip renders on the trigger's | Arrow attaches at |
|---|---|---|
| `top` | top | bottom-center of tooltip → top of trigger |
| `bottom` | bottom | top-center → bottom of trigger |
| `left` | left | right-center → left of trigger |
| `right` | right | left-center → right of trigger |
| `top-left` | bottom-right *(opposite corner)* | bottom-right corner → top-left of trigger |
| `top-right` | bottom-left | bottom-left corner → top-right of trigger |
| `bottom-left` | top-right | top-right corner → bottom-left of trigger |
| `bottom-right` | top-left | top-left corner → bottom-right of trigger |

The semantic: **`from` names the side / corner of the trigger the arrow
attaches to.** A `from="top-left"` arrow attaches at the trigger's
top-left corner, so the tooltip body sits opposite — at the
bottom-right relative to the trigger. This matches how designers and
support agents think ("the arrow points up-and-left") and removes the
"is this the side of the trigger or the side of the tooltip?" guessing
game.

**Auto-flip on overflow.** If the preferred `from` would push the
tooltip off the viewport, the position engine flips to the opposite
side, *without* rotating the consumer's mental model. The arrow follows.

### `distance`: rem gap between trigger and tooltip

Number, default `0.4` rem (just barely off the trigger — the standard
icon-tooltip). Pass higher values when the tooltip needs visual
breathing room (e.g. on a dense bubble strip) or when the trigger has
its own visible padding that would otherwise visually collide with the
arrow.

```svelte
<Tooltip--Simple content="Move Flow widget to left rail" distance={0.6}>
  <button class="chevron">⇲</button>
</Tooltip--Simple>
```

### Delay, dismissal, accessibility

Locked across the family:

- **Show delay** — `200ms` default; configurable via `delay` prop. Walkthrough overrides to `0` because the user explicitly invoked the sequence.
- **Hide** — on `mouseleave` AND `pointerdown` outside AND `Escape`.
  Tooltips and Popovers both honor `Escape`; Popover additionally
  traps focus while open.
- **A11y for Simple + Rich** — `aria-describedby` on the trigger, `role="tooltip"` on the panel, content not focusable, no interactive children.
- **A11y for Popover** — `role="dialog"`, `aria-modal="true"` when modal, focus moves into the panel on open and returns to the trigger on close. Interactive children allowed.
- **Touch** — long-press (~500ms) to show; tap-outside dismisses. Or
  — the open question — on touch surfaces, the tooltip body renders as
  always-visible inline secondary text under the icon. Pick one default
  with a per-call escape hatch.

## The Tooltip-Walkthrough surface

The bigger move. A **walkthrough** is a guided, ordered sequence of
tooltips (mostly `Tooltip--Popover` so each step can carry a Next /
Skip / Got-it action) that fires for a user under specific conditions:

- **First-run** — the user just signed in for the first time. Tour
  the shell: Flow widget → composite header → Pack Runner → Response
  Reviewer → Enhanced Records.
- **Returning-since-milestone** — the user last signed in before a
  declared milestone (e.g. `2026-06-01: Flow widget + Augment This
  Set + bundles`). On their next sign-in, the relevant subset of
  steps fires so they discover what moved without reading release
  notes.
- **Per-surface re-orientation** — the user opens a surface they
  haven't used in N weeks. A shorter, single-surface tour fires.

This is a recognized pattern. driver.js, Shepherd.js, react-joyride,
intro.js, and Notion's first-run series are all instances. The reason
to build our own rather than vendor: it has to compose with the
composite slot, the Flow widget, the cross-remote navigate event, and
the dual-identity framing (a demo visitor and an outside user want
different first-run shapes — the system has to render both).

### Walkthrough shape (to lock with the user)

- **Milestone registry.** A small TS module declares milestones with
  ISO dates and the bundle of steps each milestone introduces.
  `context-v/blueprints/Walkthroughs/milestones.ts` is a candidate
  location.
- **Cohort logic.** On sign-in, compute `unseenMilestones = milestones
  filter (lastSignIn < milestone.date AND !user.dismissed(milestone))`.
  Run the steps for each unseen milestone in date order.
- **Step shape.** Each step targets a CSS selector (or a known
  remote/slot/composite id), specifies a `from` direction and
  `distance`, supplies title + body + optional CTA actions
  (`primary: 'Next' | 'Got it'`, `secondary: 'Skip the tour' | null`).
- **Persistence.** `localStorage['augment-it:walkthrough:dismissed']`
  is a set of milestone ids the user has dismissed. Plus a per-step
  `:seen` set for "show me only the steps I haven't seen yet."
- **Composability with the shell.** A step can drive
  `augment-it:navigate` to bring its target surface into focus before
  the popover appears — so the tour can walk Record Collector →
  Enrichment → Response Reviewer without the user manually navigating.
- **Dual-identity branching.** A step can declare an `audience`
  (`'user' | 'visitor'`) and the walkthrough engine picks the shape
  appropriate for the active mode. Honors principle §12.

### Why this earns its keep

The framing again: **apps succeed at onboarding, orientation, and
re-orientation, not at functionality.** augment-it is currently shaped
for the user who already understands the augment-it model. A first-run
visitor lands on the shell and sees five rotation steps, a composite
slot with a ✎/⊞ toggle, a chat rail, and a Flow widget — all of which
are coherent *once you know the model*, none of which announce
themselves. The walkthrough is the announcement.

The returning-user case is the more under-served one. *"You came back
after we shipped Augment This Set, the Flow widget, and bundle-first
Pack Runner. Here's a 90-second tour of what moved."* That moment is
where users either feel met-where-they-are or feel like the app got
rebuilt without telling them.

## Migration plan

In order:

1. **Ship `Tooltip--Simple`.** Single component, single migration: replace
   `title=` on the four current consumers — composite header, Flow
   widget (bubbles + Split/Full + chevron), Pack Runner's `change ›`,
   and any other surface that's accumulated `title=` since. One PR.
2. **Add `Tooltip--Rich`.** No call-site change yet; just the API. Land
   when a surface (likely the Flow widget bubbles for richer content)
   wants more than a line.
3. **Add `Tooltip--Popover`.** The Walkthrough's prerequisite.
4. **Ship Tooltip-Walkthrough**, milestone registry + cohort logic +
   the first three milestones (everything Phase 1-5 shipped). Lands as
   a separate child spec when picked up.

## Open questions

- **Component vs. action directive.** A component (`<Tooltip--Simple>`)
  is more obvious in source and easier to nest. An action directive
  (`use:tooltip={{ content, from }}`) is lighter at call-sites. The
  current lean is component-shaped because the family has multiple
  variants — directives don't compose well with a `Tooltip--Rich`
  body slot.
- **Position engine.** `floating-ui` (~10kB gz) handles all eight
  placements + auto-flip + arrow positioning correctly across edge
  cases. A hand-rolled 30-line `getBoundingClientRect` shim works for
  the cardinal four; diagonals + arrow geometry get gnarly quickly.
  Lean: pull `floating-ui` for the cost predictability.
- **Touch default.** Long-press-to-show vs. always-visible-secondary-text.
  iPad / tablet usage of augment-it is currently low; this can be
  shipped as long-press with an escape hatch and revisited.
- **Where does the milestone registry live?** Per-app or shared in
  shared-ui. Likely shared — milestones are about the *product* shape,
  not any one remote.
- **Walkthrough authoring UX.** Inline as plain TS in the registry, or
  a tiny in-app authoring surface? Inline TS for v1; revisit if step
  count grows past ~30.

## Related

- [[Shell-and-Micro-Frontend-UX-Coherence]] §Cross-cutting principles §8 —
  the principle this system satisfies. The `⚠ Hanging issue` annotation
  on §8 points here.
- [[Initial-User-Experience]] — landing-through-onboarding spec; the
  Walkthrough is the first-run mechanic that spec needs.
- [[../blueprints/Augment-It-as-Working-App-and-Architecture-Demo]] —
  the dual-identity blueprint; the walkthrough's `audience` branching
  is how that framing reaches the user.
- `packages/shared-ui/src/ToggleHeader__PromptOrPackage--Icons.svelte` —
  the first migration target (its three `title=` attributes).
- `shell/src/FlowWidget.svelte` — the highest-density migration target
  (five bubble tooltips + two layout toggles + one position toggle).
- `apps/pack-runner/src/App.svelte` — the most recent `title=` addition
  (the `change ›` affordance for the inferred entity-name column).
