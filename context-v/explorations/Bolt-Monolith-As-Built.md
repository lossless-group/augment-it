---
title: "Bolt Monolith As Built — The archive/bolt-code Branch"
lede: "The earliest augment-it is a Vite + React monolith on `archive/bolt-code`: feature-richer than the federated repos, architecture we discard."
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
  - Bolt-Code
  - Monolith
  - As-Built
status: Archived
site_uuid: 9be9d5db-57b5-4ef0-a4da-12315a2907ee
hex_code: 414yhu
date_authored_initial_draft: 2026-05-25
date_authored_current_draft: 2026-05-25
publish: true
---

# Bolt Monolith As Built

## What this is

The `archive/bolt-code` branch of `lossless-group/augment-it`. A Vite + React 18 + TypeScript single-page app. Originally named `ai-customer-data-manager` in its `package.json`. Built before the microfrontend split — and, as the survey shows, covers more of the pipeline than the split ever did.

Local clone for inspection: `~/scratch/augment-it-archaeology/augment-it-bolt/`.

## Stack

| Concern | Choice |
|---|---|
| Build | Vite |
| Language | TypeScript |
| UI | React 18 |
| State | zustand |
| Auth + DB | Supabase (`@supabase/supabase-js`) |
| LLM | Direct: Anthropic SDK (`@anthropic-ai/sdk`), plus thin GPT and Perplexity handlers |
| Markdown editing | CodeMirror 6 (lang-javascript / lang-json / lang-markdown / lint / one-dark) |
| Markdown rendering | `@mdx-js/mdx`, `@mdx-js/react`, `@mdx-js/rollup` |
| Icons | lucide-react |
| Styling | Tailwind |

Notable: Anthropic-first, not Perplexity. Multi-provider was a real design choice, not aspirational.

## The component graph (~24 components)

Located in `src/components/`:

**Layout / shell:**

- `MainLayout.tsx` — the app frame
- `UserProfile.tsx`, `PasswordReset.tsx`, `UpdatePassword.tsx` — Supabase auth UI

**Pipeline stage 1 — ingest:**

- `RecordList.tsx` — the rows the rest of the system operates on
- `DataModelModal.tsx` — schema / field configuration

**Pipeline stage 2 — configure:**

- `PromptList.tsx`, `PromptSection.tsx`, `PromptSectionEdit.tsx`, `PromptSectionPreview.tsx` — prompt templates as editable + previewable sections
- `MDXEditor.tsx` — the rich editor that lets prompts contain prose + variable refs

**Pipeline stage 3 — pre-flight:**

- `RequestEditor.tsx` — the assembled request before it fires
- `QueryOptionsIconSet.tsx`, `EditQueryOptions.tsx` — per-model/per-call options

**Pipeline stage 4 — post-flight:**

- `QueryResponse.tsx`, `QueryResponseList.tsx` — the raw LLM responses, per-record + per-template
- `ResponseObjectReviewer.tsx` — structured inspection of a single response object
- `ResponseObjectContextWrapper.tsx` — context provider for response viewing

**Pipeline stage 5 — distill:**

- `HighlightsList.tsx` — collected highlights across responses
- `RecordHighlightsWrapper.tsx`, `HighlightsContextWrapper.tsx` — context wrappers
- `ResponseHighlight.tsx` — a single highlight (a span of text + section_title + color)
- `ResponseObjectHighlighter.tsx` — the UI for marking up a response and saving highlights

**Stage 6 — land:** not implemented in bolt. (The export-as-CSV in record-collector is the closest thing anywhere.)

## The store (`src/store/index.ts`)

A single zustand store holds everything. Annotated entities:

```ts
interface AppState {
  records: Record[];                       // the rows
  selectedRecord: Record | null;
  promptTemplates: PromptTemplate[];       // configurable prompt scaffolds
  selectedTemplate: PromptTemplate | null;
  aiModels: AIModel[];                     // {claude, gpt, perplexity, …}
  aiModelConfigs: AIModelConfig[];         // per-template, per-section config
  computedProperties: ComputedProperty[];  // derived fields per record
  queryResponses: QueryResponse[];         // raw LLM outputs
  highlights: Highlight[];                 // user-marked spans + section_title
  user: User | null;                       // Supabase user
  profile: UserProfile | null;
}
```

A single store coordinating all six entity types is what makes the highlight-collector / response-reviewer stages work at all — they need to see records, templates, responses, AND highlights together. The microfrontend split *broke* this by giving each app its own store with only one entity type, which is why those two stages never got built in the federated version.

This is the **most important lift-out** from bolt: the entity model and the relationships between them. Even if we throw out every line of code, the schema is reusable.

## Multi-provider response handlers (`src/lib/response-handlers/`)

Three modules:

- `claude.ts` — `handleClaudeResponse(response, apiKey) → AIResponse`
- `gpt.ts` — same shape for OpenAI
- `perplexity.ts` — same shape for Perplexity

All three normalize to a single `AIResponse` type:

```ts
interface AIResponse {
  raw: any;
  parsed: any | null;
  content?: string;
  model: string;
  usage: { promptTokens, completionTokens, totalTokens };
}
```

The contract is what survives: response-handlers are stateless modules that take a raw HTTP response + auth, return a normalized object with optional JSON-parsed payload, fallback to raw content if parse fails. Token usage normalized across providers' different field names.

This contract is the second-most-important lift-out. The bodies of the handlers are throwaway; the *shape* of `AIResponse` and the normalization discipline is what we need.

## The auth story (don't keep)

Supabase, embedded directly:

- `src/lib/supabase.ts` — client singleton
- `signIn / signUp / signOut / resetPassword / updatePassword` — all in the zustand store
- `UserProfile.tsx`, `PasswordReset.tsx`, `UpdatePassword.tsx` — UI

This is exactly the per-app Supabase wiring that [[Shared-Auth-for-Applied-AI-Labs]] is trying to consolidate. We do not keep this. The replacement is the shared-auth substrate, which the rewrite will consume rather than reinvent.

## The pre-existing analysis specs — lifted into this directory

The bolt branch already shipped six per-feature analysis docs in `augment-it-bolt/specs/`. They have been **copied into this `explorations/` directory** with a `Bolt-` prefix and `status: Stale`, so they live alongside this summary instead of in a scratch clone:

- [[Bolt-Codebase-Analysis]] — architecture overview (~430 lines, with Mermaid)
- [[Bolt-API-Provider-Widget-Analysis]] — the per-model config widget (~630 lines)
- [[Bolt-Highlight-Collector-Analysis]] — the highlight pipeline, end-to-end (~620 lines) — **only existing description of this pipeline stage**
- [[Bolt-Main-Container-UI-Analysis]] — app frame + auth gate (~750 lines)
- [[Bolt-Prompt-Section-Analysis]] — the editable prompt section feature (~200 lines)
- [[Bolt-Record-Collector-Analysis]] — the ingest UI (~480 lines)

These are essentially "as-built" docs for individual features, written in Mermaid + prose. They're stale relative to the rewrite target — the codebase moved on — but they're **a head start on the eventual forward sitemap**: the pages and components we'll build in the new stack overlap heavily with what these docs describe. Treat them as reference material; the forward sitemap (when we write it) will supersede them with new files that may cite these as ancestors.

## What's missing from bolt

- **No CRM write-back.** Highlights and responses are stored in Supabase tables but never go anywhere external.
- **No batch / fan-out abstraction.** Augmentation is per-record-per-template. Running "enrich every row" requires looping in the UI.
- **No interim artifact format.** Everything lives in Supabase rows; nothing is exported as YAML / MD / JSON for human review or version control. This is the gap that motivates the new philosophy (interim artifacts as files).

## What to lift, what to drop, what to revisit

**Lift:**

- The store's entity model (records / templates / models / configs / responses / highlights / computed properties)
- The `AIResponse` normalization contract and the three-handler pattern
- The pre-existing analysis specs as sitemap starting points
- The MDX-based prompt editing pattern (variables-in-prose, render as preview)

**Drop:**

- Supabase auth — replaced by shared-auth substrate
- React 18 — going to 19 like the rest of the family
- The single-store-everything pattern — for the federated version we need a clear answer about which entities are global vs. local

**Revisit:**

- Whether highlights live per-user or per-org (bolt was implicitly per-user; org-shared highlights are a real feature for client teams)
- Whether `computedProperties` is the same idea as record-collector's `customProperties` (it almost certainly is — two names for the same concept)

## Related

- [[Augment-It-Prior-Art-Survey]]
- [[Tanuj-Record-Collector-As-Built]]
- [[Tanuj-Prompt-Manager-As-Built]]
- [[Tanuj-Request-Reviewer-As-Built]]
- [[Shared-Auth-for-Applied-AI-Labs]] (ai-labs)
- Clone: `~/scratch/augment-it-archaeology/augment-it-bolt/`
- Source: `https://github.com/lossless-group/augment-it/tree/archive/bolt-code`
