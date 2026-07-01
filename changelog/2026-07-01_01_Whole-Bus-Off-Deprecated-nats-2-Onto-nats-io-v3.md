---
date_created: 2026-07-01
date_modified: 2026-07-01
title: "The whole bus moves off deprecated nats@2 onto @nats-io/transport-node v3"
lede: "All 10 services swapped the deprecated monolithic nats package for the scoped @nats-io/* v3 client — 27 files, one codec rewrite, zero wire-protocol changes — and every service round-tripped live on the rebuilt stack before the branch moved on."
publish: true
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
files_changed:
  - services/record-surrealdb-resolver/src/{server,handlers,domains}.ts
  - services/xlsx-ingest/src/server.ts
  - services/ingest/src/server.ts
  - services/prompt-store/src/{server,handlers}.ts
  - services/response-store/src/{server,handlers}.ts
  - services/row-store/src/{server,handlers}.ts
  - services/content-ingest/src/{server,handlers}.ts
  - services/social-search/src/{search,server,entity-pulse/dispatch}.ts
  - services/prompt-runner/src/{apply,chat-turn,drafter,preview,run,server}.ts
  - services/workspace/src/{nats,capabilities,chat,workspaces,ws}.ts
  - services/*/package.json
  - pnpm-lock.yaml
tags:
  - Progress-Update
  - Dependency-Migration
  - NATS
  - Message-Bus
  - Services
  - Deprecation
---

## Why Care?

Every `pnpm install` printed `WARN deprecated nats@2.29.3` — the monolithic
nats.js v2 package is end-of-life, split upstream into scoped `@nats-io/*`
packages. This was the one dependency deliberately parked during the
2026-07-01 upgrade campaign (Zod 4, Rsbuild 2 + MF 2.6, TypeScript 6,
csv-parse 7) because it isn't a version bump: the codec utilities were
**removed** in v3, so the swap rewrites how every inter-service message is
encoded and decoded, across the message plumbing of all 10 backend services
at once. A blind bump would have compiled fine in places and broken the bus
at runtime.

## What Shipped

All 10 services (`record-surrealdb-resolver`, `xlsx-ingest`, `ingest`,
`prompt-store`, `response-store`, `row-store`, `content-ingest`,
`social-search`, `prompt-runner`, `workspace`) now declare
`@nats-io/transport-node@^3.4.0` instead of `nats@^2.28.0`. The whole
migration is five mechanical rewrites, per the plan's mapping table:

- `from 'nats'` → `from '@nats-io/transport-node'`
- `JSONCodec` import — dropped (removed in v3)
- `const jc = JSONCodec();` — deleted (10 copies)
- `jc.encode(obj)` → `JSON.stringify(obj)` (publish / request / respond all
  accept strings)
- `jc.decode(X.data) as T` → `X.json() as T` — contextual on the `Msg`
  variable name (`msg`, `reply`, `saveReply`, `parentReply`, `ingestReply`)

`connect()`, `subscribe()`, `publish()`, `request()`, `respond()`, and the
`for await (const msg of sub)` iteration are unchanged. The NATS server,
subjects, message shapes, and capability contracts are untouched — the wire
protocol is identical.

## How It Was Proven

Per the plan's two load-bearing gates:

1. **Pilot gate** — `record-surrealdb-resolver` migrated first and proven on
   the live broker before fan-out: a real `resolver.search.requested`
   request/reply round-tripped against SurrealDB (`ok:true`, 8 candidates)
   through the new encode/decode path.
2. **Full-stack gate** — after the nine-service fan-out, the Docker images
   were rebuilt (`docker compose up --build`) and a scripted sweep fired one
   real round-trip through **every** service: workspace active-query,
   record-set list, prompt list, response list, connector inventory,
   resolver search, corpus list-for-record, prompt-run cancel, and full
   create-then-delete ingest cycles for both CSV and XLSX. 12/12 passed;
   service logs show zero JSON decode errors.

`pnpm install` no longer prints a deprecation warning; the lockfile no
longer resolves `nats@2.x`; tree-wide typecheck is clean.

## Decisions On The Record

- **No shared `@augment-it/nats` helper yet.** Ten near-identical `connect`
  call sites still beg for consolidation, but folding a refactor into a
  migration doubles the risk surface. It stays a follow-on, per the plan's
  Open Questions.
- **`as T` casts kept over `msg.json<T>()`** — smaller, more literal diff
  matching the existing style.
- One commit per service (pilot + nine), each atomic with its
  `package.json` and lockfile, so any service can be bisected or reverted
  independently.

## See Also

- `context-v/plans/Migrate-off-Deprecated-nats-Package-to-nats-io-Scoped-v3.md`
  — the plan this executed, mapping table and all
- nats.js v2→v3 migration guide —
  `https://github.com/nats-io/nats.js/blob/main/migration.md`
