---
title: "Tanuj's Prompt-Manager As Built"
lede: "The scaffolding repo. Next.js 15 + React 19 + JavaScript, with a full CRUD-shaped UI for prompts (cards, search, statistics, create/edit modals, import/export) — but no store, no real data flow, and a `samplePrompts` array hardcoded inline. Honest about what it is: the right shape, none of the wiring. Worth keeping the schema, throwing away the implementation."
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
  - Prompt-Manager
  - As-Built
status: Archived
---

# Tanuj's Prompt-Manager As Built

## What this is

Repo: `lossless-group/prompt-manager`, default branch `master`. Built by Tanuj summer 2025 alongside record-collector. **The least mature of the four sources.** One real commit after the create-next-app init.

Local clone: `~/scratch/augment-it-archaeology/prompt-manager/`.

## Stack

| Concern | Choice |
|---|---|
| Build | Next.js 15.4.4 with `next dev --turbopack` |
| Language | JavaScript |
| UI | React 19.1.0 |
| Markdown editing | `@uiw/react-md-editor` 4.0.8 |
| Zip handling | jszip 3.10.1 (presumably for import/export bundles) |
| Icons | lucide-react |
| Styling | Tailwind 4 |

Notable: **No state management** — no zustand, no React Context, nothing. State is local React `useState` and a hardcoded `samplePrompts` array.

## Components

- `PromptManager.js` — root component, has the hardcoded sample data
- `PromptCard.js` — single-prompt display
- `CreatePromptModal.js`, `EditPromptModal.js`, `DeleteConfirmModal.js` — CRUD modals
- `ImportModal.js`, `ExportModal.js` — bundle import / export (jszip)
- `SearchBar.js` — local search over prompts
- `ActionHeader.js`, `StatisticsSection.js`, `SplashScreen.js`, `Navigation.js` — UI scaffolding

## The prompt schema (from the hardcoded samples)

This is the most useful artifact in the repo. Inferred from the `samplePrompts` array in `PromptManager.js`:

```js
{
  id: number,
  name: string,
  description: string,
  content: string,           // template body with {{variable}} placeholders
  variables: string[],       // declared variable names
  category: string,          // 'Analysis' | 'Recommendation' | 'Communication' | ...
  createdAt: string,         // ISO date
  lastUsed: string,
  usageCount: number
}
```

The pattern: prompts are **versionable, named, categorized, variable-aware templates** with `{{variable}}` placeholders that get substituted at call time. This is close to the bolt monolith's `PromptTemplate` shape and almost certainly the right starting schema for the rewrite's prompt-template-manager microfrontend.

The **gap** is that the prompts are dead — they don't connect to records, they don't get fired against an LLM, they don't pull variables from a record's fields. The UI imagines a full prompt CRUD product; the wiring is non-existent.

## Why this repo exists in the state it does

Best guess: Tanuj built record-collector first as a single deployable, then started splitting concerns out. Prompt-manager was the second split. He got the UI scaffold done in the same Next.js + JS style, but never connected it to a shared store because the shared-store question is the federation question, and that question never got answered.

Request-reviewer (the third split) shows the same incomplete connection — it imports `RecordCard` from a federated `@module-federation-vite/ui` package but reimplements the augmentation logic locally, because there was no shared store to pull from.

## What's missing

- **A store.** zustand, context, anything. The component reads from a hardcoded array.
- **Persistence.** Even just localStorage. Refreshing the page resets.
- **Variable substitution at call time.** The schema declares `variables: string[]` but no code reads them.
- **Any connection to records or LLM calls.** Prompts live alone. They don't get fired against anything.
- **Versioning of prompts.** `usageCount` and `lastUsed` exist as fields but aren't tracked.

## What to lift, what to drop

**Lift:**

- The prompt template schema: `{ name, description, content, variables, category, createdAt, lastUsed, usageCount, id }`
- The CRUD-shaped UI as a sketch — Create / Edit / Delete / Import / Export / Search / Statistics is the right surface
- The `{{variable}}` placeholder convention (matches Mustache / Handlebars conventions, easy for users)

**Drop:**

- The implementation (it's a scaffold)
- Hardcoded sample data (replace with a real store)
- JavaScript (TS for the rewrite)
- The standalone Next.js host (same reasoning as record-collector)

## A small structural question this raises

Prompt-manager has its own `changelog/` directory in the repo. Record-collector does not. That's evidence the per-repo split *did* generate per-repo conventions that didn't survive consolidation. Worth a note: when we re-split (if we do), changelog conventions need to be settled at the parent level so it isn't repo-by-repo.

## Related

- [[Augment-It-Prior-Art-Survey]]
- [[Bolt-Monolith-As-Built]]
- [[Tanuj-Record-Collector-As-Built]]
- [[Tanuj-Request-Reviewer-As-Built]]
- Clone: `~/scratch/augment-it-archaeology/prompt-manager/`
- Source: `https://github.com/lossless-group/prompt-manager`
