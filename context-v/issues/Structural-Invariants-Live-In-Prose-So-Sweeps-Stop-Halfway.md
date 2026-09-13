---
title: "Structural invariants live in prose, so sweeps stop halfway and nothing notices"
lede: "Three units have now been found whose typecheck had never once passed. Each was found by accident, five weeks apart, by someone tidying something else."
date_created: 2026-09-13
date_modified: 2026-09-13
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5 (1M context)
semantic_version: 0.0.1.0
status: Resolved
tags:
  - Issue
  - Augment-It
  - TypeScript
  - Architecture
  - Drift
  - Graphify
  - Design-Drift
site_uuid: 60342b53-8333-4a42-ab76-7dd808253f0a
hex_code: 3y91ea
date_authored_initial_draft: 2026-09-13
date_authored_current_draft: 2026-09-13
publish: true
---

# Structural invariants live in prose, so sweeps stop halfway

## Why Care?

On 2026-08-06 a session found that `shell`'s typecheck **had never passed** —
not "regressed," never passed, since the day the check script was written. On
2026-09-13, five weeks later, a different session found that
`packages/federation`'s typecheck had never passed either. Same error class
(`TS2882`, ambient CSS module), same root cause (missing `css.d.ts` *and* the
`include` line that makes it visible), same discovery mechanism: **someone
tripped over it while tidying something else.**

`e2e/` turned out to be claimed by no TypeScript project at all. `packages/gallery`
was being checked twice under two different option sets.

Four units, two sessions, five weeks apart. Nobody was looking for any of them.

That is the issue. Not the four defects — those are fixed. The issue is that
this codebase's structural invariants are **written in prose inside config file
comments**, and prose cannot fail a build.

## What we were actually trying to do — an honest answer

**We did not have a plan, and this document should not invent one retroactively.**

The git record is specific. Three commits, one day, 2026-08-06:

| Commit | What |
|---|---|
| `e51032d` | `refactor(apps, packages/federation): collapse seventeen mount.ts files into one factory` |
| `6dc6d73` | `chore(apps, tsconfig): converge three tsconfig variants onto one shared base` |
| `b295817` | `fix(shell): the shell's typecheck has never passed` |

The tsconfig one is labelled **`chore`**. Its own body defers the next step
explicitly — *"The root tsconfig.json is left untouched... Removing it is a
separate decision from converging the apps."* It names its scope as the apps.
It says nothing about `services/`, nothing about `packages/`, and nothing about
a general rule.

`b295817` is the tell. The shell became the eighteenth member of the
consolidation **not because anyone swept for members**, but because a bug
pointed at it. The commit says so: *"found only because this bug pointed at it."*

So: there was no idealistic initiative that got abandoned before it got started.
There was **local tidying that got mistaken for coverage** — a session cleaned
what was in front of it, wrote an excellent comment explaining the reasoning,
and moved on. Five weeks later the same shape was still sitting in `services/`
and `packages/`, and nothing anywhere said it should not be.

What *was* real is a **repeated shape**, visible three times in one day:

> N near-identical per-unit files → one shared contract, plus a thin local file
> containing only the part that is genuinely per-unit.

`mount.ts` (406 lines → one factory). `tsconfig.json` (20 lines → 4, ×18).
That shape is good and the instincts behind it were right. It was just never
named, never scoped, and never made checkable.

## Does this unlock a refactor? No.

Stating this plainly because it would be easy to imply otherwise:

**A shared tsconfig removes zero lines of application code and changes zero
runtime behaviour.** It is build-time configuration. There is no refactor
downstream of it. The 2026-09-13 consolidation was hygiene, and hygiene that
was *proven* to be a no-op — `tsc --showConfig` came back byte-identical for all
ten services precisely because nothing changed.

Worse for the "this unlocks something" thesis: **the two refactors it might have
unlocked are already done.**

- `mount.ts` — collapsed on 2026-08-06. 406 lines across 17 files became one
  `makeMount()` factory in `packages/federation`.
- `tsconfig` for apps — converged the same day.

## The remaining duplication, measured

Having checked rather than assumed, there is **one** real candidate left:

```
19 rsbuild.config.{ts,mjs}    912 lines total, ~48 average, all 19 distinct
```

In a representative config (`apps/pack-runner`, 42 lines), the genuinely
per-remote values are: federation `name`, dev-server `port`, html `title`,
`assetPrefix`, the CORS origin, and the `exposes` path. Everything else —
`pluginSvelte()`, `pluginModuleFederation` boilerplate, `filename`,
`dts: false`, `output.target`, the browserslist, the swc `jsc.target`, the
entry — is identical across all of them.

That is the same shape as `makeMount`, and it would be a `defineRemote({ name,
port, title })` factory. **But measure before committing to it**: the spread is
42→86 lines, so some configs carry real per-app content and a factory that
cannot express it produces escape hatches that undo the gain. `person-enrichment`
at 86 lines is the one to read first.

Everything else worth consolidating in this repo has been consolidated. This is
not a monorepo drowning in copy-paste.

## Separately: the graph mis-scored the top queue item

[[../handoffs/Pickup-2026-09-13-Retrofit-Arc-And-The-Services-Tsconfig]] lists as
queue item 1: *"Finish the `mount.ts` consolidation. Proposed in the August graph
build, still unshipped... `makeMount()` is now a god node with 19 edges, so the
helper exists and the duplication wasn't removed."*

**That is wrong, and it should come off the queue.** `e51032d` shipped the
consolidation on 2026-08-06 and is an ancestor of `HEAD`. The surviving
`mount.ts` files are 12–18 lines of which most is explanatory comment, wrapping a
single `makeMount(App)` call. The distinct export name per remote is *load-bearing*
— Module Federation exposes it by name — so those files cannot collapse further.

Nineteen edges into `makeMount` is not a god node. It is **nineteen consumers of
one shared factory, which is exactly what the refactor was supposed to produce.**
The node count moved 17→19 because two apps were added, not because duplication
grew.

The methodological finding is the valuable part: **the graph reads centrality,
and centrality cannot distinguish "everyone duplicates this" from "everyone
correctly depends on this."** A successful consolidation and an unaddressed
duplication look identical in the node-degree column. This is worth carrying into
[[../plans/Graphify-As-Standing-Practice-And-Per-Component-Diagrams]] — a graph
finding is a *hypothesis*, and this one survived five weeks and two handoffs
without anyone running `git log` on the file.

## What "getting it right" would mean

Not another sweep. The sweeps work fine; the problem is that nothing tells us
when one is incomplete.

**The invariant has to be executable.** Three candidate rules, all currently
true, none currently checked:

1. Every directory containing `.ts`/`.svelte` source is claimed by **exactly one**
   TypeScript project — not zero (`e2e/` was), not two (`packages/gallery` was).
2. Every unit `tsconfig.json` extends `tsconfig.base.json` or
   `tsconfig.services.json`. No standalone copies outside the three root files.
3. Every unit that can be checked **is** checked by something an aggregate
   command runs.

Rules 1 and 2 are ~40 lines of Node against the existing file tree. Rule 3 is
[gh #100](https://github.com/lossless-group/augment-it/issues/100) (the root `typecheck` script).

**The natural home already exists.** `scripts/design-drift.mjs` is 608 lines of
zero-dependency Node with an adoption ramp (warn → fail) controlling exit code,
already wired as `pnpm design:drift`. It already enforces F1–F11 against a member
registry. These are structural drift rules of the same species. They do not need
a new harness — they need three more checks in the harness we built and are
already running.

That also fixes the *other* half of the problem, which is that `design-drift.mjs`
reads its member registry from `DESIGN.md` frontmatter, and `DESIGN.md` registers
16 of 20 microfrontends and 2 of 7 packages and mentions `services/` zero times.
**A drift linter whose scope is a hand-maintained list has the same disease as a
config comment.** Deriving the member list from the disk — and *warning* when the
disk and the registry disagree — is the same fix as rule 1.

## On the root typecheck script: the fear is measurable, and it's small

The concern raised was that adding a root `typecheck` would open a rabbit hole,
because TypeScript conventions have never been enforced and the codebase is large.

Measured on 2026-09-13, whole repo, **each unit checked by the tool it actually
declares**:

```
pnpm typecheck    21 svelte-check units + 12 tsc units + the root project
                  0 errors, 5 warnings, exit 0
```

The five warnings are one each across four apps. **That is the entire debt.**
The conventions are in fact being held — by hand, by attentive sessions, with no
automation. A root sweep would not open a rabbit hole; it would **ratchet a
state that is already green** so the next federation-shaped rot is caught in CI
instead of five weeks later by accident.

> **A correction worth keeping, because it is the same mistake in miniature.**
> An earlier pass reported "34 of 35 green, 1 red" and filed the red as
> [gh #99](https://github.com/lossless-group/augment-it/issues/99). That number
> came from running bare `tsc --noEmit` on every directory holding a
> `tsconfig.json` — including the Svelte apps, **which is the wrong checker for
> them.** `apps/corpora-curator/src/gallery/patterns.svelte` exports Svelte 5
> snippets via `export { … }` in a `<script module>` block; `svelte-check`
> resolves those, while bare `tsc` falls back to Svelte's ambient
> `declare module '*.svelte'` wildcard, which declares only a default export.
> Hence TS2614, and hence a defect that was never there. #99 is closed as a
> false positive.
>
> The sweep asserted coverage while measuring with a tool that did not fit the
> units it was pointed at — a checker reporting a result because of how it
> looked, not what was there. That is why **S3 is phrased as "declares a script
> that type-checks"** rather than "passes `tsc`": the unit knows which checker
> is correct for it, and the aggregate's job is to reach it, not to overrule it.

But the instinct is half-right, and the half that's right matters more than the
half that isn't. **The trap is not redness — it's that "typecheck" means three
different things here:**

- 10 services + `e2e` run `tsc --noEmit`
- 20 apps + shell run `svelte-check`
- `services/decile-mcp` has no `typecheck` script (it has `build`, which checks
  as a side effect of emitting)
- `services/deploy-relay` has none and needs none (plain JS)
- `apps/highlight-collector` and `apps/insight-manager` have no config and no
  source — they are README-only placeholders

So `pnpm -r typecheck` reaches **only units that declare the script** — which is
precisely the hole that let `packages/federation` sit red for weeks. Adding the
root script without rule 3 reproduces the original defect at a higher altitude:
a green aggregate that is green partly because it isn't looking.

**Recommendation:** add the root script *and* the coverage assertion together, as
one change, on the warn rung of the adoption ramp. Not the script alone.

## Resolution

**Resolved 2026-09-13, same day.** The four concrete defects were fixed by
[[../plans/Give-The-Services-A-Shared-Tsconfig-Base]] (`changelog/2026-09-13_03`),
and the condition that produced them is now enforced rather than described.

Rules 1–3 shipped as **S1–S3** in `scripts/design-drift.mjs` — same file, per the
lean below, because a second linter nobody runs is this issue one level up. They
are pure file-tree logic with no `tsc`, no `DESIGN.md` and no `theme.css` in the
path, so they **gate CI** (`pnpm design:structure`) while F6/F8 still cannot.
Every branch was mutation-tested — each failure mode introduced on purpose,
confirmed to fire, reverted — because a new check that only ever prints "all
pass" has not been shown to work, and this script has a documented history of
exactly that.

Exemptions are **derived from the disk, not listed**: a directory with no source
is not a unit, which is how the two README-only app placeholders and
`deploy-relay`'s single plain-JS function stay silent without an allowlist that
can rot.

`pnpm typecheck` now sweeps all three checker shapes — the root project,
`typecheck` (tsc) for services and packages, `check` (svelte-check) for apps and
shell — and gates CI. Three coverage gaps were closed so S3 passes honestly
rather than by loosening: `packages/shared-ui` (2 `.svelte`, no config, no
script), `packages/gallery` (config, no script), `e2e` (config, no script).

### Still open

- Does `design-drift.mjs` derive its member list from disk, or keep the
  `DESIGN.md` registry as the source of truth with a disagreement warning? **This
  is now the largest remaining instance of the pattern** — the linter's own scope
  is still a hand-maintained list registering 16 of 20 microfrontends, 2 of 7
  packages, and zero services. S1–S3 do not check it, so `design:drift` remains
  able to report clean on units it never looked at.
- Is the rsbuild factory worth doing, after reading `person-enrichment`'s 86-line
  config? It is the last mechanical duplication of any size in the repo.

## Related

- [[../plans/Give-The-Services-A-Shared-Tsconfig-Base]] — the consolidation that surfaced this
- [[../handoffs/Pickup-2026-09-13-Retrofit-Arc-And-The-Services-Tsconfig]] — carries the mis-scored queue item 1
- [[../explorations/The-Gap-Between-What-We-Preach-And-What-We-Practiced]] — the counted audit; this is the same gap with a failing build attached
- [[../plans/Graphify-As-Standing-Practice-And-Per-Component-Diagrams]] — centrality-is-not-duplication belongs here
- [[../plans/Component-Level-Documentation-Contracts]] — the forcing-function decision this feeds
