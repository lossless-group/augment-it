---
date_created: 2026-07-07
date_modified: 2026-07-07
title: "ROTATION becomes N flows — the header's bubble strip goes dynamic"
lede: "The 'Flows' popdown moved from the header's right side to sit where the numbered bubble strip lives, and now actually switches which flow is active — 'Improve a CSV' (the original 6-step pipeline, with strategyCurator un-spliced back out of it), 'Build Corpora' (1 step), and a third, 'Augment a CSV of Event Attendees' (2 steps), added minutes later at zero architecture cost. FlowWidget's bubble count is no longer a fixed constant; it resizes to whatever the active flow's rotation actually is."
publish: true
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Sonnet 5
files_changed:
  - shell/src/flows.svelte.ts
  - shell/src/remotes.ts
  - shell/src/layout.svelte.ts
  - shell/src/FlowWidget.svelte
  - shell/src/App.svelte
tags:
  - Progress-Update
  - Shell
  - Rotation
  - Flow
  - Multi-Flow
  - Jumbo-Popdown
  - Architecture
---

## Why Care?

Yesterday's "Build Corpora" popdown item worked, but it was a navigate
action bolted onto a header that still only knew about one flow. The
operator's next ask made the real shape explicit: two flows, symmetric,
each with its own step count, switched from one control sitting where the
numbered bubble strip already lives — not a second, disconnected picker.

## What's New?

- **`ROTATION` split into a registry.** `shell/src/remotes.ts`'s single
  hardcoded array is now two — `CSV_AUGMENTATION_ROTATION` (6 steps:
  recordCollector, recordDbResolver, augment, recordsSurface,
  responseReviewer, enhancedRecordsList) and `BUILD_CORPORA_ROTATION`
  (1 step: strategyCurator). `strategyCurator` — spliced onto the head of
  the old `ROTATION` on 2026-07-06 to give it *some* entry point — is back
  out entirely; it never belonged in the CSV pipeline's sequence.
- **A new `shell/src/flows.svelte.ts`.** `FLOWS: FlowDef[]` (id, label,
  description, rotation) plus an `activeFlow` singleton — same
  constructor-`$state` pattern as `layout.svelte.ts` and
  `@augment-it/workspace`. Persists to `localStorage`
  (`augment-it:active-flow`), same as layout mode and the active
  workspace already do.
- **`FlowWidget` takes its rotation as a prop now**, not an import — its
  bubble-strip `steps` computation is `$derived` instead of a plain
  `const`, so switching flows actually resizes the strip (6 bubbles ↔ 1)
  instead of silently ignoring the change.
- **`layout.svelte.ts`'s focus-index clamp reads the active flow's
  rotation length** instead of a fixed `ROTATION.length` — a single-step
  flow and a six-step flow both clamp correctly without any special-casing
  in the layout class itself.
- **The popdown moved.** "Flows" now sits in the header's left group, next
  to the brand and right where the bubble strip renders — not tucked in
  with chat-toggle/auth/workspace on the right. Its items are generated
  from the `FLOWS` registry (no more hand-maintained single-item array).
- **Switching flows resets focus to step 1** (a stale index from a
  6-step flow is meaningless against a 1-step one) **and preserves layout
  mode** (peek-flow / full carry over) — **except co-existence**, which
  falls back to peek-flow, since the co-existence `PAIRINGS` are tied to
  specific CSV-augmentation slot ids and don't mean anything in a
  different flow's rotation.

## The third flow, minutes later

Proof of the "one `FLOWS` entry + one rotation array" claim above: the
operator asked for a third flow — **"Augment a CSV of Event Attendees"**
— and it shipped as exactly that. `EVENT_ATTENDEES_ROTATION` in
`remotes.ts` (`recordCollector` → `recordDbResolver`, 2 steps) plus one
new entry in `flows.svelte.ts`'s `FLOWS` array. This is Flow B from the
exploration doc, finally given its own entry point: ingest an event-
attendee CSV, then reconcile each row to a canonical organization or
person in SurrealDB — the original CRM-replacement use-case reach-edu
asked for, previously buried as just step 2 of "Improve a CSV."
`recordDbResolver` is now genuinely dual-use across two flows, not
embedded in only one.

## What's Next

A fourth flow, whenever one is actually needed, is the same one-array-plus-
one-entry cost. The popdown's panel can grow into the "helpful marketing"
vertical-carousel framing once there's enough in it to warrant a richer
layout than a plain item list.
