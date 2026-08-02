---
title: "No test coverage — TDD keeps getting deferred, despite being exactly the right fit for agentic development"
lede: "Huge amounts of code get written, refactored, and rebuilt by agents with zero automated tests guarding key functionality. TDD is unusually well-suited to this codebase's working style — agents iterate until green, and tests are the durable spec of 'still works' across rewrites — but we've procrastinated it. Needs: pick the test environment for this stack, then climb incrementally to full coverage and full passing."
date_created: 2026-07-24
date_modified: 2026-08-02
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
semantic_version: 0.0.0.2
tags:
  - Issue
  - Oversight
  - Augment-It
  - Testing
  - TDD
  - Agentic-Development
status: Shipped
date_first_published: 2026-08-02
post_ship_note: "Resolved by the corpora-builder test suite — 43 tests across ten MECE groups (augment-it Vitest + id-didi-sh ExUnit), merged via PR #75. Vitest chosen for TS/Svelte, ExUnit for the identity service. See [[Corpora-Builder-Harmony-Test-Registry]]. One command: pnpm test:all."
---

# No test coverage — the deferred TDD debt

## The admission

We have been procrastinating TDD for expediency. The current verification
culture is real but ad-hoc: typechecks, builds, one-off NATS proof scripts
(`scripts/prove-*.mjs`), and manual walk-throughs. What's missing is the
regression floor — when an agent rewrites a service or refactors a remote,
nothing automatically asserts that the key functionality still works.

## Why this matters MORE here, not less

Two properties of agentic development make tests unusually high-leverage:

1. **Volume and churn.** Agents write and rewrite at a rate where "a human
   remembers what this touched" stops being real. Tests are the only
   memory that runs.
2. **The iterate-until-green loop.** Agents are natively good at "run
   tests, fix, repeat until passing" — a failing test suite is a better
   agent prompt than most prose. TDD converts agent effort from
   plausible-looking code into converging code.

The existing prove-scripts (Phase-1 acceptance style) are proto-tests —
they already demonstrated the value (7/7 green as a standing regression
across five phases). The gap is that they're bespoke, uncounted, and not
run automatically.

## Scope of the decision (not yet made)

- **Test environment for this stack.** Candidates to evaluate against the
  real shape (Svelte 5 runes + rsbuild federation remotes; TS services
  over NATS; SurrealDB canonical layer):
  - **Vitest** — the default gravity for TS/Svelte unit + service tests.
  - **Svelte-component testing** — vitest + @testing-library/svelte, or
    accept svelte-check as the floor and test components thinly.
  - **Service/integration tier** — spin NATS (already in compose) and test
    handlers request/reply style; the prove-scripts show the pattern.
  - **Browser/E2E tier** — Playwright; overlaps deliberately with the
    browser-drive rung (anchor-root blueprint
    `Browser-Drive-Verification-For-Agent-Sessions.md`) — decide whether
    E2E specs and browser-drives are one artifact or two.
- **Where tests live** — per-package `*.test.ts` with a turbo `test` task
  is the obvious shape; confirm.
- **The canonical-layer problem** — service tests that touch SurrealDB
  need either a disposable local instance, a test namespace, or
  mocked-db seams. The no-test-entities-in-shared-canonical rule is
  already standing; tests must honor it structurally.

## The incremental path (sketch)

1. Choose the environment (one decision doc).
2. Wire the harness + turbo task + CI job so `pnpm test` exists and is
   green-by-vacuous.
3. Convert the existing prove-scripts into real tests (they're already
   assertions with known-good fixtures).
4. New-code rule going forward: capabilities ship with tests (the loop doc
   `context-v/loops/Loop-through-Spec-Write-Plans-Implement-Test-Changelog-Commit.md`
   gains a rung).
5. Backfill by subsystem, highest-churn first (resolver service, workspace
   capabilities router, social-search dispatch).

## Open questions

- [ ] One runner for everything vs. unit (vitest) + E2E (playwright) split?
- [ ] CI: tests on every push to `rebuild/turbo-rsbuild`, or pre-push hook
  locally first while the suite is small?
- [ ] Coverage target semantics — "full coverage" as literal % or as
  "every capability + every flow's happy path asserted"? (Leaning the
  latter; % chasing on UI code is low-yield.)
- [ ] Relationship to [[Live-Not-Live-Indicator-Tooling-And-Cross-Service-Error-Surfacing]] —
  tests guard pre-ship, liveness guards runtime; both needed.
