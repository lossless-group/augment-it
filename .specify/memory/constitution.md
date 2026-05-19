<!--
Sync Impact Report
==================
Version change: (template) → 1.0.0
Bump rationale: Initial ratification — placeholders replaced with concrete
principles, sections, and governance for the augment-it project.

Modified principles: (none — initial ratification)
Added sections:
  - Core Principles I–V (Module Federation Boundaries, TypeScript Strict,
    Pseudomonorepo Discipline, AI Integrations via Typed Boundaries,
    Reproducible Builds)
  - Technology Constraints
  - Development Workflow
  - Governance
Removed sections: (none)

Templates requiring updates:
  - .specify/templates/plan-template.md       ✅ compatible (generic Constitution Check, no hardcoded principle names)
  - .specify/templates/spec-template.md       ✅ compatible
  - .specify/templates/tasks-template.md      ✅ compatible
  - .specify/templates/checklist-template.md  ✅ compatible

Follow-up TODOs: none.
-->

# Augment-It Constitution

Augment-It is a Turbo + Rsbuild + Module Federation monorepo that ships a web
application and supporting tooling for augmenting data with AI. This
constitution sets the non-negotiable principles that every feature, package,
and microfrontend in the repo MUST honor.

## Core Principles

### I. Module Federation Boundaries

Every user-facing capability MUST live in either a federated app under
`apps/`, a shared package under `packages/`, or the shell at `shell/`. Apps
MUST NOT import from one another's source directly; cross-app reuse MUST go
through a `packages/` entry with an explicit public API. The shell composes;
apps own a feature; packages expose contracts. Federation remotes MUST declare
their exposed modules and shared dependencies in `rsbuild.config.mjs` — ad-hoc
runtime imports are prohibited.

**Rationale:** Module Federation only pays off when the seams are real. Direct
cross-app reaches collapse the seams and turn the system into a slow monolith
with extra build steps.

### II. TypeScript Strict (NON-NEGOTIABLE)

All source MUST be TypeScript with `strict: true`. `any` is prohibited except
at clearly-labelled external boundaries (third-party SDKs without types,
runtime-parsed JSON pre-validation); each such use MUST be narrowed within the
same module. Generated or vendored `.d.ts` files do not count as exceptions.
Federation contracts (exposed modules, shared types) MUST export concrete
types, not `unknown`/`any`.

**Rationale:** Federation amplifies type drift across deploy boundaries.
Strict TS is the only cheap defense against runtime shape mismatches between
shell and remotes.

### III. Pseudomonorepo Discipline

This repo is a child of `lossless-monorepo/ai-labs/` and follows the Lossless
pseudomonorepo conventions. Every notable change MUST be recorded in
`changelog/` per `changelog-conventions`. Living docs (specs, prompts,
blueprints, explorations, issues) MUST live in `context-v/` per
`context-vigilance`. Branch tiers are `development → main → master`; the
parent's tier MUST match this repo's tier when promoting work upward. Repo
relocations within the tree require the three-precondition HARD STOP from the
parent `CLAUDE.md`.

**Rationale:** The tree-wide conventions are how multiple projects stay
discoverable and recoverable. Skipping them produces drift that costs more to
unwind than to maintain.

### IV. AI Integrations via Typed Boundaries

Every AI provider (Perplexity today; others later) MUST be wrapped in a
typed client under `packages/` with: (a) a single entry point, (b) explicit
input/output types, (c) timeouts and retry policy, (d) structured error
returns rather than thrown opaque errors at call sites. Apps and the shell
MUST NOT call provider SDKs or HTTP endpoints directly. Secrets MUST come from
environment variables enumerated in `.env.example`; no secret may be inlined
in source, committed, or logged.

**Rationale:** AI providers are the fastest-changing dependency in the
system. A typed wrapper is the only place to absorb provider churn, swap
models, add caching, or instrument cost — keeping it out of every app keeps
the apps cheap to evolve.

### V. Reproducible Builds

`pnpm` is the only package manager; the lockfile is authoritative and MUST be
committed. Turbo's task graph and cache MUST be the entry point for `dev`,
`build`, `lint`, and `test` — direct invocations of `rsbuild` or `next` in
docs or CI are prohibited except inside a Turbo task definition. The repo
Dockerfile MUST build from a clean checkout using only committed files and
`pnpm install --frozen-lockfile`; if local-machine state is required to
build, that is a bug and MUST be fixed rather than documented around.

**Rationale:** Module federation already produces enough moving parts at
runtime. The build itself MUST be deterministic so that "works in CI" and
"works in Docker" and "works on the laptop" describe the same artifact.

## Technology Constraints

The approved stack is fixed:

- **Build:** Turbo + Rsbuild (with Module Federation). Webpack, Vite, Parcel,
  and esbuild-as-bundler are out of scope. Rolldown may be evaluated as an
  Rsbuild internal, not as a replacement.
- **Language:** TypeScript everywhere. Plain JS only when wrapping a
  third-party file that cannot be retyped, and only inside `packages/`.
- **UI runtime:** React + Next.js inside the federated apps and shell. No
  Angular, Vue, Solid, Svelte, or framework-free DOM code in app surfaces.
- **Package manager:** `pnpm` with the workspace defined at the repo root.
- **AI providers:** Perplexity is the current default. Additional providers
  are added via Principle IV, never inlined.
- **Container:** The root `Dockerfile` is the source of truth for production
  build steps; app-level Dockerfiles MUST extend it rather than diverge.

Any deviation requires a written exception in `context-v/explorations/`
documenting the trade-off, an owner, and a sunset condition.

## Development Workflow

- **Branching:** `development` is the default working branch; promotions to
  `main` happen when work is noteworthy; `master` is the stable line and
  updates only when the dust has settled.
- **Specs first:** Non-trivial features start with a Spec Kit flow
  (`/speckit-specify` → `/speckit-plan` → `/speckit-tasks`). The plan's
  Constitution Check MUST pass — or document an explicit, justified violation
  in the plan's Complexity Tracking section — before implementation begins.
- **Changelog:** Every shipped chunk of work writes a `changelog/` entry per
  Lossless conventions before the PR merges.
- **Reviews:** PRs MUST verify (a) federation boundaries are intact, (b)
  TypeScript strictness was not loosened, (c) AI calls go through
  `packages/`, (d) the lockfile is updated when dependencies changed, (e)
  the Dockerfile still builds from a clean checkout when build-relevant files
  changed.
- **Tests:** Tests are RECOMMENDED for business logic in `packages/` and
  REQUIRED for any typed AI-provider wrapper (at minimum: a contract test
  that exercises input/output types against a recorded response). Tests are
  NOT mandatory for thin UI shells; do not pad with low-value snapshot tests.

## Governance

This constitution supersedes ad-hoc conventions inside this repo. Where it
conflicts with the parent `lossless-monorepo/CLAUDE.md` or
`ai-labs/CLAUDE.md`, the parent wins for tree-wide concerns (relocation
safety, branch tiers, MCP scope, Chroma RAG); this constitution wins for
augment-it-internal architecture decisions.

**Amendment procedure:** Amendments are proposed as a PR that (a) edits this
file, (b) updates the Sync Impact Report comment at the top, (c) bumps the
version per the policy below, and (d) updates any template or doc the
amendment invalidates. At least one repo maintainer approval is required to
merge.

**Versioning policy** (semantic):
- **MAJOR** — a principle is removed or its meaning is reversed; a previously
  permitted practice is now prohibited (or vice versa) in a way that
  invalidates existing code or specs.
- **MINOR** — a new principle or section is added, or an existing principle
  is materially expanded.
- **PATCH** — wording, typo, clarification, or non-semantic refinement.

**Compliance review:** Every plan generated by `/speckit-plan` MUST run the
Constitution Check against the principles above. Violations MUST be either
fixed or recorded in the plan's Complexity Tracking with explicit
justification — silent violations are treated as defects in review.

**Runtime guidance:** Day-to-day "how do we do X in this repo" lives in
`CLAUDE.md` at the repo root and in `context-v/`. This constitution is the
short list of things that MUST NOT drift; the rest is guidance.

**Version**: 1.0.0 | **Ratified**: 2026-05-18 | **Last Amended**: 2026-05-18
