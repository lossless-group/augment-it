---
title: "Pre-flight and post-flight — the service layer beneath two new review stages"
lede: "augment-it is growing two new pipeline stages: a request-reviewer that shows you exactly what is about to be sent to the model, and a response-reviewer that lets you triage what came back. This entry is the service layer beneath both — the no-UI plumbing. Its load-bearing idea is small and strict: there is now exactly one function that assembles a model request, so the request you preview is byte-identical to the request that fires. Alongside it, a new response-store service turns every fired response from a throwaway cell into a first-class object you can inspect and flag. The two frontends that sit on top are their own story — coming next."
publish: true
date_created: 2026-05-22
date_modified: 2026-05-22
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
tags:
  - Augment-It
  - Request-Reviewer
  - Response-Reviewer
  - Response-Store
  - Prompt-Runner
  - Pre-Flight
  - Module-Federation
  - NATS
files_changed:
  - context-v/specs/Request-Reviewer-Pre-Flight-Surface.md
  - context-v/specs/Response-Reviewer-and-Response-Store.md
  - services/prompt-runner/src/request.ts
  - services/prompt-runner/src/preview.ts
  - services/prompt-runner/src/anthropic.ts
  - services/prompt-runner/src/run.ts
  - services/prompt-runner/src/server.ts
  - services/response-store/
  - services/workspace/src/capabilities.ts
  - services/workspace/src/ws.ts
  - packages/workspace/src/models.ts
  - packages/workspace/src/index.ts
  - packages/workspace/src/types.ts
  - docker-compose.yml
  - scripts/dev.sh
  - package.json
---

## Why Care?

augment-it's job is to enrich tabular records by asking an LLM. There were two
blind spots in that loop.

**Before** a prompt fired, you could not see the actual request — the prompt
template with its `{{tokens}}` filled in from a real row, the model it would
go to, the JSON body. **After** it came back, the response was simply written
into a cell; nothing recorded what was asked, which model answered, or whether
a human judged the answer any good.

Two new pipeline stages close those blind spots — a **request-reviewer**
(pre-flight) and a **response-reviewer** (post-flight). But there is a trap a
pre-flight reviewer can fall into: if it shows you a *reconstruction* of the
request — its own copy of the template-filling logic — that copy drifts from
what the runner actually sends, and the reviewer quietly starts lying.

So the substance of this work is not UI. It is making the previewed request
and the fired request **the same code**. That is the service layer, and it is
what shipped here. The frontends that render it are the next entry.

## What's New?

- **One request builder.** A new `buildRequest()` in prompt-runner is the
  single assembler of an Anthropic request body. Both the real fire and the
  no-send preview go through it — the preview *cannot* drift from the fire.
- **A `prompt.preview` capability.** Builds the exact request for one row —
  filled template, JSON body, per-token binding — and returns it **without
  ever calling the model**. No LLM call, no cost.
- **A new `response-store` service.** Every fired response is now recorded as
  a first-class `Response` object: the request that produced it, the model,
  the verbose text, and a triage flag. Five NATS subjects —
  `response.create / list / get / flag / accept`.
- **prompt-runner records each response.** After every per-row call it
  publishes the response to `response-store`. This is purely additive — the
  derived-record-set flow is untouched.
- **Per-request `model`, `max_tokens`, `row_ids`** on `prompt.run`. The model
  is no longer a fixed server env var; `row_ids` lets a run target specific
  rows instead of slicing by a limit.
- **Two specs** written into `context-v/specs/` — the pre-flight and
  post-flight surfaces, fully designed.
- **A `pnpm stack` dev orchestrator** — one command brings the whole stack up
  in the proper order.

## The one idea — preview must equal fire

Until now the request body lived inside prompt-runner's send path: `template.ts`
substituted the `{{tokens}}`, and `anthropic.ts` assembled the
`messages.create()` body inline, right before sending it.

A request-reviewer needs to *show* that request before it fires. The wrong way
to do that is to re-implement template-filling and body-assembly in the
frontend — a second copy that drifts the first time either side changes. (This
is not hypothetical: a prior augment-it prototype shipped exactly this
duplication, and it is the documented reason this was built as a service
capability instead.)

The right way is one function, two callers:

```
                    ┌──────────────────────────────────────┐
                    │  prompt-runner                        │
                    │                                       │
  prompt.preview ──▶ │  fillTemplate ─▶ buildRequest ─▶ return│  (no send)
                    │                      │                │
  prompt.run     ──▶ │  fillTemplate ─▶ buildRequest ─▶ send  │  (fires)
                    │                                       │
                    └──────────────────────────────────────┘
```

`buildRequest()` (the new `request.ts`) is a pure function: a filled prompt
plus `{ model, maxTokens, tools }` in, an Anthropic request body out. No
network, no client. `anthropic.ts` was refactored so `runPrompt()` *sends* a
request rather than assembling one. `preview.ts` calls `buildRequest()` and
stops. Because both paths share the one assembler, the JSON the reviewer will
show is — provably — the JSON that fires.

## The response-store service

A response-reviewer cannot exist until a fired response *is something*. Today a
prompt run produces a derived record set in which the model's text simply *is*
a cell value — there is no record of the request, the model, or any judgement.

`response-store` is a new backend service, built as a structural sibling of
`prompt-store`: a NATS service with JSON-file persistence and a small CRUD
surface. It holds `Response` objects:

```ts
type Response = {
  response_id; run_id;            // run_id groups one prompt.run's responses
  prompt_id; row_id; record_set_id; output_column;
  model; request_body;            // the exact request that fired
  response_text;
  flag: 'good' | 'partial' | 'wrong' | 'needs-rerun' | null;
  accepted: boolean;
  created_at; reviewed_at;
};
```

prompt-runner now publishes a `response.create.requested` after each per-row
call. This is deliberately **additive** — fire-and-forget, a side channel. The
derived record set still gets built exactly as before; if `response-store` is
down, the publish is simply dropped and the run is unaffected. response-store
is the *review log*; the record set is the *data*. They are complementary.

The `response.accept` subject is the one that reaches back: accepting a
response marks it `good` and writes its value into the row's cell via
row-store's existing `row.update` — the lookup-class shortcut for when the
whole response *is* the answer.

## Model and max_tokens become per-request

`anthropic.ts` used to pin the model to one env var. `prompt.run` and
`prompt.preview` now both accept an optional `model` and `max_tokens`;
`buildRequest` falls back to the env defaults when they are absent, so every
existing caller behaves exactly as before. The model registry the UI's toggle
will render from lives in `@augment-it/workspace` as `models.ts` — Opus 4.7,
Sonnet 4.6, Haiku 4.5. prompt-runner does not validate against it; it passes
the string through and lets the Anthropic API be the judge.

`max_tokens` is exposed (in the spec) as a free numeric field — it is an
*output ceiling*, billed as used, so erring generous is cheap and erring
stingy truncates.

## One honest note — the SDK lag

Extracting `buildRequest` with an explicit return type surfaced a latent type
hole the old inline conditional-spread had hidden: the runner targets the
web-search tool version `web_search_20260209`, but the installed
`@anthropic-ai/sdk` (0.69) only types `web_search_20250305`. Phase-1's contract
is that fire behaviour does not change, so the exact wire value was
**preserved** and cast through `ToolUnion`, with a comment. Reconciling the
web-search tool version against the SDK is a separate, deliberate decision —
not something to slip into a refactor.

## One command to run it all

Bringing augment-it up by hand means a Docker stack *and* a set of rsbuild dev
servers, and getting them tangled (running the services in both places) puts
duplicate subscribers on NATS. So there is now an orchestrator:

```bash
pnpm stack up        # backend (Docker) → wait → frontend (rsbuild)
pnpm stack down      # stop the backend
```

`scripts/dev.sh` starts the Docker backend, waits for `workspace-service` to
answer on `:3001`, then starts the frontend dev servers — with the services
deliberately excluded from the frontend command so nothing double-subscribes.
`backend`, `frontend`, `logs`, and `ps` subcommands round it out.

## The specs

Both stages were fully designed before a line of service code was written, and
the designs live in `context-v/specs/`:

- **`Request-Reviewer-Pre-Flight-Surface.md`** — the pre-flight surface; the
  preview-equals-fire discipline; the model toggle, the `max_tokens` field,
  the JSON-request view, the row stepper.
- **`Response-Reviewer-and-Response-Store.md`** — the post-flight surface and
  the `response-store` service; triage flags plus the whole-response accept.

The decisions in them were made by question-and-answer, not assumed: tools stay
a property of the prompt (not toggled per-run), firing exits to the
response-reviewer (built as a pair, not deferred), and a response is stored as
a first-class object (not left as a bare cell).

## Verified / not verified

Every changed workspace typechecks clean — `prompt-runner`, `response-store`,
`workspace-service`, and the `@augment-it/workspace` package. What is **not**
yet runtime-verified is an end-to-end fire: that needs the Docker stack up and
an API key, and costs real model calls. The typecheck is solid for a
service-layer change; the smoke test comes with the frontends.

## Files Worth Knowing About

- `services/prompt-runner/src/request.ts` — the one request assembler.
- `services/prompt-runner/src/preview.ts` — the no-send preview handler.
- `services/response-store/` — the new service; mirror of `prompt-store`.
- `services/prompt-runner/src/run.ts` — where the per-row response publish
  and the `row_ids` row selection were folded in.
- `scripts/dev.sh` — the `pnpm stack` orchestrator.

## What's Next

- **The two remotes.** `request-reviewer` (port 3004) and `response-reviewer`
  (port 3005) — the federated frontends that render all of the above, mounted
  by the shell's tiling Deck. They are their own changelog entry.
- **An end-to-end smoke test** of `prompt.preview` and the response publish,
  once the stack is up.

## See also

- [[Request-Reviewer-Pre-Flight-Surface]] — the pre-flight spec.
- [[Response-Reviewer-and-Response-Store]] — the post-flight spec.
- [[Why-Response-Reviewer-and-Highlight-Collector-Exist]] — the blueprint
  rationale for the post-flight stages.
- [[2026-05-21_04_Prompt-Enrichment-Subsystem]] — the prompt-store +
  prompt-runner subsystem this extends.
- [[2026-05-21_07_Shell-Tiling-and-Peek-Deck]] — the Deck the remotes will
  mount into.
