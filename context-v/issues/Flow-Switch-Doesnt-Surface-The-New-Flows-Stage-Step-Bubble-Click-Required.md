---
title: "Switching flows from the Flows popdown doesn't surface the new flow's stage — a rotation-step click is required"
lede: "Switching flows flips the pill but leaves the stage blank until a step-bubble click. Only tabs with persisted layout state reproduce it."
date_created: 2026-07-24
date_modified: 2026-07-24
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
semantic_version: 0.0.0.1
tags:
  - Issue
  - Usability
  - Augment-It
  - Shell
  - Flows
  - Tiling-Host
status: Open · Jotted
site_uuid: 1180b8b1-e2b3-4617-bf8f-fc80be21b1bb
hex_code: ae44wb
date_authored_initial_draft: 2026-07-24
date_authored_current_draft: 2026-07-24
---

# Flow switch doesn't surface the new stage

## The symptom (operator-confirmed, 2026-07-24 evening)

Flows popdown → "Augment from DB": the FLOW pill updates to "1 Org
Workbench" but the stage shows nothing (or the prior flow's panes). Clicking
the **rotation-step bubble** ("1 Org Workbench") in the FlowWidget is what
actually mounts/surfaces the workbench. Discovered during the
workspace-reset debugging — after the humain-vc reset was fixed, this
remained the last inch of "doesn't load."

## Why it's slippery

Headless drives against the same stack did NOT reproduce: a fresh browser
context (no persisted layout) renders the new flow's stage immediately on
popdown selection. The differing ingredient is **persisted tiling/layout
state** (`layout.svelte.ts` — pane modes ⇲ ⊟ ▢, per-flow visible-set
memory) carried in the operator's long-lived tab. The flow switch updates
`activeFlow`; the stage derivation apparently keeps honoring stale layout
state until a step-bubble click resets focus to the rotation's first step.

## Direction (jotted)

- On flow switch, the stage should surface the new rotation's step 1 as if
  the operator had clicked its bubble — one code path for both gestures.
- Audit `layout.svelte.ts`'s persisted keys for flow-scoped state that
  outlives a flow switch (the same class of stale-persisted-state bug as
  today's active-workspace reset and per-workspace org restore — third
  instance today; the pattern is becoming its own theme, see
  [[No-User-Visibility-Into-State-Needs-A-State-Inspector]]).
