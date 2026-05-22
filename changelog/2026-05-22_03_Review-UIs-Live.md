---
title: "The review UIs go live — and the request/response line gets drawn hard"
lede: "This morning, Request Reviewer and Response Reviewer were empty placeholder panels. Tonight they work. Request Reviewer shows the resolved request — the prompt with its {{tokens}} filled from a real record row — lets you pick the model, see the literal JSON body, and fire it. Response Reviewer steps through what came back and lets you flag or accept each response. And the boundary between the two is now strict: the request belongs to Request Reviewer, the response to Response Reviewer, and authoring stays in Prompt Templates — which lost its run button entirely. Four stages, four remotes, one gate each."
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
  - Prompt-Template-Manager
  - Human-in-the-Loop
  - Module-Federation
files_changed:
  - apps/request-reviewer/src/App.svelte
  - apps/request-reviewer/src/app.css
  - apps/response-reviewer/src/App.svelte
  - apps/response-reviewer/src/app.css
  - apps/prompt-template-manager/src/App.svelte
  - apps/prompt-template-manager/src/app.css
  - packages/workspace/src/types.ts
  - packages/workspace/src/index.ts
  - context-v/specs/Response-Reviewer-and-Response-Store.md
---

## Why Care?

augment-it exists because bulk AI enrichment does not behave. Point a research
agent at 300 records and ask it to enhance each one, and the v1.0.0.0 era
taught us what comes back: hallucinations, off-target answers, accuracy nowhere
near what a paid human would produce. The product's whole answer is to **gate
every step** — never let an agent run unwatched.

This release is that gating made concrete. The enrichment pipeline is now four
stages, and each one is a gate a human passes through:

1. **Prompt Templates** — author the prompt.
2. **Request Reviewer** — see the exact request before it fires. Pick the
   model. Inspect the literal JSON if you want to.
3. *(the model call)*
4. **Response Reviewer** — read what came back, one response at a time, and
   flag it or accept it.

This morning, stages 2 and 4 were empty placeholder panels. Tonight they are
real working surfaces.

## What's New?

- **Request Reviewer is a working pre-flight surface** — pickers, a row
  stepper, a live request preview, a model toggle, a free `max_tokens` field,
  a Resolved-prompt / JSON-request view toggle, a token-binding panel, and the
  fire buttons.
- **Response Reviewer is a working triage surface** — a filter row, a response
  stepper, a context pane, the verbose response (editable), the four triage
  flags, whole-response accept, and a re-run handoff.
- **The request/response line is now strict.** The JSON-request view was
  removed from Response Reviewer — it belongs to Request Reviewer alone.
- **Selecting a template carries over.** Pick a prompt in Prompt Templates and
  Request Reviewer auto-selects it.
- **Prompt Templates lost its run button.** Firing moved out entirely;
  Prompt Templates is now purely an authoring surface.

## Request Reviewer — see it before you send it

Choose a prompt and a record set, and Request Reviewer steps through the rows
one at a time. For each row it calls `prompt.preview` (no model call, no cost)
and shows the **resolved request** — the prompt template with every
`{{token}}` replaced by that row's actual column value.

Two views, toggled:

- **Resolved prompt** — the filled-in text, exactly as it will be sent.
- **JSON request** — the literal `messages.create()` body: `model`,
  `max_tokens`, `messages`, `tools`. This is the "look under the hood" surface
  — provider request shapes get richer as their docs evolve, and seeing the
  real body is how you learn what you can fill in.

A **token-binding panel** lists every `{{token}}`, the value it resolved to,
and — in red — any token with no matching column in the record set. The fire
buttons stay disabled until every token binds. **Fire this row** runs the one
row; **Fire whole set** runs the batch. The model toggle (Opus 4.7 / Sonnet
4.6 / Haiku 4.5) and the `max_tokens` field both feed straight into the
previewed request — so what you reviewed is what fires.

## Response Reviewer — triage what came back

Response Reviewer reads from the `response-store` service: every fired
response, recorded with its request, model, and verbose text. It steps through
them one at a time, with a filter row (all / unflagged / good / partial /
wrong) for triage throughput.

The context pane shows the prompt, the record set, the model, the output
column, and the **prompt that fired** as plain text. The response itself is
shown in an editable pane — because the four triage flags
(`good / partial / wrong / needs-rerun`) are one path, and **accepting the
whole response into the cell** is the other: for lookup-class enrichments
where the entire answer *is* the value, you accept it (optionally after an
edit) and it writes straight to the row. **Re-run** hands the row back to
Request Reviewer.

## Why the two must not be conflated

An earlier draft of Response Reviewer had a JSON-request toggle too. That was
wrong, and it got removed. The two remotes are deliberately *not* the same
shape:

- **Request Reviewer owns the request** — the resolved text, the JSON body,
  the model choice. Everything about what goes *out*.
- **Response Reviewer owns the response** — the verbose text, the triage, the
  accept. Everything about what comes *back*.

Keeping each remote small and single-focus is not an accident of the
architecture — it is the point of it. A microfrontend an engineer can hold
in their head entirely is a microfrontend that gets managed well.

## The remotes talk by window event

These are four separate federated remotes, each with its own Svelte runtime
and its own workspace singleton. They coordinate the only way federation
peers safely can — a `window` event, `augment-it:review-request`:

- Prompt Templates dispatches it when you select a prompt → Request Reviewer
  auto-fills.
- Response Reviewer dispatches it on **Re-run** → Request Reviewer reloads
  that prompt + row.

The peek-deck keeps neighbouring remotes mounted, so in practice both ends of
a handoff are alive and listening.

## Honest deferrals

- **Markdown rendering** of the response — it is shown in a raw, editable
  textarea. A *rendered* view needs a markdown-renderer dependency, a
  deliberate choice not yet made.
- **Inline substitution markers** in the resolved view — the binding panel
  carries the token→value mapping instead.
- **Co-existence pairings** — the reviewers tile in the Deck but do not yet
  auto-pair into side-by-side splits.
- **Not yet runtime-verified end to end** — every changed workspace passes
  `svelte-check`, but a real fire (stack up, API key, an actual `prompt.run`)
  is the next session's first job.

## What's Next

- **Smoke-test the whole pipeline** — `pnpm stack up`, author a prompt, review
  its request, fire it, triage the response.
- **Phase 4** — the co-existence `PAIRINGS` (Request Reviewer beside Prompt
  Templates; Response Reviewer beside Request Reviewer) and a theme-token
  audit across all three modes.
- A markdown-renderer decision for Response Reviewer.
- The record-instance fold and the highlight-collector stage — the larger
  threads ([[Original-and-Enhanced-Record-Instances]],
  [[Why-Response-Reviewer-and-Highlight-Collector-Exist]]).

## See also

- [[2026-05-22_01_Pre-Flight-Post-Flight-Service-Layer]] — the service layer
  these UIs render.
- [[2026-05-22_02_Request-and-Response-Reviewer-Remotes]] — the remotes these
  UIs filled in.
- [[Request-Reviewer-Pre-Flight-Surface]] / [[Response-Reviewer-and-Response-Store]]
  — the specs.
