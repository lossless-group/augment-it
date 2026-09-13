---
title: "Two Tsconfig Profiles, and the Drift They Stop"
lede: "Ten byte-identical service configs folded onto a shared base — and the audit that proved it found three defects nobody was looking for."
publish: true
date_authored_initial_draft: 2026-09-13
date_authored_current_draft: 2026-09-13
date_work_started: 2026-09-13
date_work_completed: 2026-09-13
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5 (1M context)
summary: >-
  Executes the first item queued by yesterday's Graphify diff. Ten of eleven
  service tsconfigs were byte-identical and extended nothing, while eighteen apps
  extended a base that already worked. A new tsconfig.services.json lands as a
  sibling of tsconfig.base.json — Node profile and browser profile, neither
  extending the other — and every unit in the repository now extends exactly one
  of them. Proven by tsc --showConfig equivalence rather than exit codes. The
  audit that verified completeness found three defects the plan had not
  anticipated: packages/federation red on TS2882 for as long as it has imported
  CSS, packages/gallery type-checked twice under two different option sets, and
  e2e/ claimed by no project at all.
site_uuid: 8a941046-f06d-4de1-80c7-7405d15a992d
hex_code: ezfp0r
files_changed:
  - tsconfig.services.json
  - tsconfig.base.json
  - tsconfig.json
  - services/content-ingest/tsconfig.json
  - services/decile-mcp/tsconfig.json
  - services/ingest/tsconfig.json
  - services/prompt-runner/tsconfig.json
  - services/prompt-store/tsconfig.json
  - services/record-surrealdb-resolver/tsconfig.json
  - services/response-store/tsconfig.json
  - services/row-store/tsconfig.json
  - services/social-search/tsconfig.json
  - services/workspace/tsconfig.json
  - services/xlsx-ingest/tsconfig.json
  - packages/federation/tsconfig.json
  - packages/federation/src/css.d.ts
  - packages/workspace/tsconfig.json
  - e2e/tsconfig.json
  - context-v/plans/Give-The-Services-A-Shared-Tsconfig-Base.md
  - changelog/2026-09-13_03_Two-Tsconfig-Profiles-And-The-Drift-They-Stop.md
---

# Two Tsconfig Profiles, and the Drift They Stop

## Why Care?

Ten of eleven service `tsconfig.json` files were byte-identical — md5
`540460bd93f2916e7ccfd45e30e6a7bd` — and not one of them extended anything. One
directory away, eighteen apps extended a `tsconfig.base.json` that already
existed, already worked, and whose own header comment recorded why it was
written: *"the 17 apps carried three byte-distinct tsconfig.json variants in an
8/7/2 split — drift, not intent."*

The services hadn't drifted **yet**. That is the entire reason to act. Folding
ten identical files is a no-op you can prove in an afternoon; folding ten files
that have split 8/7/2 is the apps' archaeology all over again. The cheapest
moment to consolidate is the moment before it starts costing anything.

This was surfaced by [diffing two Graphify builds five weeks
apart](2026-09-13_02_Graphify-For-System-Knowledge-And-Code-Graphs.md). Neither
reading the code nor reading the docs would have found it — every file is
individually unobjectionable and only the aggregate is wrong. That is the case
for the graph as a standing instrument, made concretely.

## What's New?

- **`tsconfig.services.json`** — the Node profile, a **sibling** of
  `tsconfig.base.json`, not a child
- **Eleven services folded on**, including the one that genuinely differs
- **Two packages folded** onto the existing base, making the packages layer
  uniform rather than two-of-four
- **Three defects fixed** that the completeness audit found and the plan had not
  anticipated
- **One rule written down** so the root config can be checked against the disk
  with a single command

## Two profiles, not a base and a variant

The obvious move — make the services extend `tsconfig.base.json` — is wrong, and
worth saying why. That file is the browser/Svelte profile: `DOM` and
`DOM.Iterable` in `lib`, `types: ["svelte"]`, `allowImportingTsExtensions`,
`isolatedModules`. The services are Node: `ES2022` only, `types: ["node"]`,
`noUnusedLocals` and `noUnusedParameters` on.

Extending one from the other would take five override-to-undo entries and would
encode a relationship that doesn't exist. So they are peers, and the repository
now has exactly two profiles with every unit belonging to precisely one:

| Profile | Extends | Members |
|---|---|---|
| Browser / Svelte | `tsconfig.base.json` | 18 apps, `shell/`, `packages/{federation,gallery,workspace}` |
| Node | `tsconfig.services.json` | 11 services, `e2e/` |
| Astro | `astro/tsconfigs/strict` | `splash/` |
| Fallback | — | root `tsconfig.json`, one loose file |

`include` and `exclude` stayed in every unit, deliberately. TypeScript resolves
those paths relative to the file they are *written* in, so a shared
`"src/**/*.ts"` would resolve against the repository root and every service
would compile **zero files — silently, and green**. `tsconfig.base.json`'s
comment records learning that the hard way; the new file says so too, rather
than leaving it to be re-learned.

## Proven by equivalence, not by exit code

`tsc --showConfig` was captured for all fifteen affected projects before the
change and after it. For the ten identical services, the resolved configs are
**byte-identical** — the fold is not "probably fine," it is provably a no-op.

For `services/decile-mcp`, the one service that legitimately differs because it
compiles to `dist/` and starts with `node`, the gate was the emitted output:
`dist/` was checksummed before and after, and all six files — both `.d.ts`
declarations and both source maps included — came out identical.

An exit code proves the code compiles. `--showConfig` proves it compiles *under
the same rules*, which is the claim a config refactor actually makes.

`decile-mcp` also inherited `verbatimModuleSyntax`, `noUnusedLocals` and
`noUnusedParameters`, none of which it had, and stayed green. The plan had left
open whether to weaken the shared base for it; the answer was no, which is the
outcome worth having, since an override that loosens a base for one consumer is
how shared bases stop being shared.

## What the audit found that the plan didn't

The sweep run to confirm the fold was complete turned up three things:

**`packages/federation` has been red on TS2882** for as long as `src/index.ts`
line 42 has imported `@augment-it/theme/token-baseline.css`. It had neither half
of a fix that is already written down three times over — `shell/src/css.d.ts`
carries the shim *and* a comment explaining that the ambient declaration is inert
unless `src/**/*.d.ts` is in that unit's `include`. Twenty units carry the shim.
federation had neither.

Nothing surfaced it because nothing runs it. The package **has** a `typecheck`
script; the root has no `typecheck` script to sweep with, so `pnpm -r` never
reaches it. A per-unit script that no aggregate invokes is a test that does not
exist — the component-level gap [the audit
counted](../context-v/explorations/The-Gap-Between-What-We-Preach-And-What-We-Practiced.md)
showing up as a concrete red build instead of an absence.

**`packages/gallery` was being type-checked twice**, under two different option
sets. The root config's `exclude` named `packages/federation` and
`packages/workspace` and forgot gallery, so its five files were checked by their
own config *and* by the root's — which adds the unused-binding checks and omits
`types: ["svelte"]`. The root's comment claimed it governed one file;
`--listFiles` said six.

**`e2e/` was claimed by nothing at all** — no tsconfig, and in the root's exclude
list, so its two TypeScript files were checked by no project. Vitest transpiles
without type-checking, so the files ran fine and were never verified.

## The rule, so the doc can be checked

Two of those three are the same failure: **a file that misdescribes its own
scope, where nothing fails loudly.** The root config claimed one file and
governed six; `tsconfig.base.json` claimed "apps plus shell" long after three
packages had joined.

So the root comment now carries a rule rather than a snapshot:

> `exclude` must name every directory that carries its own `tsconfig.json`. A
> directory missing from this list gets type-checked twice, under two different
> sets of options, and nothing fails loudly to tell you. Verify with
> `--listFiles`; do not trust the prose, including this prose.

A rule the next editor can apply beats a fact that was true once. And it is
checkable in one command — `tsc -p tsconfig.json --listFiles` now returns exactly
`packages/theme/mode-switcher.ts`, making the comment true again.

## Where it stands

**Every project typecheck green**, under the checker each unit declares — 21
`svelte-check` units, 12 `tsc` units, and the root project: 0 errors, 5
warnings, exit 0.

> **Corrected later the same day.** This entry first reported "34 of 35 green,
> 1 red," with `apps/corpora-curator` filed as gh #99. That number came from
> running bare `tsc --noEmit` on every directory holding a `tsconfig.json`,
> **including the Svelte apps, which is the wrong checker for them.**
> `patterns.svelte` exports Svelte 5 snippets via `export { … }` in a
> `<script module>` block — `svelte-check` resolves them; bare `tsc` falls back
> to Svelte's ambient `declare module '*.svelte'` wildcard, which declares only
> a default export. TS2614 was an artifact of the measurement. #99 closed as a
> false positive, and the sweep is green.

Two follow-ups this arc earned but did not take:

- **A root `typecheck` script.** The absence is why federation rotted unseen, and
  no amount of per-unit discipline substitutes for one aggregate that runs them.
- **`decile-mcp` and `deploy-relay` have no `typecheck` script** — the first
  because it builds instead, the second because it has no TypeScript at all.

`services/deploy-relay` is worth one closing note, because it was an open
question this morning and the answer is *nothing is wrong*: its only source file
is `api/railway.js`, plain JavaScript, so it needs no tsconfig. Eleven of twelve
is the correct count. That is recorded in the services base's comment
deliberately — a negative result nobody writes down gets re-derived by the next
graph diff, and re-deriving it costs exactly as much the second time.

## Related

- [Give-The-Services-A-Shared-Tsconfig-Base.md](../context-v/plans/Give-The-Services-A-Shared-Tsconfig-Base.md) — the five-phase plan
- [Graphify for System Knowledge & Code Graphs](2026-09-13_02_Graphify-For-System-Knowledge-And-Code-Graphs.md) — the diff that queued this
- [The Gap Between What We Preach And What We Practiced](../context-v/explorations/The-Gap-Between-What-We-Preach-And-What-We-Practiced.md) — the counted audit this arc serves
