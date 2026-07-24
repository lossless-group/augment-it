---
title: "Crawl replies can be lost — the eternal 'crawling…' spinner (no client timeout, reconnect-dropped invokes, tight dispatch ceiling)"
lede: "The Curry Foundation crawl finished server-side in 87 seconds — and the tab spun forever anyway. Three gaps stacked: the browser invoke has no deadline, a WS reconnect (e.g. a workspace-service rebuild mid-crawl) silently drops pending invokes, and the 300s dispatch ceiling was one slow team-crawl away from biting (211s observed)."
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
  - Didi-Crawl
  - Workspace
  - Transport
  - Reliability
status: Shipped
date_first_published: 2026-07-24
post_ship_note: "Mitigations shipped 2026-07-24 — 660s client-side deadline on both crawl invokes (spinner always resolves to a retryable error naming that the run may still finish server-side), dispatch ceiling 300s→600s. The root transport gap (re-correlating pending invokes across WS reconnects) is folded into the legibility/liveness sweep scope ([[Live-Not-Live-Indicator-Tooling-And-Cross-Service-Error-Surfacing]]); [[Crawl-Progress-Is-A-Black-Box-Needs-Traces-The-Operator-Can-Watch]]'s progress frames would also make a lost reply visible within seconds. gh #40 closed."
---

# Crawl replies can be lost

## The incident (2026-07-24 evening, logs-confirmed)

Operator fires a links crawl on The Beth & Ravenel Curry Foundation → UI
stuck on "crawling…". prompt-runner logs show the truth: `crawl completed
… ms: 87542`. The work succeeded; the reply never made it back. Earlier
team crawls (Quell 211s, Truist 147s) completed too — 211s uncomfortably
close to the 300s dispatch ceiling.

## The three stacked gaps

1. **No client-side deadline.** `workspace.invoke` waits forever; a lost
   reply is an eternal spinner with a disabled button.
2. **WS reconnects drop pending invokes.** The transport reconnects with
   backoff, but in-flight invokes don't survive the new socket — and
   workspace-service container rebuilds (three today) sever every session.
   Any crawl pending across one is orphaned.
3. **300s dispatch ceiling vs multi-minute crawls.** The NATS
   request timeout was set before live team-crawl timings existed.

## Shipped mitigations

- 660s `withDeadline` race on `crawlSearch` and `crawlTeam` — the spinner
  always resolves; the error names that the run may still have finished
  server-side and to re-fire.
- `organization.crawl` dispatch ceiling 300s → 600s (pack.fan_out's
  precedent).

## Remaining (folded elsewhere)

- Transport-level invoke re-correlation across reconnects (or
  server-held results claimable by request id) → the liveness sweep (#21).
- Crawl progress frames (#35) would surface a dead reply path within
  seconds instead of minutes.
