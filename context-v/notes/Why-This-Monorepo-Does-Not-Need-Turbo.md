---
title: "Why this monorepo does not need Turbo: a task graph with no edges"
lede: "Turbo's core directive is `dependsOn: [\"^build\"]` — build my dependencies first. No package in packages/ has a build step, so it resolves to nothing. We adopted a best practice for an architecture we then didn't build."
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
  - Tooling
  - Monorepo
  - Turborepo
  - Build-Systems
site_uuid: 732ae6b2-3355-4a95-88c7-dfb33353cea7
hex_code: knjsnf
date_authored_initial_draft: 2026-08-06
date_authored_current_draft: 2026-08-06
publish: true
---

# Why this monorepo does not need Turbo

## Why Care?

`turbo.json` sits at the root. The trunk branch is called
`rebuild/turbo-rsbuild`. Both are historical artifacts. Turbo has no job in
this repo, and the reason is structural rather than a matter of taste — which
means it's worth writing down once, so the question "why doesn't this monorepo
use Turbo?" doesn't get re-litigated from first principles in six months.

This note supersedes the Turbo row of
[[The-Four-Layers-pnpm-Turbo-rsbuild-Federation-Bun]], which described Turbo
as "assumed-global, not a declared dep" and credited it with "the task graph +
cache." Verified 2026-08-06: it is not merely un-declared, it is absent — and
the task graph it would run is empty.

## The finding

Turbo's central directive, and the reason `turbo.json` exists:

```json
"build": { "dependsOn": ["^build"] }
```

`^build` means *build my dependencies before me*. But:

> **No package in `packages/` has a build script.**

`packages/theme` exports raw `.css` and `.ts`. `packages/shared-ui` exports
raw `.svelte`. `packages/workspace` declares only `typecheck` and `test`. They
are consumed **as source** and bundled by each app's rsbuild.

So `^build` resolves to nothing. The task graph is one node deep — Turbo would
be orchestrating a graph with zero edges. This isn't "Turbo is overkill"; there
is literally nothing for it to sequence or cache.

Three supporting facts, all verified the same day:

- `turbo` is **not** in the root `package.json` and **not** in `node_modules`.
  Root `pnpm build` → `turbo run build` fails outright.
- `turbo.json` uses `"pipeline"`, the **Turbo 1.x** key (2.x renamed it
  `"tasks"`).
- It declares `outputs: [".next/**"]` — **Next.js** paths, in a repo where
  rsbuild emits `dist/`. Even if installed, caching would cache nothing.

Every Dockerfile already routes around this with direct `pnpm --filter` calls.
`apps/corpora-curator/Dockerfile` says so in a comment: *"the (nonfunctional,
turbo was never actually installed) root build script."* And
`scripts/test-all.sh` says *"Turbo-free on purpose (turbo isn't a declared
dep)."* The decision was made and documented in passing; only `turbo.json` and
the root scripts didn't get the memo.

## The honest framing

Not *"the ecosystem outgrew Turbo."* More precisely:

> **We adopted a best practice for an architecture we then didn't build.**

Three choices — each good on its own merits — jointly eliminated Turbo's job:

1. **Source-consumed packages.** No compile step means no intermediate
   artifacts, so there is nothing to cache and nothing to order.
2. **Docker-per-deploy-unit.** Each image builds exactly one target in a fresh
   container. A local Turbo cache doesn't survive that; you'd need remote
   caching to get anything at all.
3. **Runtime federation.** Remotes compose by URL in the browser, so there is
   no "build all seventeen, then link" phase to parallelize.

Turbo optimizes intermediate build artifacts. This architecture designed them
away.

## Where the ecosystem claim is only half right

Something real did change. Turbo landed (~2021–22) when a monorepo meant
`tsc`-compiled packages, webpack/babel, and minutes-long builds; caching and a
task graph were transformative. Since then: Rust/Go toolchains (rspack, swc,
esbuild) cut build times enough that cache misses stopped hurting, pnpm's
`--filter` got good enough for topology, and bundlers began consuming
TS/Svelte source directly — deleting the per-package build step Turbo existed
to orchestrate.

But **Turbo is not obsolete.** It still earns its keep on repos with many
genuinely compiled packages, long typecheck chains, or CI matrices where
remote caching across jobs pays for itself. This repo simply isn't shaped like
that.

Keep the distinction, because it's the revisit condition.

## When to revisit

Reach for Turbo (or an equivalent) if any of these become true:

- `packages/*` gains **real build steps** — compiled types, a published
  artifact, precompiled Svelte. That's the big one: it re-creates the
  dependency graph Turbo exists to walk.
- `shared-ui` gets published to a registry rather than consumed as source.
- CI grows a **matrix** where remote caching across jobs saves meaningful time.
- Typecheck across packages becomes slow enough that ordering and caching it
  matters.

Until then, `pnpm -r` already does topological ordering across the workspace.

## What to do about it

Delete `turbo.json` and replace the root scripts:

```json
"build": "pnpm -r build",
"dev":   "bash scripts/dev.sh",
"test":  "bash scripts/test-all.sh"
```

Nothing downstream breaks — every Dockerfile already bypasses Turbo. The
current state is worse than either alternative: a config file implying a task
graph that cannot run, and a root `pnpm build` that fails.

**Leave the branch name alone.** `rebuild/turbo-rsbuild` is the trunk;
renaming it costs more than the confusion it saves. This note is the cheaper
fix for the confusion.

## See also

- [[The-Four-Layers-pnpm-Turbo-rsbuild-Federation-Bun]] — the four-layer model;
  its Turbo row is superseded by this note, the other three rows still hold
- [[Sharing-Code-Without-Breaking-Microfrontend-Autonomy]] — the Module
  Federation row's consequences for how shared code is packaged
- [[Structural-Refactors-Surfaced-by-the-Codebase-Graph]] — where the
  `turbo.json` cleanup sits in the refactor backlog
