---
title: "augment-it augments — the first LLM call, and the loop that turns a column name into a column of answers"
lede: "augment-it now does the thing it is named for. Two new microservices land — prompt-store holds prompt templates, prompt-runner makes the LLM calls — and together they close the augmentation loop: write a prompt with {{column}} placeholders, run it per-row against a record set, get back a derived record set with the model's answers as a new column. The proof-of-life was a web-search-backed prompt that turned a column of organisation names into a column of website URLs. This is the first time augment-it has called an LLM."
publish: true
date_created: 2026-05-21
date_modified: 2026-05-21
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
tags:
  - Augment-It
  - Prompt-Store
  - Prompt-Runner
  - LLM-Enrichment
  - Derived-Record-Sets
  - Anthropic-API
  - Web-Search
  - Microservices
  - Walking-Skeleton
files_changed:
  - context-v/plans/Prompt-Template-Manager-Walking-Skeleton.md
  - docker-compose.yml
  - packages/workspace/src/types.ts
  - packages/workspace/src/index.ts
  - services/prompt-store/package.json
  - services/prompt-store/tsconfig.json
  - services/prompt-store/Dockerfile
  - services/prompt-store/.dockerignore
  - services/prompt-store/data/prompts.json
  - services/prompt-store/src/store.ts
  - services/prompt-store/src/handlers.ts
  - services/prompt-store/src/server.ts
  - services/prompt-runner/package.json
  - services/prompt-runner/tsconfig.json
  - services/prompt-runner/Dockerfile
  - services/prompt-runner/.dockerignore
  - services/prompt-runner/src/template.ts
  - services/prompt-runner/src/anthropic.ts
  - services/prompt-runner/src/run.ts
  - services/prompt-runner/src/server.ts
  - services/row-store/src/store.ts
  - services/row-store/src/handlers.ts
  - services/workspace/src/capabilities.ts
  - services/workspace/src/ws.ts
  - scripts/smoke-prompt-store.mjs
  - scripts/smoke-prompt-run.mjs
---

## Why Care?

augment-it is named for what it is supposed to do: take a row of structured data and *augment* it — add the facts that weren't in the spreadsheet. Until today it could ingest spreadsheets, render them, and let you edit cells. It could not actually augment anything. It had never called an LLM.

Now it has. The augmentation loop is closed:

```
a prompt template with {{column}} placeholders
        +  one row's column values
        ▼  fill the placeholders
   the assembled prompt  →  Claude (optionally with web search)  →  an answer
        ▼
   the answer becomes a new column on a copy of that row
```

Run that across N rows and you get a **derived record set** — a copy of the original with one new column the original never had, every cell filled by the model. The original is untouched; the derived set carries a `derived_from` pointer back to its parent.

The proof-of-life: a prompt that says *"find the official website URL for `{{Prospect / Organization}}`"*, run against the Master Pipeline Tracker — a 207-row fundraising CSV that has no `url` column. Three rows in, web search on, and a new `url` column came back populated with real URLs. A column name went in; a column of answers came out.

That's the whole product thesis in one loop. Everything else — the editor UI, batch runs, the other pipeline stages — is scaffolding around this.

## What's New?

- **`prompt-store`** — a new microservice (the 6th container). Holds prompt templates as JSON, structurally a sibling of `row-store`. Five NATS handlers: `prompt.list / get / create / update / delete`. Broadcasts `prompt.created / updated / deleted`.
- **`prompt-runner`** — a new microservice (the 7th container). **The only container in augment-it that calls the Anthropic API.** Subscribes to `prompt.run.requested`; for each row it fills the template, calls Claude, and collects the answer; then it assembles a derived record set and hands it to `row-store`.
- **Derived record sets.** Running a prompt produces a new record set, not a mutation of the old one. The `RecordSet` type gained a `derived_from` field and the `ColumnSchema.source` became a union — `csv` for uploads, `derivation` for prompt output. Re-running enrichments builds a *lineage chain* (`Tracker.csv` → `…+url` → `…+url+brand-assets`) instead of the duplicate-uploads pile.
- **Per-prompt `tools`.** A prompt template declares the server-side tools its LLM call needs. The walking skeleton supports one: `web_search`. A "find the URL" prompt turns it on; a "summarise these notes" prompt leaves it off. Web search is a property *of the prompt*, authored alongside the `{{tokens}}` — not a hardcoded runner feature.
- **The augmentation capabilities are wired through the Workspace Service** — `prompt.list/get/create/update/delete` and `prompt.run` are in the capability map, and the prompt broadcast subjects (`prompt.created`, `prompt.run.progress`, `prompt.run.completed`, …) are forwarded to every connected WebSocket. The browser-facing surface is ready; only the UI that drives it is still to come.
- **Two smoke-test scripts** under `scripts/` — `smoke-prompt-store.mjs` exercises the template CRUD; `smoke-prompt-run.mjs` runs a real enrichment end-to-end.
- **The plan** — `context-v/plans/Prompt-Template-Manager-Walking-Skeleton.md` lays out all five phases. This entry covers Phases 1–3; the UI (Phase 4) and the shell wiring (Phase 5) are next.

## The loop, concretely

`prompt-runner` receives `prompt.run.requested { prompt_id, record_set_id, row_limit }` and:

1. Fetches the prompt from `prompt-store` and the parent record set + rows from `row-store` — both over NATS.
2. **Bind check.** It extracts every `{{token}}` from the template body and confirms each one matches a column in the parent's schema. If a token has no column — say the prompt wants `{{url}}` but the record set has no `url` column — the run is *rejected* with the unbound tokens named. That rejection is a feature: it is how the system tells you "run the url-finder first." Enrichment prompts form a dependency chain, and the bind check is the chain's type-checker.
3. For each row up to `row_limit` (default 25 — a full 207-row run is real money and minutes of latency), it fills the template and calls Claude. After each row it publishes `prompt.run.progress { done, total }` so a UI can show "12 of 25" instead of a frozen spinner.
4. It assembles the derived record set — the processed rows plus the new `output_column`, the schema grown by one field, `derived_from` populated — and creates it via `row-store`'s existing `record_set.create.requested` handler. No new row-store code was needed; the derived set is just a record set.

Per-row failures don't abort the run: a row whose LLM call throws gets `"[error: …]"` in its cell, and the run completes with whatever succeeded.

## Under the hood — three decisions worth recording

**The model is `claude-opus-4-7`, by default.** The first plan draft defaulted to Sonnet for cost. The claude-api skill corrected that: default to the most capable model; never downgrade for cost without an explicit decision. So `prompt-runner` defaults to Opus 4.7 and reads `LLM_MODEL` from the environment — set `LLM_MODEL=claude-sonnet-4-6` in `.env` for the cost-sensible default once batches get large. The walking-skeleton `row_limit: 3` runs are a few cents either way.

**The API key lives in exactly one place.** `prompt-runner` reads `ANTHROPIC_API_KEY` from its environment; `docker-compose.yml` sources it from `augment-it/.env`, which is gitignored. The key never enters source, never enters the browser, never enters any other container. That `.env` is an explicit walking-skeleton stand-in — prior augment-it versions had an account-manager / org-admin panel, and key management (plus per-client BYOK) belongs there when it is rebuilt. The `.env` is scaffolding, not the design.

**Web search is per-prompt, and that reframe came from a good question.** The first instinct was to bolt `web_search` onto the runner as a global feature. The right answer — "wouldn't that just be a property of the prompt?" — is that the prompt *is* the configuration. `prompt-runner` reads each prompt's `tools` list; only a prompt that asks for `web_search` gets Anthropic's server-side search tool added to its call (and the `pause_turn` server-tool loop that goes with it). Every other prompt makes a plain completion call and pays nothing for search it doesn't use.

## What actually happened on the proof-of-life run

The honest version, because the messy middle is the useful part.

**First run, no web search.** Three rows, all came back `url: unknown`. Correct behaviour, not a bug — the org names are cryptic fundraising shorthand ("Accelerate the Future (ACH, GW Match)", "(NCAD)"), and Claude, answering from training knowledge alone and told to say "unknown" when unsure, honestly did.

**Second run, web search on.** Real URLs. `https://acceleratethefuture.org/`. The model searched the web and found the site. But the output was polluted: `"I'll search for this organization.https://acceleratethefuture.org/"` — the model narrates *while* it searches, and the extraction was concatenating every text block including the pre-search preamble.

**Fix:** take only the text blocks *after* the last tool-use block — the model's final word once it has finished searching. Pre-search narration is structurally excluded; a plain no-tools completion is unaffected.

**Third run.** Two of three rows came back as clean URLs. The third — "Accelerate the Future (NCAD)" — the model genuinely couldn't resolve, so it wrote a paragraph explaining its uncertainty and ended with "unknown", all in one text block. Trailing-text extraction can't split *within* a block.

That last 1-of-3 is the honest edge of plain-prompt extraction: when the model wants to explain itself, prose leaks into the cell. The real fix is **structured outputs** (constrain the response to a JSON schema so narration is impossible) — but there is a genuine open question first: structured outputs are documented as incompatible with citations, and web-search results carry citations, so the two may not compose. That needs a real test, not an assumption. For a walking skeleton, two clean URLs and one honest "couldn't resolve this" on deliberately-cryptic data is a fair result — and real client data with actual company names will resolve far better than internal fundraising abbreviations.

## Seven containers now

```
nats            message bus + JetStream + dashboard :8222
workspace-service  WebSocket + capability routing :3001
ingest          CSV → schema + rows
xlsx-ingest     XLSX → schema + rows
row-store       record sets + rows (the domain data)
prompt-store    prompt templates                       ← NEW
prompt-runner   the LLM caller — derived record sets    ← NEW
```

`prompt-runner` is the only container with an outbound internet dependency and the only one that holds the API key. Everything else stays exactly as legible as it was.

## Files Worth Knowing About

- `services/prompt-runner/src/run.ts` — the augmentation loop. The bind check, the per-row calls, the derived-record-set assembly. ~140 lines; reads top-to-bottom.
- `services/prompt-runner/src/anthropic.ts` — the *only* file in augment-it that calls an LLM. Model selection, the per-prompt web-search toggle, the `pause_turn` loop, the trailing-text extraction.
- `services/prompt-runner/src/template.ts` — `{{token}}` extraction and substitution. Tokens are matched verbatim against column names — augment-it columns have spaces, slashes, and question marks, so no normalisation.
- `services/prompt-store/src/store.ts` — the `PromptTemplate` shape. Lifts the useful core of the legacy Tanuj schema; `tools` is the new per-prompt capability list.
- `context-v/plans/Prompt-Template-Manager-Walking-Skeleton.md` — the five-phase plan.

## What's Next

The augmentation loop works, but it is only reachable from a smoke script. **Phase 4 is the missing piece a human can actually operate:** the `prompt-template-manager` Svelte remote — a prompt editor (name, body, `output_column`, a web-search checkbox), a prompt list, and a run control that picks a record set, shows the bind check, and streams `prompt.run.progress`. Phase 5 mounts it in the shell as a second tile next to Record Collector.

After that, in rough order: clean-output hardening (the structured-outputs-vs-citations question), full-set runs with proper fan-out concurrency, and the lineage view so the record-collector list shows which sets are derived from which.

## See also

- [[Prompt-Template-Manager-Walking-Skeleton]] — the plan; this entry is Phases 1–3 of it.
- [[2026-05-21_03_Shell-Federation-Three-Lessons]] — the federation host this enrichment surface will become a tile in.
- [[Augment-It-as-CRM-Augmentation-Pipeline]] — names this the Configure stage of the pipeline.
- [[Tanuj-Prompt-Manager-As-Built]] — the legacy scaffold; the prompt schema is lifted from it.
- [[Multi-Agent-Research-Fan-Out-Per-Row]] — where the `row_limit`-capped runner is heading: real per-row fan-out.
