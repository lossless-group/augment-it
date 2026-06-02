---
title: "Tooltip System — A First-Class Affordance, Not the Browser's Half-Working `title=`"
lede: "augment-it's UX coherence audit promoted icon-with-tooltip to a shell-wide pattern (principle §8). The implementation today leans on the native HTML `title=` attribute, which doesn't show reliably across browsers, has uncontrollable delay, can't be styled, and carries no accessibility story beyond what the screen reader chooses to surface. For a load-bearing affordance pattern that's now the standard for binary picks, small-control switching, and 'change ›' affordances, this is an architecture gap. This spec scopes the Tooltip System as a first-class shell utility — a single component, a single discipline, a single accessibility story — and frames the migration plan."
date_created: 2026-06-01
date_modified: 2026-06-01
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
semantic_version: 0.0.0.1
tags:
  - Spec
  - Augment-It
  - Tooltip
  - Shell
  - Shared-UI
  - Accessibility
  - Affordance-Pattern
  - Stub
status: Draft
---

# Tooltip System

<!-- Stub — captures the scope and the "why now" so the work is
     discoverable when picked up. Body to be filled with the user. -->

## Why this exists

[[Shell-and-Micro-Frontend-UX-Coherence]] principle §8 says
*"icon-with-tooltip is the standard small-control affordance"* — and
across the refactor's six phases the pattern showed up in at least four
places that are now load-bearing:

- The enrichment composite header (`✎` / `⊞` toggle) — Phase 2c.
- The Flow widget's Split / Full layout toggles (`⊟` / `▢`) — Phase 4.
- The Flow widget's position-toggle chevron (`⇲` / `⇱`) — Phase 4.
- Pack Runner's `change ›` affordance for the inferred entity-name
  column — Decision §9.

All of them rely on the native HTML `title=` attribute today. That
attribute has well-known problems for a primary affordance pattern:

1. **Delay is uncontrollable.** Browsers wait ~700ms-2s before showing,
   so the user often gives up before the tooltip appears.
2. **Styling is impossible.** Tokens like `--color-accent`, font
   stacks, the muted-color story — none reach native tooltips.
3. **Rich content is impossible.** No icons, no badges, no two-line
   explanations with a hint + a shortcut.
4. **Touch surfaces ignore them entirely.** A tooltip you can't see
   on iPad / iPhone is functionally a missing affordance there.
5. **Accessibility is patchy.** Screen readers handle `title=`
   inconsistently — some announce the body, some don't, some treat it
   as a label, some as a description.
6. **Multiple tooltips on a tight pill row collide.** The Flow widget's
   five bubbles + Split/Full + position-toggle is exactly the case
   where native tooltips overlap and flicker.

The audit promoted the pattern to a principle on the basis that *the
affordance will read correctly when invoked*. Today the affordance only
sometimes reads. That's the gap this spec is meant to close.

## Scope (to lock with the user)

Open. Candidate framing:

- **A single shared component** at
  `packages/shared-ui/src/Tooltip.svelte` (or co-located in a small
  `Tooltip/` directory if we add multiple tip-shaped components). The
  shell + every remote consumes the same component.
- **Trigger model.** Most likely: a wrapper that takes a child slot
  + a `content` string-or-Snippet + a placement preference. The
  consumer writes `<Tooltip content="…">…the icon button…</Tooltip>`.
  Alternative: an action directive (`use:tooltip={{ content }}`)
  that's lighter at the call-site but less inspectable.
- **Position engine.** Float around the trigger; auto-flip if the
  preferred side overflows. Use a tiny dependency (e.g. floating-ui)
  or roll a small `getBoundingClientRect`-based shim. Cost vs.
  reach tradeoff.
- **Delay + dismissal.** A single configurable delay (200ms feels
  right; let's lock by trying). Hide on `mouseleave` AND on
  `pointerdown` anywhere outside, AND on `Escape`.
- **Accessibility.** Use `aria-describedby` linking the trigger to
  the tooltip's id; set `role="tooltip"` on the panel. Tooltip
  content is not interactive (no buttons inside; if you need a
  button, use a Popover, not a Tooltip).
- **Touch behaviour.** Long-press to show; tap-anywhere-else to
  dismiss. Or: on touch surfaces, the tooltip body is always-visible
  as inline secondary text. (Pick one; the icon-only-with-tooltip
  pattern doesn't degrade well on touch.)

## Migration plan (sketch)

1. Ship the component + a `@augment-it/shared-ui/Tooltip.svelte`
   export.
2. Replace `title=` on the four load-bearing usages above. Order:
   - Composite header (`ToggleHeader__PromptOrPackage--Icons.svelte`) — single highest-impact win.
   - Flow widget (`shell/src/FlowWidget.svelte`) — the most-instances surface.
   - Pack Runner's `change ›` — the most recent addition.
3. Annotate principle §8 in
   [[Shell-and-Micro-Frontend-UX-Coherence]] with a forward link
   to this spec.
4. Add a brief CHANGELOG entry naming the system shift (not just
   the styling) since this is exactly the "make the pattern
   actually reliable" moment.

## Open questions

- **Component vs. action directive?** Component is more obvious in
  the source; directive is lighter at call-sites and survives
  refactors of the wrapper element better.
- **Position library?** floating-ui is heavy for the value here;
  a 30-line shim might be sufficient.
- **Touch-surface story.** Long-press vs. always-visible inline
  secondary text — needs a UX call.
- **Rich-content tooltips on bubbles.** Should the Flow widget's
  bubble tooltips carry only the step label, or label + short
  description + keyboard shortcut? The bubble strip is exactly the
  case where richer tooltip content earns its keep.

## Related

- [[Shell-and-Micro-Frontend-UX-Coherence]] §Cross-cutting principles §8
  — the principle this spec satisfies.
- [[../plans/Shell-and-Micro-Frontend-UX-Coherence-Refactor]] — the
  six-phase refactor that promoted the pattern.
- `packages/shared-ui/src/ToggleHeader__PromptOrPackage--Icons.svelte`
  — the first consumer; will switch to `<Tooltip>` first when this
  ships.
- `shell/src/FlowWidget.svelte` — the highest-density consumer
  (five bubble tooltips + two layout toggles + one position toggle).
