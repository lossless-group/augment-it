---
date_created: 2026-07-08
date_modified: 2026-07-08
title: "Pre-auth sign-in wall — the anonymous-visitor gap the session frame couldn't close"
lede: "Step 7 of the humain-vc unlock build order: a single-tenant deploy now shows a real sign-in wall instead of a half-broken shell to anyone without a didi.sh session. Building it surfaced a genuine architecture gap — an anonymous WS upgrade against a required instance is rejected before any session frame ships — closed with a small, unauthenticated config endpoint."
publish: true
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Sonnet 5
files_changed:
  - services/workspace/src/server.ts
  - services/workspace/src/ws.ts
  - services/workspace/src/workspaces.ts
  - services/workspace/src/capabilities.ts
  - packages/workspace/src/state.svelte.ts
  - packages/workspace/src/types.ts
  - shell/src/SignInWall.svelte
  - shell/src/App.svelte
tags:
  - Progress-Update
  - Auth
  - Didi-Platform
  - Augment-It
  - humain-vc
  - Shell
---

## Why Care?

A single-tenant deploy (the DO box waiting for humain-vc) needs to look like a real product to an unauthenticated visitor, not a broken app rendering remotes that all fail their capability calls closed. Step 7 makes that true — and along the way surfaced a real gap in how "does this instance require sign-in" gets communicated, one worth knowing about before it bites a real visitor.

## What's New?

- **The wall.** When `workspace.didi_auth_mode === 'required'` and the session has no `didi_id`, the shell now renders `SignInWall.svelte` — full-screen, no header, no remotes, no WorkspaceSwitcher — instead of mounting anything. Sign in and the wall disappears; sign out and it returns.
- **The switcher hides on a pinned instance.** `workspace.list` now reports `pinned: true` whenever the instance booted with `ACTIVE_CLIENT_ID` set (a single-tenant deploy declaring its one client). No point offering a switch to a workspace that doesn't exist on that box.
- **The real find: a plain `GET /config`.** An anonymous WS upgrade against a `required` instance is rejected with code 4401 *before* any session frame is ever sent — so a genuinely anonymous visitor's shell would never learn `didi_auth_mode` from the session frame alone, and `showWall` would silently stay false. Added an unauthenticated, CORS-open `GET /config` on workspace-service that the shell fetches alongside (not instead of) `connect()`, so the wall renders correctly for the actual case that matters.

## The Story

The session-frame approach looked complete until we asked "what does a fresh, never-visited browser actually see?" The answer: the WS handshake it fires gets closed before the server ever gets to say anything — the exact code path step 3's membership gate already relies on. Rather than weaken that gate (a real, tested, intentional 4401), the fix routes around it: a cheap, side-channel HTTP read that answers one question ("does this instance require sign-in?") without needing a session at all.

Verified with headless Chromium end to end, not just typechecked: a fresh anonymous context landed on the full wall with no header/remotes/switcher visible; filling the email and completing the local dev-token sign-in reloaded into the normal shell — header, WorkspaceSwitcher, and `record-collector` mounted with real data. `pinned: true`/`false` verified live via a temporary `ACTIVE_CLIENT_ID` override on the running container, no rebuild needed, then reverted.

## What's Next

Step 8 — didi chat v0 — landed right behind this one (see the next entry). The remaining work is the deploy tail: Step 9 puts augment-it on the prepped DigitalOcean box.

## Related

- `context-v/plans/Build-Order-Humain-VC-Unlock-Flow.md` — Step 7, now done
- `context-v/plans/Unlock-Humain-VC-Team-Access-To-Augment-It.md` (ai-labs level) — item 6, "Instance posture flags"
