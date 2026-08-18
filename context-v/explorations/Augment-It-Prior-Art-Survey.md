---
title: "Augment-It Prior Art Survey — What's Already Been Built, and What It Tells Us"
lede: "Two prior attempts exist — Tanuj's three federated repos and Michael's bolt monolith. Both cover the core; neither is what we ship."
date_created: 2026-05-18
date_modified: 2026-05-25
date_archived: 2026-05-25
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
semantic_version: 0.0.0.1
tags:
  - Exploration
  - Augment-It
  - Prior-Art
  - Archaeology
  - CRM-Augmentation
  - Pipeline-as-UI
  - Microfrontends
status: Archived
site_uuid: c0d6157b-798d-4fcb-a6c0-159e86eacb1b
hex_code: 5eeprm
date_authored_initial_draft: 2026-05-25
date_authored_current_draft: 2026-05-25
---

# Augment-It Prior Art Survey

## Why this doc exists

We're about to rewrite Augment-It on a new stack — bun-native workspaces, a still-undecided federation story, the new Applied AI Labs philosophy. We have a paying client this week who wants a fundraising lead list augmented. The temptation is to ducttape something fast. We're going to resist that.

Instead, we're going to document properly as we read — because we cooperate faster when the context is clear and referenced, and because we already have agent skills (in Claude Code and dididecks-ai) that can do a good-enough first pass on the actual lead-list deliverable while we build the real thing.

This doc maps the prior art so the rewrite isn't starting from a blank page. It links out to one "as-built" doc per source.

## The four sources

| Source | Location | Stack | What it covers | Maturity |
|---|---|---|---|---|
| **Bolt monolith** | `archive/bolt-code` branch of `lossless-group/augment-it` | Vite + React 18 + TypeScript + Anthropic SDK + Supabase + zustand | All six pipeline stages in one app, including the two that never got split (highlight-collector, response-reviewer) | Working, monolithic, has its own per-feature analysis specs |
| **record-collector** | `lossless-group/record-collector` (master) | Next.js 15 + React 19 + JS + zustand-with-persist + Perplexity | CSV ingest → field-aware prompt generation → augment → export | Real feature work, single deploy |
| **prompt-manager** | `lossless-group/prompt-manager` (master) | Next.js 15 + React 19 + JS + MD editor + jszip | Prompt CRUD + import/export, hardcoded samples (no store) | Scaffold only |
| **request-reviewer** | `lossless-group/request-reviewer` (development) | Vite + React 19 + Module Federation | Proves Module Federation works; consumes `@module-federation-vite/ui/RecordCard` as a federated module | Federation proof-of-concept, augmentation logic duplicated from record-collector |

All three federated repos were last touched in late July 2025 by Tanuj. The bolt monolith is older still. None of them are running.

Per-source detail lives in:

- [[Bolt-Monolith-As-Built]] — my summary, lift/drop/revisit decisions
- [[Tanuj-Record-Collector-As-Built]]
- [[Tanuj-Prompt-Manager-As-Built]]
- [[Tanuj-Request-Reviewer-As-Built]]

Additionally, six per-feature architectural analyses written during the bolt era have been lifted into this directory (prefixed `Bolt-`, status `Stale`). They are reference material for the rewrite, not current truth:

- [[Bolt-Codebase-Analysis]] — the architectural overview (~430 lines, with Mermaid)
- [[Bolt-Main-Container-UI-Analysis]] — app shell + auth gate + routing (~750 lines)
- [[Bolt-Record-Collector-Analysis]] — ingest pipeline stage (~480 lines)
- [[Bolt-Prompt-Section-Analysis]] — variable-aware MDX prompt editing (~200 lines)
- [[Bolt-API-Provider-Widget-Analysis]] — multi-provider model config (~630 lines)
- [[Bolt-Highlight-Collector-Analysis]] — the distill stage, the only existing description of this pipeline stage (~620 lines)

## The six pipeline stages, mapped against coverage

The architectural intent has always been: **CSV-or-CRM-export in → six pipeline stages → CRM-shaped output**. Here's how the four sources cover those stages.

| Stage | Microfrontend name | Bolt monolith | record-collector | prompt-manager | request-reviewer |
|---|---|---|---|---|---|
| Ingest | record-collector | ✓ (RecordList, ImportModal) | ✓ (ImportModal, csvParser) | — | consumes federated RecordCard |
| Configure | prompt-template-manager | ✓ (PromptSection, MDXEditor) | basic (auto-generated prompt) | ✓ scaffold | — |
| Pre-flight | request-reviewer | ✓ (RequestEditor, QueryOptionsIconSet) | — | — | ✓ (RequestReviewer, RequestReviewerCard) |
| Post-flight | response-reviewer | ✓ (QueryResponse, ResponseObjectReviewer) | — | — | — |
| Distill | highlight-collector | ✓ (HighlightsList, ResponseHighlight, ResponseObjectHighlighter) | — | — | — |
| Land | insight-manager | — | ✓ (ExportPage) | — | — |

Two patterns jump out:

1. **The bolt monolith covers 5 of 6 stages with real implementations.** It's the only place `highlight-collector` and `response-reviewer` were ever built.
2. **The "land" stage (CRM write-back) has barely been touched.** Record-collector has an `/export` page that re-emits CSV, but nothing writes to an actual CRM. This is the gap.

## What we're keeping, what we're not

This is the non-binding draft of the bet, written in pencil. The per-source docs go deeper.

**Keep the ideas:**

- The six-stage pipeline shape itself. It's the right decomposition of CRM augmentation.
- **Auto-generated prompt templates from CSV field names** (record-collector). The "custom properties" pattern — user names the keys, prompt asks LLM to return them in a JSON block — is a clean way to make this generic without prompt engineering per use case.
- **Multi-provider response handlers** (bolt). Three thin modules — `claude.ts`, `gpt.ts`, `perplexity.ts` — that normalize to a single `AIResponse` shape. Worth preserving the contract even if we rewrite the bodies.
- **Records-as-rich-objects** (bolt). The store holds records, prompt templates, AI models, AI model configs, query responses, highlights, computed properties, users — all related. Tanuj's record-collector simplified this to records-with-augmentation; we probably need the richer shape back.
- **The federation proof** (request-reviewer). Tanuj proved `@module-federation-vite/ui` can ship a shared `RecordCard` and let microfrontends import it. We may not stay with Vite + Module Federation, but the proof retires the question "does this work at all."

**Don't keep:**

- **Supabase auth.** The Applied AI Labs roadmap is converging on a shared auth substrate ([[Shared-Auth-for-Applied-AI-Labs]] in `ai-labs/context-v/explorations/`). Bolt's per-app Supabase wiring is the wrong shape.
- **JavaScript (no TypeScript).** Both record-collector and prompt-manager are plain JS. Augment-It v-next is TS, full stop.
- **Hardcoded sample data.** Prompt-manager's components reference inline sample arrays rather than a store. That's scaffold-grade, not feature work.
- **Per-microfrontend duplication of augmentation logic.** Both `record-collector/src/components/AugmentPage.js` and `request-reviewer/src/components/RequestReviewer.jsx` contain the *exact same* `generateDefaultPrompt()` function copy-pasted. The shared `RecordCard` got federated; the shared prompt-building did not. This is the seam that breaks the federation story and has to be designed properly.
- **Perplexity as the default and only provider.** Bolt already proved multi-provider works. The rewrite uses Anthropic primarily, Perplexity for explicit research calls (where its current-web-results shine).
- **Next.js for the microfrontends.** If we go federation, Next.js is the wrong host. If we don't go federation, we still don't need Next.js — bun + Vite or bun + Astro Knots fits the family better.

**Open questions** (will become their own explorations or specs as we converge):

1. Federation or no federation? Both are defensible. The question that resolves it is whether the team will ever deploy these microfrontends independently or whether "microservice" means "separate service, single bundled UI."
2. bun + which bundler? `bun run` as orchestrator is decided; the bundler is not. Vite + Module Federation is one option; Rspack is what the current rebuild branch picked; a single-app build with no federation at all is a third.
3. Where does the CRM write-back actually live? Direct API calls from the browser (CORS-ed via our server) vs. server-side adapters per CRM? This is the stage that's least built and most variable per client.
4. Same chat surface as memopop / dididecks? The pattern in [[In-App-Chat-as-Agent-Surface-for-Client-Apps]] applies, but augment-it's verbs are batch-shaped. Probably yes, with a job-runner flavor.

## What needs to happen this week, in priority order

1. **Read and document all four sources.** This survey + the four sibling docs. Doing now.
2. **Decide the federation question.** A short exploration (not a spec) that picks an answer for this rewrite. Doesn't have to be permanent.
3. **Stub the new repo structure** under `augment-it/apps/` and `augment-it/packages/` with intentional README placeholders matching what the rewrite will hold. No code yet.
4. **The paying client's lead list** — use existing dididecks-ai / Claude Code agent skills against their CSV to produce a credible first-pass deliverable. Treat this as a *parallel* track to the rewrite, not blocked on it.

## A note on the previous spec

There's an earlier spec at `Augment-It-as-CRM-Augmentation-Pipeline.md` ([[Augment-It-as-CRM-Augmentation-Pipeline]]) that was written before any of this archaeology. Two assumptions there are now stale and should be revisited:

- It treats the apps as "empty folders with READMEs." That's true in the *parent monorepo*, but ignores that working code exists in four separate org repos. Update once the survey is read.
- It frames "tier 0 = throwaway script" as the fast path. Reading the prior art changes this: the fast path is probably "use existing agent skills against the CSV" rather than writing new code at all.

The spec stays as a useful map of the architectural intent; the strategic recommendations in it are superseded by this survey's "what needs to happen this week" section.

## Related artifacts

- `~/scratch/augment-it-archaeology/` — local clones of all four sources, currently
- `ai-labs/context-v/explorations/In-App-Chat-as-Agent-Surface-for-Client-Apps.md`
- `augment-it/context-v/specs/Augment-It-as-CRM-Augmentation-Pipeline.md`
- `augment-it/README.md` — original tech-stack declaration
- `augment-it/Dockerfile`, `augment-it/turbo.json` — current rebuild substrate
