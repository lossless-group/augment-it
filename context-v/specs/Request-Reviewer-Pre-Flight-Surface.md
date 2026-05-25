---
title: "Request Reviewer — the Pre-Flight Surface"
lede: "Before a prompt fires, you should be able to see exactly what is about to leave the building. request-reviewer is the augment-it stage that shows the resolved request — the prompt template with every {{token}} replaced by a real row's property value — lets you pick which model it goes to, optionally shows the literal JSON request body, and then fires it. The hard part is not the UI; it is guaranteeing the request you reviewed is byte-identical to the request that sends. That guarantee is the spec."
date_created: 2026-05-21
date_modified: 2026-05-25
date_completed: 2026-05-22
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
semantic_version: 0.0.0.2
revisions:
  - 2026-05-25 — Status swept to Shipped; remote went live per changelog 2026-05-22_02..03.
tags:
  - Spec
  - Augment-It
  - Request-Reviewer
  - Pre-Flight
  - Module-Federation
  - Model-Selection
  - Prompt-Runner
status: Shipped
---

# Request Reviewer — the Pre-Flight Surface

## What this is

`request-reviewer` is the third federated remote of augment-it, the pre-flight
inspection stage of the enrichment pipeline. Today it is an empty `apps/`
directory with a one-line README. This spec defines what gets built into it.

Pipeline position:

```
prompt-template-manager  ──▶  request-reviewer  ──▶  [ model call ]  ──▶  response-reviewer  ──▶  highlight-collector  ──▶  insight-manager
   (author the prompt)        (PRE-flight: this spec)                     (POST-flight)            (distill)              (land in CRM)
```

`request-reviewer` is the **pre-flight** counterpart to the response-reviewer.
Where [[Why-Response-Reviewer-and-Highlight-Collector-Exist]] governs
inspecting what came *back*, this spec governs inspecting what is about to go
*out*. The README's framing — "reviewing requests to make sure the Prompt
Template is appropriately applied" — is exactly right; this spec makes it
concrete.

### Three things it does

1. **Show the resolved request.** The authored prompt template with every
   `{{token}}` replaced by the matching property value from a real record
   row. This is the proven part — Tanuj's build already did template-with-
   values ([[Tanuj-Request-Reviewer-As-Built]], the `generateDefaultPrompt`
   logic). augment-it's `{{token}}` model supersedes Tanuj's auto-generated
   default prompt, but the *idea* — "render the request with the data filled
   in" — is prior art that worked.
2. **Pick the model.** A toggle choosing which model the request fires
   against. This is **net-new** — today the model is a server-side env var.
3. **Show the JSON request.** An optional toggle revealing the literal
   API request body — `{ model, max_tokens, messages, tools }`. Net-new.
   Rationale: provider API request shapes get richer as their docs evolve;
   seeing the literal body is a learning and debugging surface.

### What it does NOT do (non-goals)

- It does not render or handle the model's *response* — that is the
  response-reviewer's job.
- It does not edit prompt templates — that is prompt-template-manager.
- It does not extract highlights or write back to a CRM.
- It does not inspect the model's *response* — but firing exits directly to
  the response-reviewer, the post-flight pair built alongside this one. See
  the companion spec [[Response-Reviewer-and-Response-Store]].

## The core architecture decision — one request builder, two callers

This is the load-bearing decision. Everything else is UI.

**Today, the model request is built entirely inside `prompt-runner`:**

- `services/prompt-runner/src/template.ts` — `fillTemplate(content, fields)`
  does the `{{token}}` substitution.
- `services/prompt-runner/src/anthropic.ts` — `runPrompt(filledPrompt, tools)`
  assembles the Anthropic `messages.create()` body inline and sends it. The
  model is `process.env.LLM_MODEL ?? 'claude-opus-4-7'`, fixed per container.

request-reviewer needs to *show* that request before it fires. There are two
ways to get the resolved request in front of the user, and only one is
acceptable:

| Approach | Verdict |
|---|---|
| Reimplement `fillTemplate` + body assembly in the request-reviewer frontend | ❌ **Rejected.** This is exactly the copy-pasted-`generateDefaultPrompt` smoking gun [[Tanuj-Request-Reviewer-As-Built]] calls out. A frontend copy drifts from the runner; the reviewer would eventually lie about what fires. |
| A service capability that builds the request without sending it; the frontend just displays the result | ✅ **Chosen.** One code path builds the request; the preview and the real fire both go through it. The previewed request is *guaranteed* identical to the fired request because it is the same function. |

### The mechanism

1. **Extract a pure `buildRequest()`** in prompt-runner — a new
   `services/prompt-runner/src/request.ts` — that takes a filled prompt plus
   `{ model, tools, max_tokens }` and returns the exact Anthropic
   `messages.create()` request object. `runPrompt()` is refactored to call
   `buildRequest()` and then send; it no longer assembles the body inline.

2. **Add a `prompt.preview` capability.** A new NATS subject
   `prompt.preview.requested`, handled by prompt-runner. It takes
   `(prompt_id, record_set_id, row_id, model?)` and performs: fetch the
   prompt, fetch that one row, `fillTemplate`, `buildRequest` — and returns
   the result **without ever calling Anthropic**. No LLM call, no cost, fast.

3. **request-reviewer invokes `prompt.preview`** through the workspace
   WebSocket like any other capability, and displays what comes back.

```
                    ┌──────────────────────────────────────┐
                    │  prompt-runner                        │
                    │                                       │
  prompt.preview ──▶ │  fillTemplate ─▶ buildRequest ─▶ return│  (no send)
                    │                      │                │
  prompt.run     ──▶ │  fillTemplate ─▶ buildRequest ─▶ send  │  (fires)
                    │                                       │
                    └──────────────────────────────────────┘
                       one fillTemplate, one buildRequest,
                       two entry points — preview cannot drift from run
```

## Model selection — env var becomes a per-request argument

Today `anthropic.ts` pins the model: `const MODEL = process.env.LLM_MODEL ??
'claude-opus-4-7'`. The model toggle requires making model a per-request
choice.

### The model registry

A small registry is the single source of truth the model toggle renders
from. It lives in **`packages/workspace`** as `models.ts` — every remote
already imports `@augment-it/workspace`, and prompt-runner (a standalone
Docker service) cannot consume a workspace package across its build context
anyway. prompt-runner does **not** need the registry: it accepts whatever
`model` string is passed and lets the Anthropic API validate it. (The first
draft said `packages/config`; that is a bare stub and unreachable from the
service build — `packages/workspace` is the pragmatic home.)

| `id` | `label` | `note` |
|---|---|---|
| `claude-opus-4-7` | Opus 4.7 | Most capable. Default. Judgment-class enrichment. |
| `claude-sonnet-4-6` | Sonnet 4.6 | Cost-sensible for large per-row batches. |
| `claude-haiku-4-5-20251001` | Haiku 4.5 | Cheapest, fastest. Simple lookup-class enrichment. |

The `note` column maps loosely onto the lookup vs judgment distinction from
[[Original-and-Enhanced-Record-Instances]] — a hint, not an enforced rule.

### Threading `model` through

- `prompt.preview` and `prompt.run` both accept an optional `model`.
- `buildRequest` (the new `request.ts`) takes `model` and falls back to the
  `LLM_MODEL` env var when absent, so existing callers that pass nothing
  behave exactly as before.
- prompt-runner does **not** validate `model` — it passes the string
  straight to the Anthropic SDK, which rejects an unknown model with a
  clear API error. The registry is the frontend's list, not a server gate.
- **Persistence:** the model choice is **per-run and transient** for this
  spec — request-reviewer holds it in component state, defaulting to the
  registry default. A future `default_model?` field on `PromptTemplate`
  (so a prompt remembers its model) is **flagged, not built** — it is
  prompt-template-manager scope.

## Max tokens — a free numeric field

`max_tokens` is the ceiling on the model's *output*, not a request size: you
are billed on tokens actually generated, so a generous ceiling the model
never reaches costs nothing. The real failure mode is setting it too *low* —
the response truncates mid-thought with `stop_reason: "max_tokens"`.

request-reviewer exposes `max_tokens` as a **free numeric input**, defaulting
to **4096** (the current `LLM_MAX_TOKENS` env value, comfortable for
judgment-class output). The user types any value — lower for fast
lookup-class batches, higher for research-heavy `web_search` runs whose
narration and tool-call blocks eat the budget.

`max_tokens` threads exactly like `model`: an optional argument on
`prompt.preview` and `prompt.run`, defaulting to the env var when absent,
passed straight into `buildRequest`. Because the previewed `request_body`
comes from that same `buildRequest`, the JSON view always shows the
`max_tokens` that will actually fire.

## Row stepping — one UI for single-record and batch

Per the resolved design, request-reviewer serves both the single-record
enrich flow and the batch path with one row-stepped UI.

A prompt run against N rows is N distinct filled requests. The reviewer holds
a `(prompt, record_set, rowIndex)` cursor and shows **one row's resolved
request at a time**, with prev/next stepping. Each step re-invokes
`prompt.preview` for that row.

Two fire actions exit the stage:

- **Fire this row** — single-record. Dispatches `prompt.run` with
  `row_ids: [row_id]` and the chosen `model`. This is the pre-flight surface
  for the per-record enrich control from [[Build-the-Shell-Tiling-and-Peek-Deck]].
- **Fire whole set** — batch. Dispatches `prompt.run` with `record_set_id`,
  `row_limit`, and `model`, as prompt-template-manager does today.

### Dependency — `row_ids` on `prompt.run`

"Fire this row" needs `prompt.run` to accept a `row_ids` argument.
`run.ts` currently selects rows by `rows.slice(0, limit)`. The minimal change:
when `row_ids` is present, filter to those rows instead of slicing by limit.
This `row_ids` *input* is small and stable, and **this spec includes it**.

Note the seam: [[Original-and-Enhanced-Record-Instances]]'s record-instance
fold will later change what `prompt.run` *does with the result* (accumulate
into one enhanced instance vs. mint a new derived set). The `row_ids` input
is orthogonal to that — the fold reshapes the output, not the input. Adding
`row_ids` now does not pre-empt the fold; it is the input side the fold
assumes already exists.

## The UI

A single-pane layout, themed entirely with the `var(--color-*)` / `var(--fx-*)`
tokens from [[2026-05-21_06_Three-Mode-Theme-System]] — no hardcoded color.

```
┌─ Request Reviewer ───────────────────────────────────────────┐
│ Prompt:  [ Company Summary        ▾ ]                         │
│ Records: [ Master Pipeline Tracker ▾ ]   Row [ ◀ 3 / 25 ▶ ]   │
│ Model:   ( Opus 4.7 ) ( Sonnet 4.6 ) ( Haiku 4.5 )            │
│ Tokens:  max_tokens [ 4096 ]                                  │
│ View:    [ Resolved prompt ] [ JSON request ]                 │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  ── Resolved prompt ──                                        │
│  Summarize the company «Acme Corp» operating in the           │
│  «Logistics» sector. Their website is «acme.example».         │
│         ▲ {{Company}}      ▲ {{Sector}}       ▲ {{Website}}   │
│                                                               │
│  ── Token binding ──                                          │
│  {{Company}}  → "Acme Corp"        ✓ bound                    │
│  {{Sector}}   → "Logistics"        ✓ bound                    │
│  {{Website}}  → "acme.example"     ✓ bound                    │
│  {{Founded}}  → (no such column)   ✗ unbound                  │
│                                                               │
├───────────────────────────────────────────────────────────────┤
│              [ Fire this row ]   [ Fire whole set · limit 25 ]│
└───────────────────────────────────────────────────────────────┘
```

- **Resolved prompt view** (default) — the filled template as prose, with
  each substituted span visibly marked so the eye catches what came from
  data versus what was authored.
- **JSON request view** (toggle) — the exact `messages.create()` request
  object, pretty-printed:
  ```json
  {
    "model": "claude-opus-4-7",
    "max_tokens": 4096,
    "messages": [{ "role": "user", "content": "Summarize the company …" }],
    "tools": [{ "type": "web_search_20260209", "name": "web_search" }]
  }
  ```
  `tools` appears only when the prompt declares `web_search` — it is set in
  prompt-template-manager and shown here **read-only**, never toggled
  per-run, so the stored prompt and the fired request cannot diverge.
  `max_tokens` reflects the free numeric field above.
- **Token binding panel** — every `{{token}}` in the template, its resolved
  value, and a bound/unbound mark. An unbound token (no matching column in
  the record set) is the pre-flight failure the reviewer exists to catch;
  the fire buttons disable while any token is unbound, mirroring the bind
  check `run.ts` already enforces server-side.

### Entry points

request-reviewer is reachable two ways:

1. **Standalone** — its own pickers (prompt dropdown, record-set dropdown,
   row stepper), fully self-sufficient as a remote.
2. **Handoff** — it listens for a `augment-it:review-request` window event
   carrying `{ prompt_id, record_set_id, row_id? }`, so prompt-template-
   manager or the per-record enrich control can hand off a pre-selected
   target. Same window-event pattern as `augment-it:enrich-record` from
   [[Build-the-Shell-Tiling-and-Peek-Deck]].

### Co-existence pairing

request-reviewer pairs naturally with prompt-template-manager in the shell's
co-existence split — tweak the prompt on one side, watch the resolved request
update on the other. A `PAIRINGS` entry in `shell/src/remotes.ts`
(`promptTemplateManager + requestReviewer`) wires this; recommended but
deferrable to the last phase.

## Service changes

### `services/workspace/src/capabilities.ts`

- Add `'prompt.preview': 'prompt.preview.requested'` to
  `CAPABILITY_TO_SUBJECT`.
- Add a short timeout for it in `CAPABILITY_TIMEOUTS_MS` (~5 000 ms — no LLM
  call, so it must be fast; the default 5 s is fine, so this is optional).
- `prompt.run` already routes and already has its 600 000 ms timeout — the
  new `model` / `row_ids` args ride the existing subject.

### `services/prompt-runner/`

- **New `src/request.ts`** — the pure `buildRequest(filledPrompt, { model,
  tools, max_tokens })` function. The single request-body assembler.
- **New `src/preview.ts`** — the `prompt.preview.requested` handler: fetch
  prompt, fetch the one row, `fillTemplate`, `buildRequest` (with the passed
  `model` / `max_tokens`), return `{ filled_prompt, request_body, bind,
  unbound_tokens }`. No send.
- `src/anthropic.ts` — `runPrompt` accepts `model`, delegates body assembly
  to `buildRequest`.
- `src/run.ts` — accept `model`, `max_tokens`, and `row_ids`; thread `model`
  and `max_tokens` into `runPrompt`; when `row_ids` is present, select those
  rows instead of slicing by `row_limit`.
- `src/server.ts` — subscribe to `prompt.preview.requested` and dispatch it
  to the preview handler; the `prompt.run.requested` payload type gains
  optional `model`, `max_tokens`, and `row_ids`.

### `packages/workspace`

- **New `src/models.ts`** — the model registry (`id`, `label`, `note`) plus
  `DEFAULT_MODEL` / `DEFAULT_MAX_TOKENS`, and the `ModelId` / `ModelEntry`
  types. Consumed by the request-reviewer toggle; re-exported from the
  package index.

### `packages/workspace/src/types.ts`

- `TokenBinding` type — one `{{token}}`, its resolved value, a bound flag.
- `PreviewResult` type — `{ filled_prompt: string; request_body: unknown;
  bind: TokenBinding[]; unbound_tokens: string[] }`.
- `ResponseRecord` / `ResponseFlag` types (shared with the response-reviewer
  spec).
- `prompt.run` / `prompt.preview` arg types gain optional `model` and
  `max_tokens`; `prompt.run` also gains optional `row_ids`.
- `PromptTemplate` — `default_model?` is **noted as a future field**, not
  added now.

## Federation wiring

request-reviewer is a federated remote built exactly like
prompt-template-manager ([[2026-05-21_03_Shell-Federation-Three-Lessons]]):
expose a `mount` function, no `shared` block, ship CSS as a side-effect
import.

- **`apps/request-reviewer/`** gets: `rsbuild.config.ts`
  (`name: 'requestReviewer'`, `exposes: { './mount': './src/mount.ts' }`,
  `port: 3004`, `dev.assetPrefix: 'http://localhost:3004'`), `package.json`,
  `tsconfig.json`, and `src/{mount.ts, index.ts, App.svelte, app.css}`.
- **Port 3004** — record-collector is 3002, prompt-template-manager 3003;
  3004 is next. (workspace service 3001, shell 3100.)
- **`shell/rsbuild.config.ts`** — add
  `requestReviewer: 'requestReviewer@http://localhost:3004/remoteEntry.js'`
  to the `remotes` map.
- **`shell/src/remotes.ts`** — add a `REMOTES` entry
  (`id: 'requestReviewer'`, `label: 'Request Reviewer'`,
  `importMount: () => import('requestReviewer/mount')`); optionally a
  `PAIRINGS` entry for the prompt-template-manager pairing.

## Build phases

### Phase 1 — the service preview path (no UI)

`buildRequest()` extraction, `prompt.preview` capability + handler, the
the `packages/workspace` model registry, and `model` / `max_tokens` /
`row_ids` on `prompt.run`.
Verifiable by invoking `prompt.preview` directly over the workspace
WebSocket and asserting the returned `request_body` matches what `prompt.run`
would send. **This phase de-risks the whole feature** — once the preview
equals the fire, the UI is decoration.

### Phase 2 — the remote scaffold + federation wiring

`apps/request-reviewer/` rsbuild config, `mount.ts`, `index.ts`, a minimal
`App.svelte` that connects to the workspace singleton and renders a
placeholder. Wire it into the shell (`rsbuild.config.ts` + `remotes.ts`).
The walking skeleton of the remote — it mounts in the shell and connects.

### Phase 3 — the review UI

Prompt + record-set pickers, the row stepper, the resolved-prompt view with
substitution marking, the model toggle, the JSON-request toggle, the token-
binding panel. Driven by `prompt.preview`. No firing yet.

### Phase 4 — fire actions + integration

"Fire whole set" and "Fire this row" wired to `prompt.run` (with `model`,
`max_tokens`, and — for the single row — `row_ids`). The
`augment-it:review-request` handoff event listener. The co-existence
`PAIRINGS` entry. A theme-token audit across all three modes.

Firing exits to the response-reviewer; that remote and its `response-store`
are specified in the companion document
[[Response-Reviewer-and-Response-Store]] and built in the same body of work.

## Resolved decisions

The three open questions from the first draft are now settled:

- **`tools` selection stays prompt-only.** `web_search` is set in
  prompt-template-manager; request-reviewer shows it in the JSON view
  read-only and never toggles it per-run. The stored prompt and the fired
  request cannot diverge.
- **`max_tokens` is a free numeric field**, default 4096 — see
  [§Max tokens](#max-tokens--a-free-numeric-field).
- **Firing exits to response-reviewer**, which is built alongside
  request-reviewer rather than deferred. The pre-flight and post-flight
  surfaces ship as a pair — see [[Response-Reviewer-and-Response-Store]].

## Still open

- **Multi-provider (OpenAI and beyond).** This spec is Anthropic-only —
  `anthropic.ts` is the single LLM caller and the model registry holds only
  Claude models. Supporting other providers is a larger decision (a provider
  abstraction, a second key, divergent `tools` schemas) and belongs in its
  own exploration, not here.

## See also

- [[Response-Reviewer-and-Response-Store]] — the companion spec; the
  post-flight surface request-reviewer's fire exits into, built alongside.
- [[Why-Response-Reviewer-and-Highlight-Collector-Exist]] — the blueprint
  rationale for the post-flight stages.
- [[Tanuj-Request-Reviewer-As-Built]] — the prior art; template-with-values
  worked, and its copy-pasted-logic smoking gun is why preview is a service
  capability, not a frontend reimplementation.
- [[Original-and-Enhanced-Record-Instances]] — the record-instance model;
  `row_ids` on `prompt.run` is the input seam the fold assumes.
- [[Build-the-Shell-Tiling-and-Peek-Deck]] — the enrich control and the
  window-event handoff pattern request-reviewer reuses.
- [[Augment-It-as-CRM-Augmentation-Pipeline]] — the full pipeline this stage
  sits inside.
