---
title: "Augment-It Workspace — Walking Skeleton Plan"
lede: >-
  Browser ↔ Workspace Service over WebSocket, Workspace Service ↔ row-store over NATS, and two real spreadsheets as the proof-of-life payload.
date_created: 2026-05-21
date_modified: 2026-05-25
date_completed: 2026-05-21
revisions:
  - 2026-05-21 — Added services/ingest/ as a fourth container; introduced RecordSet + ColumnSchema types per the dynamic-schema discipline ([[feedback_augment_it_dynamic_schema]]); flagged the unresolved record-set toggler and upsert/merge features ([[project_augment_it_recordset_open_features]]).
  - 2026-05-25 — Status swept to Shipped; all five phases landed per changelog 2026-05-21_01..02.
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
semantic_version: 0.0.0.2
tags:
  - Plan
  - Augment-It
  - Workspace-Package
  - Workspace-Service
  - Walking-Skeleton
  - Svelte-5
  - Fastify
  - WebSocket
  - NATS
  - Microservices-Demo
status: Shipped
site_uuid: d3a1a564-4187-4d63-9cd1-aeedb4d4e404
hex_code: ipba1c
date_authored_initial_draft: 2026-05-25
date_authored_current_draft: 2026-05-25
---

# Augment-It Workspace — Walking Skeleton Plan

## What this plan is

The smallest end-to-end build that demonstrates the augment-it architecture under load. After this lands:

1. `@augment-it/workspace` exists as a real Svelte 5 package other federation remotes can mount.
2. A **Workspace Service** container exists, holding no domain data, doing only: WebSocket on the browser side, NATS bridge on the service side, auth boundary.
3. One domain microservice exists (**row-store**) and owns the spreadsheet-row data authoritatively.
4. NATS runs in the compose file and is the only way the Workspace Service talks to row-store.
5. Two real spreadsheets load through this stack and become the proof-of-life payload.

The in-app-agent chat package is **not** in scope here. It consumes this substrate later; building it first would give it nothing to drive. See [[In-App-Agent-Chat-Walking-Skeleton]] in the parent ai-labs `context-v/plans/` for the chat's own walking skeleton, which will pick up after this lands.

## Why this comes first

The chat surface is UI-only per the corrected architecture ([[Remote-Mount-Contract-for-In-App-Agent]]). It speaks to whichever app it's mounted in through a typed `WorkspaceAdapter`. Without a workspace to mount against, the chat has nothing to invoke and nothing to mirror. Workspace first → chat plugs in → both have something real to do.

There is a parallel argument: augment-it needs revitalization independent of the chat. The existing six federated apps (`apps/highlight-collector`, `apps/insight-manager`, `apps/prompt-template-manager`, `apps/record-collector`, `apps/request-reviewer`, `apps/response-reviewer`) are the legacy Bolt-era surface. The workspace package is the substrate that gives them a coherent state model and a path off the old patterns. Either way, the workspace is the prerequisite.

## Audience-driven design constraint

This walking skeleton is also a **demo artifact** for a client with 26 tech products who is hesitant about microservices. That constraint changes some decisions that would otherwise be ambiguous:

- Every container in the compose file must have a legible reason to exist. No ornamental containers.
- The wire between services should be **visibly** a microservices wire, not a thin HTTP veneer. Hence NATS over HTTP.
- The "add the 27th service" story has to be readable from the compose file alone. Adding a service to a NATS-backed architecture is "subscribe to a subject"; adding one to a point-to-point HTTP gateway is "wire another route." That contrast is the lesson.
- See [[project_augment_it_workspace_demo_stance]] memory for the full demo-honesty rationale.

## Decisions that supersede [[Walking-Skeleton-Pre-Flight-Decisions]]

Two of the five pre-flight picks change here. The other three carry forward.

| Pre-flight pick | Status | Reason for change |
|---|---|---|
| **D1.** Svelte 5 `$state` runes singleton | ✅ Carries forward | Confirmed; matches memopop's FlowState |
| **D2.** HTTP fetch to Bun sidecar at localhost | ❌ **Superseded** by WebSocket (browser ↔ workspace) + NATS (service ↔ service) | Demo-audience constraint above; HTTP+Bun is honest engineering but the wrong story to tell a microservices-skeptical exec |
| **D3.** JSON files for persistence (graduate to libSQL) | ✅ Carries forward | Persistence lives inside the row-store domain service, not the Workspace Service. JSON is fine for the walking skeleton |
| **D4.** Opaque session tokens auto-minted on first contact | ✅ Carries forward | The Workspace Service is where this enforcement lives; the contract is unchanged |
| **D5.** `@lossless/in-app-agent` ownership *(open)* | Out of scope here | Resolved by sequencing: workspace first, chat package later in its own walking skeleton |

The Bun sidecar from D2 is also out — Node/Fastify replaces it. Reason: WebSocket + NATS server libraries are mature on Node; nothing is gained by running Bun for this role and the team's existing JS toolchain stays unified with the Svelte 5 frontend build (Rsbuild + Module Federation).

## Architecture for the walking skeleton

```
┌───────────────────────────────────────────────────────────────────────┐
│  Browser                                                              │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │  Federation host (Rsbuild)                                      │  │
│  │                                                                 │  │
│  │   imports @augment-it/workspace (singleton)                     │  │
│  │   imports remotes: record-collector, etc. (federated)           │  │
│  │                                                                 │  │
│  │   workspace.invoke('row.research', {row_id})  ─────────┐        │  │
│  │   workspace.ingestEvent(evt)  ◄───────────────┐        │        │  │
│  └────────────────────────────────────────────────┼───────┼────────┘  │
│                                                   │       │           │
└───────────────────────────────────────────────────┼───────┼───────────┘
                                                   │       │
                                          (single WebSocket connection)
                                                   │       │
┌──────────────────────────────────────────────────▼───────▼───────────┐
│  Workspace Service (Node/Fastify container)                          │
│                                                                      │
│   - WebSocket endpoint  ←→  capability frames + event frames         │
│   - Auth: opaque session token, minted on first contact              │
│   - Capability dispatcher: translates invoke() → NATS publish        │
│   - Event listener: subscribes to NATS subjects → forwards on WS     │
│   - Holds NO domain data                                             │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                          NATS pub/sub
                             │
              ┌──────────────┼──────────────┬──────────────┐
              │              │              │              │
        ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐
        │  ingest   │  │ row-store │  │  (future) │  │  (future) │
        │  service  │  │  service  │  │  research │  │  export   │
        │ container │  │ container │  │  service  │  │  service  │
        └───────────┘  └───────────┘  └───────────┘  └───────────┘
        parses CSV     owns spreadsheet
        derives schema rows + record sets
        stateless      owns its own JSON file
```

**Why ingest is its own container.** CSV parsing + schema derivation is stateless transformation; pulling it out of row-store is the pure microservices answer (separation per responsibility, not per technical layer). For the demo audience, it's also the cleanest illustration of "add the 27th service" — ingest does *only* parsing, owns nothing, and any other input format (XLSX, JSON, API import) becomes a sibling service.

The thin orchestrator pattern is visible in the box widths: the Workspace Service is narrow. row-store is wide because it actually holds data. Adding research or export services later requires no changes to the Workspace Service — they subscribe to the relevant NATS subjects and start consuming.

## Wire contracts

### Browser ↔ Workspace Service (WebSocket)

One connection per session. Frames are JSON. Two kinds of frames:

**Capability invocation (client → server):**

```jsonc
{
  "kind": "invoke",
  "id": "inv_abc123",         // client-generated, used to correlate result
  "capability": "row.research",
  "args": { "row_id": "row_42", "agents": ["social_profiles"] }
}
```

**Capability result (server → client):**

```jsonc
{
  "kind": "result",
  "id": "inv_abc123",
  "ok": true,
  "result": { "job_id": "job_xyz" },
  "display_hint": { "kind": "row_detail", "row_id": "row_42" }
}
```

**Event (server → client, broadcast):**

```jsonc
{
  "kind": "event",
  "seq": 1247,                 // monotonic per session — workspace uses for dedup
  "subject": "row.updated",
  "payload": { "row_id": "row_42", "fields": { "status": "researched" } }
}
```

`seq` matches the pre-flight spec's SSE dedup expectation (`lastSeenSeq` in the singleton). The transport is different; the contract on the workspace singleton's `ingestEvent` is the same.

### Workspace Service ↔ NATS subjects

Subject hierarchy follows `<domain>.<action>` for capability dispatch and `<domain>.<event>` for events. Examples:

| Subject | Direction | Producer | Consumer |
|---|---|---|---|
| `record_set.ingest.requested` | request | Workspace Service | ingest service |
| `record_set.create.requested` | request | ingest | row-store |
| `record_set.created` | event | row-store | Workspace Service (forwards to all sessions) |
| `record_set.list.requested` | request | Workspace Service | row-store |
| `record_set.get.requested` | request | Workspace Service | row-store |
| `row.list.requested` | request | Workspace Service | row-store |
| `row.update.requested` | request | Workspace Service | row-store |
| `row.updated` | event | row-store | Workspace Service (forwards to all sessions) |
| `row.research.requested` | request | Workspace Service | research-service *(later)* |

Request/reply uses NATS's built-in pattern (`nats.request(subject, payload, {timeout})`); broadcasts use plain `nats.publish` + `nats.subscribe`.

### Auth boundary

Workspace Service is the only entry from the browser. On first WebSocket connect:

- If client presents a session token (`Authorization` header on the upgrade request), validate against the in-memory session map (persisted to a JSON file by the Workspace Service — this is its *only* state).
- If client presents no token, mint a new opaque token, return it in the first server frame as `{kind: "session", token: "..."}`, the workspace singleton stashes it for reconnects.

Same shape as pre-flight D4, just delivered over the WS upgrade instead of an HTTP cookie.

## Repo layout

```
augment-it/
├── apps/                                 # existing federated remotes (untouched in this skeleton)
├── packages/
│   ├── workspace/                        # NEW — the Svelte 5 singleton package
│   │   ├── package.json                  # name: "@augment-it/workspace"
│   │   ├── src/
│   │   │   ├── state.svelte.ts           # singleton class, $state runes
│   │   │   ├── transport.ts              # WebSocket client wrapper, reconnect, frame routing
│   │   │   ├── adapter.ts                # WorkspaceAdapter implementation for chat to consume later
│   │   │   ├── types.ts                  # WorkspaceSnapshot, ActiveView, JobEvent, FileEntry, Row
│   │   │   └── index.ts                  # exports: workspace singleton, types, adapter factory
│   │   └── tsconfig.json
│   ├── config/                           # existing
│   ├── shared-services/                  # existing
│   └── shared-ui/                        # existing
├── services/                             # NEW directory
│   ├── workspace/                        # the Workspace Service container
│   │   ├── package.json                  # name: "@augment-it/workspace-service"
│   │   ├── src/
│   │   │   ├── server.ts                 # Fastify + @fastify/websocket
│   │   │   ├── ws.ts                     # WS frame parsing + routing
│   │   │   ├── nats.ts                   # NATS client, subject helpers
│   │   │   ├── auth.ts                   # session token mint/validate + JSON persistence
│   │   │   └── capabilities.ts           # invoke() → NATS subject mapping
│   │   ├── Dockerfile
│   │   └── tsconfig.json
│   ├── ingest/                           # CSV parser + schema deriver (no domain data)
│   │   ├── package.json                  # name: "@augment-it/ingest-service"
│   │   ├── src/
│   │   │   ├── server.ts                 # subscribes record_set.ingest.requested
│   │   │   └── parse.ts                  # CSV → {schema, rows}; csv-parse/sync
│   │   ├── Dockerfile
│   │   └── tsconfig.json
│   └── row-store/                        # first domain microservice
│       ├── package.json                  # name: "@augment-it/row-store-service"
│       ├── src/
│       │   ├── server.ts                 # NATS subscribe loop, no HTTP surface
│       │   ├── store.ts                  # JSON file persistence
│       │   └── handlers.ts               # row.list.requested, row.update.requested
│       ├── data/                         # mounted volume in compose
│       │   └── rows.json
│       ├── Dockerfile
│       └── tsconfig.json
├── shell/                                # existing
├── docker-compose.yml                    # NEW — orchestrates workspace-service, row-store, nats
└── package.json                          # workspaces: add "services/*"
```

`services/*` is added to `workspaces` in the root `package.json` so npm/pnpm/yarn workspaces resolve them.

## docker-compose.yml shape

```yaml
services:
  nats:
    image: nats:2.10-alpine
    ports:
      - "4222:4222"     # client connections
      - "8222:8222"     # monitoring (the page the client looks at during the demo)
    command: ["-js", "-m", "8222"]    # JetStream enabled, monitoring on

  workspace-service:
    build: ./services/workspace
    ports:
      - "3001:3001"
    depends_on:
      - nats
    environment:
      NATS_URL: nats://nats:4222
      SESSION_STORE_PATH: /data/sessions.json
    volumes:
      - workspace-data:/data

  row-store:
    build: ./services/row-store
    depends_on:
      - nats
    environment:
      NATS_URL: nats://nats:4222
      ROW_STORE_PATH: /data/rows.json
    volumes:
      - row-store-data:/data

volumes:
  workspace-data:
  row-store-data:
```

JetStream isn't strictly required for the walking skeleton (plain pub/sub is enough), but having it on means the demo can show durable consumers when the question of "what if a service is down when an event fires?" comes up — without re-wiring anything.

## Implementation phases

Five phases, each a single working slice. Don't move to the next until the previous one passes its check.

### Phase 1 — Scaffolding (no behavior yet)

- Add `services/` to root `package.json` workspaces.
- Scaffold `packages/workspace/` with empty Svelte 5 singleton (per pre-flight D1 sketch, no transport yet).
- Scaffold `services/workspace/` and `services/row-store/` with empty Fastify and bare NATS clients.
- Write `docker-compose.yml`.

**Check:** `docker compose up` runs without errors; NATS monitoring page at `localhost:8222` is reachable; both service containers boot and log "ready."

### Phase 2 — NATS round-trip (no browser yet)

- Workspace Service publishes `row.list.requested` on startup (smoke test).
- row-store subscribes, replies with a hard-coded `[{row_id: "row_1", ...}]`.
- Workspace Service logs the reply.

**Check:** Workspace Service log shows the row-store reply on boot. The NATS monitoring page shows one publisher and one subscriber on the relevant subjects.

### Phase 3 — WebSocket invocation (round-trip from browser)

- Workspace Service opens its WebSocket endpoint at `ws://localhost:3001/ws`.
- `packages/workspace/src/transport.ts` connects to it, frames the `invoke` shape above.
- A throwaway HTML test page (not yet a federated remote) calls `workspace.invoke('row.list', {})` and logs the result.
- Workspace Service's `capabilities.ts` translates `row.list` → NATS `row.list.requested` → forwards reply → WS `result` frame.

**Check:** The throwaway page logs the row-store's hard-coded row list. Browser DevTools network tab shows one WebSocket connection, several frames.

### Phase 4 — Real rows from real spreadsheets

- Decide spreadsheet ingestion path: probably a one-shot CLI in `services/row-store/scripts/ingest.ts` that reads CSV → writes the JSON store.
- Ingest the two spreadsheets the user has on hand.
- Verify `row.list` returns real rows from the singleton.
- Add `row.update` capability: invoke from the throwaway page, see the row update, see the `row.updated` event broadcast back, see the singleton's reactive state update.

**Check:** Workspace singleton mutates in response to capability calls. The DevTools Svelte inspector (or a `$inspect(workspace.records)` log line) shows reactive updates.

### Phase 5 — Federation host wiring

- Replace the throwaway HTML page with one of the existing `apps/*` federated remotes (recommend `apps/record-collector` since its name aligns with the row-store payload).
- Remove its local state; have it consume `@augment-it/workspace` directly.
- Confirm Module Federation singleton-module sharing so the workspace instance is the same one any other remote would see.

**Check:** Open the federation host in a browser. The federated remote renders a row list pulled from the singleton. Invoking a capability in one remote updates the singleton; other remotes (if running) see the update through their own subscriptions.

## What proof-of-life looks like at the end

A short video the client could watch:

1. `docker compose up` — three containers boot, NATS dashboard opens in a tab.
2. Browser opens augment-it. WebSocket connection establishes (visible in DevTools).
3. The two spreadsheets' rows render in the record-collector remote.
4. Clicking a row triggers a capability. NATS dashboard shows the message flowing on `row.update.requested`.
5. row-store's logs show it handling the message and emitting `row.updated`.
6. The UI updates in realtime without a refresh — the singleton's reactive state, the WebSocket broadcast, and Svelte's runes all firing in sequence.
7. Killing the row-store container: invocations queue up. Bringing it back: queue drains, UI catches up. (Optional Phase 5+ demo; sells durability.)

That's the moment the architecture clicks. From there, "add the 27th service" is a half-day exercise: scaffold under `services/`, subscribe to the relevant NATS subjects, add capability mapping in Workspace Service. No core code changes.

## What's explicitly out of scope

- The in-app-agent chat package. Picked up in its own walking skeleton after this lands.
- A second domain microservice (research, export). The demo lands with one; the second is a separate session that *exercises* the "add a service" lesson.
- Auth beyond opaque session tokens. OAuth, SSO, multi-tenant isolation come later — the Workspace Service's session map is enough for the demo.
- Persistence beyond JSON files. libSQL is the named graduation path; the walking skeleton doesn't need it.
- Production deployment. The compose file is a local-dev artifact; the deployment story is its own conversation.
- Retiring the existing `apps/*` remotes. Phase 5 wires *one* of them through the workspace; the rest stay as-is until each gets its own migration session.

## Dynamic schema discipline (load-bearing)

The Row schema is **always derived per-upload from CSV headers**. Never user-predefined, never validated against a fixed shape, never "we require column X." Every upload defines its own column set; the system adapts. This is the primary lift-out from the legacy Tanuj record-collector — the clever idea worth keeping is that the prompt template auto-regenerates from whatever columns the imported CSV has, with no per-use-case prompt engineering.

The implication for the type system: `Row.fields: Record<string, unknown>` is the right shape and stays that way; the **column schema lives on the `RecordSet`** (the per-upload bundle), not on individual rows. A workspace holds multiple record sets simultaneously, each with completely different column shapes — that's the normal case, not the edge case.

See [[feedback_augment_it_dynamic_schema]] memory for the constraint. See `context-v/explorations/Tanuj-Record-Collector-As-Built.md` and `Bolt-Record-Collector-Analysis.md` for the prior-art that established the pattern.

## Two unresolved record-set features (deferred past walking skeleton)

Flagged so future sessions know these are explicitly *out of scope* here, not oversights.

1. **Record-set toggler.** UI to switch which record set is active. Never built in any prior iteration (Bolt, Tanuj, or this rewrite). Small UX work; ships when the workspace has more than one record set in it.
2. **Smart upsert / merge.** Two related operations: re-upload of the same logical record set (rows update in place, no duplicates), and add-one-spreadsheet-to-another (merge or fuse record sets). Both depend on a **primary key** notion that the dynamic-schema constraint makes nontrivial — there is no fixed column to key on. Options when this is taken up: user picks key column at upload, heuristic detection (look for `id`, `email`, etc.), hash-of-whole-row (fragile), row order (only handles identical-shape re-upload). Walking-skeleton behavior: every upload creates a new RecordSet. Period.

See [[project_augment_it_recordset_open_features]] memory for the full deferral note.

## Open questions worth flagging before code starts

- **NATS client library on Node.** `nats.js` (the official one) vs `nats.ws` (browser-native, in case we want to bypass the Workspace Service for some flows). Walking skeleton picks `nats.js` on the Node side; `nats.ws` is a later consideration we shouldn't accidentally couple to.
- **Spreadsheet schema.** The two spreadsheets need to converge on a single `Row` shape inside `packages/workspace/src/types.ts`. Worth a 30-minute pass at the data before Phase 4.
- **Reconnect behavior on the WebSocket.** The walking skeleton can do "drop and reconnect, replay last N events from server." A future iteration may want resumable streams via JetStream. Note the upgrade path; don't build it now.

## See also

- [[Walking-Skeleton-Pre-Flight-Decisions]] — the original five-decision substrate; this plan supersedes D2 and confirms the rest.
- [[Per-App-Workspace-Conventions]] — the blueprint this walking skeleton instantiates for augment-it.
- [[Remote-Mount-Contract-for-In-App-Agent]] — the contract the in-app-agent chat package will consume against this workspace later.
- [[Slides_Anatomy-of-the-In-App-Agent-Shell]] — the four-thing distinction; augment-it is named as the chat-primary configuration in there.
- [[In-App-Agent-Chat-Walking-Skeleton]] — the parallel plan in ai-labs' `context-v/plans/` for the chat package; sequenced *after* this one.
