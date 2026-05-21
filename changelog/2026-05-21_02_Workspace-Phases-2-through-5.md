---
title: "augment-it goes end-to-end — your spreadsheets, your browser, four phases in one push"
lede: "Phases 2 through 5 of the walking skeleton landed in a single session. Five containers running, the two real fundraise spreadsheets ingested, cells editable from a Svelte 5 frontend that consumes the workspace singleton, and the architecture demo's strongest claim — 'adding a new service is cheap' — has gone from slide to docker-compose diff. The 27th service made its first appearance as xlsx-ingest, with zero changes to row-store."
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
  - Svelte-5
  - Fastify
  - Dynamic-Schema
  - Demo-Architecture
files_changed:
  - context-v/plans/Augment-It-Workspace-Walking-Skeleton.md
  - package.json
  - pnpm-workspace.yaml
  - docker-compose.yml
  - packages/workspace/src/types.ts
  - packages/workspace/src/state.svelte.ts
  - packages/workspace/src/transport.ts
  - packages/workspace/src/adapter.ts
  - packages/workspace/src/index.ts
  - packages/workspace/tsconfig.json
  - services/workspace/src/ws.ts
  - services/workspace/src/server.ts
  - services/workspace/src/capabilities.ts
  - services/row-store/src/store.ts
  - services/row-store/src/handlers.ts
  - services/row-store/data/rows.json
  - services/ingest/Dockerfile
  - services/ingest/package.json
  - services/ingest/tsconfig.json
  - services/ingest/src/server.ts
  - services/ingest/src/parse.ts
  - services/xlsx-ingest/Dockerfile
  - services/xlsx-ingest/package.json
  - services/xlsx-ingest/tsconfig.json
  - services/xlsx-ingest/src/server.ts
  - services/xlsx-ingest/src/parse.ts
  - apps/record-collector/package.json
  - apps/record-collector/rsbuild.config.ts
  - apps/record-collector/tsconfig.json
  - apps/record-collector/src/index.ts
  - apps/record-collector/src/App.svelte
  - playground/index.html
  - scripts/package.json
  - scripts/smoke-ingest.mjs
  - scripts/smoke-ws.mjs
  - scripts/smoke-xlsx.mjs
  - scripts/serve-playground.mjs
---

## Why Care?

Two days ago augment-it was three containers that booted cleanly and a plan that promised the rest. Today augment-it is a working pipeline: pick a fundraise spreadsheet, watch it travel through a CSV parser microservice, land in a row store as a record set with a dynamically-derived column schema, render in a Svelte 5 UI that consumes the workspace package directly, click a cell, edit it, watch the change broadcast back as a NATS event and animate in the UI. The architecture is no longer a slide.

That matters for two reasons. First, augment-it is a real internal tool — the **Master Pipeline Tracker** (24 columns, 207 fundraise prospects) and the **Reach DC Invite RSVP List** (6 columns, 39 attendees) are *our* operational documents, not toy CSVs. The workspace now ingests both, which means we can start using it ourselves before we ever show it to anyone. Second, augment-it is also a teaching artifact for a client running 26 tech products who is unconvinced that microservices are worth the operational tax. The demo we wanted them to see is the one that's now actually running. Adding a new service is a six-line docker-compose diff; we proved it during Phase 4 by adding xlsx support as its own container.

If you are an engineer and want to understand the shape: the wire is **WebSocket browser-side, NATS service-side**, with a thin Workspace Service in the middle that owns sessions and capability routing but nothing else. Every domain microservice subscribes to subjects and owns its own data. The Svelte frontend consumes a singleton state container via `$state` runes, exactly the pattern memopop established with `FlowState`. The full architecture in one diagram is at the bottom of this entry.

## What's New?

- **The four backend containers all do real work end-to-end.** `nats` (with JetStream + monitoring), `workspace-service` (Fastify + WebSocket + capability routing), `ingest` (CSV → schema + rows), and `row-store` (record sets + rows, JSON persistence). The full `record_set.ingest` invocation now flows through every container and back.
- **`xlsx-ingest` — the "27th service" demo, now real.** Excel binary parsing as its own container. Subscribes to `record_set.ingest.xlsx.requested`, parses via ExcelJS, publishes `record_set.create.requested` with the same shape the CSV ingest uses. **Row-store unchanged. Workspace Service got two added lines.** That contrast — adding a service is six lines, not a refactor — is the entire pitch to the 26-product client.
- **WebSocket protocol fully implemented.** Session token handshake on upgrade, frame-id-keyed invoke/result correlation, per-session sequence numbers on broadcast events, NATS subjects forwarded to every connected session. Reconnect-with-backoff on the client. Documented in `services/workspace/src/ws.ts` and `packages/workspace/src/transport.ts`.
- **Dynamic-schema discipline formalized.** A `RecordSet` type carries the per-upload `ColumnSchema` derived from CSV headers (or XLSX header row). Every upload gets its own column shape; multiple record sets coexist with completely different columns. No fixed-schema validation, no required columns. The legacy Tanuj record-collector's primary clever idea — *"the prompt template auto-regenerates from whatever columns the imported CSV has"* — now has structural support in the type system. Memorialized in `feedback_augment_it_dynamic_schema` (auto-memory).
- **Svelte 5 record-collector app.** First federated remote (well, soon-to-be-federated — runs standalone for now) that imports `@augment-it/workspace` directly. Three-column UI: record sets, rows-as-cards, event stream + wire log. Click a cell to edit; the `row.updated` event reaches the singleton, Svelte's reactive `$effect` re-renders the field. This is the first moment the workspace package's transport and state singleton actually execute in a real browser.
- **Vanilla HTML playground** at `playground/index.html`. No bundler, just inline ES module talking WebSocket directly. Lives alongside the Svelte app as a portable proof-of-life that doesn't depend on the Svelte build chain.
- **Four smoke-test scripts under `scripts/`**: `smoke-ingest.mjs` (direct NATS), `smoke-ws.mjs` (browser-shaped WebSocket), `smoke-xlsx.mjs` (XLSX path specifically), `serve-playground.mjs` (zero-dep static server). Run them from a terminal to verify any layer of the stack independently.
- **Plan updated** to reflect the actual shape (ingest as a separate container, the dynamic-schema rule, the two deferred features). See `context-v/plans/Augment-It-Workspace-Walking-Skeleton.md`.

## The 27th-service moment

The most important thirty minutes of this push wasn't writing code — it was watching what *didn't* need to change when we added xlsx support.

Going into Phase 4, the question was: how do we accept Excel files alongside CSV? Three options:

1. **Quickest**: tell users to "save as CSV" in Excel. Zero code.
2. **Right for the demo**: add an xlsx-ingest service. Sibling container. Subscribes to its own NATS subject. Publishes the same `record_set.create.requested` shape. Row-store has no idea xlsx exists.
3. **Cheaper engineering**: teach the existing CSV ingest service to dispatch internally by file extension.

We picked (2) deliberately, even though (3) was less code, because (2) *is the demo*. A 26-product client doesn't need to be told microservices are powerful — they need to *see* what adding the 27th service feels like. The diff that landed:

- One new directory: `services/xlsx-ingest/` (one Dockerfile, one package.json, one tsconfig, two source files).
- One new docker-compose service: 6 lines.
- One new line in the Workspace Service's capability map.
- One new line in the timeout config.
- **Zero changes to row-store**, the service that actually owns the data.
- **Zero changes to the WebSocket protocol.**
- **Zero changes to the workspace package**.

After the rebuild, the playground's file picker accepted .xlsx files and the RSVP list rendered in the UI alongside the CSV record sets. Six columns derived from the worksheet's header row, 39 rows, exactly like the CSV path. ExcelJS for parsing.

This is the architecture's strongest claim, and it's now a thing you can do in front of a skeptical executive in 30 minutes. *"Watch us add the next input format."* Six lines of compose plus a thin service that subscribes to one subject.

## How the wire actually flows now

For a CSV upload originating in the browser:

```
1. Browser  ── WebSocket invoke('record_set.ingest', {filename, csv})
                │
                ▼
2. workspace-service
   - validates session token (opaque, mints on first contact, persists to JSON)
   - dispatch('record_set.ingest', args) → NATS request 'record_set.ingest.requested'
                │
                ▼
3. ingest service
   - parses CSV via csv-parse/sync, columns: true
   - derives ColumnSchema from header row
   - NATS request 'record_set.create.requested' with {name, schema, rows}
                │
                ▼
4. row-store
   - createRecordSet({name, schema, rows}) — fresh record_set_id, fresh row_ids
   - persists {record_sets, rows} JSON to /data/rows.json
   - replies on the NATS request channel
   - PUBLISHES 'record_set.created' broadcast event (NATS pub/sub)
                │
                ├─────────────────────────────┐
                ▼                             ▼
5. ingest forwards reply        workspace-service catches broadcast
                                  - increments per-session seq
                                  - sends EventFrame to every connected WS
                                              │
                                              ▼
6. Browser receives:
   - ResultFrame for the original invoke (the requested round-trip)
   - EventFrame on the same socket (the broadcast, separately)
   - record_set.list refreshes; UI re-renders.
```

For an XLSX upload, replace step 3 with `xlsx-ingest` subscribing to `record_set.ingest.xlsx.requested`. Steps 4–6 are byte-for-byte identical because the `record_set.create.requested` payload shape is the same. That payload-equivalence is what makes the architecture cheap to extend.

## The dynamic-schema discipline (why this is the core idea)

The clever idea worth keeping from the legacy Bolt and Tanuj record-collectors: **the prompt template auto-regenerates from whatever columns the imported CSV has**. A user uploads a different CSV and the prompt automatically reflects the new fields. No prompt engineering per use case.

That discipline forced a shape in the type system. The temptation is to model a `Row` with known columns. We do the opposite:

```ts
export type ColumnSchema = {
  fields: { name: string; order: number }[];
  source: { kind: 'csv'; filename: string; uploaded_at: string };
};

export type RecordSet = {
  record_set_id: string;
  name: string;
  schema: ColumnSchema;          // ← lives on the record set, not the row
  row_ids: string[];
  created_at: string;
};

export type Row = {
  row_id: string;
  record_set_id: string;
  fields: Record<string, unknown>;  // ← keys are whatever the CSV had
};
```

The Master Pipeline Tracker has 24 columns including `Prospect / Organization`, `Joe Involved? (Y/N)`, `Weighted FY26 (auto)`, `Stalled? (auto)` — spaces, slashes, parentheses, question marks. The RSVP list has 6 columns including `q1: will you be bringing a guest?`. Both ingest and render with zero special-casing. The system never asked what the columns should be; it derived them from the header row at ingest time and the schema lived on the record set ever after.

The downstream consequences are interesting and we've only just started exploring them — the prompt generator (when we wire it next) will derive its template from `record_set.schema.fields`, not from anything hard-coded. The UI renders whatever columns exist. The xlsx-ingest service shares the schema shape with the CSV ingest service because the source format is irrelevant to the consumer.

## Five containers, one running architecture

```
       Browser (Svelte 5 record-collector OR vanilla playground)
                            │
                            │  WebSocket
                            ▼
              ┌──────────────────────────┐
              │  workspace-service       │
              │  Fastify + @fastify/ws   │
              │  - session tokens        │
              │  - capability dispatch   │
              │  - NATS broadcast bridge │
              └──────────┬───────────────┘
                         │
                       NATS
              (JetStream + monitoring on :8222)
                         │
        ┌────────────────┼─────────────────┐
        │                │                 │
   ┌────▼─────┐   ┌──────▼──────┐   ┌──────▼──────┐
   │ ingest   │   │xlsx-ingest  │   │  row-store  │
   │ CSV →    │   │ XLSX →      │   │  records +  │
   │ schema   │   │ schema      │   │  rows       │
   │ stateless│   │ stateless   │   │  (the data) │
   └──────────┘   └─────────────┘   └─────────────┘
                                          │
                                  /data/rows.json
                                  (Docker volume)
```

Three of these containers are stateless transformations. Only one (`row-store`) owns durable data. The Workspace Service holds session tokens (JSON-file backed). NATS holds in-flight messages and broadcast subscriptions. Everyone else is replaceable, restartable, parallel-deployable — exactly the properties the 26-product client cares about even when they don't yet have the vocabulary for them.

## Files Worth Knowing About

- `apps/record-collector/src/App.svelte` — the first Svelte component in the project that consumes `@augment-it/workspace`. ~300 lines. Reads like the per-app-workspace blueprint promised: components subscribe to the singleton directly, no hook plumbing, $effect handles event reactions.
- `packages/workspace/src/state.svelte.ts` — the singleton. Uses constructor-assignment of `$state` rather than class-field initializer (toolchain-portability fix, documented in-file). Otherwise identical to memopop's `FlowState` pattern.
- `services/xlsx-ingest/src/parse.ts` — 50 lines that earn the whole "27th service" demo. ExcelJS, header-derived schema, formula-cell flattening, empty-row skipping. The file is short on purpose.
- `services/row-store/src/handlers.ts` — what a domain microservice looks like in this architecture. Five NATS subscriptions, each one a short async generator loop. No HTTP. No awareness of any other service.
- `playground/index.html` — bundler-free proof-of-life. Same protocol, vanilla JS. Useful as a debugging surface that doesn't depend on the Svelte build.
- `context-v/plans/Augment-It-Workspace-Walking-Skeleton.md` — updated with the actual five-phase trajectory, the dynamic-schema discipline section, and the two deferred features.

## Two Unresolved Features (deferred, honestly)

The walking skeleton's behavior is **every upload creates a new RecordSet**. That's deliberate; the alternative requires solving a problem none of the prior augment-it iterations resolved.

**The toggler.** UI to switch which record set is active without losing the others. Never built in Bolt or Tanuj. Mechanically small (sets `workspace.activeView`); UX-wise it's a real decision about how multi-set ergonomics should feel.

**Upsert / merge.** Two related operations: re-upload of the same logical record set (rows update in place, no duplicates), and merging two record sets. Both depend on a *primary key* notion that the dynamic-schema constraint makes nontrivial — there is no fixed column to key on. Options worth considering when this is taken up: user picks key column at upload, heuristic detection (`id`, `email`, `domain`, etc.), hash-of-whole-row (fragile), row order (only handles identical-shape re-upload). We have three duplicate copies of the pipeline tracker in the store right now from smoke tests; this is the actual problem made visible.

Both are flagged in `project_augment_it_recordset_open_features` (auto-memory) so future sessions don't either silently rely on them or accidentally try to add them in the wrong place.

## What's Next

The walking skeleton is now complete in the technical sense — every phase has acceptance-checked. What's not yet done is the *system* the walking skeleton was a proof-of-concept for. The natural next moves, in increasing scope:

1. **Module Federation host.** Wire `shell/` as the Svelte host that mounts `record-collector` (and future siblings) as federated remotes. Prerequisite for adding the in-app-agent chat surface alongside the workspace UI.
2. **First domain microservice beyond row-store.** Something like `research-service` subscribing to `row.research.requested` — the second proof that "add a service" is cheap, this time with semantic intent rather than just a second input format.
3. **Upsert / merge.** Pick one of the four primary-key approaches and ship it. Probably user-picks-key-at-upload first (smallest UI footprint, most honest behavior).
4. **Retire `shell/rsbuild.config.ts`'s React reference.** Vestigial from the Bolt era, no longer matches anything in the tree.

## See also

- [[2026-05-21_01_Workspace-Walking-Skeleton-Phase-1]] — the prior entry. Phase 1 ended when containers booted; this entry picks up there and runs to the end of Phase 5.
- [[Augment-It-Workspace-Walking-Skeleton]] — the plan, updated.
- [[Walking-Skeleton-Pre-Flight-Decisions]] — the five-decision pre-flight spec. D2 (transport) was superseded in the prior session; D1/D3/D4 carried through; D5 (chat package ownership) remains deferred.
- [[Per-App-Workspace-Conventions]] — the blueprint this walking skeleton was an instantiation of. Now has a real implementation to point at.
- [[Tanuj-Record-Collector-As-Built]] — the legacy record-collector whose "auto-generate the prompt from CSV columns" idea is the dynamic-schema lift-out at the core of this work.
