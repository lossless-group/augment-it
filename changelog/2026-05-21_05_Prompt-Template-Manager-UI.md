---
title: "The enrichment loop gets a face — prompt-template-manager, and the walking skeleton is whole"
lede: "Yesterday's question was 'how do I see it?' — the enrichment loop worked but only from a smoke script. Now it has a UI. prompt-template-manager is augment-it's second federated remote: a prompt editor with a live {{token}} strip, a bind check that turns green or red against whichever record set you pick, and a run control that streams progress. It mounts as the second tab in the shell. The five-phase walking skeleton from the plan is complete — you can author a prompt, run it, and watch a derived record set appear, all without touching a terminal."
publish: true
date_created: 2026-05-21
date_modified: 2026-05-21
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
tags:
  - Augment-It
  - Prompt-Template-Manager
  - Module-Federation
  - Svelte-5
  - Microfrontends
  - Walking-Skeleton
  - LLM-Enrichment
files_changed:
  - apps/prompt-template-manager/package.json
  - apps/prompt-template-manager/rsbuild.config.ts
  - apps/prompt-template-manager/tsconfig.json
  - apps/prompt-template-manager/src/index.ts
  - apps/prompt-template-manager/src/mount.ts
  - apps/prompt-template-manager/src/App.svelte
  - apps/prompt-template-manager/src/app.css
  - packages/workspace/src/state.svelte.ts
  - shell/rsbuild.config.ts
  - shell/src/App.svelte
  - pnpm-lock.yaml
---

## Why Care?

Two changelogs ago the prompt-enrichment subsystem shipped — prompt-store, prompt-runner, the first LLM call. It worked. But the only way to *run* a prompt was `node scripts/smoke-prompt-run.mjs`. The honest closing line of that entry was: "the loop currently works but is only reachable from a smoke script."

Now it isn't. **prompt-template-manager** is a real UI. Open the shell, click the **Prompt Templates** tab, and you can:

- write a prompt with `{{Column Name}}` placeholders in a text editor,
- tick a box to give it web search,
- pick a record set and *see, before running*, which placeholders map to real columns and which don't,
- run it, watch `enriching… 2/3` tick by, and get a derived record set.

No terminal. No script. The thing augment-it is named for — augmenting records — is now an operable product surface.

It's also a milestone for the architecture: this is the **second federated remote**. The first (record-collector) proved the federation pattern works. The second proves it *scales* — adding it was a `REMOTES[]` entry, a `remotes` map line, and a remote built from the documented pattern. No surprises. That's the claim the whole microservices-plus-microfrontends bet rests on, demonstrated twice.

## What's New?

- **`apps/prompt-template-manager/`** — a new Svelte 5 federated remote, augment-it's second. Built to the exact pattern record-collector established (see the `2026-05-21_03` changelog): exposes a mount function, no `shared` block, CSS shipped as a plain `.css` file namespaced under `.ptm-app`. Runs standalone on `:3003`, or federated into the shell.
- **The prompt editor** — name, description, a prompt-body textarea, an output-column field, and an **Enable web search** checkbox (the per-prompt `tools` flag from the last entry, now with a UI). Create / save / delete.
- **A live token strip.** As you type `{{tokens}}` into the body, the editor extracts and displays them. The prompt's variables are derived from its text, never declared separately — the strip just makes that visible.
- **The bind check** — the part worth pausing on. Pick a record set in the run control, and every `{{token}}` in the prompt turns **green** (that column exists in the set) or **red** (it doesn't). If anything's red, the run button disables with a one-line explanation. This is the dependency-chain type-checker, surfaced: it tells you *before you spend tokens* whether the prompt can run, and it's how the system says "run the url-finder first."
- **The run control** — record-set picker, row-limit input, a run button, a progress line that consumes `prompt.run.progress` events (`enriching… 2/3`), and on completion the derived record set's ID.
- **Second tab in the shell.** `shell/src/App.svelte` gained a `promptTemplateManager` entry in `REMOTES[]`; `shell/rsbuild.config.ts` gained the matching `remotes` map line. The shell header now switches between **Record Collector** and **Prompt Templates**.
- **`prompts` state on the workspace singleton** — `packages/workspace/src/state.svelte.ts` gained a `prompts` field so the new remote has a home for prompt state, mirroring how `record_sets` and `rows` already sit there.

## The bind check, and why it's the good part

The temptation with a prompt editor is to let people write whatever and find out at run time that `{{Prspect}}` was a typo or that the record set has no `url` column. augment-it's prompts form a *dependency chain* — the brand-assets prompt needs the `url` column that the url-finder prompt produces — so "find out at run time" means spending real LLM tokens to discover a mistake.

The bind check moves that discovery to *before the run*, and makes it visual:

```
bind check:  [Prospect / Organization]   ← green: this column exists
             [url]                        ← red: this column does NOT exist
             ⚠ Unbound tokens aren't columns in this record set —
               run an enrichment that adds them first.
```

The red token *is* the instruction. It tells you the prompt you're holding needs a column you don't have yet, which means there's an earlier enrichment to run first. The run button stays disabled until every token is green. The same regex that the prompt-runner uses for substitution drives the editor's strip and the bind check — one notion of "what's a token", three places it shows up.

## Under the hood

**Each remote owns its own workspace singleton.** Module Federation singleton-sharing was dropped back in the `_03` work (Svelte 5 + `.svelte.ts` + MF didn't compose). So the Prompt Templates tab and the Record Collector tab each have their own `@augment-it/workspace` instance. They don't share memory — they stay consistent because both connect to the same backend over WebSocket and re-fetch (`prompt.list`, `record_set.list`) on mount. For a walking skeleton that's the right trade: correctness via the wire, not via shared memory. The `prompts` field on the singleton is a superset slot — record-collector simply leaves it empty.

**The shell's remote loader is now generic.** It used to hard-code `mod.mountRecordCollector`. It now takes `mod.default ?? <first function export>`, so any remote that exposes a single mount function works without the shell knowing its name. The federation contract is "`./mount` exposes a mount function" — the function's name is the remote's business. Adding the third remote will need a `REMOTES[]` entry and a `remotes`-map line, and nothing else in the shell.

**The run-progress `$effect` reuses the seq-cursor.** `prompt.run.progress` events arrive as broadcasts on `workspace.events`; the editor watches the latest one with the same non-reactive `lastProcessedSeq` cursor that the record-collector bug fix established — so a stale event can't re-fire the handler when some unrelated reactive dependency changes. The lesson, applied once, stays applied.

## The walking skeleton is complete

The five-phase plan in `Prompt-Template-Manager-Walking-Skeleton.md`:

| Phase | What | State |
|---|---|---|
| 1 | prompt-store | ✅ |
| 2 | prompt-runner, the first LLM call | ✅ |
| 3 | capability wiring | ✅ |
| 4 | prompt-template-manager Svelte remote | ✅ this entry |
| 5 | wire into the shell | ✅ this entry |

Every phase has shipped and acceptance-checked. The augment-it walking skeleton — ingest, store, enrich, browse, all of it operable from one shell — is whole.

## What's Next

The skeleton is complete; the refinements are now the work:

- **Clean-output hardening.** The structured-outputs-vs-web-search-citations question from the last entry — does `output_config.format` compose with `web_search`? — is still open and is the difference between mostly-clean output and guaranteed-clean output.
- **Full-set runs.** `row_limit` is capped low on purpose; running all 207 rows wants proper fan-out concurrency and rate-limit handling (the `Multi-Agent-Research-Fan-Out-Per-Row` exploration).
- **The lineage view.** Derived record sets carry `derived_from`, but the record-collector list renders them flat. Showing the chain — `Tracker.csv` → `…+url` → `…+url+brand-assets` — is a small render change with a big legibility payoff.
- **The remaining pipeline stages.** request-reviewer, response-reviewer, highlight-collector, insight-manager are still empty stubs. Each is another remote on the now-proven pattern.
- **Upsert / merge** for record sets — still deferred, still the honest answer to "I uploaded the same file twice."

## See also

- [[Prompt-Template-Manager-Walking-Skeleton]] — the five-phase plan, now fully executed.
- [[2026-05-21_04_Prompt-Enrichment-Subsystem]] — Phases 1–3; the backend this UI drives.
- [[2026-05-21_03_Shell-Federation-Three-Lessons]] — the federation pattern this second remote follows.
- [[Augment-It-as-CRM-Augmentation-Pipeline]] — prompt-template-manager is the Configure stage; four stages remain.
