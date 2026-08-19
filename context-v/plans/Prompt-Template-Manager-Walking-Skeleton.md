---
title: "Prompt-Template-Manager — Walking Skeleton Plan"
lede: >-
  Author `{{column}}` templates and run them per row — `prompt-runner` is the only container that calls the Anthropic API.
date_created: 2026-05-21
date_modified: 2026-05-25
date_completed: 2026-05-21
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
semantic_version: 0.0.0.2
revisions:
  - 2026-05-25 — Status swept to Shipped; prompt-template-manager UI + prompt-store + prompt-runner landed per changelog 2026-05-21_04..05.
tags:
  - Plan
  - Augment-It
  - Prompt-Template-Manager
  - Prompt-Runner
  - Prompt-Store
  - Walking-Skeleton
  - LLM-Enrichment
  - Derived-Record-Sets
  - Module-Federation
  - Anthropic-API
status: Shipped
site_uuid: a724b530-d1b5-4845-94f7-41aff5c97bf2
hex_code: 9r21lc
date_authored_initial_draft: 2026-05-25
date_authored_current_draft: 2026-05-25
publish: true
---

# Prompt-Template-Manager — Walking Skeleton Plan

> **Superseded in part (2026-05-21).** This plan's "every prompt run produces a
> new derived record set / lineage chain" decision is **superseded** by the
> record-instance model in [[Original-and-Enhanced-Record-Instances]]: runs
> accumulate into one mutable *enhanced instance* per round, not a chain of
> sets. Phases 1–3 shipped as written (changelog `2026-05-21_04`) and are the
> v0 of that model; the implementing work folds many-runs-into-one-instance
> and the source pointer onto it. Everything else in this plan stands.

## What this plan is

The second federated app for augment-it, building directly on the substrate the
[[Augment-It-Workspace-Walking-Skeleton]] put in place. After this lands:

1. `prompt-store` exists — a microservice owning prompt templates (JSON-backed,
   NATS-subscribed, structurally identical to `row-store`).
2. `prompt-runner` exists — the **one** container that calls the Anthropic API.
   It fills a prompt template per-row, calls the LLM, and produces a derived
   record set.
3. Running a prompt produces a **derived record set** — a copy of the parent
   with the LLM output added as a new column. The original is never mutated.
4. `apps/prompt-template-manager/` exists — a Svelte 5 federated remote, second
   tile in the shell, following the record-collector pattern exactly.
5. The url-enrichment loop works end-to-end: author "find the URL for
   `{{Prospect / Organization}}`", run it against the pipeline-tracker record
   set, get back a derived set with a `url` column.

## Why this is the right next app

`record-collector` (Ingest) is done. Per the [[Augment-It-as-CRM-Augmentation-Pipeline]]
spec, the next pipeline stage is **Configure** — the prompts that fire per-row.
The architecture stub for it is `apps/prompt-template-manager/`.

The legacy `lossless-group/prompt-manager` repo (Tanuj's scaffold) was analysed
in [[Tanuj-Prompt-Manager-As-Built]]: good CRUD-shaped UI, zero wiring, verdict
"lift the schema, drop the implementation." We lift the schema and the
`{{variable}}` convention; everything else is new.

This app is also where augment-it stops being a viewer and becomes an
*augmenter*. Running a prompt is the augmentation loop:

```
prompt template  +  one row's column values
        │  fill {{tokens}}
        ▼
   assembled prompt  →  Anthropic API  →  response text
        │
        ▼
   response becomes a new column value on a copy of that row
```

## Naming note

The user refers to this as "prompt-manager"; the legacy repo is
`lossless-group/prompt-manager`; the architecture spec and the existing stub
say `prompt-template-manager`. This plan uses **`apps/prompt-template-manager/`**
— it matches the existing seam and the descriptive-naming style of the other
five app stubs (record-collector, request-reviewer, etc.). Not worth churning
the seam name; the legacy repo stays where it is as prior art.

## Decisions already settled (2026-05-21 conversation)

| Decision | Choice | Rationale |
|---|---|---|
| Where the LLM call happens | **New `prompt-runner` microservice** | Keeps the API key server-side; matches "every container has one job" + the thin-orchestrator stance ([[project_augment_it_workspace_demo_stance]]); natural home for per-row fan-out later |
| Enrichment output | **New derived record set** | Original untouched; inspectable; turns re-runs into a lineage chain instead of the duplicate-uploads problem |
| Placeholder syntax | `{{column name}}` | Matches the legacy prior art and Mustache/Handlebars familiarity; user is indifferent to syntax |
| LLM provider | Anthropic Claude | Per the repo's CLAUDE.md "default to the latest and most capable Claude models" |
| Default model | `claude-opus-4-7` | The claude-api skill is explicit: default to the most capable model, never downgrade for cost without the user's say-so. `prompt-runner` reads `LLM_MODEL` from env — set `LLM_MODEL=claude-sonnet-4-6` in `.env` for the cost-sensible default on large per-row batches (Sonnet is $3/$15 vs Opus $5/$25 per M tokens). The walking-skeleton `row_limit: 3` runs are cheap either way |

## Architecture after this lands

```
            Browser — shell :3100
            ├── record-collector remote  (Ingest)
            └── prompt-template-manager remote  (Configure)   ← NEW
                         │
                         │ WebSocket → workspace-service :3001
                         ▼
                  workspace-service  (capability routing, thin)
                         │
                       NATS
        ┌────────────┬───┴────┬─────────────┬──────────────┐
        ▼            ▼        ▼             ▼              ▼
   ingest      xlsx-ingest  row-store   prompt-store   prompt-runner   ← 2 NEW
   (CSV)       (XLSX)       (rows +     (prompt        (the only
                            record      templates)     container that
                            sets)                      calls Anthropic)
                                                            │
                                                            ▼
                                                    api.anthropic.com
```

Seven containers after this (was five). `prompt-store` and `prompt-runner` are
both new. `prompt-runner` is the only one with an outbound internet dependency
and the only one holding the `ANTHROPIC_API_KEY`.

## New NATS subjects

| Subject | Direction | Producer | Consumer |
|---|---|---|---|
| `prompt.list.requested` | request | workspace-service | prompt-store |
| `prompt.get.requested` | request | workspace-service / prompt-runner | prompt-store |
| `prompt.create.requested` | request | workspace-service | prompt-store |
| `prompt.update.requested` | request | workspace-service | prompt-store |
| `prompt.delete.requested` | request | workspace-service | prompt-store |
| `prompt.created` / `prompt.updated` / `prompt.deleted` | event | prompt-store | workspace-service → WS |
| `prompt.run.requested` | request | workspace-service | prompt-runner |
| `prompt.run.progress` | event | prompt-runner | workspace-service → WS |
| `prompt.run.completed` | event | prompt-runner | workspace-service → WS |
| `record_set.create.requested` | request | prompt-runner | row-store *(reused — derived set creation)* |

`prompt.run.progress` lets the UI show "row 12 of 50 enriched" instead of a
frozen spinner — per-row LLM calls are slow (seconds each).

## Type changes

### Prompt template (new — in the workspace package and prompt-store)

Lifts the useful core of the legacy Tanuj schema, drops the dead fields
(`variables[]` is derived from `content`, not stored; `category` / `lastUsed` /
`usageCount` were never wired and aren't needed yet).

```ts
export type PromptTemplate = {
  prompt_id: string;
  name: string;                 // e.g. "Crawl & Fetch Brand Assets"
  description: string;
  content: string;              // body with {{token}} placeholders
  output_column: string;        // the column name the LLM response populates
  created_at: string;
  updated_at: string;
};
```

`{{token}}` names are extracted from `content` by regex at bind time, never
stored — single source of truth is the template body.

### RecordSet gains a derivation provenance

```ts
export type ColumnSchema = {
  fields: { name: string; order: number }[];
  source:
    | { kind: 'csv'; filename: string; uploaded_at: string }
    | { kind: 'derivation';
        prompt_id: string;
        prompt_name: string;
        parent_record_set_id: string;
        derived_at: string };
};

export type RecordSet = {
  record_set_id: string;
  name: string;
  schema: ColumnSchema;
  row_ids: string[];
  created_at: string;
  derived_from?: {              // absent for uploaded sets, present for derived
    record_set_id: string;
    prompt_id: string;
    added_columns: string[];
  };
};
```

A derived set's `schema.fields` = parent's fields + the new column(s) appended
at `order = max + 1`. A derived set's `name` is suggested as
`"<parent name> + <output_column>"`.

## prompt-runner — how a run works

`prompt.run.requested { prompt_id, record_set_id, row_limit? }`

1. `prompt.get.requested` → fetch the template from prompt-store.
2. `record_set.get.requested` → fetch the parent record set + its rows from
   row-store.
3. Extract `{{tokens}}` from `template.content`. **Bind check:** every token
   must match a column name in the parent's schema. Unbound tokens → reply with
   an error naming them (this is how the UI tells the user "run the url prompt
   first").
4. For each row (capped at `row_limit`, default 25 for the walking skeleton —
   not all 207):
   - Substitute `{{token}}` → `row.fields[token]`.
   - Call Anthropic (`@anthropic-ai/sdk`, model from `LLM_MODEL` env).
   - Trimmed response text → the value for `output_column`.
   - Publish `prompt.run.progress { done, total }`.
5. Build the derived record set: copy the processed rows, add `output_column`
   to each row's fields, append it to the schema, set `derived_from`.
6. `record_set.create.requested` (reusing row-store's existing handler — it
   already accepts `{name, schema, rows}`; the only extension is carrying
   `derived_from` through).
7. Publish `prompt.run.completed { record_set_id: <new derived id> }`.

`row_limit` default of 25 keeps the walking skeleton cheap and fast — a full
207-row run is real money and minutes of latency. Batch-the-whole-set is a
later iteration once the fan-out concurrency story (per
[[Multi-Agent-Research-Fan-Out-Per-Row]]) is built.

### Output parsing — walking-skeleton scope

The prompt's `output_column` is a single column; the LLM's trimmed text
response is that column's value. The prompt author is responsible for telling
the model to answer with just the value ("Respond with only the URL, nothing
else"). Structured / multi-column output (JSON or tool-use) is a deliberate
later iteration — noted, not built.

## API key handling

`ANTHROPIC_API_KEY` is read by `prompt-runner` from its environment. The
docker-compose entry uses `${ANTHROPIC_API_KEY}` — Docker Compose auto-reads a
`.env` file in the project root, and `.env` is already gitignored. So:

- Create `augment-it/.env` with `ANTHROPIC_API_KEY=sk-ant-...` (never committed).
- `prompt-runner`'s compose service: `environment: ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}`.
- The key never enters source, never enters the browser, never enters any
  container except `prompt-runner`.

This is the BYOK-deferred posture: for now the key is ours (server-side). The
"client brings their own key" path from the in-app-chat exploration is a later
concern and would most likely flow the key per-request over the WebSocket
rather than via container env — out of scope here.

**Known future home (2026-05-21):** prior augment-it versions had an *account
manager* and an *org admin panel*. Key management, account/org settings, and
BYOK rightfully belong in that admin surface, not a raw `.env` file. The `.env`
here is an explicit walking-skeleton stand-in; when the admin panel is
rebuilt, `ANTHROPIC_API_KEY` (and per-org/per-client keys) move there. Treat
the `.env` as temporary scaffolding, not the design.

## Repo layout added

```
augment-it/
├── .env                                  # NEW — ANTHROPIC_API_KEY (gitignored)
├── apps/
│   └── prompt-template-manager/           # NEW — Svelte 5 federation remote
│       ├── package.json
│       ├── rsbuild.config.ts              # MF remote, exposes ./mount
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts                   # standalone entry
│           ├── mount.ts                   # federation mount fn
│           ├── App.svelte
│           └── app.css                    # namespaced .ptm-app
├── services/
│   ├── prompt-store/                      # NEW — template CRUD, JSON-backed
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── Dockerfile
│   │   ├── data/prompts.json
│   │   └── src/{server,store,handlers}.ts
│   └── prompt-runner/                     # NEW — the LLM caller
│       ├── package.json                   # depends on @anthropic-ai/sdk
│       ├── tsconfig.json
│       ├── Dockerfile
│       └── src/{server,run,template,anthropic}.ts
└── docker-compose.yml                     # + prompt-store, prompt-runner
```

## Phases

### Phase 1 — prompt-store service

Scaffold the service. Structurally a clone of `row-store`: JSON-file
persistence, NATS request/reply handlers for `prompt.list/get/create/update/
delete`, broadcasts `prompt.created/updated/deleted`. Add to docker-compose.

**Check:** `docker compose up`, smoke script creates a prompt, lists it, gets
it, updates it — all via NATS.

### Phase 2 — prompt-runner service (the proof-of-life)

Scaffold the service with `@anthropic-ai/sdk`. Implement the run flow above.
RecordSet type changes (derived_from, ColumnSchema derivation source) land here
in the workspace package + row-store.

**Check:** a smoke script seeds a real url-finding prompt into prompt-store,
fires `prompt.run.requested` against the pipeline-tracker record set with
`row_limit: 3`, and a new derived record set appears with a populated `url`
column. This is the moment augment-it first calls an LLM.

### Phase 3 — capability wiring

workspace-service capability map gains `prompt.list/get/create/update/delete`
and `prompt.run`. `ws.ts` BROADCAST_SUBJECTS gains `prompt.created`,
`prompt.updated`, `prompt.deleted`, `prompt.run.progress`,
`prompt.run.completed`.

**Check:** the existing `smoke-ws.mjs`-style script can drive a prompt run
through the WebSocket and observe progress + completion frames.

### Phase 4 — prompt-template-manager Svelte remote

Scaffold the app following `record-collector` exactly: Svelte 5, Rsbuild + MF
plugin, `exposes: { './mount': './src/mount.ts' }`, namespaced `.ptm-app` CSS
imported as a side effect, no `shared` block. The UI:

- **Prompt list** (left) — all templates from prompt-store, create/select.
- **Editor** (centre) — name, description, a `<textarea>` for `content`,
  `output_column` field. A side panel lists the columns of a chosen record set
  so the author can see what `{{tokens}}` are available (click-to-insert is a
  nice-to-have; manual typing is fine for the skeleton).
- **Run control** — pick a record set, see the bind check (bound vs unbound
  tokens), set `row_limit`, run. A progress line consumes `prompt.run.progress`.
  On `prompt.run.completed`, link to the derived record set.

**Check:** standalone on its own port — author a prompt, run it, see the
derived set.

### Phase 5 — wire into the shell

Add `prompt-template-manager` to the `REMOTES[]` array in `shell/src/App.svelte`
(six lines). Two tiles in the shell nav.

**Check:** open the shell, switch between Record Collector and Prompt Template
Manager tabs, run an enrichment from the prompt tab, switch to the record tab,
see the derived record set in the list.

## Proof-of-life at the end

A demo sequence:

1. In Prompt Template Manager, author **"Find Organisation URL"** —
   content: *"You are a research assistant. Find the official website URL for
   the organisation named `{{Prospect / Organization}}`. Respond with only the
   URL, nothing else."*, `output_column: url`.
2. Run it against the Master Pipeline Tracker record set, `row_limit: 5`.
3. Progress ticks 1→5. A derived record set **"Master Pipeline Tracker + url"**
   appears.
4. Switch to Record Collector — the derived set is in the list, marked as
   derived; its rows have a populated `url` column the parent never had.
5. Author **"Crawl & Fetch Brand Assets"** using `{{url}}` — run it against the
   *derived* set (where `url` now exists). The dependency chain works.

That last step is the whole thesis: enrichments compose, each one a derived
record set, each consumable by the next prompt.

## Out of scope (deliberately)

- **Full-set runs / fan-out concurrency.** `row_limit` defaults to 25; running
  all 207 rows with proper concurrency + rate-limit handling is the
  [[Multi-Agent-Research-Fan-Out-Per-Row]] work, a later plan.
- **Structured / multi-column output.** One prompt → one `output_column`.
  JSON/tool-use output is later.
- **BYOK.** Key is server-side in prompt-runner. Client-supplied keys later.
- **The other four pipeline stages** (request-reviewer, response-reviewer,
  highlight-collector, insight-manager). prompt-runner currently does its own
  minimal pre-flight (the bind check) and post-flight (trim the response);
  splitting those into their own review microfrontends is future work.
- **Prompt versioning.** The legacy schema had `usageCount` / `lastUsed`;
  not built. A prompt is mutable; no history.
- **Caching of LLM responses.** Every run is fresh calls. A response cache
  (keyed on prompt + row-field-values) is an obvious later optimisation.

## Open questions to settle before Phase 2

- **Anthropic SDK error handling.** Rate limits (429), overloaded (529),
  per-row failures — does one bad row fail the whole run, or does the derived
  set carry partial results with an error marker in the cell? Walking-skeleton
  proposal: per-row try/catch, failed cells get a value like
  `"[error: <message>]"`, the run completes with whatever succeeded.
- **`.env` ergonomics.** Confirm the user has an `ANTHROPIC_API_KEY` to put in
  `augment-it/.env`, or whether it lives in `~/.secrets` and should be sourced
  into the shell before `docker compose up`.
- **Token-to-column matching with spaces.** Columns like
  `Prospect / Organization` have spaces and slashes. `{{Prospect / Organization}}`
  must match verbatim. The regex extracts everything between `{{` and `}}` and
  trims — exact-string match against column names. No normalisation.

## See also

- [[Augment-It-Workspace-Walking-Skeleton]] — the substrate this builds on.
- [[Augment-It-as-CRM-Augmentation-Pipeline]] — names this the Configure stage.
- [[Tanuj-Prompt-Manager-As-Built]] — the legacy scaffold; schema lifted here.
- [[Multi-Agent-Research-Fan-Out-Per-Row]] — the per-row fan-out the
  `row_limit`-capped runner is a first step toward.
- [[feedback_augment_it_dynamic_schema]] — why a derived set's new column is
  just a schema growth, not a fixed-shape change.
