---
date_created: 2026-07-06
date_modified: 2026-07-06
title: "The shell shows who you are — didi badge and in-app sign-in"
lede: "The header gains a didi.sh identity badge that carries across every micro-app: server-verified didi_id state straight from the workspace session frame, and a sign-in popover that completes the whole magic-link flow without leaving augment-it — the headless GTM contract, working in dev."
publish: true
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
files_changed:
  - shell/src/DidiBadge.svelte
  - shell/src/App.svelte
  - packages/workspace/src/types.ts
  - packages/workspace/src/state.svelte.ts
tags:
  - Progress-Update
  - Auth
  - Didi-Platform
  - Shell
  - Header
  - Workspace-Package
---

## Why Care?

This morning the workspace *verified* didi.sh sessions but nothing showed it —
localhost:3100 gave no indication whether a didi.sh ID was connected. Now the
header answers at a glance, shell-level so it rides above every mounted
micro-app: a quiet "▣ sign in" pill when anonymous, a lit badge with your
email when connected.

## What's New?

- **The badge trusts the server, not the client.** Signed-in state comes from
  the workspace session frame's `didi_id` — set only when the WS upgrade
  carried a cookie the workspace verified against the id service's JWKS. The
  email shown beside it comes from `/api/me`. The workspace package's
  `UserContext` now carries `didi_id` for any remote that wants it.
- **Sign-in without leaving the app** (the headless contract): the popover
  posts to the id service's magic-link endpoints directly. In dev, the id
  service echoes the raw token, so sign-in completes in one click — email,
  send, reload, connected. In production the same panel becomes "check your
  email." Sign out everywhere kills the didi session domain-wide.
- **CORS on the id side** (in the id-didi-sh repo): a config-driven
  exact-origin allowlist with credentials — dev lists
  `http://localhost:3100`; production will enumerate the `*.didi.sh`
  origins. Preflights answered before the router.

## What's Next

The last piece of spec increment 2: per-capability `didi_id` → org-role →
workspace authorization. Then invites (id increment 3) and the
`DIDI_AUTH=required` flip.
