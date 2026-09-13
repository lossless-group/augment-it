---
title: "Give the services a shared tsconfig base — fold ten byte-identical service configs onto a new `tsconfig.services.json`, reconcile `decile-mcp`'s real delta, fold two duplicated package configs onto the existing `tsconfig.base.json`, and correct the root fallback's stale exclude list"
lede: >-
  Ten service tsconfigs are byte-identical and extend nothing. The fix already
  exists one directory away — `tsconfig.base.json` did this for the apps and works.
date_created: 2026-09-13
date_modified: 2026-09-13
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5 (1M context)
semantic_version: 0.0.1.0
revisions:
  - 2026-09-13 — Executed, same day, on `rebuild/turbo-rsbuild`. All five phases ran as written. The ten identical services resolved to byte-identical `tsc --showConfig` output before and after — the fold is provably a no-op, not probably fine. `decile-mcp` emitted six checksum-identical files in `dist/`, and the open question about `noUnusedLocals`/`noUnusedParameters` settled in the base's favour: it inherited them plus `verbatimModuleSyntax` and stayed green, so no loosening override was needed. `deploy-relay` closed as a verified non-gap. The completeness audit then found three defects the plan had not anticipated — `packages/federation` red on TS2882 since it first imported CSS (missing both halves of the `css.d.ts` fix, unseen because no root script sweeps per-unit `typecheck`), `packages/gallery` type-checked twice under two option sets, and `e2e/` claimed by no project at all. All three fixed. Repo-wide sweep ends at 34 of 35 green; the one red (`apps/corpora-curator`, TS2614) was proven pre-existing by reproducing it at 5c00a54 and filed separately. Shipped as changelog/2026-09-13_03.
  - 2026-09-13 — Initial draft. Surfaced by diffing two Graphify builds five weeks apart and carried into [[../handoffs/Pickup-2026-09-13-Retrofit-Arc-And-The-Services-Tsconfig]] as the cheapest verified item that session produced. Baseline established before drafting — all 11 services typecheck green, so the refactor has a green bar to hold.
tags:
  - Plan
  - Augment-It
  - TypeScript
  - Tsconfig
  - Services
  - Refactor
  - Graphify
status: Implemented
site_uuid: c7515b89-2512-4083-81ff-63276ada9e29
hex_code: 0qq8zv
date_authored_initial_draft: 2026-09-13
date_authored_current_draft: 2026-09-13
publish: true
---

# Give the services a shared tsconfig base

## Why care

`tsconfig.base.json` already solved this problem for the apps. Its own header
comment records the before-state: *"the 17 apps carried three byte-distinct
tsconfig.json variants in an 8/7/2 split — drift, not intent."* The base was
written, the apps were folded onto it, and the drift stopped.

That file scoped itself to **"every federated member under `apps/`, plus the
federation host in `shell/`."** Reasonable when written. Stale the moment the
services grew to twelve — and they are now carrying the exact drift the apps
were rescued from, one directory away from the rescue.

The services have not drifted *yet* — ten of them are still byte-identical. That
is precisely the moment to fold them, while the consolidation is a no-op in
behavior and a pure structural win. Waiting until they have split 8/7/2 means
doing the apps' archaeology over again.

**Found by diffing two Graphify builds five weeks apart.** Neither reading the
code nor reading the docs would have surfaced it — the files are individually
unobjectionable and only the aggregate is wrong. Worth remembering when queue
item 5 ([[Graphify-As-Standing-Practice-And-Per-Component-Diagrams]]) decides
whether the graph earns its cadence.

## Verified current state

Measured 2026-09-13, not assumed:

```
10 of 11 service tsconfig.json files byte-identical   md5 540460bd93f2916e7ccfd45e30e6a7bd
 0 of 11 extend anything
18 of 18 apps extend ../../tsconfig.base.json
 2 of  4 package/shell configs extend it (gallery, shell)
 2 of  4 duplicate it inline (federation, workspace)
11 of 11 services typecheck green at baseline
```

| Unit | tsconfig | Disposition |
|---|---|---|
| `content-ingest`, `ingest`, `prompt-runner`, `prompt-store`, `record-surrealdb-resolver`, `response-store`, `row-store`, `social-search`, `workspace`, `xlsx-ingest` | byte-identical, standalone | fold onto new services base |
| `services/decile-mcp` | own variant — NodeNext, `outDir`/`rootDir`, `declaration`, `sourceMap`, emits | fold onto services base **with documented overrides** |
| `services/deploy-relay` | none | **not a gap** — see Phase 3 |
| `packages/federation`, `packages/workspace` | duplicate `tsconfig.base.json` inline | fold onto the existing base |
| `packages/gallery`, `shell` | already extend the base | leave alone |
| root `tsconfig.json` | claims 6 files, comment says 1 | correct the exclude list |

## The shape of the fix

A **new sibling**, not an extension of the existing base. `tsconfig.base.json` is
the browser/Svelte profile (`lib: ["DOM", …]`, `types: ["svelte"]`,
`allowImportingTsExtensions`, `isolatedModules`). The services are the Node
profile (`lib: ["ES2022"]` only, `types: ["node"]`, `noUnusedLocals`,
`noUnusedParameters`, no DOM, no Svelte). Making one extend the other would need
five override-to-undo entries and would document the relationship as a lie —
these are two profiles, not a profile and a variant.

So: `tsconfig.services.json` at the repository root, a peer of
`tsconfig.base.json`, carrying only `compilerOptions`.

**`include`/`exclude` stay in each service.** This is not a style preference — it
is the constraint `tsconfig.base.json`'s comment records having learned "the hard
way": TypeScript resolves those paths relative to the file they are *written* in,
not the one doing the extending. A shared `"src/**/*.ts"` would resolve to
`<root>/src/**/*.ts` and every service would compile zero files, silently and
green. Do not move them.

## Phases

Each phase is independently verifiable and independently committable. Run them in
order; the verification gate at the end of each is non-negotiable.

### Phase 1 — `tsconfig.services.json` + the ten identical services

1. Author `tsconfig.services.json` at the root, `compilerOptions` lifted verbatim
   from the shared service config, with a `_comment` block in the house style
   explaining what it covers, why it is a sibling of `tsconfig.base.json` rather
   than a child, and the include/exclude constraint above.
2. Rewrite each of the ten to the three-line shape the apps already use:

   ```json
   {
     "extends": "../../tsconfig.services.json",
     "include": ["src/**/*.ts"],
     "exclude": ["node_modules", "dist"]
   }
   ```

3. **Gate:** all ten typecheck green, and `tsc --showConfig` for at least one
   service resolves to the same effective options as the pre-change file.

### Phase 2 — `decile-mcp`

The only service that legitimately differs, and the pickup flagged it as
needing a look before being folded in. It differs on exactly one axis: **it
emits.** It is an MCP server compiled to `dist/` and started with `node`, not run
through `tsx` like its ten siblings.

Fold it onto the services base and override only the emit/module axis
(`module`/`moduleResolution` NodeNext, `noEmit: false`, `outDir`, `rootDir`,
`declaration`, `sourceMap`). The shared axis — target, lib, strict,
`esModuleInterop`, `skipLibCheck`, `types` — stops being a separate copy.

Open question to settle *by running it*, not by deciding in advance: the base
carries `noUnusedLocals`/`noUnusedParameters` and decile-mcp currently does not.
If inheriting them fails the build, that is a **finding about decile-mcp's
source**, not a reason to weaken the base. Fix the unused bindings if the fix is
trivial; if it is not, override the two flags to `false` *with a comment naming
what would have to change to drop the override*, and note it as follow-up. Do
not silently loosen the shared file for one consumer.

**Gate:** `npx tsc` in `services/decile-mcp` emits to `dist/` exactly as before —
compare the file list, not just the exit code.

### Phase 3 — `deploy-relay`: close it as a verified non-gap

The pickup flagged "no tsconfig at all" as a thing to check. Checked:

```
services/deploy-relay/api/railway.js   ← the only source file
```

It is a single-file Vercel function in plain JavaScript, with a `package.json`
carrying no scripts and no TypeScript dependency. **It needs no tsconfig.** The
correct action is to record that it was checked and why the answer is "nothing,"
so the next graph diff does not re-raise it as an open item.

Land that as one line in the services base's `_comment` — the file that would
otherwise look incomplete at 11-of-12 is then self-explaining.

**Gate:** none (no code change). This phase is documentation of a negative
result, which is the cheapest kind of finding to lose and the most annoying to
re-derive.

### Phase 4 — `packages/federation` and `packages/workspace`

Wider than the pickup recorded, same defect, and cheaper than Phase 1 because the
target already exists. Both files duplicate `tsconfig.base.json`'s
`compilerOptions` inline, differing from it by exactly one key: they omit
`noImplicitAny`, which `strict: true` already implies. So the fold is provably a
no-op.

`packages/gallery` and `shell` already extend the base — this makes the packages
layer uniform rather than 2-of-4.

**Gate:** `svelte-check`/`tsc` for both packages green, and `--showConfig`
equivalence before and after.

### Phase 5 — the root fallback's stale exclude list

`tsconfig.json`'s comment states: *"That is currently ONE file —
`packages/theme/mode-switcher.ts`."* Measured with `--listFiles`, it claims
**six**:

```
packages/gallery/src/audit.ts
packages/gallery/src/css.d.ts
packages/gallery/src/index.ts
packages/gallery/src/router.ts
packages/gallery/src/types.ts
packages/theme/mode-switcher.ts
```

`packages/gallery` has its own tsconfig extending the base, but the root's
`exclude` names `packages/federation` and `packages/workspace` and forgets it.
So gallery's five files are checked **twice, under different options** — the root
adds `noUnusedLocals`/`noUnusedParameters` and omits `types: ["svelte"]`. That is
the same class of silent-wrong as the `DESIGN.md` registry gap in queue item 2:
a file that documents its own scope incorrectly, where nothing fails loudly.

Add `packages/gallery` to the exclude list. Once Phase 4 lands, the list should
name every directory carrying its own tsconfig — state that rule in the comment
so the next package added is obviously covered or obviously not.

**Gate:** `tsc -p tsconfig.json --listFiles` returns exactly
`packages/theme/mode-switcher.ts`, making the comment true again.

## Verification

The bar for every phase, and for the arc:

1. **Per-service typecheck** — `npx tsc --noEmit -p tsconfig.json` in each of the
   11 service directories. Baseline is 11 green; the refactor holds that.
2. **Effective-config equivalence** — `tsc --showConfig` before and after for a
   representative unit per phase. Exit code 0 proves it compiles; `--showConfig`
   proves it compiles *under the same rules*, which is the actual claim.
3. **Root scope** — `tsc -p tsconfig.json --listFiles` matches its own comment.
4. **No behavior change anywhere.** This is a pure structural refactor. Any diff
   in emitted output or in diagnostics is a bug in the refactor, not an
   improvement.

## Deliberately out of scope

- **Renaming `tsconfig.base.json`.** Its name is now slightly wrong — it is the
  web profile, not "the" base — but 20 files reference it and a rename is churn
  with no verification value. The new sibling's comment disambiguates instead.
- **`packages/config`, `packages/shared-services`, `packages/shared-ui`,
  `packages/theme`.** Zero or one `.ts` file each; none needs its own config.
  `packages/theme`'s single file is exactly what the root fallback is for.
- **Adding `typecheck` scripts where they are missing.** `decile-mcp` and
  `deploy-relay` have none. Real, worth doing, unrelated to this consolidation.

## Related

- [[../handoffs/Pickup-2026-09-13-Retrofit-Arc-And-The-Services-Tsconfig]] — where this queued
- [[Graphify-As-Standing-Practice-And-Per-Component-Diagrams]] — queue item 5; this is evidence for a structural trigger
- [[../refactors/Structural-Refactors-Surfaced-by-the-Codebase-Graph]] — the August build that established the genre
- [[../explorations/The-Gap-Between-What-We-Preach-And-What-We-Practiced]] — the counted audit this arc serves
- [[../loops/From-a-Raised-Issue-to-Fixed-and-Shipped]] — the execution cadence this plan runs under
