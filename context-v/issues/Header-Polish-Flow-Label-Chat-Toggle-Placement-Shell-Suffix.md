---
title: "Header polish — the FLOW label and shell suffix have outlived their jobs, and the chat toggle sits on the wrong side"
lede: "Three operator findings from the workspace-auth human gate, all in the shell header: FLOW duplicates the Flows dropdown, the chat toggle lives center-right while the chat rail it controls is on the left, and 'augment-it · shell' still says shell."
date_created: 2026-07-28
date_modified: 2026-07-28
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
semantic_version: 0.0.0.1
tags:
  - Issue
  - Augment-It
  - Shell
  - Header
  - UX-Polish
status: Active
---

# Header polish — three findings from the first production walk-through

## The observations (operator, 2026-07-28, during the workspace-auth human gate)

1. **The `FLOW` header text is now unnecessary.** The Flows dropdown
   (`⎔ Flows ▾`) landed beside it and carries the same meaning with an
   actual affordance; the underlined `FLOW` label next to the numbered
   step pill (`1 Org Workbench`) is duplicate chrome.
2. **The chat toggle is in the wrong place.** The `💬 chat` button sits
   center-right in the header, but it toggles the didi chat rail — which
   is pinned to the **left** side of the viewport. The toggle should be
   **top left**, above the thing it controls (the same spatial logic the
   `🔎 queue` toggle gets right: right-side toggle, right-side rail).
3. **The `· shell` suffix in the wordmark can go.** `augment-it · shell`
   was orientation scaffolding while the module-federation architecture
   was being stood up; with a second tenant's users arriving, the
   internal-architecture label reads as noise ("I get it ;)").

All three are shell-header concerns (`shell/src/App.svelte` and its
header region — the wordmark, the flow strip, and the rail toggles), no
remote or service surface involved.

## Why now

These are the first findings filed with a non-operating-team user
incoming: [[../plans/Open-Augment-Didi-Sh-To-Reach-Edu]] puts Stephenie
Tesoro in front of this header, and chrome that exists to orient the
builders (FLOW, `· shell`) or that ignores spatial mapping (chat toggle
across the screen from its rail) is exactly the kind of thing a first
client user trips on silently.

## Resolution shape (when picked up)

- Drop the `FLOW` label from the flow strip; the dropdown + numbered
  step pill carry the context.
- Move the chat toggle to the far left of the header, adjacent to where
  the chat rail mounts; keep `queue` on the right with its rail.
- Wordmark becomes just `augment-it`.

Small enough to ride as a fix-ticket in the workspace-auth loop's human
gate (per [[../loops/Implement-Feature-Loop]] — findings become
fix-tickets), or as a standalone polish pass after ship.

## See also

- [[../plans/Open-Augment-Didi-Sh-To-Reach-Edu]] — the run whose human
  gate surfaced these
- `shell/src/App.svelte` — header layout, rail toggles, wordmark
