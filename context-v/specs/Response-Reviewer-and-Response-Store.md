---
title: "Response Reviewer and Response Store — the Post-Flight Surface"
lede: "Once a request has fired, the verbose prose the model returns has to be inspected before any of it reaches a CRM cell. response-reviewer is that inspection surface — and it cannot exist until a fired response becomes a first-class stored object instead of a bare cell value. So this spec defines two things at once: a new response-store service that records every fired response with its request, model, and review flag; and the response-reviewer remote that reads it, lets a human triage good/partial/wrong, and either accepts a whole response straight into a cell or sends the row back to be re-run."
date_created: 2026-05-22
date_modified: 2026-05-22
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
semantic_version: 0.0.0.1
tags:
  - Spec
  - Augment-It
  - Response-Reviewer
  - Response-Store
  - Post-Flight
  - Human-in-the-Loop
  - Module-Federation
status: Draft
---

# Response Reviewer and Response Store — the Post-Flight Surface

## What this is

This spec is the companion to [[Request-Reviewer-Pre-Flight-Surface]]. The two
ship as a pair — pre-flight and post-flight — and are built in one body of
work. Where request-reviewer governs inspecting what goes *out*, this governs
inspecting what comes *back*.

It defines **two** things:

1. **`response-store`** — a new backend service. The store of record for every
   fired LLM response.
2. **`response-reviewer`** — the fourth federated remote. The UI that reads
   response-store, triages responses, and routes them onward.

The rationale for why this stage must exist — the verbose-prose-to-tabular
bridge, why structured output does not remove the need for a human integrity
check — is already written in [[Why-Response-Reviewer-and-Highlight-Collector-Exist]].
This spec is the *build*, not the *why*.

Pipeline position:

```
request-reviewer ──▶ [ model call · prompt-runner ] ──▶ response-store
                                                              │
                                                              ▼
                                                       response-reviewer
                                                       (triage)
                                                       │      │      │
                              accept whole response ◀──┘      │      └──▶ needs-rerun
                              → CRM cell                      ▼           → request-reviewer
                                                       highlight-collector
                                                       (span distill · future)
```

### Why response-store has to exist first

Today a fired prompt produces a **derived record set** in which the model's
response text simply *is* a cell value. Nothing records the request that
produced it, the model that ran it, or any review judgement. `prompt-runner`
writes a cell and moves on.

response-reviewer's whole job — present the verbose response, the row it
enriched, the prompt and model that produced it, and let a human flag it —
requires the response to be a **first-class object**. That object has to live
somewhere, and per the resolved design it lives in a **new `response-store`
service**, mirroring `prompt-store`.

### Non-goals

- **highlight-collector is not in this spec.** Span-selection distillation is
  a separate stage with a separate interaction shape — the blueprint is
  explicit that review and distillation must not be collapsed. response-reviewer
  has a *button* that hands off to highlight-collector; building
  highlight-collector is a future spec.
- response-reviewer does not author prompts (prompt-template-manager) or
  build requests (request-reviewer).
- The terminal write-back into an external CRM (HubSpot, Airtable) is out of
  scope — see [[Augment-It-as-CRM-Augmentation-Pipeline]].

## The Response object

```ts
type ResponseFlag = 'good' | 'partial' | 'wrong' | 'needs-rerun';

type Response = {
  response_id: string;
  run_id: string;            // groups the N responses of one prompt.run
  prompt_id: string;
  row_id: string;
  record_set_id: string;     // the set the row belongs to
  model: string;             // the model that actually ran
  request_body: unknown;     // the exact messages.create() body that fired
  response_text: string;     // the verbose model output, as returned
  flag: ResponseFlag | null; // null until a human triages it
  accepted: boolean;         // a value from this response reached a cell
  created_at: string;
  reviewed_at: string | null;
};
```

`request_body` is the same object request-reviewer previews — storing it means
response-reviewer can show the exact request post-hoc, closing the loop. A
`run_id` groups one `prompt.run`'s responses so the reviewer can step "3 / 25"
through a batch.

## The response-store service

A new service at `services/response-store/`, built to mirror
`services/prompt-store/` exactly — same shape, same conventions:

| File | Role |
|---|---|
| `src/server.ts` | NATS connection; subscribes to the `response.*.requested` subjects |
| `src/store.ts` | Persistence — a `data/responses.json` file (later a DB), same as prompt-store's `data/prompts.json` |
| `src/handlers.ts` | The subject handlers |
| `Dockerfile`, `package.json`, `tsconfig.json` | Standard service scaffold |

### NATS subjects

| Subject | Purpose |
|---|---|
| `response.create.requested` | prompt-runner records a fired response |
| `response.list.requested` | list responses — filterable by `run_id`, `record_set_id`, `prompt_id`, `flag` |
| `response.get.requested` | one response by id |
| `response.flag.requested` | set the triage flag on a response |
| `response.accept.requested` | accept a response's value into its row's cell (see below) |

### Broadcast events

`response.created` and `response.flagged` are published as broadcast events so
mounted remotes update live. They are added to the workspace service's
broadcast allowlist (`services/workspace/src/ws.ts`, alongside
`prompt.run.progress` / `prompt.run.completed`).

## prompt-runner — additive change

`prompt-runner` keeps doing exactly what it does today: run the prompt per row,
build the derived record set, create it. **One thing is added:** for each row,
after `runPrompt` returns, prompt-runner publishes a `response.create.requested`
carrying the `Response` object — `request_body` (the same one `buildRequest`
produced for request-reviewer's preview), `model`, `response_text`, `row_id`,
`prompt_id`, `record_set_id`, and the `run_id` for the batch.

This is **purely additive**. The derived record set still appears in
record-collector as before — that is the *data*. response-store is the
*review log* — request, model, flag, the verbose original. They are
complementary; neither replaces the other. Crucially, this does **not** block
on the record-instance fold ([[Original-and-Enhanced-Record-Instances]]):
prompt-runner's output flow is unchanged, a side-channel publish is all that
is added.

## The accept path — triage plus whole-response accept

Per the resolved design, response-reviewer does **both** triage and a
whole-response accept shortcut.

**Triage** is the high-throughput path: a human flags each response
`good` / `partial` / `wrong` / `needs-rerun` via `response.flag`. Read-mostly,
fast, glance-and-judge — exactly the operation the blueprint describes.

**Whole-response accept** is the shortcut for **lookup-class** enrichments
([[Original-and-Enhanced-Record-Instances]] §6): when the entire response *is*
the answer — a URL, a handle, a single figure — forcing it through
highlight-collector's span-selection is overkill. `response.accept.requested`:

1. Marks the response `accepted: true` and flag `good`.
2. Writes the value into the row's output-column cell via row-store's existing
   `row.update` capability. If the reviewer edited the text before accepting,
   the edited value is written; otherwise the raw `response_text`.

`response.accept` is handled by response-store, which issues the
`row.update.requested` itself — one capability, one atomic human action,
server-side orchestration. (The alternative — response-reviewer firing
`response.flag` + `row.update` as two invokes — is acceptable but leaves the
two writes un-atomic; the single capability is preferred.)

**Judgment-class** responses are not accepted whole. They are flagged, and the
ones worth keeping go to highlight-collector for careful span distillation —
the "Distill" button below.

## The UI

Read-mostly, high-throughput, themed entirely with `var(--color-*)` /
`var(--fx-*)` tokens ([[2026-05-21_06_Three-Mode-Theme-System]]).

```
┌─ Response Reviewer ──────────────────────────────────────────────┐
│ Run: Master Pipeline Tracker + summary       Response [ ◀ 3/25 ▶ ]│
│ Filter: ( all )( unflagged )( good )( partial )( wrong )          │
├────────────────────────────┬─────────────────────────────────────┤
│  Context                   │  Response                           │
│  Row:    Acme Corp          │  Acme Corp is a logistics company   │
│  Prompt: Company Summary    │  founded in 2014, operating across  │
│  Model:  Opus 4.7           │  [ rendered verbose markdown —      │
│  Output col: summary        │    links, code blocks, tables,      │
│  Prompt fired:              │    citations preserved ]            │
│   "Summarize Acme Corp …"   │                                     │
├────────────────────────────┴─────────────────────────────────────┤
│ Flag:  ( good ) ( partial ) ( wrong ) ( needs-rerun )             │
│ [ Accept whole response → cell ]   [ Re-run in request-reviewer ] │
│ [ Distill in highlight-collector ]            (judgment-class)    │
└───────────────────────────────────────────────────────────────────┘
```

- **Response stepper** — prev/next across a `run_id`'s responses; the filter
  row narrows to unflagged / by-flag for triage throughput.
- **Context pane (left)** — the prompt name, the record set, the model, the
  output column, and the **prompt that fired** rendered as plain text (the
  filled-in question, read from the stored `request_body`'s message content).
  The **JSON request view belongs to request-reviewer, not here** — the two
  remotes are deliberately not conflated: request-reviewer owns the request
  (and its under-the-hood JSON), response-reviewer owns the response.
- **Response pane (right)** — the verbose `response_text` rendered through a
  lightweight markdown renderer, structure preserved. The reviewer may edit
  the text inline before a whole-response accept.
- **Flag row** — the four triage flags, written via `response.flag`.
- **Accept whole response → cell** — the lookup-class shortcut above.
- **Re-run in request-reviewer** — for `needs-rerun`: dispatches the
  `augment-it:review-request` window event (the handoff
  [[Request-Reviewer-Pre-Flight-Surface]] defines) preloaded with this
  response's `prompt_id` + `row_id`, so the human can adjust model or prompt
  and fire again.
- **Distill in highlight-collector** — present but **stubbed/disabled** until
  highlight-collector is built; it is the judgment-class path.

## Federation wiring

Built like every other remote — expose a `mount` function, no `shared` block,
CSS as a side-effect import ([[2026-05-21_03_Shell-Federation-Three-Lessons]]).

- **`apps/response-reviewer/`** gets `rsbuild.config.ts`
  (`name: 'responseReviewer'`, `exposes: { './mount': './src/mount.ts' }`,
  `port: 3005`, `dev.assetPrefix`), `package.json`, `tsconfig.json`, and
  `src/{mount.ts, index.ts, App.svelte, app.css}`.
- **Port 3005** — record-collector 3002, prompt-template-manager 3003,
  request-reviewer 3004, response-reviewer 3005.
- **`shell/rsbuild.config.ts`** — add
  `responseReviewer: 'responseReviewer@http://localhost:3005/remoteEntry.js'`.
- **`shell/src/remotes.ts`** — a `REMOTES` entry (`id: 'responseReviewer'`,
  `label: 'Response Reviewer'`, `importMount: () => import('responseReviewer/mount')`),
  and a `PAIRINGS` entry pairing `responseReviewer + requestReviewer` — the
  co-existence split for the re-run loop (review a response on one side, adjust
  the request on the other).
- **`docker-compose.yml`** — add the `response-store` service container,
  alongside prompt-store / row-store / prompt-runner.

## Type and capability changes

### `packages/workspace/src/types.ts`

- `Response` and `ResponseFlag` types (as above).

### `services/workspace/src/capabilities.ts`

- Add to `CAPABILITY_TO_SUBJECT`:
  `response.list`, `response.get`, `response.flag`, `response.accept` →
  their `response.*.requested` subjects.

### `services/workspace/src/ws.ts`

- Add `response.created` and `response.flagged` to the broadcast subject
  allowlist.

## Build phases

These interleave with [[Request-Reviewer-Pre-Flight-Surface]]'s phases — see
*Combined sequencing* below.

### RR-Phase 1 — the response-store service

Scaffold `services/response-store/` (mirror prompt-store), the five
`response.*` subjects, `data/responses.json` persistence. Add the
`response.create` publish to prompt-runner's per-row loop. Add the
`response.*` capabilities and broadcast subjects to the workspace service.
Add the container to `docker-compose.yml`. Verifiable: fire a `prompt.run`,
see `Response` objects land in response-store.

### RR-Phase 2 — the remote scaffold + federation wiring

`apps/response-reviewer/` rsbuild config, `mount.ts`, `index.ts`, a minimal
`App.svelte` that connects to the workspace singleton. Wire into the shell
(`rsbuild.config.ts` + `remotes.ts`, port 3005).

### RR-Phase 3 — the review UI

The response stepper and filter row, the context pane (prompt / record set /
model / output column / the prompt-that-fired as plain text — no JSON view,
that is request-reviewer's), the response pane, the four triage flag buttons
wired to `response.flag`.

### RR-Phase 4 — accept path + integration

`response.accept` (whole-response → cell, with optional inline edit). The
`needs-rerun` → `augment-it:review-request` handoff into request-reviewer. The
stubbed "Distill" button. The `responseReviewer + requestReviewer` co-existence
pairing. A theme-token audit across all three modes.

## Combined sequencing (both specs)

The two specs touch `prompt-runner` and the workspace service together, so the
service work is done once, up front:

1. **Service layer** — request-reviewer Phase 1 (`buildRequest`,
   `prompt.preview`, model registry, `model`/`max_tokens`/`row_ids` on
   `prompt.run`) **and** RR-Phase 1 (`response-store`, prompt-runner's response
   publish). Both edit `prompt-runner` and `capabilities.ts`; doing them
   together avoids touching those files twice.
2. **request-reviewer remote** — request-reviewer Phases 2–4.
3. **response-reviewer remote** — RR-Phases 2–4.

Each remote, once its service layer exists, is independently shippable.

## Open / deferred

- **highlight-collector** — the judgment-class span-distillation stage. Its
  own future spec; response-reviewer ships with the handoff button stubbed.
- **Deep Research source attribution.** When a response carries cited sources,
  the reviewer should render them inline and the eventual highlight-collector
  should attribute extracted highlights to specific sources
  ([[Why-Response-Reviewer-and-Highlight-Collector-Exist]] anti-patterns).
  Walking skeleton renders plain markdown; source-aware rendering is flagged.
- **Record-instance fold interaction.** When the fold lands, "accept → cell"
  writes into the round's enhanced instance rather than a derived set. The
  `response.accept` → `row.update` seam is where that change applies; the
  Response object itself is unaffected.

## See also

- [[Request-Reviewer-Pre-Flight-Surface]] — the companion pre-flight spec;
  built in the same body of work.
- [[Why-Response-Reviewer-and-Highlight-Collector-Exist]] — the blueprint
  rationale: the verbose-prose-to-tabular bridge and why a human check is
  irreducible.
- [[Original-and-Enhanced-Record-Instances]] — the lookup vs judgment split
  that decides whole-response-accept vs distillation; the enhanced-instance
  model "accept → cell" will eventually write into.
- [[Augment-It-as-CRM-Augmentation-Pipeline]] — the full pipeline; the terminal
  write-back is its final stage.
