---
title: "Session expiry turns the app into a zombie — the 12h JWT dies mid-use, the UI stays up, and every invoke times out"
lede: "The `didi_session` cookie lives 30 days, the JWT inside ~12h, and nothing calls `/api/session/refresh` — the transport 4401-loops at 2/sec."
date_created: 2026-07-28
date_modified: 2026-08-02
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
semantic_version: 0.0.0.2
tags:
  - Issue
  - Augment-It
  - Identity
  - Workspace-Transport
  - Shell
  - Session-Expiry
status: Shipped
date_first_published: 2026-07-28
post_ship_note: "The fix landed in `9fc2543` (hourly + on-focus token refresh; transport treats 4401/4403 as auth-death — fail fast, one silent refresh, glacial retry) and is now guarded by the Group C transport tests. CAVEAT: this is the CODE fix; whether production augment.didi.sh was redeployed to carry it is a separate open question — see [[Workspace-And-Corpora-Connection-Slow-To-Hanging-And-Auth-Wont-Persist]]."
site_uuid: 691764f6-153c-4878-944a-7b639522c4b2
hex_code: azmkjc
date_authored_initial_draft: 2026-08-02
date_authored_current_draft: 2026-08-02
publish: true
---

# Session expiry turns the app into a zombie

## The incident (2026-07-28, during the workspace-auth human gate)

The operator, mid-walk-through on production: *"When I search, nothing
loads. And usually the list on the left loads correctly... Now I see
nothing."* Gut diagnosis: *"we didn't set up the DB access correctly on
Railway."* Then the smoking gun surfaced in the UI itself:

> resolver.search timed out after 120s — the workspace did not reply;
> retry the action

That message is the transport's client-side deadline (gh #58's fix)
firing — meaning the invoke was **queued but never delivered**, because
the WebSocket never (re)established. Server logs showed the counterpart:
a continuous ~2/second stream of

```
ws reject: didi auth required, no valid didi_session
```

— the operator's own browser, reconnect-looping against a 4401.

Meanwhile the deployed backend was verified healthy end to end (a fresh
minted session over the same `wss://ws.augment.didi.sh` returned the
441-org reach-edu roster and instant `resolver.search` results). Nothing
was wrong with SurrealDB, Railway env, or the tenancy build. The
session had simply **expired**.

## Root cause — two designs that don't meet

1. **id-didi-sh's token model** (by design, per `session_cookie.ex`):
   the cookie jar lives 30 days rolling, but the EdDSA JWT inside
   expires **~12h** after mint and is meant to be re-minted via
   `POST /api/session/refresh`. Verification always checks the token's
   own `exp`.
2. **Nothing on the augment-it side ever calls refresh.** Not the
   shell, not `packages/workspace`. So every session hard-dies ~12h
   after sign-in — *while the tab is open and working*.

The failure PRESENTATION is what makes it expensive:

- The UI stays fully rendered — the workspace chip ("Reach Edu"), the
  flow strip, the workbench shell all come from localStorage + loaded
  code, none of it gated on a live session.
- The transport receives close code **4401** and treats it like any
  transient drop: reconnect in ~500ms, forever. The reject storm
  pollutes server logs and burns battery.
- `invoke()` calls enqueue (the gh #41 queue/claim protocol) waiting
  for a socket that will never open, then die at the 120s deadline
  with a message ("the workspace did not reply") that points at the
  SERVER.
- Net: the app looks like its database fell over. The operator spent a
  troubleshooting round on Railway env vars. Stephenie would hit the
  same wall ~12h after her first login, with no operator instincts to
  fall back on.

## The fix (two halves, both needed)

1. **Shell keeps the token fresh.** Call `POST /api/session/refresh`
   (credentialed, against `PUBLIC_ID_BASE`) on an interval well inside
   the 12h TTL — e.g. hourly — and on `visibilitychange`/focus, so a
   tab that sleeps overnight refreshes before its next invoke. The
   endpoint re-mints the JWT into the same cookie; no UI involved.
2. **Transport recognizes auth-death.** On WS close code **4401/4403**:
   stop the reconnect loop (or back off to something glacial), reject
   queued invokes immediately with an auth-shaped error ("session
   expired — sign in again", not "the workspace did not reply"), and
   surface the state to the shell so the SignInWall reappears over the
   zombie UI. One attempted refresh-then-retry before declaring death
   would make the two halves compose: expiry mid-flight heals
   invisibly when the 30-day cookie is still good.

## See also

- `ai-labs/id-didi-sh/lib/id_didi_sh_web/session_cookie.ex` — the 30d
  jar / 12h token split and the refresh contract.
- `packages/workspace/src/transport.ts` — reconnect loop + invoke
  queue + the 120s deadline whose error message misdirected here.
- `shell/src/SignInWall.svelte` — the surface that should reappear on
  auth-death.
- [[Search-And-Add-Invokes-Never-Reach-The-Workspace]] — gh #58, whose
  deadline machinery correctly detected this but mis-attributed it.
- [[../plans/Open-Augment-Didi-Sh-To-Reach-Edu]] — the run whose human
  gate surfaced this; arguably a launch blocker for Stephenie's
  onboarding.
