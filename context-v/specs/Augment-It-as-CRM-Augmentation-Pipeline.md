---
title: "Augment-It as a CRM-Augmentation Pipeline (Microfrontends + Microservices)"
lede: "First-pass spec capturing what Augment-It actually is, where it sits in the family of Applied AI Labs apps (memopop generates memos, dididecks generates slides, augment-it generates information that goes back into a CRM), and what the minimum viable path looks like given a paying client needs a fundraising lead list augmented this week against a repo that is currently a clean rebuild on rsbuild + Module Federation + Turbo. Journey-mode: the destination isn't pinned, the team's understanding is."
date_created: 2026-05-18
date_modified: 2026-05-18
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
semantic_version: 0.0.0.1
tags:
  - Spec
  - Augment-It
  - CRM-Augmentation
  - Microfrontends
  - Microservices
  - Module-Federation
  - Rsbuild
  - Turbo
  - Lead-Enrichment
  - Pipeline-as-UI
  - Applied-AI-Labs
status: Draft
---

# Augment-It as a CRM-Augmentation Pipeline

## What Augment-It is

Augment-It is the third app in the Applied AI Labs family. The shared pattern across the three:

> *Run a relatively stable set of LLM calls + tool calls + reviews against structured input to produce something important.*

What differs is the output artifact:

| App | Input | Output | Form factor |
|---|---|---|---|
| **memopop-ai** | Research bundles, scorecards, sources | Investment memos | Long-form markdown → Google Docs |
| **dididecks-ai** | Slide-decks-as-code, brand kits | Slide decks | Astro slides, OG images, exports |
| **augment-it** | CRM exports, CSVs, prospect/customer rows | **Information back into the CRM** | Structured rows (with interim YAML / MD / JSON artifacts) |

Memopop and dididecks own their output artifact end-to-end. Augment-It is the only one of the three where the **destination is somebody else's system** — usually a HubSpot, Salesforce, Affinity, or Notion CRM. The interim artifacts (YAML, markdown, JSON) exist for the same reason they do in dididecks: so humans can inspect, edit, and version-control what the LLM produced before it lands somewhere irreversible.

## The architectural bet — pipeline as microfrontends

Augment-It was built (a year ago, largely by Tanuj, in React) to demonstrate **microservices + microfrontends**. The structural choice that makes this more than a buzzword: each stage of the CRM-augmentation pipeline gets its own federated UI module.

Currently scaffolded under `apps/`:

| Microfrontend | Pipeline stage | What it owns |
|---|---|---|
| `record-collector` | Ingest | CSV / CRM-export upload, row inspection, schema mapping |
| `prompt-template-manager` | Configure | The prompts that will fire per-row (per-field, per-task) |
| `request-reviewer` | Pre-flight | Confirm the assembled request is right *before* tokens get spent |
| `response-reviewer` | Post-flight | Inspect the raw LLM/tool response per row |
| `highlight-collector` | Distill | Pull the load-bearing facts out of the response |
| `insight-manager` | Land | The structured, CRM-shaped artifact ready to write back |

The shell (`shell/`) hosts these as federated modules; shared code lives in `packages/shared-services`, `packages/shared-ui`, `packages/config`. Build is **rsbuild + Module Federation + Turbo**; container layer is **Docker**.

The bet is that this six-stage shape is **the CRM-augmentation workflow itself** — and that exposing each stage as its own deployable microfrontend lets the team (and eventually clients) compose pipelines without the monolith trap.

## Current state of the repo (as of 2026-05-18)

This matters for the "what can we ship this week" question.

- Branch: `rebuild/turbo-rsbuild` — a clean rebuild after the original React/Next iteration
- `apps/*/` — each app has **only a README**. No source. They are *named seams*, not implementations.
- `packages/*/` — same. Stubs.
- `shell/` — `rsbuild.config.ts` + `tsconfig.json` only. No app shell yet.
- `splash/` — Astro splash site, the most-built thing in the repo
- `Dockerfile` — exists, wires the pnpm + Turbo build, but builds an empty graph today
- `turbo.json` — pipeline declared
- React 19 declared at root

**Translation:** Augment-It is a scaffolded skeleton, not a working app. The architectural intent is documented in directory names; the implementation is greenfield.

## Where this sits relative to the In-App Agent Chat pattern

Worth saying explicitly so it doesn't get retro-fitted incorrectly later. The chat-as-agent-surface pattern documented in [[In-App-Chat-as-Agent-Surface-for-Client-Apps]] and the walking-skeleton plan in [[In-App-Agent-Chat-Walking-Skeleton]] *does* apply to augment-it — but augment-it's situation is different from memopop's and dididecks's in two ways:

1. **The verbs are inherently batch-shaped.** "Enrich every row in this CSV with the founder's LinkedIn, their company stage, and their most recent funding round" is one chat utterance that becomes hundreds or thousands of capability invocations. The capability registry pattern still holds; the runtime needs to handle per-row fan-out cleanly.
2. **The "noun the system knows about" is a row in someone else's database, not a doc we own.** That shifts where state lives: the LLM's job is to *propose* updates, not to own the truth. The CRM remains the system of record. Augment-It is a queryable staging area.

Both are tractable inside the same `@lossless/in-app-agent` package — but they aren't free; they shape the capability surface and the transcript schema.

## The pivot question — paying client this week vs. VC demo tomorrow

Stating the tension plainly so the team can decide it deliberately rather than by drift:

- **Paying client** wants a fundraising lead list augmented. Real money, real deadline (this week), real obligation. Augment-It is the right shape for the work.
- **VC** meets tomorrow to see Memopop. Not a paying client. The memo output already exists; the demo is presumably the existing artifact, not a new build.

The honest read: **the VC demo doesn't compete with the client work for build time** — it competes for *prep* time. If the VC demo just needs the existing memo and a coherent narrative, augment-it gets the build week.

If, instead, the VC demo needs new memopop functionality to land tomorrow, the tension is real — but that's a different conversation than "which app gets architectural attention this week," and probably resolvable by descoping the demo rather than splitting build effort.

**Default recommendation:** spend this week on augment-it. The client work is the forcing function the spec needs anyway.

## Minimum viable path for the lead-list-this-week obligation

Given augment-it is a skeleton, the temptation is to skip the microfrontend architecture and just write a script that ingests the CSV, hits Perplexity per row, and emits an enriched CSV. That's not wrong — it's the right v0 if the deadline is this week. The question is what to preserve as we go fast.

A tiered path:

### Tier 0 — Get the client their list (this week)

Whatever shape gets the deliverable out the door. Probably: a focused Python or TypeScript script that operates on the CSV, fires LLM calls per row, writes results to YAML/MD/JSON interim artifacts, then re-emits as a CSV importable into the client's CRM. **Do not** build the microfrontend shell to ship this. Treat tier 0 as throwaway-but-loggable: every prompt, every row's request and response, every reviewer decision recorded as a real artifact, so it can seed tier 1.

### Tier 1 — Lift the script into the pipeline shape

The six microfrontend names (`record-collector`, `prompt-template-manager`, `request-reviewer`, `response-reviewer`, `highlight-collector`, `insight-manager`) become the *six folders* in `apps/` where script logic gets refactored. First-pass: each app might be a single-page React surface that wraps the corresponding stage of the tier-0 script. The microservice on the back end can stay a single FastAPI or Bun server with multiple routes — *services* and *microservices* aren't the same thing; the architecture commits to microfrontends, but the services tier can earn its splits later.

### Tier 2 — Real microservices, real federation

Each microfrontend deploys independently; each service has its own container; the shell composes them at runtime. This is the demo-able architecture that justifies the rebuild. It earns its way in once tier 1 has run against a real client list and surfaced the actual seams that matter.

## What needs to be true to start tier 0 this week

A short prep list, not a plan:

- [ ] Confirm the client's CSV shape — what columns are in, what columns they want enriched, what format the CRM needs back.
- [ ] Confirm the CRM destination (HubSpot? Salesforce? Affinity? Notion?). The destination shapes the round-trip even if we never write directly to it this week.
- [ ] Pick the LLM substrate. Augment-It's README declares Perplexity — fine for tier 0, but worth confirming we still have a working key and the per-row pattern.
- [ ] Decide where the throwaway script lives. Probably `augment-it/scripts/lead-list-tier-0/` so it sits inside the right repo even if it doesn't use the microfrontend scaffold.
- [ ] Decide whether the interim artifacts go in the repo (likely no — client data) or in a sibling private location (likely yes — a `.gitignored` directory or a separate private repo).

## What's deliberately out of scope for this spec

- The capability registry for augment-it's eventual chat surface. Comes once the pipeline stages are real.
- The Tauri / desktop story. Augment-It is browser-first; no native client planned.
- BYOK. Augment-It clients are paying engagements; our keys for now.
- Cross-app integration (e.g., augment-it feeding memopop). Tempting; premature.
- The Rust/Go microservice story. Node + Python for v1.

## Open forks worth flagging

1. **Are the six microfrontends the right six?** They came from Tanuj's original architecture. The pipeline shape feels right (ingest → configure → pre-flight → post-flight → distill → land) but the *names* and *boundaries* deserve a fresh look once tier 0 produces a real script.
2. **Should the splash become the shell host?** The splash is the most-built surface. There's a world where the shell *is* the splash plus authenticated app routes. Probably not — splash and app should stay separate per [[maintain-splash-pages]] — but worth naming the temptation.
3. **What does CRM write-back actually look like?** v1 might just emit an import-ready CSV/JSON and let the client paste it. v2 hits the CRM API directly. The line between v1 and v2 is the line between "consulting deliverable" and "product."
4. **Does augment-it eventually get the same chat surface as memopop/dididecks?** Yes per the family pattern, but the batch-shape of augment-it's verbs may push the chat-mode to feel more like a job runner than a conversation. Worth keeping a watch on.

## Related artifacts

- `ai-labs/context-v/explorations/In-App-Chat-as-Agent-Surface-for-Client-Apps.md`
- `ai-labs/context-v/plans/In-App-Agent-Chat-Walking-Skeleton.md`
- `ai-labs/context-v/plans/Slides_Agent-Capabilities_Hooking-the-Chat-Surface-into-Memopop.md`
- `augment-it/README.md` — the original tech-stack declaration
- `augment-it/Dockerfile` — the container baseline
- `augment-it/turbo.json` — the build pipeline
- `augment-it/splash/` — the most-built surface in the repo today
