---
date_created: 2026-07-06
date_modified: 2026-07-06
title: "Workspace meets its identity — didi.sh sessions verified on the WS gate"
lede: "augment-it becomes the didi.sh identity service's first consumer: the workspace WS upgrade now verifies the didi_session cookie locally (jose + JWKS, EdDSA-only), attaches didi_id to the session, and keeps the legacy continuity token working — proven end-to-end against local dev, id service to Docker container."
publish: true
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
files_changed:
  - services/workspace/src/didi.ts
  - services/workspace/src/ws.ts
  - services/workspace/package.json
  - docker-compose.yml
  - scripts/prove-didi-auth.mjs
tags:
  - Progress-Update
  - Auth
  - Didi-Platform
  - Identity-Service
  - Workspace-Service
  - JWKS
---

## Why Care?

Until today the workspace gate was session *continuity*, not authentication —
any browser that connected got a minted token. Now the gate knows **who** is
connecting: a `didi_session` cookie from the didi.sh identity service is
verified on the WebSocket upgrade, and the person's stable `didi_id` rides
the session. This is spec increment 2 landing in dev mode — the wiring that
turns "reach-edu and humain-vc want logins" from an auth-service feature
into something augment-it actually enforces.

## What's New?

- **The verify adapter** (`services/workspace/src/didi.ts`) — ~80 lines, per
  the spec's copy-in discipline (no shared package with the identity
  service, by design). Verifies signature + expiry + issuer against the id
  service's JWKS: **EdDSA only** (a symmetric algorithm would let any
  verifier mint), fetched once and cached, locally checked per upgrade — no
  network call to the identity service on the hot path.
- **Three modes** via `DIDI_AUTH`: `off`, `optional` (dev default — identity
  attaches when the cookie is present, the legacy continuity token still
  works), `required` (upgrades without a valid cookie are rejected with
  4401 — the posture once operators are didi users).
- **The session frame carries `didi_id`** so the shell can know who it is
  the moment the socket opens.
- **Local-dev topology that mirrors production.** Cookies ignore ports, so
  the dev id service on `localhost:4000` sets a host-only cookie that rides
  every localhost WS upgrade — the same-host analog of the `.didi.sh`
  domain cookie. The container reaches the host's id service via
  `host.docker.internal` for the JWKS fetch. Deploy-time is an env swap.

## Proven, not promised

`scripts/prove-didi-auth.mjs` walks the whole loop against the live local
stack: magic-link issue + redeem at the id service → cookie → WS upgrade
with the cookie → session frame carrying the verified `didi_id` → upgrade
without the cookie still works (optional mode) → tampered token treated as
absent. All four steps green on first run after the container rebuild.

## What's Next

The shell's access panel (sign-in UI calling the id service's magic-link
endpoints from inside augment-it, per the headless GTM contract), the
per-capability org→workspace authorization mapping, and — once invites
exist (id spec increment 3) — flipping `DIDI_AUTH=required`.
