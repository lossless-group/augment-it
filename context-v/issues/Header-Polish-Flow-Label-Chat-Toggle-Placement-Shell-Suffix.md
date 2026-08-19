---
title: "Header polish — the FLOW label and shell suffix have outlived their jobs, and the chat toggle sits on the wrong side"
lede: "Four findings from the first production walk-through — including a chat toggle on the right that opens a rail pinned to the left."
date_created: 2026-07-28
date_modified: 2026-07-28
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
semantic_version: 0.0.0.2
tags:
  - Issue
  - Augment-It
  - Shell
  - Header
  - UX-Polish
status: Active
site_uuid: 1dd33727-44cd-4a47-9ff4-0e636c9455bf
hex_code: 8amphh
date_authored_initial_draft: 2026-07-28
date_authored_current_draft: 2026-07-28
publish: true
---

# Header polish — findings from the first production walk-through

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
4. **The chat rail needs its own obvious collapse button** — INSIDE the
   chat surface, in its header, floated right. Today the only way to
   dismiss the rail is the shell-header toggle sitting across the
   screen; a rail you open should be closable from the rail itself,
   with an affordance you can't miss.

All four are shell/chat-rail chrome concerns (`shell/src/App.svelte`'s
header region — wordmark, flow strip, rail toggles — plus the chat
rail's own header bar for the collapse button), no service surface
involved.

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
- Add a prominent collapse control inside the chat rail's header, float
  right (`◀`/`✕`-grade obvious, not a subtle icon), wired to the same
  visibility state as the shell-header toggle so the two stay in sync.

Small enough to ride as a fix-ticket in the workspace-auth loop's human
gate (per [[../loops/Implement-Feature-Loop]] — findings become
fix-tickets), or as a standalone polish pass after ship.

## See also

- [[../plans/Open-Augment-Didi-Sh-To-Reach-Edu]] — the run whose human
  gate surfaced these
- `shell/src/App.svelte` — header layout, rail toggles, wordmark
