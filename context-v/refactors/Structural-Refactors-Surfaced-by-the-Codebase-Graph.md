---
title: "Structural refactors surfaced by the codebase graph — the deadweight, the boilerplate, and the CSS convergence problem"
lede: >-
  A zero-token graph over 490 files found ~500 lines that delete cleanly, 11 near-identical `mount.ts` files, and no duplicate CSS after all.
date_created: 2026-08-06
date_modified: 2026-08-06
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5
semantic_version: 0.0.1.0
status: Partially-Shipped
date_first_published: 2026-08-06
tags:
  - Refactor
  - Augment-It
  - Knowledge-Graph
  - Graphify
  - Design-System
  - Component-Library
  - Dead-Code
  - Technical-Debt
site_uuid: 5e73fb67-9969-464c-ad3e-15683ec96a9c
hex_code: wy9wrp
date_authored_initial_draft: 2026-08-06
date_authored_current_draft: 2026-08-06
publish: true
---

# Structural refactors surfaced by the codebase graph

> **Folder note.** `context-v/refactors/` is not one of the canonical
> context-vigilance folders. It sits alongside this repo's existing
> extensions (`backlogs/`, `notes/`) as a project-specific type: a refactor
> doc is narrower than a [[plans]] entry (it proposes surgery on existing
> code rather than sequencing new work) and wider than an [[issues]] log
> (no single bug is being chased). Kept, not folded — per the
> context-vigilance rule to surface divergence rather than normalize it.

## Why Care?

This codebase was built the way real products get built: services, frontends,
and flows one at a time, each one correct in isolation, none of them looking
sideways at the last. That is the right way to move fast and it accrues a
specific, predictable kind of debt — not bugs, but *repetition without a
home*. A design system and component library are queued next, and starting
that work without knowing what actually repeats means guessing.

So we measured instead of guessing. A `graphify` build over the 490 source
files (excluding `clients/`) produced **4,330 nodes and 6,011 directed edges
for zero tokens** — AST extraction needs no LLM. Every claim below was then
verified against the files themselves, because a graph tells you where to
look, not what's true.

The headline is split. There *is* easy deadweight, and it's mechanical enough
to do in an afternoon. But the assumption that the frontend is full of
copy-pasted CSS is **wrong**, and the real finding there is harder and more
important than deletion.

Method and scoping discipline: [[Understanding-Codebases-with-Graphify]]
(anchor monorepo `context-v/blueprints/`).

---

## Tier 1 — mechanical, no judgment required

### 1.1 Collapse the 17 `mount.ts` files

`apps/*/src/mount.ts` totals **406 lines**. Eleven of the seventeen differ
from each other by **exactly one line** — the exported function name.

```ts
// apps/pack-runner/src/mount.ts — and 10 others, verbatim except line 16
import '@augment-it/theme/theme.css';
import './app.css';
import { mount, unmount, type Component } from 'svelte';
import App from './App.svelte';

export type MountResult = { destroy: () => void };

export function mountPackRunner(target: HTMLElement): MountResult {
  const component = mount(App as Component, { target });
  return { destroy: () => { unmount(component); } };
}
```

`diff apps/pack-runner/src/mount.ts apps/search-results/src/mount.ts` returns
a single changed line.

**Do:** a `makeMount(App)` factory in `packages/workspace` (or `shared-ui`),
leaving each app a one-liner. Module federation still needs the distinct
export names, so keep those:

```ts
export const mountPackRunner = makeMount(App);
```

**Removes:** ~250 of 406 lines. `MountResult` stops being declared 17 times.

**Caveat worth preserving:** the header comment in each file documents a real
bug — `theme.css` must be imported before `app.css` because Svelte's
`append_styles` doesn't fire reliably across the federation chunk boundary.
That ordering constraint must move into the factory *with its comment*, or
the refactor silently re-opens the bug.

### 1.2 Hoist the app `package.json` files

**14 of 17** `apps/*/package.json` are byte-identical after stripping the
`name` field. The outliers are `corpora-curator`, `response-reviewer`, and
`person-enrichment`.

This is what the graph showed as fourteen communities with an *identical*
signature — size 30, cohesion 0.067. Identical size **and** identical cohesion
across N communities means N copies of one structure.

**Do:** hoist shared deps to the workspace root or a shared preset; keep only
genuine per-app divergence. Diff the three outliers first — their differences
may be intentional or may be drift.

### 1.3 Converge the tsconfigs

Seventeen apps, three distinct `tsconfig.json` files:

| Hash | Apps |
|---|---|
| `9ae781ef` | 8 |
| `b330eb64` | 7 |
| `1bfcbda4` | 2 (`record-collector`, `records-surface`) |

A 8/7/2 split across otherwise-identical apps reads as drift, not design.
**Do:** one base config, `extends` everywhere, with any real difference stated
explicitly.

---

## Tier 2 — verified dead code, delete (~250 lines)

Both confirmed by grep across `apps/`, `services/`, `packages/`, `shell/` —
not merely by absent graph edges.

### 2.1 `apps/person-enrichment/src/pulse-dimensions/OrgCreate.svelte`

**Zero references anywhere in the repo.** Its five siblings in that folder
(`NameFields`, `EmailListField`, `LinkList`, `AffiliationCard`, `DomainList`)
are all imported by `App.svelte`. This one was left behind.

### 2.2 `services/social-search/src/bundles.ts` + `entity-pulse/bundles.ts`

**159 lines (91 + 68), no importer repo-wide.**

Two things kept these alive and both are worth noting. `search.ts:36` carries
the comment `// ... See bundles.ts.` — a prose reference with no import, which
is exactly how orphaned modules survive review. And `apps/pack-runner` imports
its own `./bundles`, a *different* file, which makes a careless grep look like
a hit.

**Do:** delete both, and fix the stale comment in `search.ts:36` in the same
commit.

---

## Tier 3 — utility consolidation (audit before merging)

Hand-rolled helpers re-implemented across the tree:

| Helper | Files | Mostly in |
|---|---|---|
| `parseArgs()` | 19 | `scripts/`, `services/social-search/scripts/` |
| `parseCsv()` | 9 | `scripts/`, `services/ingest` |
| `sleep()` | 8 | `scripts/`, tests, `services/content-ingest` |
| `csvEscape()` | 6 | `scripts/`, `apps/record-collector` |
| `fileExists()` | 5 | `scripts/`, `services/` |
| `unquote()` | 5 | `scripts/`, `services/content-ingest`, `splash` |

Hand-rolling these is correct per [[Libraries-we-Do-Not-Use-Ever]] — the
problem isn't that they're hand-rolled, it's that they have no home. A
`scripts/lib/` or `packages/shared-node` fixes it without adding a dependency.

### The trap — do not merge on name alone

`slugify()` appears 6× and is **not one function**:

```ts
// services/content-ingest/src/corpus.ts — and scripts/jina-fetch-urls.mjs
s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
 .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)

// apps/corpora-curator/src/curation.svelte.ts — different behaviour
s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
```

No NFKD normalization, no diacritic stripping, no 60-character cap. These
produce different slugs for the same input. `corpora-curator` also
deliberately preserves user casing for tags in the adjacent function — a
documented product decision.

**Rule for this tier:** diff every implementation before consolidating. A
repeated name is a *candidate*, never a verdict.

---

## Tier 4 — the design system finding

This is the one that changes the plan.

The working assumption was that seventeen independently-built frontends must
be full of copy-pasted CSS waiting to be deduplicated. **They are not.**

| Measure | Value |
|---|---|
| `packages/shared-ui` components | **2** (`ConfidencePill`, `ToggleHeader__PromptOrPackage--Icons`) |
| Apps consuming `shared-ui` | **2** (`response-reviewer`, `shell`) |
| `@augment-it/theme` imports | 52 |
| `apps/*/src/app.css` | **5,434 lines** across 17 files |
| Distinct CSS selectors | 1,392 |
| Selectors used in ≥2 apps | **6** |
| Selectors used in ≥4 apps | **0** |
| Repeated component filenames | 4 (`RecordCard`, `ConnectorPalette`, `ConnectorChip`, `ColumnMapper`) |

**1,386 of 1,392 selectors are unique to a single app.** Four of the six
"shared" selectors are keyframe stops (`50%`, `to`, `100%`) and media queries
— not shared components at all.

### What this means

There is almost nothing to delete. Instead there are **seventeen
independently invented CSS vocabularies** that have never had to agree.

That inverts the component-library work:

- It is **greenfield extraction**, not deduplication. Nobody will find savings
  by hunting duplicates — the duplicates aren't there.
- The cost is **migration**, not consolidation. Seventeen surfaces each need
  to be moved onto a vocabulary that doesn't exist yet.
- Sequencing matters more than it would for a dedup job: pick the vocabulary
  from the two or three richest surfaces first
  (`response-reviewer` 1,299 lines, `person-enrichment` 670,
  `sort-filter-lens` 511), because those already encode the hardest cases.

### The good news

The **token layer is already working**: 1,519 `var(--…)` references against
490 hardcoded colors/`rgba()` — roughly 76% tokenized. `@augment-it/theme` is
imported 52 times across the tree. The foundation is adopted; it's the
component tier above it that never got built.

Sweeping the 490 hardcoded escapes into tokens is a well-defined, independently
valuable task that can start before any component decisions are made.

---

## Tier 5 — one-line fixes

**The lone import cycle.**
`services/workspace/src/capabilities.ts → searches.ts → capabilities.ts`.
`searches.ts:20` imports only `import type { Actor }`. Move `Actor` into a
`types.ts` and the cycle is gone. (Type-only imports are erased at compile
time, so this is hygiene rather than a live defect — but it's a one-line fix.)

**Three functions named `registerHandlers()`** occupy graph positions 2, 3, and
5 by connectivity — distinct functions in different services sharing one name.
Not a defect; worth renaming to service-specific names while touching this
area, since it makes every future search across the tree ambiguous.

---

## Suggested order

1. **2.1 + 2.2** — delete dead code. Smallest diff, zero risk, clears noise.
2. **1.1** — the `mount.ts` collapse. Mechanical across 17 files; carry the
   `theme.css`-before-`app.css` comment into the factory.
3. **1.2 + 1.3** — `package.json` / `tsconfig` convergence. Diff the outliers.
4. **Tier 5** — `Actor` move, cycle gone.
5. **Tier 3** — utility homes, auditing each implementation.
6. **Tier 4** — the token sweep first (490 escapes), then vocabulary
   extraction from the three richest surfaces. This is the long one and it
   deserves its own plan doc.

Items 1–4 are afternoon-sized and independent. Item 6 is the actual project.

---

## Remaining work (as of 2026-08-06)

Tiers 1, 2 and 5 shipped the same day this document was written, on
`refactor/deadweight-and-mount-collapse`. Net **−466 lines across 65 files**,
verified by 19 packages building, 1,494 files svelte-check clean with zero
errors, and every non-Docker test suite passing.

| Item | State |
|---|---|
| 1.1 — collapse 17 `mount.ts` | ✅ shipped — new `@augment-it/federation`, 406 lines → 12 each |
| 1.2 — hoist app `package.json` | ⏸️ **deferred, deliberately** — see below |
| 1.3 — converge tsconfigs | ✅ shipped — `tsconfig.base.json`, 20 lines → 4 per app |
| 2.1 — `OrgCreate.svelte` | ✅ deleted |
| 2.2 — two orphaned `bundles.ts` | ✅ deleted, stale comment corrected |
| 3 — utility consolidation | ⬜ not started (and see the services caveat below) |
| 4 — design system | ⬜ not started — the actual project |
| 5 — `Actor` import cycle | ✅ shipped — moved to `services/workspace/src/types.ts` |
| 5 — rename `registerHandlers()` | ✅ shipped — **five**, not three; one per service |

**Why 1.2 was deferred rather than done.** "Hoist the identical deps to the
root" is the wrong fix under pnpm. pnpm's strict resolution means a package
that imports `svelte` must *declare* `svelte`, or it will not resolve — the
duplication across the 14 identical `package.json` files is a correctness
requirement, not sloppiness. The right tool is a **pnpm catalog**
(`catalog:` protocol, available on the pinned pnpm 10.15), which centralises
the *versions* while leaving the declarations in place. That regenerates the
lockfile and touches all 17 manifests, so it wants its own commit and its own
verification pass — and it collides with the root `package.json` change in the
stranded design-system work (see below).

**Four things shipped that this document did not originally list:**

1. **`turbo.json` removed**, root scripts repointed at `pnpm -r`, which made
   `pnpm build` work for the first time in the repo's history. Reasoning in
   [[Why-This-Monorepo-Does-Not-Need-Turbo]].
2. **React evicted.** The root `tsconfig.json` set `jsx: "react-jsx"` — the
   only React reference anywhere in the repo, against a hard prohibition, with
   zero `.tsx` files and no `react` dependency to justify it. Now
   `jsx: "preserve"`: TSX stays legal, no runtime is bound. Target also raised
   ES2020 → ES2022 and three dead path aliases removed.
3. **The shell's typecheck fixed** — it had *never* passed. A missing
   `css.d.ts` shim, compounded by a tsconfig that omitted `src/**/*.d.ts` from
   `include` so the shim would have been ignored anyway; plus a real type error
   (`stageEl` typed `HTMLDivElement` while bound to a `<main>`). This also
   revealed the shell as the **eighteenth** copy of the converged tsconfig.
4. **`registerHandlers()` renamed** — see below.

The `registerHandlers()` count in this document was **wrong**. It said three,
because three appeared in the graph's top-ten by connectivity. There are
**five**, one per NATS service. All are now service-qualified
(`registerPromptStoreHandlers`, `registerContentIngestHandlers`,
`registerRecordResolverHandlers`, `registerResponseStoreHandlers`,
`registerRowStoreHandlers`), so a tree-wide search for any one of them is
unambiguous. `registerPersonHandlers` in `record-surrealdb-resolver` was left
alone — it was already unique, which was the entire point.

A reminder that god-node rankings show the *top* of a distribution, not the
whole of it. Read them as "look here," never as a census.

**Conflict surface with the stranded design-system work.** Phase 0 adds
`design:drift` / `design:contrast` to the root `package.json`, which this work
rewrote. Trivial to resolve, but whoever merges second resolves it. The
`mount.ts` collapse is *complementary* to Phase 1b rather than competing:
centralising the `theme.css` import turns the F10 migration into one deletion
instead of fourteen. See
[[Federated-Design-System-Phases-0-and-1-Shipped-Nothing-Seen]] and issue #81.

## Caveats on this analysis

**"Zero incoming imports" is a candidate list, not a verdict.** `ConfidencePill`
and `ToggleHeader` first appeared as dead code and are not — they're imported
via package subpath exports (`@augment-it/shared-ui/ConfidencePill.svelte`),
which AST extraction doesn't resolve into edges. The same blind spot may hide
other live code. Every Tier 2 entry here was grep-verified afterward; apply
the same discipline to anything added later.

**Also unresolved by AST:** dynamic `import()`, string-keyed registry lookups,
and anything reached only through NATS subjects or HTTP routes. Services wired
by message subject will look far more disconnected than they are — 1,985 of
4,330 nodes are weakly connected, and that number should not be read as dead
code.

**This is a code-only graph.** It reflects nothing about what `context-v/`
specs say *should* exist. A module can be structurally orphaned and still be
the correct implementation of a spec that hasn't been wired up yet.

**Graph health, reported honestly:** 417 dangling-endpoint edges (6.3% of raw)
— overwhelmingly imports of external npm packages never extracted as nodes;
144 collapsed directed edges where a pair carries both `imports_from` and
`re_exports`. Neither invalidates the findings above, both mean the graph is
not a complete picture of every edge.

## Reproducing

```bash
cd ai-labs/augment-it
graphify --update           # AST cache makes the rebuild near-free
open graphify-out/graph.html
graphify query "What depends on packages/workspace?"
```

Corpus scope is committed in `.graphifyignore`; `graphify-out/` is gitignored.

## Related

- [[Understanding-Codebases-with-Graphify]] — the method, scoping, and how to
  read the report (anchor monorepo `context-v/blueprints/`)
- [[Test-Coverage-Harness-And-Regression-Floor]] — the regression floor these
  refactors should land on top of; 1.1 and 2.x are exactly the kind of change
  that wants a test underneath it first
- [[Libraries-we-Do-Not-Use-Ever]] — why Tier 3 consolidates rather than
  installing a utility package
