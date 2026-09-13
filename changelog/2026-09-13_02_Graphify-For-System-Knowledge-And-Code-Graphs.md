---
title: "Graphify for System Knowledge & Code Graphs"
lede: "The graph moved 23 nodes in five weeks. Underneath, a quarter of it was replaced — including a fix we proved, then stopped applying."
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
  Second Graphify build over augment-it (first was 2026-08-06), run code-only and
  directed to match, then diffed node-by-node against the preserved August graph.
  Establishes the graph as a standing instrument rather than a snapshot: the diff,
  not the graph, is the product. Confirms the corpora-curator rename propagated,
  finds an unlogged tsconfig consolidation across 18 apps, finds that the same fix
  was never applied to 11 byte-identical service tsconfigs, and finds the August
  mount.ts consolidation proposal still unshipped. Executes the first half of the
  Graphify-As-Standing-Practice plan. Zero tokens.
site_uuid: 74273d37-4f41-4f33-93a3-4ee1b08f3630
hex_code: ac3ucm
files_changed:
  - .graphifyignore
  - graphify-out/GRAPH_REPORT.md
  - graphify-out/graph.json
  - graphify-out/graph.html
  - changelog/2026-09-13_02_Graphify-For-System-Knowledge-And-Code-Graphs.md
---

# Graphify for System Knowledge & Code Graphs

::image{src="https://ik.imagekit.io/xvpgfijuw/augment-it/graphify-system-knowledge-code-graphs/Graphify__Codebase-Graph--4353-Nodes_20260913T061425Z.jpg" alt="Graphify force-directed knowledge graph of the Augment-It codebase, 4,353 nodes and 6,176 edges in 294 colour-coded communities, with a sidebar listing the largest communities including Record SurrealDB Resolver Service, Gallery Pkg, Row Store Service and Tsconfig Base Json" caption="4,353 nodes · 6,176 edges · 294 communities, extracted from 521 source files for zero tokens. AST parsing needs no LLM."}

## Why Care?

A codebase **is** a graph — of imports, calls, mounts, and data flow — and
extracting it costs nothing. No LLM, no tokens, no API key. Tree-sitter walks the
AST and you get 4,353 nodes and 6,176 edges in under a minute.

That makes the picture cheap. What makes it *useful* is running it twice.

We built this graph once before, on **2026-08-06**. It found ~500 cleanly
deletable lines, 11 near-identical `mount.ts` files, and — more valuably —
*disproved* our assumption that the frontend was full of copy-pasted CSS. Then it
sat there for five weeks while the code moved out from under it, until its
community list was still advertising an app we'd renamed two days after the build.

**A graph nobody re-runs is a document, not an instrument.** This is the re-run,
and the diff is the product.

## What's New?

- **The second build**, code-only and directed to match August exactly, so the
  comparison is like-for-like
- **A node-by-node diff** against the preserved August graph — the thing that
  actually produces findings
- **Four findings**, two of them things nobody had written down
- **`graph.html`** — 3.4MB standalone, opens in any browser, no server
- **Scoping fix** in `.graphifyignore` so generated diagram renders stop skewing
  community detection

## The headline is a trap

| | 2026-08-06 | 2026-09-13 |
|---|---:|---:|
| Nodes | 4,330 | 4,353 |
| Edges | 6,011 | 6,176 |
| Communities | 285 | 294 |
| Code files | 490 | 521 |

Net **+23 nodes**. Read that row alone and you'd conclude nothing happened in five
weeks.

Underneath: **562 nodes added, 539 removed.** A quarter of the graph turned over
while the totals barely moved. This is the entire argument for diffing rather than
re-reading — a summary line is *actively misleading* here, and only a
node-by-node comparison recovers the truth.

## Finding 1 — the rename propagated, and the exceptions held

`strategy*` nodes went **131 → 4**. `corpora*` went **11 → 142**. The graph no
longer describes an app that doesn't exist.

The four survivors are the interesting part. They aren't stragglers — they're the
`strategy | topic | thesis | market-segment | category` domain vocabulary that
`DESIGN.md` explicitly says was **deliberately not renamed**, because it's a data
value living in two external client submodules and in on-disk folder names.

So the diff independently confirmed a documented decision. That is what a graph is
for: not "did we rename it," but "did we rename exactly what we said we would."

## Finding 2 — a consolidation landed that nobody logged

Nine different apps each lost **exactly 21 nodes**. An identical delta repeating
across unrelated units is never a coincidence.

They were per-app `tsconfig.json` `compilerOptions` — every app declaring
`target`, `module`, `strict`, `lib`, `moduleResolution` and fifteen more, inline,
separately. **Eighteen apps went from ~28 inline nodes each to 11**, now extending
a new shared `tsconfig.base.json`.

The base file's own header records what drove it:

> *"Before this file the 17 apps carried three byte-distinct `tsconfig.json`
> variants in an 8/7/2 split — drift, not intent."*

That is the August graph's central thesis — *repetition without a home* — actually
acted on. It just never got a changelog entry, so the only place it was legible
was the diff.

## Finding 3 — the same fix stops dead at the `apps/` boundary

Every one of the **eleven services sits at 22 inline tsconfig nodes. 22 → 22.
Unchanged.**

The graph said look here; the disk confirmed it:

```
10 of 11 service tsconfig.json files are byte-identical   (md5 540460bd…)
 0 of 11 extend anything
18 of 18 apps extend ../../tsconfig.base.json
```

Ten identical files, and a proven fix sitting one directory away. `tsconfig.base.json`
scoped itself to "every federated member under `apps/`, plus the federation host in
`shell/`" — a reasonable boundary when it was written, and stale the moment the
services grew to twelve.

This is the cheapest actionable item any process has produced here, and neither
reading the code nor reading the docs would have surfaced it. It took comparing
two graphs five weeks apart.

## Finding 4 — the headline August refactor is still unshipped

August proposed collapsing 11 near-identical `mount.ts` files. Mount nodes went
**17 → 19**. It *grew*.

`makeMount()` now appears as a god node with 19 edges, so the shared helper exists
— but the duplication it was meant to remove is still there, and there are two
more instances of it than before. The refactor doc's `Partially-Shipped` status is
accurate, and this is the unshipped part.

## What the graph considers central now

God nodes, by edge count: `CurationState` (34), `registerContentIngestHandlers()`
(29), `registerRecordResolverHandlers()` (25), `registerRowStoreHandlers()` (24),
`AugmentItWorkspace` (21), `runOfficialBlogPack()` (20), `MountResult` (19),
`makeMount()` (19).

Three of the top five are NATS handler registrars. The message bus is more
structurally central to this system than any UI surface — worth knowing before
anyone proposes changing it.

## How to actually use this — agents, humans, and the handoff

A graph that only gets read when someone remembers it exists is the same failure
as one that never gets rebuilt. So: who does what.

### For agents

**Query the graph before you grep.** If `graphify-out/graph.json` exists and the
question is structural — *what calls this, what would break if I change it, how
does data get from A to B* — the answer is already extracted. Reading twelve files
to reconstruct it is slower and less complete.

```bash
graphify query "How does a record get from the collector into SurrealDB?"
graphify path  "AugmentItWorkspace" "RecordSet"
graphify explain "CurationState"
```

**Check the build date first, every time.** This is the discipline the August
snapshot taught us the hard way: for five weeks the graph confidently named an app
that had been renamed. A stale graph is not neutral — it is *wrong with
confidence*, which is worse than absent.

**The graph tells you where to look, not what is true.** Every finding in this
entry was verified against the files before it was written down. Finding 3 came
from the graph; the `md5` check on eleven service tsconfigs is what made it a fact.
Never ship a graph claim unverified.

**Rebuild on structural change, not on a schedule.** A new unit, a rename, a
removal, a federation-contract change. `--update` re-extracts only what moved, and
the AST cache makes it nearly free.

**A run that produces no document produced nothing.** Findings land in
`context-v/refactors/` or a changelog entry. The graph is the instrument; the
written finding is the output.

### For humans

**`graph.html` is for looking, `--wiki` is for learning.** The force-directed view
is genuinely useful for *shape* — which clusters are dense, what sits alone at the
edge, how many communities a change would touch. It is bad for reading. When the
goal is understanding a subsystem, `graphify --wiki` generates an index plus one
article per community and is far more legible.

**Use it to settle arguments with evidence.** "The frontend is full of copy-pasted
CSS" felt obviously true and was false — the August graph disproved it and saved
the wasted refactor. A cheap graph is a cheap way to stop being confidently wrong
about your own codebase.

**It is an onboarding artifact.** The community sidebar is a map of the system by
actual coupling rather than by folder layout, which is what a new contributor needs
and what the directory tree doesn't show.

### How to talk to an agent about it

The phrasing changes the behaviour more than you'd expect.

| Say this | Not this | Why |
|---|---|---|
| "What does the graph say about X?" | "How does X work?" | Routes to the built graph instead of a fresh file-read |
| "Re-run the graph and **diff** it against the last build" | "Re-run the graph" | The diff is the product; a rebuild alone just replaces a stale picture with a fresh one nobody compares |
| "Verify that against the files" | *(nothing)* | Graph claims are hypotheses until checked |
| "When was this graph built?" | *(nothing)* | Forces the staleness check that five weeks of drift taught us to ask for |

And the one worth saying out loud when you hand an agent a fresh clone: **the graph
is not in git.** `graphify-out/` is ~7MB of regenerable output and is gitignored, so
a new checkout has no graph at all. An agent that assumes one exists will answer
from training data instead. Ask for a build first.

## Honesty

**Graph health warning:** 437 dangling-endpoint edges, 1 self-loop, 197 collapsed
directed edges. The dangling ones are imports reaching packages outside the corpus;
the collapsed ones are node pairs carrying multiple relation types
(`imports_from` *and* `re_exports`) flattened into one by the DiGraph. Not
corruption — but not nothing, and it caps how much the raw edge count can be
trusted.

**Eleven JSON manifests produced zero nodes** and are absent from the graph
entirely (`speckit.manifest.json`, `workflow-registry.json`, others) — a known
upstream issue. A re-run retries them.

**This run was code-only.** 343 documents and 12 images went unstamped, exactly as
in August. That keeps it free and keeps the comparison honest; the doc layer can be
added later with `--update` without re-running AST extraction.

**Scoping change:** `context-v/diagrams/*.html` and `*.png` are now in
`.graphifyignore` — an 804KB rendered diagram and four verification screenshots
were entering the corpus and distorting community detection. That is graphify's
reading scope only; the files remain committed.

## What's Next

- **Give the services a shared tsconfig base.** Ten identical files, fix already
  proven in `apps/`.
- **Finish the `mount.ts` consolidation** that has now been outstanding across two
  graph builds.
- **Decide the re-run cadence.** Two builds five weeks apart produced this much;
  the open question in the plan is whether the trigger is structural (a unit added,
  renamed, or removed) or periodic. The evidence here favours structural — every
  finding traces to a structural event.

## References

- [[Graphify-As-Standing-Practice-And-Per-Component-Diagrams]] — the plan this executes the first half of
- [[Structural-Refactors-Surfaced-by-the-Codebase-Graph]] — the August build and its findings
- [[The-Gap-Between-What-We-Preach-And-What-We-Practiced]] — where the staleness was first counted
- [[Understanding-Codebases-with-Graphify]] — the scoping and reading discipline
- [[2026-09-13_01_Setting-Up-To-Retrofit-Lossless-Disciplines-And-Vigilance]] — the arc this continues
