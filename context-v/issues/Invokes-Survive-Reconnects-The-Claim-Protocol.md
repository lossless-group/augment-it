---
title: "Invokes survive reconnects — the claim protocol closes the eternal-spinner root cause"
lede: "Two crawls finished server-side while the tab spun forever. Pending invokes now survive a socket drop and re-attach by id via claim frames."
date_created: 2026-07-24
date_modified: 2026-07-24
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
semantic_version: 0.0.0.1
tags:
  - Issue
  - Augment-It
  - Workspace
  - Transport
  - Reliability
  - Didi-Crawl
status: Shipped
date_first_published: 2026-07-24
post_ship_note: "Shipped 2026-07-24 — successor to [[Crawl-Replies-Can-Be-Lost-Eternal-Spinner-No-Client-Timeout]]'s mitigations, landing the root cure the same evening after the Atlas Network crawl reproduced the loss. gh #41 closed."
site_uuid: f4cc6eef-8bff-44d1-9bc0-1e2246b6a4db
hex_code: mgs5ff
date_authored_initial_draft: 2026-07-24
date_authored_current_draft: 2026-07-24
---

# The claim protocol

## Why (twice in one evening)

The Curry Foundation crawl completed in 87s server-side; the tab spun
forever. Mitigations landed (client deadline, bigger dispatch ceiling) — and
then the Atlas Network crawl reproduced the loss within the hour, this time
severed by the very rebuild that shipped the mitigation. Container rebuilds
are ROUTINE in this stack; pending invokes must survive them.

## The design

- **Client** (`packages/workspace/src/transport.ts`): on socket close,
  pending invokes are NOT rejected (previously: reject + clear — the root
  cause). Undelivered queued frames re-send on reconnect; delivered ones
  re-attach by sending a `claim` frame per pending id. The claim's answer is
  a normal result frame — same id, same resolution path. Chat turns stay
  fail-fast (cheap to resend).
- **Server** (`services/workspace/src/ws.ts`): every invoke's serialized
  result is tracked in-flight; if the owning socket is gone when the result
  lands, it's stashed (15-min TTL). A `claim` returns the stash, attaches to
  still-running work, or — when the process restarted and knows nothing —
  replies with an explicit "workspace service restarted; retry" error so the
  caller fails fast instead of hanging.

## What this covers, and what it doesn't

Covered: network blips, browser sleep/wake, idle disconnects, and
mid-dispatch workspace-service RESTARTS where the service comes back before
the client gives up (in-flight work is lost with the process, but the claim
gets an immediate explicit error). Not covered: durable results across
restarts — the responder services (prompt-runner) reply over core NATS to a
requestor that no longer exists; true durability needs persisted results or
JetStream-style delivery, parked with the liveness sweep
([[Live-Not-Live-Indicator-Tooling-And-Cross-Service-Error-Surfacing]]).
The 660s client deadline from the mitigation pass stays as the backstop.

## Rider observation (operator, same session)

`services/workspace/src/ws.ts` is a poor name — terse, collides mentally
with both "workspace" and the `ws` npm package. `frame-router.ts` or
`websocket-router.ts` would say what it is. Not renamed mid-fix (drift
policy); a candidate for the conventions/component cleanup (#22-adjacent).
