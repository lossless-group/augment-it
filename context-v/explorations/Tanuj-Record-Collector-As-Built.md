---
title: "Tanuj's Record-Collector As Built"
lede: "The most-finished of the three microfrontend repos Tanuj split out. A standalone Next.js 15 app with a working ingest → configure → augment → export flow, a zustand-with-persist store, Perplexity-only LLM substrate, and one genuinely clever idea — the prompt template auto-generates from whatever columns the imported CSV has. Not the architecture we're keeping, but the field-aware prompt-generation idea is."
date_created: 2026-05-18
date_modified: 2026-05-18
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
semantic_version: 0.0.0.1
tags:
  - Exploration
  - Augment-It
  - Prior-Art
  - Record-Collector
  - As-Built
status: Draft
---

# Tanuj's Record-Collector As Built

## What this is

Repo: `lossless-group/record-collector`, default branch `master`. Built by Tanuj summer 2025. A standalone Next.js single-page-app that does the first three pipeline stages (ingest, configure, augment) and the last one (export) in one bundle, with no awareness that it would eventually be a microfrontend among siblings.

Local clone: `~/scratch/augment-it-archaeology/record-collector/`.

## Stack

| Concern | Choice |
|---|---|
| Build | Next.js 15.4.3 with `next dev --turbopack` |
| Language | JavaScript (no TypeScript) |
| UI | React 19.1.0 |
| State | zustand 5.0.6 with `zustand/middleware` `persist` |
| CSV | papaparse 5.5.3 |
| LLM | Perplexity (no other providers) |
| Icons | lucide-react |
| Styling | Tailwind 4 |

Notable: persisting zustand to localStorage means imported records survive a reload, which is the right call for a side-project demo but the wrong call for a multi-user product. Also notable: no TypeScript.

## Routes (`src/app/`)

- `/` — the main `RecordCollector` UI (import + browse records)
- `/augment` — `AugmentPage` (select records, configure Perplexity, fire calls, view results)
- `/export` — `ExportPage` (re-emit as CSV)

## Components (`src/components/`)

- `RecordCollector.js` — root of `/`
- `ImportModal.js` — CSV import (uses papaparse)
- `RecordCard.js` — single-record display
- `SearchBar.js`, `Navigation.js`, `SplashScreen.js`, `DeleteConfirmModal.js` — UI infrastructure
- `AugmentPage.js` — root of `/augment`
- `PerplexityConfig.js` — API key, prompt, model selection, deep-research toggle, custom-properties editor
- `AugmentationResults.js` — display LLM output per record
- `ExportPage.js` — root of `/export`

## The store (`src/lib/store.js`)

zustand + persist. State shape:

```js
{
  records: [],                    // imported rows with augmentation results
  selectedRecord: null,
  availableFields: [],            // derived from CSV columns
  perplexityConfig: {
    apiKey: '',
    prompt: '',
    useDeepResearch: false,
    selectedModel: 'sonar',
    customProperties: []          // user-defined extra fields to research
  }
}
```

Records get IDs auto-generated on import, plus `augmentationResults`, `lastAugmented`, `customProperties` (the LLM-returned values). `availableFields` is recomputed from the first imported record's keys.

This is **a simpler, single-entity version** of the bolt monolith's store. There are no templates, no models, no responses-as-rich-objects, no highlights. Everything LLM-related is squashed into the per-record `augmentationResults` field.

## The clever idea — field-aware prompt auto-generation

In `AugmentPage.js`:

```js
const generateDefaultPrompt = (customProperties = []) => {
  const fieldPlaceholders = availableFields
    .map(field => `- ${field}: {${field}}`)
    .join('\n');

  let prompt = `Analyze the following company information and provide insights:
  **Company Details:**
  ${fieldPlaceholders}
  Please provide: 1. Market analysis ...`;

  if (customProperties.length > 0) {
    prompt += `
    **Additional Research Required:**
    ${customProperties.map(p => `- ${p}: Research and provide the ${p.replace(/_/g, ' ')}`).join('\n')}

    **IMPORTANT:** End your response with a JSON object:
    \`\`\`json
    { "custom_properties": { ${customProperties.map(p => `"${p}": "..."`).join(', ')} } }
    \`\`\``;
  }
  return prompt;
};
```

Two ideas worth keeping:

1. **The prompt scaffold rebuilds whenever the CSV's columns change.** A user uploads a different CSV, the prompt automatically reflects the new fields. No prompt engineering per use case.
2. **Custom properties as a generic mechanism for "I want the LLM to research X, Y, Z and return them structured."** The user types `recent_funding_round` and `founder_linkedin` into the custom-properties UI; the prompt's footer asks the LLM to return them as JSON. This is essentially a poor-person's tool-use, and it's exactly the right shape for the fundraising-lead-list use case the paying client has.

This is the **primary lift-out** from record-collector. The mechanism — *infer prompt structure from CSV, let user name extra fields, structured JSON tail* — is general-purpose and worth carrying into the rewrite, probably promoted to a proper tool-use schema rather than an inline-JSON convention.

## The dead-on-arrival idea — JS instead of TS

Both record-collector and prompt-manager are plain JavaScript. The store has no schema discipline, the components consume untyped objects, and the data flowing through the augmentation pipeline (rows → fields → prompts → LLM responses → parsed JSON → re-merged into records) is exactly the kind of pipeline where types catch real bugs.

The rewrite is TypeScript. Bolt was already TS; the federated repos regressed.

## What's missing

- **No multi-provider.** Perplexity-only. Hardcoded `selectedModel: 'sonar'`.
- **No prompt template management.** The prompt is auto-generated, then editable in a textarea, with no save / version / library. (Prompt-manager exists separately but they don't talk to each other.)
- **No response review.** The augmentation result is dumped into a card and that's it. No structured inspection, no highlight extraction, no per-section evaluation.
- **No CRM write-back.** Export is `papaparse` re-emit as CSV. The user manually pastes into the CRM.
- **No auth.** Localhost demo only.

## What to lift, what to drop

**Lift:**

- The field-aware prompt auto-generation pattern
- The custom-properties JSON-tail mechanism (as input to a proper tool-use spec)
- Routes-as-pipeline-stages — `/augment` and `/export` as distinct surfaces with shared state

**Drop:**

- JavaScript → TypeScript
- Next.js — wrong host for federation, and we don't need SSR for an internal tool
- Perplexity-only — multi-provider per bolt
- zustand persist to localStorage — single-user demo pattern, won't survive a multi-user product
- The inline `generateDefaultPrompt()` function duplicated into other repos (request-reviewer has the exact same one copy-pasted; this is the seam that has to be designed properly)

## Branches worth knowing about

The repo has a branch called `independent` alongside `master` and `development`. Worth a future spot-check — likely a fork point where Tanuj tried to make this standalone-deployable separate from the federation experiment. Not opening that today.

## Related

- [[Augment-It-Prior-Art-Survey]]
- [[Bolt-Monolith-As-Built]]
- [[Tanuj-Request-Reviewer-As-Built]] — duplicates this repo's `generateDefaultPrompt` function
- Clone: `~/scratch/augment-it-archaeology/record-collector/`
- Source: `https://github.com/lossless-group/record-collector`
