---
title: "Run /speckit-constitution — Seed Augment-It's Constitution from Context-V"
lede: "The directive to paste alongside /speckit-constitution to fill .specify/memory/constitution.md from augment-it's already-documented thinking. Five principles, two constraint sections, governance — all grounded in the context-v blueprints and specs so spec-kit synthesizes from what we've actually decided rather than re-deriving from training data."
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
  - Constitution
  - Augment-It
  - First-Session
status: Draft
---

# Run /speckit-constitution

## Why this prompt exists

`/speckit-constitution` reads the project's principles and fills `.specify/memory/constitution.md` from a template, then propagates consistency to `.specify/templates/*`. We want the constitution synthesized from our already-documented context-v thinking, not re-derived from training data.

This prompt provides the directive to paste with the slash command. Future amendments to the constitution should reference and update this prompt (or supersede it with a fresh one).

## Prerequisite reading for the synthesizer

The skill must read these before drafting principle descriptions:

- `context-v/specs/Walking-Skeleton-Pre-Flight-Decisions.md`
- `context-v/blueprints/Per-App-Workspace-Conventions.md` (which lives in `ai-labs/context-v/blueprints/`)
- `context-v/blueprints/Why-Response-Reviewer-and-Highlight-Collector-Exist.md`
- `context-v/blueprints/Module-Federation-Rsbuild-Dev-Loop-Gotchas.md`
- `context-v/blueprints/Spec-Kit-and-Context-V-Coexistence.md`
- `context-v/explorations/Federation-and-Bundler-Decision.md`
- `context-v/explorations/Augment-It-Prior-Art-Survey.md`
- `context-v/explorations/Multi-Agent-Research-Fan-Out-Per-Row.md`

Plus the cross-cutting in `ai-labs/context-v/`:

- `ai-labs/context-v/blueprints/Per-App-Workspace-Conventions.md`
- `ai-labs/context-v/explorations/Remote-Mount-Contract-for-In-App-Agent.md`
- `ai-labs/context-v/explorations/In-App-Chat-as-Agent-Surface-for-Client-Apps.md`

## How to invoke

In Claude Code, type either of the two forms below.

### Form A — Pointer to this prompt (recommended)

Lighter, lets spec-kit's skill read this file directly:

```
/speckit-constitution Synthesize the augment-it constitution per context-v/prompts/Run-Speckit-Constitution.md. Read the prerequisite docs listed there, then build the constitution with the principles, stack constraints, workflow conventions, and governance defined in the "Directive content" section below. Ratification date 2026-05-18, version 1.0.0.
```

### Form B — Full directive inline

Heavier paste; explicit; doesn't require the skill to read this prompt file:

```
/speckit-constitution Read context-v/blueprints/ and context-v/specs/Walking-Skeleton-Pre-Flight-Decisions.md. Synthesize a constitution with five principles aligned to those documents: (1) Per-App Workspaces Not Universal State, (2) Capabilities Are the Only Mutation Surface (NON-NEGOTIABLE), (3) Chat is Optional Workspace is Required, (4) Prior Art Beats Hypothesis, (5) Substrate Decisions Are Documented Before Code (NON-NEGOTIABLE). Add Stack Constraints and Workflow Conventions sections. Stack Constraints: bun for orchestration + package management, rsbuild + Module Federation 2.0 with @rsbuild/plugin-svelte, @module-federation/dts-plugin for TS across federation seams, Svelte 5 + TypeScript for UI (matching memopop-ai's FlowState pattern), $state runes on workspace classes (no useSyncExternalStore — that pattern is preserved as cross-framework reference only), HTTP fetch to bun sidecar at localhost:8787 for capability transport, JSON-file persistence under augment-it/data/ until multi-device demands libSQL, opaque session tokens auto-minted by sidecar on first contact (no OAuth in v1), Module Federation singleton:true required for both @augment-it/workspace and @lossless/in-app-agent. Workflow Conventions: per-feature flow runs /speckit-specify → /speckit-clarify (optional) → /speckit-plan → /speckit-checklist (optional) → /speckit-tasks → /speckit-analyze (optional) → /speckit-implement with human review gates; living memory stays in context-v/; per-feature artifacts live in .specify/memory/; Train-Case for filenames and tags; snake_case for frontmatter keys; full package names like @augment-it/workspace never @aug/workspace. Governance: constitution supersedes all other practices for augment-it; amendments require rationale in context-v/explorations/ + version bump + sync impact report propagated to .specify/templates/ and relevant context-v blueprints; substrate changes require reading the corresponding blueprints first; PRs touching capability handlers MUST verify the three-guards model still holds. Ratify 2026-05-18, version 1.0.0.
```

## Directive content (used by Form A)

### The five principles

**Principle 1 — Per-App Workspaces, Not Universal State.** Each app owns its own workspace package (`@augment-it/workspace`, `@memopop-ai/workspace`, `@dididecks-ai/workspace`). State of truth lives there: entities, capability registry, `activeView` discriminated union. No universal data-model package across the family. Cross-app integration goes through capability invocation, never shared type imports.

**Principle 2 — Capabilities Are the Only Mutation Surface (NON-NEGOTIABLE).** All state changes flow through `workspace.invoke('entity.verb', args)`. Direct state mutation outside a registered capability handler is forbidden. The capability registry is the documented, auditable, tier-gated side-effect surface for the system.

**Principle 3 — Chat is Optional, Workspace is Required.** Augment-it must remain functional without `@lossless/in-app-agent` loaded. The workspace is the source of truth; chat is one consumer among many (Window, headless workflow scripts, future agent modes). Apps that cannot ship without chat have leaked chat-shaped logic into their workspace and must be refactored.

**Principle 4 — Prior Art Beats Hypothesis.** When prior implementations exist (bolt monolith, Tanuj's federated split, memopop's FlowState), they are read and documented as "as-built" archaeology before new architecture is proposed. Architectural decisions cite real prior art, not training-data memory.

**Principle 5 — Substrate Decisions Are Documented Before Code (NON-NEGOTIABLE).** Architectural substrate choices — bundler, federation strategy, state management, transport, persistence, auth — are documented in `context-v/specs/` or `context-v/explorations/` before implementation begins. The `Walking-Skeleton-Pre-Flight-Decisions` pattern is the template. Ducttape now costs more than discipline now.

### Stack Constraints (Section 2)

- **Orchestration & package management:** bun (no pnpm, no turbo)
- **Frontend bundler:** rsbuild with Module Federation 2.0 (`@module-federation/rsbuild-plugin`)
- **TypeScript across federation seams:** `@module-federation/dts-plugin` mandatory
- **UI framework:** Svelte 5 + TypeScript (matches memopop-ai; matches the broader Lossless family's no-React stance)
- **Rsbuild plugin:** `@rsbuild/plugin-svelte` (not `@rsbuild/plugin-react`)
- **State subscription:** Svelte 5 `$state` runes on workspace classes — same pattern as memopop's `FlowState`. No `useSyncExternalStore`, Zustand, Jotai, or MobX. The React `useSyncExternalStore` pattern is preserved as cross-framework reference only.
- **Capability transport:** HTTP fetch to bun sidecar at `localhost:8787` (rsbuild proxies `/api/*`)
- **Persistence:** sidecar writes to JSON files under `augment-it/data/` (gitignored); graduate to libSQL when multi-device or query patterns demand it
- **Auth:** opaque session tokens auto-minted by sidecar on first contact; no OAuth in v1
- **Module Federation singletons:** `@augment-it/workspace` AND `@lossless/in-app-agent` declared `singleton: true` in every host and remote

### Workflow Conventions (Section 3)

- **Per-feature implementation flow:** `/speckit-constitution` → `/speckit-specify` → `/speckit-clarify` (optional) → `/speckit-plan` → `/speckit-checklist` (optional) → `/speckit-tasks` → `/speckit-analyze` (optional) → `/speckit-implement`. Human review gates honored between major phases.
- **Living memory** (explorations, blueprints, reminders, broader specs, slide content) stays in `context-v/`.
- **Per-feature implementation artifacts** (feature spec, plan, tasks) live in `.specify/memory/`.
- **Filenames:** Train-Case (`My-Doc-Name.md`).
- **Tags:** Train-Case.
- **Frontmatter property keys:** snake_case.
- **Package names:** full, no abbreviations — `@augment-it/workspace`, never `@aug/workspace`.
- **Status discipline** per context-v skill: `Draft` → `In-Review` → `Signed-Off` → `Implementing` → `Shipped` / `Partially-Shipped` / `Deferred` / `Stale` / `Superseded` / `Archived`.

### Governance

- Constitution supersedes all other practices for augment-it.
- Amendments require: rationale documented in `context-v/explorations/`, version bump per semver, sync impact report propagated to `.specify/templates/*` and the relevant context-v blueprints.
- Substrate changes (anything touching the Stack Constraints section) require reading the corresponding `context-v/blueprints/` and `context-v/specs/` before proposing.
- Pull requests touching capability handlers MUST verify the three-guards model still holds (capability registry as the only side-effect surface; system prompt anchored in skills; per-org policy enforced at the registry).

### Ratification

- **Ratification date:** 2026-05-18
- **Version:** 1.0.0

## After the constitution fills

1. Verify the output in `.specify/memory/constitution.md` matches the directive above.
2. Verify `.specify/templates/*` files were updated per the consistency-propagation checklist (the `/speckit-constitution` skill handles this; the Sync Impact Report at the top of the constitution file lists what was touched).
3. Move to `/speckit-specify` for the first feature — the augment-it walking skeleton per `context-v/specs/Walking-Skeleton-Pre-Flight-Decisions.md`. A follow-up prompt file (`Run-Speckit-Specify-Walking-Skeleton.md`) will live in this same `prompts/` directory.

## Related

- `.specify/memory/constitution.md` — the output target
- `.specify/templates/constitution-template.md` — the source template
- `context-v/specs/Walking-Skeleton-Pre-Flight-Decisions.md` — the five substrate decisions the constitution encodes
- `context-v/blueprints/Spec-Kit-and-Context-V-Coexistence.md` — the workflow framework
- All prerequisite docs listed under "Prerequisite reading for the synthesizer" above
