---
title: "Two tiers: WebSocket to the gateway, NATS between services"
lede: "The browser talks WebSocket to one gateway; the gateway talks NATS to every service. They aren't alternatives — they're two legs of one design, and the gateway between them is where tenancy lives."
date_created: 2026-07-30
date_modified: 2026-07-30
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.8
semantic_version: 0.0.0.1
status: Reference
tags:
  - Note
  - Architecture
  - Augment-It
  - NATS
  - WebSocket
  - Workspace-Service
---

# Two tiers: WebSocket to the gateway, NATS between services

## The one-line answer

**We did not choose NATS *instead of* WebSocket. We chose them together,
for two different legs of the wire.** What NATS-plus-WebSocket replaced
was the original plan of plain HTTP fetch to a Bun sidecar — not
WebSocket.

## The topology

```
Browser (strategy-curator / org-workbench / chat / …)
   │
   │   ONE WebSocket connection per session
   ▼
Workspace Service  ← the gateway: auth + tenancy boundary
   │
   │   NATS pub/sub (verb → subject)
   ▼
~15 domain services (resolver, content-ingest, social-search, row-store,
                     prompt-runner, …)
```

- **Browser ↔ Workspace Service = WebSocket.** One socket per session,
  carrying `invoke` / `result` / `event` / `chat` frames. The client
  lives in `packages/workspace/src/transport.ts`; the server endpoint in
  `services/workspace/src/ws.ts`.
- **Workspace Service ↔ domain services = NATS.** Every `services/*`
  speaks NATS; the workspace-service's `dispatch()` maps a capability
  verb onto a NATS subject and awaits the reply.

Verified by grep, 2026-07-30: **nothing** browser-side (`apps/`,
`shell/`, `packages/workspace`) imports NATS — zero hits. Every
`services/*` imports it. The **workspace-service is the only thing that
speaks both** — it is the bridge, on purpose.

## Why two, not one

The obvious question: NATS *can* run over WebSocket for browser clients,
so why not let the browser join the bus directly and delete the custom
WebSocket layer? Because the Workspace Service isn't just a relay — it is
the **auth and tenancy boundary**. It verifies the didi.sh JWT, resolves
org memberships into allowed workspaces, and runs `enforceTenant()` on
every frame before any subject sees it. If browsers spoke NATS directly,
every browser would have raw subject access to the entire bus, and there
would be **nowhere to put the tenant gate**. The whole workspace-auth
effort (the sid-keyed session, the membership gate, server-side client
enforcement) depends on there being exactly one chokepoint the browser
must pass through. That chokepoint is the WebSocket gateway.

So the two tiers each earn their keep:

- **WebSocket** is the browser's single, authenticated pipe to the
  gateway. A browser cannot natively speak the NATS TCP protocol, and we
  deliberately don't hand it the NATS-over-WebSocket alternative that
  would bypass the gate.
- **NATS** is the internal fabric. Its payoff is the "add the 27th
  service" story: a new service is "subscribe to a subject," not "wire
  another route into a point-to-point gateway."

## Why it looked like WebSocket "suddenly appeared"

It didn't — the WebSocket transport has been the browser leg since the
walking skeleton shipped (2026-05-21). The recent confusion came from
test scaffolding: the transport tests need something to connect to, so
the harness includes a small hand-rolled RFC-6455 WebSocket server
(`packages/workspace/test/workspace-socket-test-server.ts`). That is
test-only, zero-dependency, and not new production surface. (An earlier
draft of that work wrongly pulled in the `ws` npm package; it was
removed — the transport itself uses the platform-native `WebSocket`, no
library.)

## If you build this out

- Keep the gateway as the *only* place the browser reaches. New
  browser-facing capability = a new frame the gateway validates and
  dispatches, never a new direct-to-NATS path from the client.
- New backend capability = a NATS subject + a handler in the owning
  service + an entry in `services/workspace/src/capabilities.ts`
  (verb → subject) so the gateway can route to it.
- The tenancy gate (`enforceTenant`) only works because there's one
  WebSocket chokepoint. Preserve that invariant.

## See also

- `context-v/plans/Augment-It-Workspace-Walking-Skeleton.md` — where the
  two-tier decision (and the dropped Bun sidecar) was made, 2026-05-21
- [[The-Four-Layers-pnpm-Turbo-rsbuild-Federation-Bun]] — the sibling
  note on the *build/tooling* layers (a different kind of "federation")
- [[Session-Expiry-Turns-The-App-Into-A-Zombie]] — why the gateway's
  session handling is load-bearing
