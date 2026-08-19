---
title: "Sharing code without breaking microfrontend autonomy: build-time import IS the copy"
lede: "With no `shared` block, a workspace import is inlined into all seventeen bundles. The cost isn't runtime coupling, it's redeploy fan-out."
date_created: 2026-08-06
date_modified: 2026-08-06
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5
semantic_version: 0.0.0.1
status: Reference
tags:
  - Note
  - Architecture
  - Augment-It
  - Module-Federation
  - Monorepo
  - Microservices
  - Design-System
site_uuid: dd90ecab-82c2-4f82-82e7-2a46b0243e5a
hex_code: yys433
date_authored_initial_draft: 2026-08-06
date_authored_current_draft: 2026-08-06
publish: true
---

# Sharing code without breaking microfrontend autonomy

## Why Care?

The instinct is sound and worth naming: if microfrontends and microservices
are supposed to "work on their own a bit," then pulling their shared code into
a common package sounds like it trades autonomy for DRY. Every consolidation
looks like a new coupling.

In this repo, for the frontends, **that trade doesn't exist** — and the reason
is a specific, deliberate choice already made in `shell/rsbuild.config.ts`.
For the services, the trade is real and has a price tag. The two halves of the
stack answer this question differently, which is the whole point of this note.

Verified 2026-08-06 against the configs and Dockerfiles.

## The fact that dissolves the question

The federation host declares **no `shared` block**, on purpose. From
`shell/rsbuild.config.ts`:

> *No `shared` block — sharing Svelte 5's reactive runtime and a `.svelte.ts`
> singleton across federation has known issues with the current
> `@module-federation/rsbuild-plugin` (factory-undefined at consume time, even
> with `eager:true` + bootstrap pattern)... each side owns its own Svelte
> runtime and its own workspace singleton. Cross-side state coherence is
> handled by the WebSocket broadcast.*

Consequence: **a build-time workspace import is inlined into each remote's own
bundle.** Importing `makeMount` from a shared package physically produces a
separate copy inside every `remoteEntry.js`.

So the "import or copy?" framing is a false choice here:

> **Build-time import *is* the copy** — one source of truth in the repo,
> N independent copies in the artifacts.

Each remote still boots with every other remote down. Nothing new is coupled
at runtime, because there is no runtime link to couple.

This is not novel; it's how `@augment-it/theme` already works across 52
imports and `workspace:*` deps in every app.

## The cost that IS real: redeploy fan-out

Shared code doesn't couple remotes at runtime. It couples them at **deploy
time**. Change the shared thing, and every remote must be rebuilt and
redeployed or it keeps serving its old inlined copy.

For framework glue this is exactly what you want — the
`theme.css`-before-`app.css` federation bug should be fixable in one place.
For a fast-moving design system it means every token tweak drags seventeen
deploys behind it.

Which yields the rule that actually matters:

> **Split shared packages by change frequency, not by topic.**
> Package granularity *is* redeploy blast radius.

`packages/theme` changes rarely. A component library will change constantly.
Keeping them separate means a button tweak doesn't force a rebuild of apps
that only consume tokens. By the same logic, `makeMount` belongs in its own
near-frozen package, **not** in `packages/workspace`, which changes often.

## What to share, what to duplicate

- **Share where convergence is the goal** and drift is a bug: theme tokens,
  design system, mount glue, protocol and contract types.
- **Duplicate where divergence is legitimate**: per-app product logic, and
  per-app styling beyond whatever the design system covers.

Duplication is not automatically debt. It's debt when two copies are *supposed*
to agree and nothing makes them.

## The asymmetry: apps and services build differently

This is the part that changes refactor plans, and it is easy to miss.

**Apps** (`apps/corpora-curator/Dockerfile`) build from the repo root:

```dockerfile
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @augment-it/corpora-curator build
```

They already see `packages/`. Sharing more costs nothing.

**Services** (`services/workspace/Dockerfile`) build from their own directory
with plain npm:

```dockerfile
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY src ./src
```

No workspace, no lockfile, **no access to `packages/` at all.**

So the services are genuinely standalone today — and that is *why*
`parseArgs()`, `sleep()`, and `fileExists()` got re-implemented inside them.
That duplication isn't sloppiness; the Dockerfile enforces it.

**Practical consequence:** "consolidate the duplicated helpers" is not one
task. Doing it across `scripts/` and the frontends is free. Doing it into
`services/` first requires migrating those Dockerfiles to root-context
workspace builds — a real change with real risk, and a separate decision.
See [[Structural-Refactors-Surfaced-by-the-Codebase-Graph]] (Tier 3).

## The general shape

| Sharing mechanism | Runtime coupling | Deploy coupling | Used here |
|---|---|---|---|
| Federation `shared` block (runtime singleton) | **Yes** — one instance across remotes | low | **No** — rejected, documented bug |
| Build-time workspace import (`workspace:*`) | **None** — inlined per bundle | rebuild consumers | **Yes** — theme, workspace |
| Scaffold / copy-paste template | None | none | implicitly, via `mount.ts` drift |

The third row is what you get by default when you *don't* decide. It has no
coupling and no source of truth, which is why seventeen `mount.ts` files
drifted into eleven identical copies plus six variants.

## If you build this out

- **Adding shared frontend code?** A `workspace:*` package. Runtime autonomy
  is unaffected. Ask only: how often will this change, and who rebuilds when
  it does?
- **Adding shared *service* code?** Answer the Dockerfile question first —
  root-context build, published package, or accept the duplication. All three
  are legitimate; silently assuming the first will break the image build.
- **Tempted by a federation `shared` block?** Read the comment in
  `shell/rsbuild.config.ts` before re-litigating it. The failure mode was
  concrete (`factory-undefined` at consume time) and the WebSocket broadcast
  replaced what it would have bought.

## See also

- [[Structural-Refactors-Surfaced-by-the-Codebase-Graph]] — the refactor
  backlog this note supplies the architectural constraints for
- [[The-Four-Layers-pnpm-Turbo-rsbuild-Federation-Bun]] — which tool owns
  which job; this note is the "so what" for the Module Federation row
- [[Why-This-Monorepo-Does-Not-Need-Turbo]] — the task-runner row, revisited
- [[Two-Tiers-WebSocket-To-The-Gateway-NATS-Between-Services]] — the runtime
  wire that replaced the shared-singleton claim
- `context-v/blueprints/Module-Federation-Rsbuild-Dev-Loop-Gotchas.md`
