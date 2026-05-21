---
title: "augment-it grows a backbone — workspace, services, and a message bus that boots"
lede: "Phase 1 of the augment-it rewrite landed today. Three containers come up cleanly with one command: a NATS message bus, a thin Workspace Service that owns no domain data, and a row-store microservice that owns its own rows. The shape of every future service is set; the wire is now visibly a microservices wire instead of point-to-point HTTP. The in-app chat surface has something real to plug into."
publish: true
date_created: 2026-05-21
date_modified: 2026-05-21
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
tags:
  - Augment-It
  - Workspace-Package
  - Walking-Skeleton
  - Microservices
  - NATS
  - WebSocket
  - Module-Federation
  - Svelte-5
  - Fastify
files_changed:
  - package.json
  - docker-compose.yml
  - packages/workspace/package.json
  - packages/workspace/tsconfig.json
  - packages/workspace/README.md
  - packages/workspace/src/index.ts
  - packages/workspace/src/state.svelte.ts
  - packages/workspace/src/transport.ts
  - packages/workspace/src/adapter.ts
  - packages/workspace/src/types.ts
  - services/workspace/package.json
  - services/workspace/tsconfig.json
  - services/workspace/Dockerfile
  - services/workspace/.dockerignore
  - services/workspace/src/server.ts
  - services/workspace/src/nats.ts
  - services/workspace/src/auth.ts
  - services/workspace/src/capabilities.ts
  - services/workspace/src/ws.ts
  - services/row-store/package.json
  - services/row-store/tsconfig.json
  - services/row-store/Dockerfile
  - services/row-store/.dockerignore
  - services/row-store/src/server.ts
  - services/row-store/src/store.ts
  - services/row-store/src/handlers.ts
  - services/row-store/data/rows.json
  - context-v/plans/Augment-It-Workspace-Walking-Skeleton.md
---

## Why Care?

augment-it is two things at once: a CRM-augmentation pipeline we actually use, and a teaching artifact for a client with 26 tech products who's hesitant about microservices. Until today the architecture lived entirely in docs — half a dozen explorations, a blueprint, a pre-flight decision spec, a walking-skeleton plan. Plans don't boot.

This is the first commit where `docker compose up` boots augment-it as the architecture intends: a message bus, a thin orchestrator, a domain microservice that owns its own data. Three boxes, three legible reasons to exist, one network. The shape that every future service in the project will adopt — and the shape that's supposed to convince a skeptical 26-product exec that microservices are worth doing properly — is now real enough to point at.

It also unblocks the in-app-agent chat work that's been queued behind it. The chat surface is UI-only by design; without a workspace to drive, it had nothing to do. Now it does.

## What's New?

- **`@augment-it/workspace`** — new Svelte 5 singleton package at `packages/workspace/`. Matches memopop's `FlowState` pattern verbatim per the per-app-workspace blueprint. `$state` runes for `activeView`, `records`, `events`, `user`. `WorkspaceAdapter` factory exposed for the in-app-agent chat package to consume later. Transport layer scaffolded but stubbed — Phase 3 wires it.
- **`@augment-it/workspace-service`** — new Node/Fastify container at `services/workspace/`. Holds no domain data. Real responsibilities only: WebSocket endpoint at `/ws`, NATS bridge, opaque session token mint/validate, capability dispatcher mapping `invoke('row.list', ...)` to NATS subjects.
- **`@augment-it/row-store-service`** — new container at `services/row-store/`. Owns the spreadsheet rows authoritatively. Subscribes to `row.list.requested` and `row.update.requested` on NATS; broadcasts `row.updated` events when rows change. JSON-file persistence per pre-flight D3.
- **`docker-compose.yml`** — three services (`nats`, `workspace-service`, `row-store`), JetStream enabled, monitoring on `localhost:8222`. Boots cleanly.
- **`services/*` workspace glob** — added to root `package.json` alongside the existing `apps/*`, `packages/*`, `shell/*`. The package vs containerized-service distinction is now visible in the repo layout.
- **The plan** — `context-v/plans/Augment-It-Workspace-Walking-Skeleton.md` codifies the five-phase sequence (scaffold → NATS round-trip → WebSocket → real rows → federation host wiring) and supersedes the Transport decision from [[Walking-Skeleton-Pre-Flight-Decisions]].

## The Decision That Drove the Shape

The pre-flight spec from 2026-05-18 picked **HTTP fetch to a Bun sidecar at localhost** for transport. That's honest engineering — it would have worked, the code would have been simpler, and any normal team would have shipped it that way. We changed it.

The reason is the audience. augment-it isn't just a project we're building; it's an artifact we'll show a client who runs 26 tech products and doesn't yet believe microservices are worth the operational tax. Every container in our `docker-compose.yml` is going to be on a screen during a real conversation with a skeptical exec. "Container that's actually a sidecar talking HTTP to localhost" is the failure mode that client is afraid of — it looks like microservices-cargo-cult, and that's exactly the impression we cannot leave them with.

So we made two swaps:

| Hop | What it was | What it is now |
|---|---|---|
| Browser ↔ Workspace Service | HTTP POST + separate SSE | **WebSocket** (single bidirectional channel) |
| Workspace Service ↔ domain services | HTTP fetch to localhost sidecar | **NATS pub/sub** |

The browser-side win is small but real: one connection, both directions, less framing-and-correlation code, "realtime" by construction. The Workspace Service win is the one that earns the demo. Adding a 27th service to a NATS-backed architecture is `nats.subscribe("row.*")`. Adding it to an HTTP gateway is "wire another route through the orchestrator." That contrast is the entire lesson the client needs to internalize, and it has to be visible from the compose file alone.

We also decided to enable **JetStream** from day one even though plain pub/sub is enough for the walking skeleton. It costs nothing extra at config time, and it means when the client asks "what happens if a service is down when an event fires?" — the inevitable question from a 26-product exec — we have an answer that doesn't require rewiring anything: durable consumers were already on.

## What's Actually Running

```
┌──────────────────────────────────────────────────────────────┐
│  Browser (later — currently just a /health curl)             │
│         │                                                    │
│         │  WebSocket (Phase 3 wires this end)                │
│         ▼                                                    │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  workspace-service                                   │    │
│  │  Fastify 5 + @fastify/websocket, Node 22-alpine      │    │
│  │  - /ws endpoint (stub, logs incoming frames)         │    │
│  │  - /health                                           │    │
│  │  - opaque session tokens (JSON-file backed)          │    │
│  │  - capability dispatcher → NATS                      │    │
│  └────────────────────────┬─────────────────────────────┘    │
│                           │                                  │
│                       NATS (JetStream + monitoring on :8222) │
│                           │                                  │
│  ┌────────────────────────▼─────────────────────────────┐    │
│  │  row-store                                           │    │
│  │  subscribes: row.list.requested, row.update.requested│    │
│  │  publishes:  row.updated                             │    │
│  │  persistence: JSON file in a Docker volume           │    │
│  └──────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

On boot the three containers log, in order: NATS reports `Server is ready`, `workspace-service` logs `sessions loaded` → `nats connected` → `workspace-service ready`, `row-store` logs `store loaded` → `nats connected` → `row-store-service ready`. The NATS dashboard at `localhost:8222` shows the two subscribers connected.

That's Phase 1's acceptance check, and it passes.

## How Far the Scaffolding Reaches

A subtle thing worth being honest about: the row-store handlers and the workspace capability dispatcher are *already wired* with real implementations, not stubs. The pure-Phase-1 scope was "containers boot and log ready" — but because the NATS subject contract was settled in the plan, writing the real handlers was the same amount of typing as writing stubs. So:

- **Phase 2** of the plan (NATS round-trip with a hard-coded row) is essentially already done. A `nats sub 'row.*'` in a side terminal will see traffic the moment something publishes `row.list.requested`.
- **Phase 3** (browser WebSocket) is the next genuine work. The Workspace Service's `/ws` endpoint logs frames but doesn't yet route them to the capability dispatcher; that's a small, contained change.

The thing that is *not* yet wired is the workspace package's transport layer. It throws `"not wired — Phase 3 lands transport"` if anything calls `workspace.invoke()`. That's the seam Phase 3 closes.

## What This Unblocks

- **The in-app-agent chat package.** Its walking skeleton ([[In-App-Agent-Chat-Walking-Skeleton]] in the parent `ai-labs/context-v/plans/`) needed something to drive. The `WorkspaceAdapter` is the contract; the workspace singleton is the implementation; the row-store is the first domain it can speak to.
- **Revitalizing the legacy `apps/*` remotes.** The existing six Bolt-era federated apps don't have a coherent state model. Once Phase 5 of the plan lands and the federation host is wired to the workspace singleton, each of those apps becomes a migration target with a clear destination.
- **The two spreadsheets.** Real proof-of-life data lands in Phase 4 — the row schema in `packages/workspace/src/types.ts` is deliberately loose right now so it can converge against actual columns, not made-up ones.

## Files Worth Knowing About

- `context-v/plans/Augment-It-Workspace-Walking-Skeleton.md` — the five-phase plan, the decisions that supersede pre-flight D2, the open questions flagged for before Phase 4.
- `packages/workspace/src/state.svelte.ts` — the singleton. Read alongside memopop's `flow.svelte.ts` to see the pattern lift.
- `packages/workspace/src/types.ts` — the frame contract for the WebSocket wire. `InvokeFrame`, `ResultFrame`, `EventFrame`, `SessionFrame`. Read this first; everything else routes against these shapes.
- `services/row-store/src/handlers.ts` — the cleanest illustration of what a domain microservice looks like in this architecture. Twenty lines. No HTTP. No knowledge of the Workspace Service. Just subjects in, subjects out.
- `docker-compose.yml` — the compose file the demo audience will see. Worth pretending you are them when reading it.

## What's Next

Phase 2 verification (NATS round-trip from a side terminal), then Phase 3 — the WebSocket frame router on the service side and the real transport client in the workspace package. Phase 4 brings the two spreadsheets in. Phase 5 wires one of the existing `apps/*` federated remotes through the workspace, which is the first migration off the legacy Bolt-era state model.

## See also

- [[Augment-It-Workspace-Walking-Skeleton]] — the plan
- [[Walking-Skeleton-Pre-Flight-Decisions]] — pre-flight spec; D2 is now superseded, the rest carry forward
- [[Per-App-Workspace-Conventions]] — the blueprint this walking skeleton instantiates
- [[Remote-Mount-Contract-for-In-App-Agent]] — the contract the chat package will consume against this workspace
- [[Slides_Anatomy-of-the-In-App-Agent-Shell]] — names augment-it as the chat-primary configuration; this is the substrate that makes that real
