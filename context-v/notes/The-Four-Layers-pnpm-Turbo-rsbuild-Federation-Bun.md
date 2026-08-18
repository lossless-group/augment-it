---
title: "The four layers: pnpm, Turbo, rsbuild Module Federation, and where Bun would fit"
lede: "There isn't one 'monorepo' system — there are four independent ones, and the word 'federation' means two different things across them. Untangling which tool owns which job, and what Bun would actually replace."
date_created: 2026-07-30
date_modified: 2026-07-30
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.8
semantic_version: 0.0.0.1
status: Reference
tags:
  - Note
  - Architecture
  - Augment-It
  - Tooling
  - Module-Federation
  - Monorepo
site_uuid: a7bf1b32-966a-412b-8552-6e49fd0fd2ef
hex_code: 422ca9
date_authored_initial_draft: 2026-07-30
date_authored_current_draft: 2026-07-30
---

# The four layers: pnpm, Turbo, rsbuild Module Federation, and where Bun would fit

## Why Care?

"Monorepo," "workspaces," and "federation" get used as if they name one
system. They name four independent ones, stacked. The confusion is real
and has a specific cause: the word **"federation" does double duty** —
Turbo federates *build tasks*, Module Federation federates *runtime
bundles*, and they have nothing to do with each other. This note pins
which tool owns which job so a future build-out doesn't reach for the
wrong layer.

## The four layers

| Layer | The job | In augment-it (verified 2026-07-30) |
|---|---|---|
| **Package manager + workspace linker** | Install deps; symlink local packages so `import '@augment-it/workspace'` resolves to the folder | **pnpm** (`pnpm-lock.yaml`, `packageManager: pnpm@10.15.0`) |
| **Task runner / build orchestrator** | Run build/test/lint across packages *in dependency order*, cache, parallelize | **Turbo** (`turbo.json`; assumed-global, not a declared dep) |
| **Microfrontend runtime composition** | Separately-built browser bundles load each other at runtime via `remoteEntry.js` | **Module Federation** (rsbuild plugin; `shell/rsbuild.config.ts`, each `apps/*/rsbuild.config.ts`) |
| **Microservice runtime messaging** | Backend services talk to each other | **NATS** (see [[Two-Tiers-WebSocket-To-The-Gateway-NATS-Between-Services]]) |

They stack; they don't overlap. pnpm doesn't know federation exists.
Turbo doesn't know NATS exists. Module Federation doesn't know pnpm
exists. Each row is swappable without touching the others.

## The two memories, placed

**"Turbo natively supports federated modules."** The word-trap. Turbo
federates **build tasks** — it orchestrates the monorepo's task graph
(build A before B because B depends on A) and caches the results.
**Module Federation** federates **runtime bundles** — the browser
stitching microfrontends together at load time. Same word, unrelated
mechanisms. What Turbo actually bought us is the task graph + cache;
it has never had anything to do with how the microfrontends load each
other. That was always the rsbuild plugin, and still is.

**"Bun natively handled it."** Bun is three tools in one — package
manager *and* JS runtime *and* bundler. That is exactly why it *feels*
like it "handles everything." Concretely, Bun could natively replace
**two** of the four rows at once:

- the **package manager** row (Bun workspaces link like pnpm's), and
- the **"run TypeScript directly"** job that `tsx` does today for the
  services (Bun executes TS with no separate transpile step).

But Bun does **not** replace Turbo (it runs scripts, but it is not a
caching task-graph runner), and it does **not** do Module Federation
(still rsbuild). So the honest scope of "Bun handles it natively" is:
**it collapses pnpm + tsx into one binary.** Real and meaningful — but it
leaves the Turbo and federation rows exactly where they are.

## The factual correction

augment-it **never actually switched to Bun.** Verified 2026-07-30: the
only lockfile is `pnpm-lock.yaml` (no `bun.lockb`), there is no Bun
reference in any config, the Dockerfile, or `scripts/dev.sh`, and every
service runs on `tsx`/Node. The one time Bun entered this repo's story
was the walking skeleton's proposed **"Bun sidecar,"** which was
explicitly dropped in the same document for Node/Fastify. So a
"switched to Bun" memory is most likely that considered-then-rejected
moment — or a *different* repo in the tree (worth checking the specific
one before claiming; it wasn't this one).

## The current, verified stack

```
pnpm            → workspace linking (installs, symlinks @augment-it/*)
  └ Turbo       → task orchestration + cache (build/dev/lint/test)
      └ rsbuild + Module Federation → microfrontends (shell loads remotes)
      └ NATS     → microservices (gateway ↔ domain services)
      └ tsx/Node → runs the TS services
```

Note on Turbo: it is **assumed-global**, not a declared dependency —
which is why `pnpm test` (and `build` / `dev` / `lint`) need `turbo` on
PATH. If a shell lacks it, run the suites directly with
`pnpm -r --filter <pkg> test`.

## If you build this out

- Adding a **package**? pnpm's job — a folder under a workspace glob,
  and it's linkable. Nothing else needs to know.
- Adding a **build/test step**? Turbo's job — a task in `turbo.json`
  with its `dependsOn`.
- Adding a **microfrontend**? rsbuild Module Federation's job — a remote
  in the shell's config + the app's own `rsbuild.config.ts`.
- Adding a **backend service**? NATS's job — a subject + handler + a
  capabilities.ts route.
- Considering **Bun**? The realistic win is swapping the pnpm + tsx rows
  for one binary — a two-row change, not a stack collapse. It would not
  simplify the Turbo or federation story at all. Decide it on those
  terms, not on "Bun does monorepos."

## See also

- [[Two-Tiers-WebSocket-To-The-Gateway-NATS-Between-Services]] — the
  *runtime* wire (a different "federation" again — microservices)
- `context-v/plans/Augment-It-Workspace-Walking-Skeleton.md` — the
  Bun-sidecar decision (D2) that was superseded
- `context-v/blueprints/Module-Federation-Rsbuild-Dev-Loop-Gotchas.md` —
  the federation layer's sharp edges in practice
