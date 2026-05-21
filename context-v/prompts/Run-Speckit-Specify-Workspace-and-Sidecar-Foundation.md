---
title: "Run /speckit-specify — Workspace + Sidecar Foundation (Feature 001)"
lede: "The first feature spec for augment-it after the constitution lands. Scope: the workspace package and bun sidecar that everything else depends on, plus exactly one read-only capability (records.import) end-to-end to prove the pipe. No federation yet. No research agents yet. No chat surface implementation yet. Just the foundation that makes every subsequent feature possible — and a CSV import that lands rows in the workspace and persists them to disk."
date_created: 2026-05-18
date_modified: 2026-05-18
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
semantic_version: 0.0.0.1
tags:
  - Prompt
  - Spec-Kit
  - Specify
  - Augment-It
  - Walking-Skeleton
  - First-Feature
status: Draft
---

# Run /speckit-specify — Workspace + Sidecar Foundation

## Why narrow scope

`/speckit-specify` produces one feature spec per invocation. Going broad (the whole walking skeleton at once) would generate a sprawling document that's hard to plan, task, and implement cleanly. Narrow gives us a real first feature to ship: the foundation that everything else hangs off, plus one end-to-end capability that proves it works.

Subsequent features get their own `/speckit-specify` calls — listed under "Future features" below.

## Prerequisite reading

`/speckit-specify` should read these before drafting:

- `.specify/memory/constitution.md` — the ratified principles (just landed via /speckit-constitution)
- `context-v/specs/Walking-Skeleton-Pre-Flight-Decisions.md` — the five substrate calls
- `context-v/blueprints/Spec-Kit-and-Context-V-Coexistence.md` — how to balance the two systems
- `ai-labs/context-v/blueprints/Per-App-Workspace-Conventions.md` — the workspace pattern
- `memopop-ai/apps/memopop-native/src/lib/stores/flow.svelte.ts` — canonical Svelte 5 reference

## How to invoke

```
/speckit-specify Read context-v/prompts/Run-Speckit-Specify-Workspace-and-Sidecar-Foundation.md and follow its "Feature description" section. Scope is intentionally narrow — workspace package + sidecar + records.import only. Federation, research agents, chat, and other capabilities come in subsequent features.
```

## Feature description

### What we're building

The augment-it foundation:

1. **`@augment-it/workspace` package** — a Svelte 5 `$state` class (`AugmentItWorkspace`) following [[Per-App-Workspace-Conventions]] and the canonical memopop `FlowState` pattern. Exports the singleton `workspace`, the `ActiveView` discriminated union, the `WorkspaceAdapter` implementation for `@lossless/in-app-agent`, and capability registry plumbing.

2. **`apps/sidecar/` — a bun HTTP server at localhost:8787** that:
   - Resolves opaque session tokens via `x-augment-it-session` header; mints new ones on first contact (Decision 4 of the pre-flight)
   - Routes `POST /api/<entity>.<verb>` to registered capability handlers
   - Persists session, record, and other state to JSON files under `augment-it/data/` (Decision 3 of the pre-flight)
   - Hot-reloads via `bun --watch`

3. **`records.import` capability** — end-to-end:
   - Workspace handler at `records.ts` calls `fetch('/api/records.import', { method: 'POST', body: ... })`
   - Sidecar route accepts a CSV (file blob or pasted text), parses with a small library (e.g. `papaparse` or Bun's CSV utilities)
   - Returns `{ data: { record_set_id, row_count, fields }, display_hint: { mount: 'record_list', props: { record_set_id } } }`
   - Sidecar saves to `data/records.json`
   - Workspace receives the result, transitions `activeView` to `{ kind: 'record_list', recordSetId }`
   - A minimal Svelte 5 component (`RecordList.svelte`) reads `workspace.activeView` and renders the rows

4. **A 50-line shell** — Svelte 5 component that:
   - On mount, calls `GET /api/session` to establish a session
   - Mounts `<AgentProvider>` (from `@lossless/in-app-agent`) around an `<ActiveViewMount />` that switches on `workspace.activeView.kind`
   - For now: only `idle` and `record_list` view kinds exist

5. **Project plumbing:**
   - `package.json` workspaces field at the augment-it root declaring `packages/workspace`, `packages/in-app-agent` (the local stub), `apps/sidecar`, `shell`
   - `rsbuild.config.ts` with `@rsbuild/plugin-svelte`, dev-server proxy for `/api/*` → `localhost:8787`
   - `augment-it/data/` gitignored

### Constraints (per constitution + pre-flight)

- **Svelte 5** with `$state` runes; **no** React, useSyncExternalStore, Zustand, Jotai
- **bun** for everything orchestrational; no pnpm, no turbo
- **rsbuild** for the frontend bundler with `@rsbuild/plugin-svelte`
- **No Module Federation yet** — single bundle for this feature; federation is a separate feature
- **`@module-federation/dts-plugin`** not needed yet (single bundle)
- **TypeScript** everywhere
- **All state mutations** go through `workspace.invoke('capability.name', args)` — the three guards
- **Session token storage:** `localStorage` on the browser, `data/sessions.json` on the sidecar
- **Capability name:** `records.import` (entity.verb, snake_case kinds in activeView)
- **No tests required for this feature** — walking skeleton priority; tests come in a follow-up feature once the pattern is real

### What's explicitly out of scope

- Module Federation 2.0 setup (subsequent feature)
- Research agents — `research.social_profiles`, `research.web_crawl`, etc. (subsequent features, one per agent)
- The chat surface UI (just provider mounting; `<ChatSurface>` renders nothing meaningful yet)
- Highlight collector, response reviewer, prompt template manager UIs
- CRM write-back (insight-manager)
- Multi-tenant Chroma collections
- Real auth flow (we use opaque tokens; OAuth is later)
- libSQL/Turso migration (JSON files are fine for now)

### What "done" looks like

Manual smoke test:

1. `cd augment-it && bun install && bun --filter '*' dev`
2. `bun --watch apps/sidecar/src/server.ts` running in another terminal
3. Browser opens to the rsbuild dev URL
4. First load: browser receives a session token, stores in localStorage, prints user name in some debug spot
5. Drag-drop or paste a CSV into a minimal import UI
6. `records.import` fires; sidecar parses; `data/records.json` updates on disk
7. Workspace's `activeView` transitions to `{ kind: 'record_list', recordSetId: ... }`
8. `RecordList.svelte` renders the rows
9. Refresh the browser; session persists; records persist; the import doesn't have to happen again

If all nine steps work, the foundation is real.

### Implementation order suggestions (for `/speckit-plan` later)

1. Root `package.json` + `bun install` + workspaces declaration
2. `apps/sidecar/` skeleton with session resolver only — test with `curl localhost:8787/api/session`
3. `packages/workspace/` skeleton — class, singleton, types
4. `packages/in-app-agent/` minimal stub — WorkspaceAdapter interface + AgentProvider that just holds the adapter
5. `shell/` skeleton — mount, session bootstrap, ActiveViewMount
6. Add `records.import` capability handler in the sidecar; `data/records.json` persistence
7. Add `records.import` registration in the workspace + Svelte component for `record_list` view
8. Smoke test the full path

## Future features (each its own `/speckit-specify` later)

- **Feature 002 — `research.social_profiles` end-to-end.** First real research agent. Proves the per-row capability pattern. Adds the multi-agent fan-out machinery in skeleton form (still single agent for this feature; the fan-out shape itself is feature 005).
- **Feature 003 — Module Federation 2.0 + rsbuild setup.** Single-bundle becomes a host + remotes. Per [[Federation-and-Bundler-Decision]].
- **Feature 004 — First federated remote: `record-collector`.** The ingest UI extracted as a federated app per the federation decision.
- **Feature 005 — Multi-agent fan-out runtime.** Per-row × per-agent jobs, character cast, partial-result tolerance. Per [[Multi-Agent-Research-Fan-Out-Per-Row]].
- **Feature 006 — Chat surface implementation.** Anthropic streaming, tool-use, transcript persistence, the actual chat UI inside `<ChatSurface>`.
- **Feature 007 — `response-reviewer` remote.** Per [[Why-Response-Reviewer-and-Highlight-Collector-Exist]].
- **Feature 008 — `highlight-collector` remote.**
- **Feature 009 — `insight-manager` + first CRM adapter.** Real CRM write-back.

This ordering is a recommendation, not a contract — adjust as reality contacts the code.

## After this feature spec lands

1. Review `.specify/memory/specs/001-*/spec.md` (the file `/speckit-specify` creates).
2. Optionally `/speckit-clarify` to de-risk anything ambiguous.
3. `/speckit-plan` to draft an implementation plan.
4. `/speckit-checklist` (recommended for a foundation feature) to generate quality gates.
5. `/speckit-tasks` to break the plan into actionable tasks.
6. `/speckit-analyze` to cross-check consistency.
7. Review gate.
8. `/speckit-implement` — execute.

## Related

- `.specify/memory/constitution.md` — the ratified principles this feature must respect
- `context-v/specs/Walking-Skeleton-Pre-Flight-Decisions.md` — the five substrate calls
- `context-v/blueprints/Spec-Kit-and-Context-V-Coexistence.md` — the workflow framework
- `context-v/blueprints/Module-Federation-Rsbuild-Dev-Loop-Gotchas.md` — relevant for feature 003+
- `ai-labs/context-v/blueprints/Per-App-Workspace-Conventions.md` — workspace pattern
- `ai-labs/context-v/explorations/Remote-Mount-Contract-for-In-App-Agent.md` — adapter contract
- `memopop-ai/apps/memopop-native/src/lib/stores/flow.svelte.ts` — canonical Svelte 5 reference
