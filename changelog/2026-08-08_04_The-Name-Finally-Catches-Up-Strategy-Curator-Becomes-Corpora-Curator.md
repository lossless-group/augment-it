---
date_created: 2026-08-08
date_modified: 2026-08-08
title: "The name finally catches up — strategy-curator becomes corpora-curator"
lede: "The surface has said 'Corpora Curator' on screen since early July. Underneath, every file, class and federation remote still said strategy — a word that was only ever one value out of five. The code now says what the thing is."
publish: true
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5
files_changed:
  - apps/corpora-curator/
  - shell/rsbuild.config.ts
  - shell/Dockerfile
  - shell/src/remotes.ts
  - services/record-surrealdb-resolver/src/domains.ts
  - services/workspace/src/capabilities.ts
  - DESIGN.md
  - context-v/refactors/Rename-Strategy-Curator-To-Corpora-Curator.md
tags:
  - Augment-It
  - Corpora-Curator
  - Refactoring
  - Module-Federation
  - Design-System
  - Deployment
---

# The name finally catches up

## Why Care?

A name that is wrong costs more than it looks like it costs. Every agent
reading this repo, every new contributor, and every one of us six weeks from now
inherits the wrong mental model for free — and then writes code against it.

`strategy-curator` was wrong in a specific, checkable way. The surface it names
gathers sources into a **domain**, and a domain is type-discriminated:
`strategy | topic | thesis | market-segment | category`. `strategy` is one value
out of five. The client this ships to most, humain-vc, has never once run the
surface on `strategy` — everything they have is a thesis. We noticed early
enough to change the on-screen label to "Corpora Curator" back on 2026-07-06.
The code kept the old name for another month.

It has now been changed everywhere it referred to the live thing, and — this is
the part that took the care — deliberately **not** changed in the three places
where it is data rather than an identifier.

## What's New?

**The code identity moves in one piece.** `apps/strategy-curator/` →
`apps/corpora-curator/`, the package `@augment-it/strategy-curator` →
`@augment-it/corpora-curator`, the federation remote `strategyCurator` →
`corporaCurator`, and `StrategyPicker.svelte` → `CorpusPicker.svelte`.

**383 class occurrences across 56 names move from `sc-` to `cc-`**, in lockstep
with the member registry row in `DESIGN.md` (now revision 0.1.0.2). The registry
is what `pnpm design:drift` reads to enforce containment, so prefix and registry
had to move in the same commit or the F2/F3 audit would light up. It stayed at
zero.

**Nothing about the product changed.** No behaviour, no capability, no data, no
schema. This is a rename and only a rename.

## The vocabulary stays put — on purpose

The tempting next move is to rename the *domain type* too. We didn't, and the
reason is worth writing down.

`strategy` as an identifier lived in our repo. `strategy` as a **value** lives
in other people's:

- two external client submodules, in their corpus folder names on disk
- each client's `DEFAULT_DOMAIN_TYPE` in their own `.env`
- every `domains` row already written in SurrealDB

Renaming an identifier is a find-and-replace with a test suite behind it.
Renaming a value in someone else's repository is a migration, and it buys
nothing — the whole point of a type-discriminated catalog is that the types are
vocabulary preference. reach-edu says "strategy." humain-vc says "thesis."
Both are correct and neither needs our approval.

Same reasoning applies backwards through the docs. Earlier `DESIGN.md` revision
entries, the closed-defect logs, and every prior changelog entry keep the old
name. They record what was true when they were written, and rewriting history to
be consistent with the present is how you lose the ability to tell when
something changed.

## Under the Hood: the rename that could have taken production down

The genuinely dangerous part of this refactor was four environment variables.

Both `PUBLIC_<NAME>_REMOTE` and `PUBLIC_<NAME>_ASSET_PREFIX` are **inlined by
rsbuild at build time**, not read at runtime. The Railway dashboard still
supplies the `STRATEGY_CURATOR` spellings. So a shell built after the rename but
before someone updates the dashboard reads an unset variable, falls through to
the localhost default, and ships a production bundle pointing at
`http://localhost:3017`.

The asset-prefix one fails worse than the remote one. A wrong remote URL fails
loudly and immediately. A wrong **asset prefix** ships a remote that loads fine
and then breaks on its first async sub-chunk — the failure mode we already
burned a day on once, where the shell's SPA-fallback HTML gets `eval`'d as
JavaScript and you get `SyntaxError: Unexpected token '<'` from deep inside the
Module Federation runtime.

So both configs read the new name first and the old name second:

```ts
const CORPORA_CURATOR_REMOTE =
  process.env.PUBLIC_CORPORA_CURATOR_REMOTE ||   // what we will set
  process.env.PUBLIC_STRATEGY_CURATOR_REMOTE ||  // what Railway still sends
  'http://localhost:3017/remoteEntry.js';
```

`||` rather than `??`, deliberately — an unset Docker `ARG` assigned to `ENV`
arrives as an **empty string**, not `undefined`, so `??` would happily ship
`corporaCurator@` with no host at all.

Both Dockerfiles declare both `ARG`s. Both middle terms get deleted in Phase 5,
once the dashboard is updated. Until then the deploy builds correctly no matter
which name the environment happens to be using.

## What's Next

Phase 5 is the cleanup: drop the legacy env-var reads once Railway supplies
`PUBLIC_CORPORA_CURATOR_REMOTE` and `PUBLIC_CORPORA_CURATOR_ASSET_PREFIX`.

The phased record — what moved, what deliberately didn't, and what is left —
lives in
[[context-v/refactors/Rename-Strategy-Curator-To-Corpora-Curator.md]].
