---
title: "Tanuj's Request-Reviewer As Built — The Module Federation Proof"
lede: "The smallest of the four sources, and architecturally the most important. Vite + React 19 + Module Federation. The only place Tanuj actually got cross-app code sharing to work — a federated `RecordCard` component imported from `@module-federation-vite/ui`. The augmentation logic, however, is duplicated from record-collector by copy-paste, which exposes the seam that the federation experiment didn't resolve."
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
  - Request-Reviewer
  - Module-Federation
  - As-Built
status: Archived
---

# Tanuj's Request-Reviewer As Built

## What this is

Repo: `lossless-group/request-reviewer`, default branch `development` (only branch). Built by Tanuj summer 2025 as the third microfrontend split, this time on a different stack from the first two — Vite instead of Next.js — specifically to host Module Federation.

Local clone: `~/scratch/augment-it-archaeology/request-reviewer/`.

The commit history is short and on-point:

1. `initial commit: ready for module federation`
2. `working: module federation`
3. `improve(ui) RecordCard is now a shared component`

That's the whole repo. A federation proof in three commits.

## Stack

| Concern | Choice |
|---|---|
| Build | Vite |
| Language | JavaScript |
| UI | React 19.1.0 |
| State | zustand 5.0.6 |
| Federation | `@module-federation-vite/utils`, `@module-federation-vite/ui` (file-deps in `packages/`) |
| Icons | lucide-react |
| Styling | Tailwind |

Notable: it depends on local file paths (`file:../../packages/utils`, `file:../../packages/ui`) — meaning **this repo only runs inside the parent augment-it monorepo**, not standalone. That's true of any module-federation host, but it's worth flagging: cloning this repo alone won't build.

## What's actually federated

The proven case: `RecordCard.jsx` was extracted from `record-collector` and placed in `packages/ui/RecordCard`. Both `request-reviewer` and (presumably) `record-collector` import it from `@module-federation-vite/ui/RecordCard`:

```jsx
import { RecordCard } from '@module-federation-vite/ui/RecordCard';
import { ErrorBoundary } from '@module-federation-vite/ui/ErrorBoundary';
```

So the federation infrastructure is real, the build wiring works, and one component (`RecordCard`) plus one utility (`ErrorBoundary`) successfully cross the seam.

## The smoking gun — duplicated augmentation logic

The body of `src/components/RequestReviewer.jsx` is **largely a copy-paste of `record-collector/src/components/AugmentPage.js`**. Specifically:

- The same `generateDefaultPrompt(customProperties)` function, character-for-character.
- The same component-local `useState` setup for `selectedRecords`, `isAugmenting`, `processingRecords`, `results`, `showResults`.
- The same call into `useRecordStore` for `availableFields`.

The federation experiment succeeded at sharing **dumb display components** (a card) but failed at sharing **stateful logic** (the prompt generator + augmentation runner). Two patterns in the same codebase, addressed differently:

| Concern | Resolution |
|---|---|
| Visual atom (RecordCard) | Federated package, shared cleanly |
| Stateful logic (generateDefaultPrompt) | Copy-pasted into each consumer |
| State store (useRecordStore) | Re-imported in each microfrontend, presumably with separate instances |

This is the **architectural lesson** of the federation experiment, more valuable than the proof itself: *Module Federation gives you the bundler tools to share code, but it does not answer the question of where shared state lives.* That answer has to come from somewhere else.

For the rewrite, the candidates are:

1. **Lift state into a shared package** federated like `RecordCard` is — works for stateless logic, dubious for live stores.
2. **A shared state service** (e.g., a tiny FastAPI or bun-server endpoint each microfrontend reads/writes from) — natural for "microservices" framing, adds a network hop.
3. **One coordinating host (the shell)** owns the store and exposes it to mounted microfrontends through a defined seam (a context, a custom event bus, postMessage).
4. **No federation, single bundle** — the question dissolves.

The choice of 1/2/3/4 is the choice that resolves Tanuj's open seam.

## The `RecordCard` extraction is the right model

Worth saying: federating `RecordCard` was the right call. It's a stateless, visual atom that multiple microfrontends genuinely render. The "improve(ui) RecordCard is now a shared component" commit is a real architectural improvement.

The right rewrite probably keeps this pattern even if it changes the bundler:

- **Per-microfrontend:** routes, stage-specific state, stage-specific UI compositions
- **Shared package(s):** atoms (RecordCard, RecordList, ErrorBoundary), schemas (Record, PromptTemplate, AIResponse), and stateless utilities (CSV parsing, prompt building, response handling)

What does **not** federate cleanly: the cross-stage state. That has to be owned by exactly one thing.

## What's missing

- **Anything beyond the federation proof.** Two real components, no real feature work past `record-collector` parity.
- **Wiring to a real shared store.** Even though it imports `useRecordStore`, the experiment never demonstrated cross-app store sharing.
- **The other shared atoms.** Only `RecordCard` and `ErrorBoundary` got federated. `PerplexityConfig` is reimported locally instead of federated.

## What to lift, what to drop

**Lift:**

- The `RecordCard` + `ErrorBoundary` federation pattern as a model for what *should* federate
- The recognition (even if implicit) that there are two kinds of cross-app artifacts: shareable atoms and unshareable state
- The Vite + Module Federation tooling itself, **if** we decide federation is the answer (open question)

**Drop:**

- The copy-pasted `generateDefaultPrompt`. Anything duplicated across more than one consumer needs to either federate or be a single-source helper.
- The `file:../../` package deps — fragile and accidentally tied to a specific monorepo layout

**Revisit:**

- Whether `RecordList` (plural) is what should be federated rather than `RecordCard` (singular). The plural lets the consumer parameterize selection / display / actions without owning the list state.
- Whether the same federation works under bun — `@module-federation-vite/*` is presumably Vite-specific; bun's bundler story is different.

## Related

- [[Augment-It-Prior-Art-Survey]]
- [[Bolt-Monolith-As-Built]]
- [[Tanuj-Record-Collector-As-Built]] — the source of the copy-pasted augmentation logic
- [[Tanuj-Prompt-Manager-As-Built]]
- Clone: `~/scratch/augment-it-archaeology/request-reviewer/`
- Source: `https://github.com/lossless-group/request-reviewer`
