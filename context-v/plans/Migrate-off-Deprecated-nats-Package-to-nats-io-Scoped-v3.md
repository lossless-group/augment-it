---
title: "Migrate off the deprecated `nats` package to the `@nats-io/*` scoped v3 client — swap `nats@2` for `@nats-io/transport-node@3` across all 10 services, drop the removed `JSONCodec` in favor of `JSON.stringify` + `msg.json()`, and prove the inter-service bus still round-trips live before committing"
lede: >-
  `nats` → `@nats-io/transport-node` v3 across 27 files: mechanical, except the removed `JSONCodec` rewrites every encode and decode.
date_created: 2026-07-01
date_modified: 2026-07-01
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.8 (1M context)
semantic_version: 0.0.1.0
revisions:
  - 2026-07-01 — Initial draft. Written at the tail of a workspace-wide dependency-upgrade campaign (Zod 4, Rsbuild 2 + Module Federation 2.6, TypeScript 6, csv-parse 7). `nats` was the one item deliberately parked because it's a deprecation-migration, not a version bump — the inter-service bus across ~10 services, needing real import-path and codec changes plus a live round-trip test, not a blind `pnpm update`. Authored to be handed to a fresh session whose agents execute it.
  - 2026-07-01 — Executed, same day, on `feature/resolve-db`. All four phases ran as written: pilot proven on the live broker (resolver.search round-trip, ok:true, 8 candidates), nine-service fan-out in the planned order (one atomic commit each), hygiene sweep clean (deprecation warning gone, no nats@2 in the lockfile, tree-wide typecheck green), and a scripted full-stack sweep through the rebuilt Docker images — one real round-trip per service incl. CSV + XLSX create-then-delete ingest cycles, 12/12 passed, zero decode errors in the logs. Types re-exported from `@nats-io/transport-node` cleanly (the `@nats-io/nats-core` fallback flagged in Open Questions was never needed). Shipped as changelog/2026-07-01_01.
tags:
  - Plan
  - Augment-It
  - NATS
  - Message-Bus
  - Dependency-Migration
  - Services
  - Deprecation
status: Implemented
site_uuid: 6e8e09a9-0e44-474b-b6df-a6ed901c7869
hex_code: emiaxu
date_authored_initial_draft: 2026-07-01
date_authored_current_draft: 2026-07-01
publish: true
---

# Migrate off the deprecated `nats` package to `@nats-io/*` v3

## Why this plan exists

`pnpm install` prints `WARN deprecated nats@2.29.3` on every run. The
monolithic `nats` package (all of nats.js v2) is fully deprecated: nats.js
v3 split the library into scoped `@nats-io/*` packages with independent
versioning. We declare `nats@^2.28.0` in **10 services** and import it in
**27 files**.

This was the one dependency deliberately held back during the 2026-07-01
upgrade campaign (Zod 4, Rsbuild 2 + Module Federation 2.6, TypeScript 6,
csv-parse 7 all shipped). Unlike those, `nats` is not a version bump you can
`pnpm update` — it's a package rename plus a real API change (the codec
utilities were **removed**), and it touches the message plumbing of every
backend service simultaneously. A blind bump would break the entire
inter-service bus with no compile error until runtime. Hence: its own plan,
its own session, its own live-bus verification gate.

The good news, established by surveying the actual code: our usage is a
small, uniform, pure-core subset. No JetStream, no KV, no queue groups, no
headers, no `StringCodec`, no `drain`/`close`. Just `connect`, request/reply,
pub/sub, and one JSON codec. The migration is mechanical — the risk is
breadth (27 files at once), not depth.

## Scope of this plan

In scope:

- Replace `nats@^2.28.0` with `@nats-io/transport-node@^3.4.0` in all 10
  service `package.json` files.
- Rewrite the import sites: `from 'nats'` → `from '@nats-io/transport-node'`.
- Remove the deleted `JSONCodec`: every `jc.encode(x)` → `JSON.stringify(x)`,
  every `jc.decode(msg.data) as T` → `msg.json() as T`.
- Keep `connect({ servers, name })`, `nc.subscribe`, `nc.publish`,
  `nc.request`, `msg.respond`, `msg.reply`, and the `for await (const msg of
  sub)` iteration exactly as-is (unchanged in v3).
- A one-service **pilot** (`record-surrealdb-resolver`) proven on a live bus
  before touching the other nine.
- A full-stack `pnpm stack` verification exercising each service's
  capabilities end-to-end.

Out of scope:

- The NATS **server**. `docker-compose.yml` + `nats.conf` run the broker;
  the v2→v3 change is client-library only and the wire protocol is
  unchanged. Do not touch the server config, ports, or `NATS_URL`
  (`nats://localhost:4222`).
- JetStream / KV / Object Store adoption. We don't use them; `@nats-io/jetstream`
  and `@nats-io/kv` are not installed. If a future feature needs durable
  streams, that's a separate plan.
- Introducing a shared `@augment-it/nats` helper package. Tempting (10
  near-identical `connect` call sites), but consolidation is a refactor with
  its own risk surface — do it as a follow-on once everything is on v3, not
  entangled with the migration. Noted in Open Questions.
- Changing any subject names, message shapes, or capability contracts.

## The migration mapping (the crux)

This is the entire API delta. Every change in this plan is one of these five
rows. Authoritative source: the nats.js v2→v3 migration guide
(`github.com/nats-io/nats.js/blob/main/migration.md`).

| # | Concern | v2 (`nats`) | v3 (`@nats-io/transport-node`) |
|---|---|---|---|
| 1 | Import source | `import { connect } from 'nats'` | `import { connect } from '@nats-io/transport-node'` |
| 2 | Codec import | `import { JSONCodec, type NatsConnection } from 'nats'` | `import { type NatsConnection } from '@nats-io/transport-node'` (drop `JSONCodec`) |
| 3 | Codec init | `const jc = JSONCodec();` | **delete the line** |
| 4 | Encode (publish/request/respond) | `jc.encode(obj)` | `JSON.stringify(obj)` |
| 5 | Decode (any `Msg`) | `jc.decode(msg.data) as T` | `msg.json() as T` |

Notes the executing agent must respect:

- **Rule for row 5 is contextual.** `jc.decode(X.data)` becomes `X.json()`
  where `X` is whatever the local `Msg` variable is named — usually `msg`,
  but request replies use a different name, e.g.
  `const reply = await nc.request(...); jc.decode(reply.data) as T` →
  `reply.json() as T`. A blind global `jc.decode(msg.data)` sed will miss the
  `reply` / `m` / other-named cases. Grep each file for every `jc.` first.
- **Encoding returns a string now, not `Uint8Array`.** `publish`, `request`,
  and `respond` all accept `string | Uint8Array`, so `JSON.stringify()` is a
  drop-in. No call-site signature changes.
- **Rare non-`Msg` decode.** If any file decodes a stored `Uint8Array` that
  isn't a live `Msg.data` (none found in the survey, but verify per file),
  use `JSON.parse(new TextDecoder().decode(raw))` — there's no `.json()`
  helper off a raw buffer.
- **Types.** `NatsConnection`, `Subscription`, and `Msg` are re-exported by
  `@nats-io/transport-node`. If tsc reports one isn't found, import it from
  `@nats-io/nats-core` (the transitive core package) — but try
  transport-node first.
- **ESM.** The `@nats-io/*` packages are ESM. Services run via `tsx` (ESM
  already) and build with `tsc` under NodeNext, so no module-system change is
  needed. Node floor is `>= 18`; we're on 22.

### Worked example — `record-surrealdb-resolver/src/handlers.ts`

```ts
// BEFORE (v2)
import { JSONCodec, type NatsConnection } from 'nats';
const jc = JSONCodec();
const sub = nc.subscribe('resolver.candidates.requested');
for await (const msg of sub) {
  const args = jc.decode(msg.data) as { record: NormRecord; client: string };
  // ...
  if (msg.reply) msg.respond(jc.encode({ ok: true, candidates }));
}

// AFTER (v3)
import { type NatsConnection } from '@nats-io/transport-node';
const sub = nc.subscribe('resolver.candidates.requested');
for await (const msg of sub) {
  const args = msg.json() as { record: NormRecord; client: string };
  // ...
  if (msg.reply) msg.respond(JSON.stringify({ ok: true, candidates }));
}
```

### Worked example — a requester (e.g. `workspace/src/capabilities.ts`)

```ts
// BEFORE (v2)
const reply = await nc.request(subj, jc.encode(args), { timeout: 90_000 });
const out = jc.decode(reply.data) as ResolverReply;

// AFTER (v3)
const reply = await nc.request(subj, JSON.stringify(args), { timeout: 90_000 });
const out = reply.json() as ResolverReply;
```

## The footprint (what the next session is walking into)

10 services declare `nats@^2.28.0`; 27 source files import it. Per service:

| Service | Files importing `nats` | Role on the bus |
|---|---|---|
| `prompt-runner` | 6 | requester + responder (apply, drafter, preview, chat-turn, run, server) |
| `workspace` | 5 | the hub — capabilities router, ws bridge, chat, workspaces, nats helper |
| `record-surrealdb-resolver` | 3 | responder (candidates/search/apply/update); **pilot target** |
| `social-search` | 3 | responder + entity-pulse dispatch |
| `content-ingest` | 2 | responder (corpus/inbox) |
| `prompt-store` | 2 | responder |
| `response-store` | 2 | responder |
| `row-store` | 2 | responder |
| `ingest` | 1 | responder |
| `xlsx-ingest` | 1 | responder |

Connection is uniform everywhere:
`connect({ servers: NATS_URL, name: '<service>-service' })`, with
`NATS_URL = process.env.NATS_URL ?? 'nats://localhost:4222'`. Only
`workspace/src/nats.ts` wraps it in a singleton helper; the other nine inline
`connect` in their `server.ts`.

## Phases

### Phase 1 — Pilot: `record-surrealdb-resolver`, proven on a live bus

Do the full migration on **one** service first, end to end, before touching
any other. Chosen because it's a self-contained responder with all the
decode/encode/subscribe/respond patterns in 3 files.

1. Edit the 3 files (`server.ts`, `handlers.ts`, `domains.ts`) per the
   mapping table.
2. `package.json`: remove `"nats": "^2.28.0"`, add
   `"@nats-io/transport-node": "^3.4.0"`. Run `pnpm install`.
3. `pnpm --filter @augment-it/record-surrealdb-resolver-service typecheck` →
   must be clean.
4. **Live round-trip test.** Start the broker + this one service, and fire a
   real request/reply through it:
   - Broker up (via `pnpm stack` or `docker compose up nats`).
   - `NATS_URL=nats://localhost:4222 pnpm --filter
     @augment-it/record-surrealdb-resolver-service start`.
   - From a scratch script (or another running service), publish a
     `resolver.search.requested` request and assert a well-formed reply comes
     back **decoded as JSON** — this proves both encode (responder side) and
     decode (caller side) survived the codec swap.
5. Commit the pilot atomically (code + package.json + lockfile) with a
   message that documents the mapping, so the pattern is on the record for
   the remaining nine.

**Gate:** do not proceed to Phase 2 until the live round-trip returns correct
JSON. If `msg.json()` throws or returns `undefined`, the encode side is still
emitting something non-JSON — fix the mapping before fanning out.

### Phase 2 — Fan out to the remaining nine services

With the pattern proven, migrate the rest. Each service is an **atomic
commit** (its source files + its `package.json`, install once at the end or
per service). Suggested order — responders first (they only need their own
encode/decode correct), the hub last (it's the busiest caller and benefits
from every responder already being on v3):

1. `xlsx-ingest` (1) → 2. `ingest` (1) → 3. `prompt-store` (2) →
4. `response-store` (2) → 5. `row-store` (2) → 6. `content-ingest` (2) →
7. `social-search` (3) → 8. `prompt-runner` (6) → 9. `workspace` (5, last).

Per service, the loop:

- Grep the file(s) for every `jc.` occurrence; rewrite per the mapping,
  minding the contextual decode rule (row 5 note).
- Swap the `package.json` dep.
- `pnpm --filter <service> typecheck` → clean before moving on.

A codemod can safely automate rows 1–4 (import source, drop `JSONCodec`
import + init, `jc.encode(` → `JSON.stringify(`). Row 5 (`jc.decode(X.data)`
→ `X.json()`) should be reviewed per hunk because of the variable-name
context — don't trust a blind sed for it.

### Phase 3 — Tree-wide typecheck + dependency hygiene

1. Confirm no `nats` (v2) references remain:
   `grep -rn "from 'nats'" services` → empty;
   `grep -rn '"nats"' services/*/package.json` → empty.
2. `pnpm -r --if-present run typecheck` → all services clean.
3. `pnpm install` → the `WARN deprecated nats@2.29.3` line is **gone** (the
   success signal for the whole plan).
4. Confirm `pnpm-lock.yaml` no longer resolves `nats@2.x` (only the
   `@nats-io/*` tree).

### Phase 4 — Full-stack live verification

Code compiling is necessary but not sufficient — the codec change is a
runtime concern. Bring the whole stack up and exercise the bus:

1. `pnpm stack` (→ `bash scripts/dev.sh`) — broker + all services + the
   Module-Federation shell.
2. Click through the app the way the operator does, hitting at least one
   capability routed through **each** migrated service:
   - a resolver search/candidates round-trip,
   - a prompt-runner run (the 6-file service, most caller-heavy),
   - an ingest (CSV or XLSX) end-to-end,
   - a social-search / entity-pulse dispatch,
   - a content-ingest corpus/inbox add,
   - a store read/write (prompt-store, response-store, row-store).
3. Watch service logs for JSON decode errors and the browser console for
   failed capability calls. A silent bus (no messages arriving) or a
   `SyntaxError` in `.json()` is the failure signature to hunt.

**Gate:** the plan is done when the deprecation warning is gone AND every
exercised capability round-trips correctly through the live bus.

## Files changed

| File(s) | Phase | Change |
|---|---|---|
| `services/record-surrealdb-resolver/src/{server,handlers,domains}.ts` | 1 | Import swap + codec removal (pilot) |
| `services/record-surrealdb-resolver/package.json` | 1 | `nats` → `@nats-io/transport-node` |
| `services/{xlsx-ingest,ingest}/src/server.ts` | 2 | Import swap + codec removal |
| `services/{prompt-store,response-store,row-store,content-ingest}/src/*.ts` | 2 | Import swap + codec removal (2 files each) |
| `services/social-search/src/{search,server,entity-pulse/dispatch}.ts` | 2 | Import swap + codec removal |
| `services/prompt-runner/src/{apply,drafter,preview,chat-turn,run,server}.ts` | 2 | Import swap + codec removal (6 files) |
| `services/workspace/src/{nats,capabilities,workspaces,chat,ws}.ts` | 2 | Import swap + codec removal (5 files); `nats.ts` singleton helper updates its import + type |
| `services/{ingest,xlsx-ingest,prompt-store,response-store,row-store,content-ingest,social-search,prompt-runner,workspace}/package.json` | 2 | `nats` → `@nats-io/transport-node` |
| `pnpm-lock.yaml` | 1, 2 | Resolves the `@nats-io/*` tree; drops `nats@2` |

No server, infra, env, or contract files change.

## Open questions

- **Shared `@augment-it/nats` helper?** Ten near-identical `connect` call
  sites and (before this migration) ten `const jc = JSONCodec()` lines beg
  for a shared `packages/nats` with a `connectNats(name)` export. `workspace/
  src/nats.ts` already has the singleton shape to lift. **Lean:** do it as a
  *follow-on* refactor after everything is on v3 — folding a consolidation
  into the migration doubles the risk surface and muddies the "did the codec
  swap break anything?" signal. File a separate small plan.
- **Codemod vs by-hand.** Rows 1–4 of the mapping are safe to script; row 5
  (`jc.decode(X.data)` → `X.json()`) is contextual. **Lean:** codemod the
  mechanical four, hand-review the decode rewrites. 27 files is small enough
  that a careful pass per file is cheap and safer than debugging a bad sed on
  a live bus.
- **Type re-exports from transport-node.** The migration guide says types
  "remain available through the transport packages," but if `Msg`,
  `Subscription`, or `NatsConnection` isn't re-exported by
  `@nats-io/transport-node@3.4.0`, fall back to `@nats-io/nats-core`. Verify
  during the Phase 1 pilot typecheck; if the fallback is needed, note it so
  Phase 2 uses the right import from the start.
- **`msg.json()` generic vs cast.** The library supports `msg.json<T>()`.
  Existing code uses `jc.decode(msg.data) as T`. Either `msg.json() as T` or
  `msg.json<T>()` works; **lean** toward `as T` for a smaller, more literal
  diff (matches the existing style).
- **Branch strategy.** This is multi-file, multi-service, user-affecting →
  named-branch territory per the [[branch-cadence]] discipline, not
  trunk-direct. Pilot commit + nine fan-out commits + a verification note on
  one feature branch, PR at the end. (Current campaign branch is
  `feature/resolve-db`; the executing session may start fresh from the trunk
  `rebuild/turbo-rsbuild` per [[project_augment_it_trunk_branch]].)

## Migration / sequencing

Recommended order: **Phase 1 (pilot + live round-trip) → gate → Phase 2
(nine services, responders before the hub) → Phase 3 (hygiene sweep) →
Phase 4 (full-stack live)**. The two gates are load-bearing: the Phase 1
round-trip proves the codec mapping before it's replicated 9×, and the
Phase 4 stack test proves the whole bus at runtime (the codec change won't
surface at compile time). Do not let "it typechecks" stand in for "the bus
carries messages" — that's the entire reason this is a plan and not a
`pnpm update`.

## See also

- nats.js v2→v3 migration guide —
  `https://github.com/nats-io/nats.js/blob/main/migration.md` (the
  authoritative source for the mapping table above).
- `@nats-io/transport-node` — `https://www.npmjs.com/package/@nats-io/transport-node`
  (3.4.0 at time of writing; "has all the functionality of the original
  nats.js").
- [[branch-cadence]] — named-branch discipline for multi-file,
  multi-service, user-affecting work.
- [[project_augment_it_trunk_branch]] — the trunk is `rebuild/turbo-rsbuild`;
  bring-to-parity is a fast-forward of that branch.
- The 2026-07-01 upgrade campaign commits on `feature/resolve-db`
  (Zod 4 `6e5ad7c`, Rsbuild 2 + MF 2.6 `4e32945`, TypeScript 6 `68670bc`,
  csv-parse 7 `98acb1f`) — the same "bump, verify, fix the fallout, commit
  per coherent unit" rhythm this plan continues. `nats` was explicitly parked
  by each of those commit messages as "its own focused task"; this is it.
