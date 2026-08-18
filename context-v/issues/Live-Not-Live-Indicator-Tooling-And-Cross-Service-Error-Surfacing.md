---
title: "Live/not-live indicator tooling — parts of the UI feel dead, and there's no single view that says whether everything is actually working"
lede: "Five distinct failures — dead remote, dead socket, dead service, no refresh, unwired button — all present to the operator as one dead click."
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
  - Error
  - Augment-It
  - Observability
  - Liveness
  - Error-Surfacing
  - Shell
status: Open · Jotted
site_uuid: 6b25472d-3441-41d8-9d46-2b3a5e7461f5
hex_code: bep4f8
date_authored_initial_draft: 2026-07-24
date_authored_current_draft: 2026-07-24
---

# Live/not-live indicator tooling + cross-service error surfacing

## The symptom

Using the application, some options feel **"dead"** — clicking a Flow in the
popdown, clicking a button, firing an action sometimes produces nothing
visible. No spinner, no error, no state change. The operator is left
guessing which of at least five different failures it was:

1. The federated remote isn't running (dev server down on its port) — the
   shell mounts nothing or errors quietly.
2. The remote mounted but its WebSocket to workspace-service is
   `closed`/`error` — every `workspace.invoke` dies.
3. The capability crossed the wire but the backing service (or NATS, or
   SurrealDB) is down/erroring — reply times out or comes back `ok:false`
   into a code path that doesn't render it.
4. The click worked and the write landed, but nothing on-screen refreshed.
5. The click genuinely does nothing yet (an unwired affordance).

All five present identically to the operator: a dead click.

## What we already have (scattered, insufficient)

- Per-remote WS status pills (`status-open/closed/error` chrome in each
  app's header) — but only for the workspace socket, only per-remote, and
  easy to miss.
- Per-widget localized error text (AdditiveList, ResultRow, etc.) — good
  where it exists, but only covers errors that make it back as `ok:false`.
- Service-side JSON logs (`docker compose logs`) — invisible unless you go
  terminal-side.
- The known gotcha that the shell's DevTools console scrubs
  Module-Federation cross-origin errors to `'Script error.'` (README §Get
  started) — so even the console lies about remote failures.

## What "fixed" plausibly looks like (directions, not decisions)

- **A liveness view** — one surface (a shell page, a header popover, or a
  didi-chat verb) showing green/red per: each federated remote's
  `remoteEntry.js` reachability, workspace WS, NATS, each service
  (heartbeat subject or `<service>.ping.requested`), SurrealDB reachability,
  SearXNG. "Is everything fine?" should be one glance, not six terminals.
- **Chrome-level indicators** — the shell header already knows the WS
  state; it could aggregate remote-mount failures and show a single
  degraded-state badge instead of remotes failing silently into blank
  slots.
- **Error surfacing pipeline** — capability failures (`ok:false`, timeouts)
  should land somewhere visible by default (toast layer? a shell-owned
  error rail? at minimum a dev-mode on-screen log), not just in whichever
  component thought to render them.
- **Dead-click insurance** — every wired affordance gives immediate
  feedback (busy state within ~100ms) so "no reaction" reliably means
  "not wired or broken," never "working silently."

## Open questions

- [ ] Heartbeat convention: per-service `*.ping.requested` subjects, or a
  single workspace-service aggregator that checks its dependencies?
- [ ] Where does the liveness view live — a shell surface, a remote of its
  own, or a didi chat verb (`/status`)?
- [ ] Does error surfacing ride the existing WS broadcast machinery
  (an `error.raised` frame) or stay client-local?
- [ ] Relationship to [[No-Test-Coverage-TDD-Deferred-Despite-Agentic-Fit]]
  — tests catch regressions before ship; liveness tooling catches
  environment/runtime failure after ship. Both attack "feels dead," neither
  substitutes for the other.
