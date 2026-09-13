---
title: "Graphify as Standing Practice and Per-Component Diagrams — Visual Engineering That Doesn't Go Stale"
lede: "The graph ran once, on 2026-08-06, and still names an app that was renamed two days later. Turning a snapshot into an instrument, and giving each unit its own picture."
date_created: 2026-09-12
date_modified: 2026-09-12
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5 (1M context)
semantic_version: 0.0.1.0
tags:
  - Plan
  - Augment-It
  - Visual-Engineering
  - Graphify
  - Knowledge-Graph
  - Architecture-Diagrams
  - Mermaid
  - Documentation-First
  - Client-Recommendations
status: Proposed
site_uuid: 34b59262-dc9c-4d98-ac9c-76a5c333e3ec
hex_code: jhr8iv
date_authored_initial_draft: 2026-09-12
date_authored_current_draft: 2026-09-12
publish: true
---

# Graphify as Standing Practice and Per-Component Diagrams

## Why Care?

Recommendation 1b — **Visual Engineering, Visual Leadership** — is the one most
likely to be heard as decoration. "We made some diagrams." The distinction that
makes it a real practice rather than a slide is the difference between a
**snapshot** and an **instrument**: a snapshot tells you what the system looked
like once; an instrument answers questions you didn't have when you built it.

Augment-it built the snapshot and stopped. On **2026-08-06**, `graphify`
extracted **4,330 nodes and 6,011 directed edges** across 490 source files — 99%
`EXTRACTED`, 1% `INFERRED`, **zero tokens**, because AST parsing needs no LLM.
It produced a genuinely valuable artifact,
[[../refactors/Structural-Refactors-Surfaced-by-the-Codebase-Graph]], which found
~500 cleanly deletable lines, 11 near-identical `mount.ts` files, and — more
useful than either — *disproved* the assumption that the frontend was full of
duplicated CSS.

Then it never ran again. Here is the proof, and it is exact: the graph's
community hub list still reads **"Strategy Curator App."** That app was renamed
to `corpora-curator` on **2026-08-08**, two days after the graph was built. The
instrument is now describing a system that no longer exists, in a way that would
mislead any agent that trusted it.

That is the whole of the 1b gap. Not "we didn't do visual engineering" — we did
it once, well, and then let it rot.

## Two halves, one recommendation

**The graph as a standing instrument** — structural truth, re-derived, diffable.
**The diagram as a per-unit artifact** — each of the forty units carrying a
picture of its own data flow. The first is about the system; the second is about
the components, and it folds directly into
[[Component-Level-Documentation-Contracts]] as the visual member of each unit's
contract set.

Both are needed, and they are not substitutes. A system graph can't tell a
developer how one service's request flows. A per-unit diagram can't tell you that
eleven mount files converged on the same shape.

## Half one — the graph as a standing instrument

### What has to change

Three things separate an instrument from a snapshot:

**It gets re-derived.** The August graph is stale in a *detectable* way — the
Strategy Curator rename is a single grep away. Re-running is nearly free: the
extraction costs zero tokens, and the AST cache in `graphify-out/cache` makes the
second build faster than the first. The `.graphifyignore` scoping is already
correct (it excludes `clients/`, which was 2,106 of 2,910 detected files — a
*content* corpus that would otherwise bury the architecture in community
detection). Nothing needs re-deciding; it needs re-running.

**The diff is the product, not the graph.** A fresh graph tells you what the
system is. The *delta* between two graphs tells you what the system became —
which is the question worth a human's attention. New god nodes, new import
cycles, communities that merged or split, a unit whose edge count doubled. That
is the reading that turns the graph from a reference into a signal.

**Findings land as documents.** The August run's one genuinely correct move was
writing [[../refactors/Structural-Refactors-Surfaced-by-the-Codebase-Graph]] —
the `refactors/` folder this repo invented for exactly this. A graph run that
produces no document produced nothing. This is the rule to keep.

### Cadence

Not continuous, and not per-commit — a graph re-run per commit is noise, and the
structural questions it answers don't change that fast. The natural trigger is
**structural**: a new unit added, a unit renamed or removed, a federation
contract changed, or a refactor of the kind the August run proposed. Plus a
standing periodic run so drift can't accumulate silently between structural
events.

The mechanism is an open question below. The principle is not: **a graph nobody
re-runs is a document, and should be dated and filed as one rather than
pretended to be current.**

### Reading it well

Worth carrying forward from
[[../../../../context-v/blueprints/Understanding-Codebases-with-Graphify|the anchor
blueprint]]: for *learning* a system, `graphify --wiki` — an index plus one
article per community — is more legible than the force-directed HTML view, which
is impressive and hard to reason from. And the doc layer can be added later via
`--update` without re-running AST extraction; the August run deliberately left
314 semantic files unstamped, so that option is still open and still cheap.

## Half two — per-component diagrams

### What a unit's diagram has to show

Mermaid already appears in 13 files here, which is real but incidental — none of
it is a unit describing itself. The obligation is specific and narrow, because
a diagram that tries to show everything shows nothing:

- **For a microservice** — what comes in, what it calls, what it writes, what it
  emits. The request/message lifecycle through *this* service only, with the
  boundary drawn at the service edge.
- **For a microfrontend** — what the shell hands it, what it renders, what
  services it calls, what it emits back. The federation boundary is the frame.
- **For a shared package** — what depends on it. This is the one case where the
  graph's own output is more useful than a hand-drawn picture, and the diagram
  should be generated from it.
- **For the shell** — the composition picture. Twenty remotes mount into it and
  the mounting rules are currently undocumented in any form, prose or visual.

Each diagram lives in the unit's own `README.md` or `DESIGN.md` as a Mermaid
fence — rendered in place on GitHub, diffable as text, no build step, no image
assets to go stale silently. **No raster.** A picture that can't be diffed will
rot exactly the way the August graph did, and won't announce it.

### Generated, not hand-drawn, wherever possible

A hand-drawn diagram is a claim about the code. A generated one is a description
of it. The first goes out of date silently; the second goes out of date visibly,
when regeneration produces a diff.

The graph already holds the edges for most of what these diagrams should show —
`graphify path` and `graphify explain` answer exactly the per-unit questions
above. The strong version of this plan is that **half two is downstream of half
one**: a standing graph emits per-unit diagrams, rather than forty people drawing
forty pictures. Hand-drawing is the fallback for what the graph can't see — the
NATS message flows and cross-service semantics that AST extraction misses.

### The Archify question

Archify-shaped tooling — natural language → architecture diagram — was named as
a candidate and never tried. Before anyone evaluates it, note that this tree's
own [[../../../../self-host-stack/context-v/explorations/Watchlist-Interesting-Tools|watchlist]]
already flags the ambiguity: **two distinct projects share the name**,
`tt-a1i/archify` (a CLI/agent skill) and `Harrison-Yuan/archify-webui` (a
self-hostable web UI), and the watchlist explicitly asks that whoever revisits it
say which one was meant.

Evaluate it only after the generated-diagram path has been tried, and evaluate it
against the right bar: an LLM drawing a plausible diagram from a description is
*a hand-drawn diagram with extra steps* — it inherits the silent-rot problem. It
earns its place only if it reads the code rather than the prose.

## Sequencing

**First, re-run the graph and diff it against August.** Cheap, and it produces
the most interesting single artifact available right now: a month of structural
change, including whatever the partially-shipped refactors actually landed. This
is also the fastest way to find out whether the diff is genuinely as informative
as this plan assumes.

**Second, decide the cadence mechanism** — informed by what the first diff
actually shows, not before.

**Third, generate per-unit diagrams from the graph** for the units that get their
contracts first: `packages/federation` and `shell/`, per
[[Component-Level-Documentation-Contracts]].

**Fourth, hand-draw only what the graph can't see** — the NATS message flows
between services, which AST extraction will miss entirely.

## Open questions

- **Cadence mechanism.** A CI job on structural change, a `/loop`, a cron, or a
  human ritual? Leaning toward CI on structural triggers, because the whole
  lesson of the August run is that human rituals lose to agentic velocity.
- **Where the graph output lives.** `graphify-out/` is ~7MB of regenerable
  artifacts and the anchor blueprint says gitignore it. But then the *diff*
  between runs has no home. Options: commit `GRAPH_REPORT.md` only (small,
  diffable, and the diff becomes a git diff — likely right), or store snapshots
  outside the repo.
- **Does the graph re-run before or after the refactors it proposed?** The August
  findings are `Partially-Shipped`. Re-running now measures the system mid-
  refactor, which muddies the diff but also reveals exactly which proposals
  landed. Probably worth doing precisely for that reason.

## Related

- [[../explorations/The-Gap-Between-What-We-Preach-And-What-We-Practiced]] — the audit that counts this gap
- [[../blueprints/Augment-It-as-Working-App-and-Architecture-Demo]] — recommendation 1b in the doctrine
- [[../refactors/Structural-Refactors-Surfaced-by-the-Codebase-Graph]] — what the single August run produced
- [[Component-Level-Documentation-Contracts]] — the prose half of the same per-unit effort
- [[../../../../context-v/blueprints/Understanding-Codebases-with-Graphify]] — the scoping and reading discipline this builds on
- [[../loops/Endow-A-Component-With-Its-Own-Contracts]] — where per-unit diagrams get attached
