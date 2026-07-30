---
title: "Test coverage — pick the harness, seed the suite from the prove-scripts, and loop the open bugs to green"
lede: "Vitest + Playwright for this repo, ExUnit already standing in id-didi-sh — convert the six prove-scripts into a permanent suite, then write the humain-vc corpora bugs as failing tests and iterate until they pass."
date_created: 2026-07-30
date_modified: 2026-07-30
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
semantic_version: 0.0.0.1
status: Draft
tags:
  - Plan
  - Augment-It
  - Testing
  - TDD
  - Agentic-Development
  - Regression-Floor
---

# Test coverage: harness, seed suite, and the loop to green

## Why Care?

Agents write and rewrite this codebase at a rate where "a human remembers
what this touched" stops being real. The verification culture is genuine
but ad-hoc — typechecks, builds, six one-off `prove-*.mjs` scripts, manual
walk-throughs — and the cost is now visible: corpus creations silently
lost in the transport, a zombie-session fix with no regression guard, and
an operator who can't tell "broken" from "empty." Tests are the only
memory that runs, and the iterate-until-green loop is the single thing
agents do best. This plan turns the standing debt
([[No-Test-Coverage-TDD-Deferred-Despite-Agentic-Fit]]) into a sequence,
and fixes the live humain-vc bug
([[Troubleshooting-Workspace-DB-State-Alignment]]) as a side effect of
building its test.

## The harness decision

**One decision was needed; the other was already made.**

- **augment-it (this repo): Vitest + Playwright.**
  - **Vitest** for unit and service tests — the default gravity for a
    TS/Svelte-5-runes monorepo, ESM-native, fast, and the runner the
    converted prove-scripts drop into with the least ceremony.
  - **Playwright** for the browser/E2E tier — deliberately the same tool
    as the codified browser-drive rung (anchor-root blueprint
    `Browser-Drive-Verification-For-Agent-Sessions.md`), so E2E specs and
    browser-drives are ONE artifact, not two parallel systems.
  - `svelte-check` stays the floor for components; component-level
    testing-library work is deferred until a component library exists
    ([[No-Component-Library-UI-Improvised-Not-Component-Based]]).
- **id-didi-sh: ExUnit — already in place.** Elixir ships its test
  framework in the standard library; the repo already has a real suite
  (`test/id_didi_sh/accounts_test.exs`,
  `test/id_didi_sh_web/controllers/auth_flow_test.exs`, a dedicated
  test DB, `mix test` documented in the README). Async-by-default ExUnit
  tests exercise exactly the concurrency the service was built for.
  Nothing to pick; the work there is *extending* the suite to pin the
  cross-service auth contract (below).

## Architecture: three tiers plus one seam

1. **Unit tier (Vitest, pure).** Logic with no I/O — e.g. the curator's
   `defaultDomainTypeFor()` fallback, transport frame bookkeeping,
   slug/tag normalizers. Lives as `*.test.ts` beside the source,
   per-package, run by a turbo `test` task.
2. **Service/contract tier (Vitest, real infrastructure, disposable
   state).** The prove-script pattern formalized: boot the service under
   test against real NATS (already in compose) and a **disposable
   SurrealDB** — never the shared cloud instance. The
   no-test-entities-in-shared-canonical rule is structural: tests get
   their own `surrealdb start memory` container (or an ephemeral
   namespace torn down after), and the harness refuses to run if pointed
   at the production `SURREAL_URL`.
3. **Browser/E2E tier (Playwright).** The backstop that doesn't care
   which layer broke: sign in, switch workspace, assert what the
   operator would see. Runs against the local compose stack;
   click-paths named per the browser-drive rules.
4. **The cross-service seam (augment-it ↔ id-didi-sh).** Two halves that
   must agree without importing each other:
   - augment-it side: the **fake id-plane** pattern
     (`prove-session-tenancy.mjs` already mints an EdDSA keypair and
     serves JWKS + `/api/me`) becomes a shared test fixture — every
     auth-touching test runs against it with controllable token TTLs.
   - id-didi-sh side: ExUnit tests assert the contract the fake mimics —
     JWT claims shape, JWKS endpoint, `/api/session/refresh` re-minting
     an expired JWT while the session row lives, `memberships_for`
     resolution. If the Elixir contract moves, its own suite fails
     before augment-it's fake silently lies.

## The phases

### Phase 1 — wire the harness, green-by-vacuous

Vitest + Playwright installed at the workspace root, per-package
`test` scripts, a root turbo `test` task, one trivial passing test per
tier so `pnpm test` exists and is green. The disposable-SurrealDB fixture
and the fake id-plane fixture land here as shared test utilities in
`packages/`.

### Phase 2 — convert the prove-scripts into the seed suite

The six scripts are already assertion suites with known-good fixtures:
`prove-session-tenancy` (20 assertions), `prove-didi-auth`,
`prove-org-relations` (22), `prove-search-queue`,
`prove-augment-from-db-capabilities`, `surreal-smoke-test`. Each becomes
a Vitest service-tier spec; the originals retire once their conversions
pass. This alone gives ~60+ standing assertions over the highest-churn
subsystems.

### Phase 3 — the open bugs become failing tests; loop until green

Written failing-first, each encoding a suspect from
[[Troubleshooting-Workspace-DB-State-Alignment]]:

1. **Domain-type contract** — workspace summary carries
   `default_domain_type: 'thesis'` for a humain-vc stub; curator fallback
   unit test. (Suspect 1.)
2. **Auth-death behavior** — short-TTL JWT against the fake id-plane:
   pending invokes fail fast with `auth_required`, one silent
   refresh-reconnect, 30s retry cadence, no 4401 storm. Pins the
   `9fc2543` zombie fix. (Suspect 2a.)
3. **The no-lost-invokes property** — transport vs a scripted fake server
   that drops/reopens sockets at controlled moments (pre-OPEN flush,
   mid-claim, mid-invoke): **every invoke resolves or rejects within its
   deadline; none silently vanishes.** This is the harness that
   reproduces — and whose loop fixes —
   [[Search-And-Add-Invokes-Never-Reach-The-Workspace]] and the lost
   corpus creations. (Suspects 0/2b.)
4. **Workspace-switch E2E** — Playwright: switch into humain-vc, assert
   the corpus rail lists the expected theses. (Suspect 3 + the backstop.)
5. **Alignment audit** — DB domain rows ↔ corpus folders ↔ `domain.list`
   agree per client; runnable standalone as a standing consistency
   check (flag, don't fix, per the surrealdb-canonical-layer skill).

The loop discipline is the existing one
([[Implement-Feature-Loop]] /
[[Loop-through-Spec-Write-Plans-Implement-Test-Changelog-Commit]]):
run the failing test, fix, re-run, until green — the debugging and the
coverage are the same work.

### Phase 4 — the standing rule

New capabilities ship with tests; the feature-loop doc gains the rung.
The id-didi-sh contract tests (ExUnit side) land here if not already
pulled forward by Phase 3's auth work.

### Phase 5 — backfill by churn

Highest-churn subsystems first: record-surrealdb-resolver handlers, the
workspace capabilities router + tenancy enforcement, social-search
dispatch, content-ingest. Coverage semantics are **"every capability and
every flow's happy path asserted"** — not a percentage target; % chasing
on UI code is low-yield.

## Open questions

- [ ] CI: run on every push to `rebuild/turbo-rsbuild`, or local
  pre-push hook while the suite is small? (Leaning: turbo task now,
  GitHub Action once Phase 2 lands.)
- [ ] Does the transport property test (Phase 3.3) need fault injection
  hooks added to `transport.ts` itself, or can the fake server induce
  every failure mode from outside? Decide during the harness spike.
- [ ] Disposable SurrealDB flavor: `surrealdb start memory` in Docker vs
  an ephemeral namespace on a local instance. (Leaning memory-engine
  container: zero shared state, compose-friendly.)

## See also

- [[No-Test-Coverage-TDD-Deferred-Despite-Agentic-Fit]] — the debt this plan pays down
- [[Troubleshooting-Workspace-DB-State-Alignment]] — the live bug Phase 3 encodes
- [[Session-Expiry-Turns-The-App-Into-A-Zombie]] — fixed, unguarded until Phase 3.2
- [[Search-And-Add-Invokes-Never-Reach-The-Workspace]] — open, reproduced by Phase 3.3
- `scripts/prove-*.mjs` — the proto-suite Phase 2 formalizes
