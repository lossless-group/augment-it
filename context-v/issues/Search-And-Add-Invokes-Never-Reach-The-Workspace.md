---
title: "Search & Add's invokes never reach the workspace — the pane hangs at 'searching…' while every backend rung is green"
lede: "The 🔍 term-search pane stalls forever with a one-chip palette, yet SearXNG answers directly, search.fire answers over NATS, and the org card loads fine over the same workspace — the frame dies somewhere in the client transport, and tonight's commits are exonerated."
date_created: 2026-07-28
date_modified: 2026-08-02
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
semantic_version: 0.0.0.1
tags:
  - Issue
  - Augment-It
  - Search-And-Add
  - Workspace-Transport
  - Debugging-Journey
status: Resolved-Pending-Confirmation · Eternal-spinner symptom structurally fixed (120s invoke deadline, ce51eb7) + reconnect root-cause mitigated (899b144) · Silent-frame-loss cause mitigated + made grep-able, never pinned; needs an operator confirm on prod that the mount-time hang is gone
---

# Search & Add invokes never reach the workspace

## Symptom (operator report, 2026-07-28 ~02:00)

"SearXNG is down / search is no longer working." In the UI: open any org
card → 🔍 on a list → the Search & Add pane opens, seeds its term, and
hangs at **"searching…" (button disabled) forever**. The provider palette
shows only "auto" — the connector chips never load. No error ever
surfaces. Reproduced twice, including on a fresh page load against a
freshly restarted stack.

## What is PROVEN healthy (all verified live during the same session)

- **SearXNG**: direct HTTP `/search?format=json` → 200 with results.
- **search.fire over NATS**: `ok, provider: searxng, 10 results` — twice,
  including post-restart with a team query returning
  `carnegiefoundation.org/our-team` as the first hit.
- **connectors.inventory over NATS**: 6 connectors, correct statuses.
- **The same workspace hop for OTHER verbs**: the org card fully loads
  (organization.detail / relations / affiliations) over `ws://…:3001/ws`
  in the same page, same session.
- **The queue path**: 🤖 crawls submit and run (`crawl started
  carnegie-foundation` in the same window); `search.submit` jobs land in
  the rail.

## The load-bearing negative

When the pane fires, **neither workspace-service nor social-search logs
anything** — and social-search's `search.fire` log line (which my direct
NATS probe produces every time) never appears. `ws.ts`'s invoke handler
always replies (ok or error; dispatch has a 30s NATS ceiling), so a frame
that reached the server would produce SOMETHING within 30s. The pane
hangs for minutes. **Conclusion: the invoke frame never reaches ws.ts —
it dies in the client-side transport** (`packages/workspace/src/
transport.ts` queue/claim machinery), or is sent on a socket the server
never associates with a reply path.

Context that may matter: workspace logs show heavy ws connect/close churn
(sessions bouncing 5→11) — every remote holds its own socket (NO
module-federation singleton, per shell/rsbuild.config.ts's deliberate
no-shared-block decision), and the stack had been restarted mid-session.

## What did NOT break it

- **Tonight's commits (2026-07-27/28)**: none touch search-and-add,
  transport.ts, ws.ts, social-search, or the SearXNG config. The
  capabilities.ts changes were purely additive (verified: zero deleted
  lines). The crawl-budget change affects Anthropic crawls only.
- **SearXNG itself**: healthy, though upstream engines degrade over long
  uptimes — the 11-day-old container had accumulated engine suspensions
  (`SearxEngineAccessDeniedException: HTTP error 403, suspended_time=
  86400`, qwant JSON failures). `docker compose restart searxng` clears
  them (suspensions are in-memory). Worth knowing as routine hygiene,
  but NOT this bug.

## Suspect window

Everything in the failing path was last modified **2026-07-24**:

- `56191ce` — fix(workspace, transport): invokes survive reconnects — the
  claim protocol (transport.ts + ws.ts)
- `f61a5b3` — feat: searches become async jobs — the queue rail
  (search-and-add + ws.ts)
- `3ca925d` — fix(search-and-add): auto-fire waits for the workspace
  socket (the mount-time race this pane already had once)

Hypothesis space, narrowed: the pane's TWO mount-time invokes
(`connectors.inventory` for the palette + the auto-fired `search.fire`)
both hang, while later same-socket traffic elsewhere works — so suspect
the mount-time path: frames queued pre-OPEN whose flush-on-open or
claim-on-reconnect leg loses them silently under socket churn
(`pendingAutoFire` waits for `status === 'open'`, but the status store
and the socket the sendQueue flushes to may disagree across reconnect).

## Repro

1. `./scripts/dev.sh up`, open `localhost:3100`, Flows → Augment from DB
   (then click the step bubble — see the KNOWN separate issue
   [[Flow-Switch-Doesnt-Surface-The-New-Flows-Stage-Step-Bubble-Click-Required]]).
2. Search to any org → 🔍 on Identity & social links.
3. Pane opens, term seeds, "searching…" forever; palette = "auto" only.

## Next probes (for the fix session)

1. Instrument `transport.ts`: console.debug on enqueue / flush / send /
   claim, with frame ids — watch where the two mount invokes stall.
2. Log invoke receipt (capability + id) at the top of ws.ts's invoke
   branch — turns "never reached the server" from inference into fact.
3. Check whether fire()'s promise rejection path can be swallowed when
   the component re-mounts mid-invoke (zombie pane holding the pending
   promise while a fresh instance renders the stuck button).
4. Client-side deadline: a62d3dc gave CRAWL invokes a client deadline —
   ordinary invokes appear to have none, which is why this hangs forever
   instead of erroring. A default client timeout would at least fail
   loud.

## Workarounds meanwhile

- The 🤖 queue path (search.submit → search-results rail) works.
- `node scripts/prove-augment-from-db-capabilities.mjs`-style direct NATS
  fires work for ad-hoc searches.
- Restart SearXNG periodically to shed engine suspensions:
  `docker compose restart searxng`.

## See also

- `changelog/2026-07-24_07_Searches-Become-Async-Jobs…` — the rework that
  landed the suspect commits.
- [[Flow-Switch-Doesnt-Surface-The-New-Flows-Stage-Step-Bubble-Click-Required]] —
  the separate, known "Augment from DB looks gone after reload" symptom
  hit in the same session.
