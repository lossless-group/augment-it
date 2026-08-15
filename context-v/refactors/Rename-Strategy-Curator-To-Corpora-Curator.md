---
title: "Rename the corpora curator — finishing a rename that only ever reached the label"
lede: "The surface said \"Corpora Curator\" from 2026-07-06 while the package, the directory, the federation remote and the Railway service all still said strategy. Four naming layers were tangled here and only three moved: the fourth is a data value living in two external client repos."
date_created: 2026-08-08
date_modified: 2026-08-08
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5
semantic_version: 0.0.2.0
status: Partially-Shipped
tags:
  - Refactor
  - Augment-It
  - Naming
  - Module-Federation
  - Deployment
  - Design-System
---

> **Editing note.** This document is the one place in the repo that must keep
> BOTH names — every row below has a "from" side. A bulk
> `s/strategy-curator/corpora-curator/` over `context-v/` will silently turn it
> into nonsense (it did once already, on 2026-08-08). Exclude this file.

# Rename `strategy-curator` → `corpora-curator`

## Status

**Phases 1–3 shipped 2026-08-08** (local: code identity, docs/registry, CSS
prefix). **Phase 4 — the Railway cutover — is NOT done** and is the only thing
between here and production correctness. See §5.

## 1. Why this was a correction, not a preference

The remote was named when it curated strategies. It does not. A "domain" is a
**typed grouping** — `type ∈ strategy | topic | thesis | market-segment |
category | …` — and this surface is the view onto *all* of them
(`services/record-surrealdb-resolver/src/domains.ts:1-10`). humain-vc's
workspace runs it with `DEFAULT_DOMAIN_TYPE=thesis` and has never curated a
strategy in it.

The on-screen label was corrected to **Corpora Curator** on 2026-07-06 as a
display-only rename; `remotes.ts` recorded that as "*display rename;
id/package/remote name unchanged*". This finished the job.

It also removes an active trap: an agent reading `apps/strategy-curator/` and
`type: 'strategy'` in the same file reasonably concludes the two are the same
concept. They are the opposite — the app is the container, `strategy` is one
thing the container holds.

## 2. Four naming layers — three moved, one must not

| # | Layer | From → To | Moved? |
|---|---|---|---|
| 1 | **Display name** | already "Corpora Curator" | ✅ 2026-07-06 |
| 2 | **Code identity** | `apps/strategy-curator/` → `apps/corpora-curator/`; `@augment-it/strategy-curator` → `@augment-it/corpora-curator`; `strategyCurator` → `corporaCurator`; `PUBLIC_STRATEGY_CURATOR_*` → `PUBLIC_CORPORA_CURATOR_*` | ✅ Phase 1 |
| 3 | **CSS prefix** | `sc-` → `cc-`, `.sc-app` → `.cc-app` | ✅ Phase 3 |
| 4 | **Domain vocabulary** | `type: 'strategy'`, `Strategy`, `strategy_slugs`, `strategies/<slug>/index.md` | ❌ **never** |

### Why layer 4 must not move

`strategy` is a **data value**, not a name for this app:

- **`DEFAULT_DOMAIN_TYPE=strategy`** is baked into reach-edu's per-client `.env`
  in the production volume (`DEPLOYMENT.md`). humain-vc's says `thesis`.
- **On-disk folder names** derive from it — `strategies/<slug>/index.md`, via
  `DOMAIN_FOLDERS` in both the picker component and
  `services/content-ingest/src/corpus.ts`.
- **SurrealDB rows** carry `type` and `strategy_slugs`.
- **The client corpora are git submodules pointing at separate repos** —
  `clients/reach-edu` → `lossless-group/augment-reach-edu`, `clients/humain-vc`
  → `lossless-group/humain-vc-data`. `grep -c strateg clients/` returns
  **5,835**.

Renaming layer 4 is a data migration across two external repositories plus the
database plus the filesystem. It is also *semantically wrong*: the whole reason
the app was renamed is that it is not strategy-specific. Renaming the domain
type would re-conflate exactly the two ideas this refactor separates.

**Hard rule: a `strategy` → `corpus` substitution that touches `type:`,
`*_slugs`, `DOMAIN_FOLDERS`, `DEFAULT_DOMAIN_TYPE`, or anything under
`clients/` is out of scope and must be reverted.**

In source, layer 4 is ~116 occurrences (`Strategy` 36, `strategies` 34,
`'strategy'` 46) and every one is legitimately about the data. All were left
alone; verified after Phase 1.

## 3. Blast radius — as executed

| Form | Count | Disposition |
|---|---|---|
| the old kebab name | 127 | renamed |
| the old camel name | 26 | renamed (MF remote name, remote id, dynamic imports) |
| the old SCREAMING name | 21 | renamed, **with legacy fallbacks** — §5 |
| `StrategyPicker` | 14 | → `CorpusPicker` |
| `sc-` classes | 383 across 8 files, **56 distinct** | → `cc-`, 383 → 383 |
| **`changelog/`** | **43** | **untouched — historical record** |
| `DESIGN.md` revision log + closed-defect log | 2 | **untouched — historical record** |

The port did **not** change. It stays `3017`, which kept the shell, the portal
and every CORS allowlist out of scope.

## 4. This was NOT a repo relocation

The [[pseudomonorepos]] HARD STOP three-precondition checklist governs moving a
**repo**. `apps/strategy-curator/` was plain tracked files inside augment-it —
`.gitmodules` contains only `clients/reach-edu` and `clients/humain-vc`. The
checklist did not apply. `git mv` was used so history follows the files.

## 5. Phase 4 — the Railway cutover (NOT DONE)

**There is no Railway config in this repo** — no `railway.json`, no
`railway.toml`, no nixpacks file. Service names, `dockerfilePath`, domains and
env vars live only in the Railway dashboard. Nothing in the tree will tell you
a directory rename has production consequences, which is exactly why this phase
is easy to skip and expensive to skip.

Verified live 2026-08-08:

```
https://augment.didi.sh                                            200
https://strategy-curator-production.up.railway.app/remoteEntry.js  200 (110 KB)
https://chat-production-3378.up.railway.app/remoteEntry.js         200 (110 KB)
```

Only **two** of the seventeen remotes are deployed at all — the curator and
`chat`; the other fifteen are still pointed at `localhost` in the shell's
federation config, deliberately, per the build order.

### The transition fallbacks already in the tree

Because these vars are inlined at **build** time, a build that lands before the
dashboard is updated would fall through to `localhost` and 404 in production.
Four files therefore read the **new** name first and the **old** name second:

| File | Reads |
|---|---|
| `shell/rsbuild.config.ts` | `PUBLIC_CORPORA_CURATOR_REMOTE` ‖ `PUBLIC_STRATEGY_CURATOR_REMOTE` |
| `shell/Dockerfile` | both `ARG`/`ENV` declared |
| `apps/corpora-curator/rsbuild.config.ts` | `PUBLIC_CORPORA_CURATOR_ASSET_PREFIX` ‖ `PUBLIC_STRATEGY_CURATOR_ASSET_PREFIX` |
| `apps/corpora-curator/Dockerfile` | both `ARG`/`ENV` declared |

This means **the current tree deploys correctly with the dashboard untouched.**
The asset-prefix one matters most: missing it does not fail the build, it ships
a remote that loads and then breaks on its first async sub-chunk.

### Sequence

1. Update the Railway service's `dockerfilePath` to
   `apps/corpora-curator/Dockerfile`. Dashboard change; Railway builds on push,
   so land it near the merge. Out of order in either direction costs one failed
   build — recoverable, but expect it rather than discover it.
2. Add `corpora-curator-production.up.railway.app` as an **additional** domain
   on the existing service. Both hostnames now serve.
3. Add `PUBLIC_CORPORA_CURATOR_REMOTE` / `PUBLIC_CORPORA_CURATOR_ASSET_PREFIX`
   as service variables, redeploy, verify in a real browser.
4. Only then rename the Railway service and retire the old domain.
5. Update `DEPLOYMENT.md`'s hostname table last, once it is true.

## 6. Phase 5 — retire

Delete the old Railway domain and the old service variables; **delete the four
legacy fallbacks listed above** (they are marked with `RENAME TRANSITION`
comments); set this document to `Shipped`; changelog entry.

## 7. Deliberately not done

- **`.cc-strat*` class names.** `.cc-strat`, `.cc-strat-list`,
  `.cc-strat-title`, `.cc-strategy` survived the prefix rename with `strat` in
  them. They name the corpus list and the active-corpus label, so by the same
  reasoning that renamed `StrategyPicker` they should probably become
  `.cc-corpus*`. Out of the agreed scope; ~10 occurrences, purely local.
- **`curation.strategies`, `createStrategy()`, the `Strategy` TS type.** These
  name the **rows**, not the surface. The resolver already calls the same thing
  a `Domain`; if these ever move it should be to `Domain`, as its own pass, and
  it is layer-4-adjacent enough to need care.
- **`changelog/` and the `DESIGN.md` revision + closed-defect logs.** Dated
  records of what was true when written. A changelog that silently agrees with
  the present is not a changelog.

## 8. Verification gates

```bash
pnpm build                 # zero "Module not found"
pnpm -r check              # 0 errors
pnpm test:all
pnpm design:drift          # must still read 99 fail · 0 warn
```

Plus the browser drive below.

## 9. Browser-drive click path

Run against Playwright MCP after Phase 1 and again after Phase 3:

1. `localhost:3100` → **Developers** → **Component libraries** → card reads
   `corpora-curator`, prefix `.cc-*` → mounts.
2. In the mounted gallery: **Source row** → fixture **Selected** → Audit tab
   shows `0 contract`. *(This is the check that catches a half-finished prefix
   rename: `.cc-app` and the catalog's `rootClass` must move in lockstep, or
   every specimen renders unstyled and all 56 classes report as F2/F3 leaks.)*
3. `localhost:3100` → flow picker → **Build Corpora** → the remote mounts and
   the header reads "Corpora Curator" with a live connection chip. *(Catches a
   missed remote **id** — those fail at click time, not at build time.)*
4. `localhost:3017/#/gallery` standalone → **isolate ↗** → renders.
5. Console clean of `Cannot find module` and MF `remote not found`.

## 10. Related

- [[Federated-Design-System-Architecture]] — the member registry this renamed a row in
- [[Federated-Component-Libraries]] — the catalog declares `member`, `prefix`, `rootClass`
- [[Structural-Refactors-Surfaced-by-the-Codebase-Graph]] — the sibling refactor doc
- `context-v/specs/Corpora-Curator-Entry-Point-for-Augment-It.md` — renamed in Phase 2
