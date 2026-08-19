---
title: "No user visibility into state — the app needs a State-Inspector surface"
lede: "State lives in five places and none are inspectable from inside the app — nothing shows which remote currently believes what."
date_created: 2026-07-24
date_modified: 2026-07-24
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
semantic_version: 0.0.0.1
flagged_up_tree: "ai-labs/context-v/issues/State-Inspector-As-A-Universal-Need-Across-Apps.md"
tags:
  - Issue
  - Oversight
  - Usability
  - Augment-It
  - State-Inspector
  - Observability
  - Microfrontends
status: Open · Jotted
site_uuid: 52ff4460-797a-4d46-964b-74afd3176689
hex_code: pk0w3a
date_authored_initial_draft: 2026-07-24
date_authored_current_draft: 2026-07-24
publish: true
---

# No user visibility into state — needs a State-Inspector

## The symptom

There is no way, from inside the running app, to see what the app currently
believes. When something looks wrong — a stale card, a flow that mounts the
wrong remote, a search rail with no launch context — the only inspection
tools are DevTools spelunking (per-remote, and federation scrubs
cross-origin errors) and reading localStorage by hand.

## Where state actually lives here (the inspector's table of contents)

1. **Per-remote Svelte 5 runes singletons** — deliberately NOT shared
   across federation (no `shared` block): `activeFlow` + `layout` in the
   shell, `searchContext` in search-and-add, and a separate
   `@augment-it/workspace` singleton instance in EVERY remote, each
   converging via WS broadcasts rather than shared memory. When they
   desync, nothing shows which remote believes what.
2. **localStorage keys** — the cross-remount contract:
   `augment-it:active-flow`, `augment-it:session-token`,
   `augment-it:active-record-set`, `augment-it:search-request`,
   `augment-it:org-workbench:active-org`, per-page sort prefs, per-set idx
   bookmarks, mapping caches. Undocumented as a set; no registry.
3. **WS-session state** — what workspace-service currently holds for this
   connection (active client, didi identity, pinned flag).
4. **Server-side stores** — row-store record sets/rows, response-store,
   prompt-store; visible only through whichever remote happens to render
   them.
5. **The canonical layer** — SurrealDB; inspectable only via scripts/MCP.

## Directions (jotted, not decided)

- **A State-Inspector surface** — dev-mode panel or its own small remote:
  dumps (1) this remote's singleton snapshots, (2) all `augment-it:*`
  localStorage keys parsed, (3) the current WS session frame, (4) recent
  cross-remote CustomEvents (a ring buffer listener on `augment-it:*`).
  Read-only first; editing state comes much later, if ever.
- **A localStorage key registry** — even just a doc/table with owner +
  shape per key would halve the spelunking.
- **Event tap** — the `augment-it:*` window-event namespace is the app's
  nervous system and completely invisible; a 50-line listener that logs
  the last N events with payloads would have explained most historical
  "why didn't it refresh" mysteries.
- Composes with [[Live-Not-Live-Indicator-Tooling-And-Cross-Service-Error-Surfacing]] —
  liveness answers "is it up," the inspector answers "what does it think";
  they may share a surface.

## Flagged up the tree

This is not an augment-it quirk — every ai-labs app has the same hole with
different state substrates. The universal framing lives at
`ai-labs/context-v/issues/State-Inspector-As-A-Universal-Need-Across-Apps.md`;
this file stays the augment-it-specific instance (the five-place inventory
above is this app's).

## Open questions

- [ ] Dev-mode-only, or shipped-but-tucked-away (the didi chat could gate a
  `/state` verb)?
- [ ] One inspector in the shell that asks each remote to self-report (a
  `augment-it:state-report` request/response event pair), vs per-remote
  panels?
- [ ] Does the WS/event ring buffer belong in `@augment-it/workspace` so
  every remote gets it for free?
