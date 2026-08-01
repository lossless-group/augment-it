---
title: "The test suite lands — nine of ten groups green, and the two bugs it caught"
lede: "augment-it goes from zero automated tests to 39 across the whole corpora-builder chain — identity, tenancy, transport, canonical CRUD, corpus files, curator state, chat, alignment — spanning two repos and two languages. On the way it caught a real reconnect bug and two live data drifts that no human had flagged. The end-to-end capstone (Group I) is deferred as its own infrastructure effort; every layer under it is covered."
date_created: 2026-08-01
date_modified: 2026-08-01
publish: true
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
  - Claude Code on Claude Opus 4.8
files_changed:
  - packages/workspace/src/transport.ts
  - services/workspace/src/capabilities.ts
  - services/workspace/src/chat.ts
  - scripts/audit-corpora-alignment.mjs
  - context-v/specs/Corpora-Builder-Harmony-Test-Registry.md
---

# The test suite lands

## Why Care?

A week ago augment-it had **zero automated tests** — every agent rewrite
rode on typechecks, builds, and the operator walking the surface. That
debt came due as humain-vc's corpora quietly failed to load and creations
went missing. This run pays it down: **39 tests across nine of the ten MECE
groups** in the [[Corpora-Builder-Harmony-Test-Registry]], spanning two
repos (augment-it + id-didi-sh) and two languages (TypeScript/Vitest +
Elixir/ExUnit), covering every layer of the corpora-builder chain.

The point isn't the number. It's that the suite **found real bugs on its
own** — one in code, two in live data — that no human had caught. That is
the whole argument for tests in an agent-built codebase: they are the
memory that runs.

## The nine groups

| Group | Area | Tests |
|---|---|---|
| A | Identity contract (id-didi-sh, ExUnit) | 5 |
| B | Session tenancy (the security gate) | 5 |
| C | Client transport resilience | 4 |
| D | Workspace registry / default_domain_type | 3 |
| E | Canonical CRUD (disposable SurrealDB) | 7 |
| F | Corpus file layer | 3 |
| G | Curator surface state (Svelte 5 runes) | 5 |
| H | Chat corpora slab | 2 |
| J | Alignment audit (pure diff + runnable script) | 5 |

Each test's name is the ✓-phrase you see turn green — the registry spec is
the human-language index of all of them.

## What the suite caught

**A real reconnect bug (Group C).** The headline property test — *"no
invoke silently vanishes"* — failed on its first run, exactly as the
registry predicted, and the failure was genuine: the client transport only
scheduled a reconnect from the WebSocket `close` handler, but a *refused*
connection (the exact case during a workspace-service restart) fires only
`error` on Node's native WebSocket, never `close`. So the reconnect chain
died on the first failed attempt and the surface wedged until a full page
reload — a strong candidate mechanism behind the zombie-session and
"invokes never reach the workspace" symptoms. Fixed in `transport.ts`; the
test now guards it.

**Two live data drifts (Group J).** The alignment audit, on its first run
against real read-only data, flagged two mismatches between the canonical
`domains` rows and the on-disk corpus folders:

- `strategy:rural-income-boosts` — in the DB for humain-vc but no folder on
  disk (the known mis-scope: created for reach-edu from the humain-vc
  workspace).
- `strategy:upward-mobility` — a folder on reach-edu's disk with **no DB
  row at all** (a new orphan-folder finding).

Both are operator triage items. The audit is flag-don't-fix — it reported
and touched nothing.

## Discipline notes (the demonstration part)

- **No new runtime dependencies.** Only test libraries (Vitest,
  @sveltejs/vite-plugin-svelte, jsdom). The `ws` package stays out: the
  transport tests run against a hand-rolled RFC-6455 server over
  `node:http`, and the tenancy tests exercise the logic directly instead of
  over a cookie-bearing socket. (Removing `ws` had also left the old
  `prove-session-tenancy.mjs` broken — Group B replaces it properly.)
- **Tests never touch shared state.** Group E spins a throwaway in-memory
  SurrealDB per run (verified the installed v3 CLI interoperates with the
  v2 SDK — no upgrade needed); Groups D/F/B build temp dirs; Group J's unit
  test is a pure diff and its live script is read-only.
- **Two exported test seams** (`existingCorporaSlab`, `enforceTenant`) and
  one timing seam on the transport — no behavior changes.

## What's deferred, and why

**Group I (end-to-end) is deferred** — as its own infrastructure effort,
not a skip. Every *layer* the E2E would traverse is now covered at the
unit/contract tier. What Group I adds is the full-chain walk as the
operator lives it, which needs the frontend federation stack (shell +
remotes) stood up, Playwright wired, and an auth path — a CI project of its
own. Until it's built, the manual browser-drive rung (CLAUDE.md) covers the
full walk. The registry names exactly what it would take.

## See also

- [[Corpora-Builder-Harmony-Test-Registry]] — the living registry, now 9/10 landed
- [[Test-Coverage-Harness-And-Regression-Floor]] — the harness plan this executed
- [[Troubleshooting-Workspace-DB-State-Alignment]] — the bug hunt that started it
- `changelog/2026-07-30_01_Test-Coverage-Begins…` — the first-wave beat
