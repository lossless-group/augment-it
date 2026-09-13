---
title: "Setting Up to Retrofit Lossless Disciplines & Vigilance"
lede: "Forty deployable units, fourteen READMEs, zero component design systems. We audited our own flagship against the advice we give clients."
publish: true
date_authored_initial_draft: 2026-09-13
date_authored_current_draft: 2026-09-13
date_work_started: 2026-09-12
date_work_completed: 2026-09-13
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5 (1M context)
summary: >-
  Establishes the context-v scaffolding for retrofitting augment-it against the three
  practices we recommend to clients — context over code, extreme monorepo architecture,
  and the four "firsts" applied per-unit. Adds a counted self-audit exploration, develops
  a dormant 2026-06-01 blueprint stub into the doctrine document, two remediation plans,
  and two loops. Installs Archify as a nested submodule under context-v/agent-skills and
  ships the first generated architecture diagram. Supersedes nothing; unblocks the
  per-component contract sweep. Read the exploration first — it carries the counts every
  other document references.
site_uuid: 42b2b0f6-238e-4843-be9f-a641f5a4d8ed
hex_code: 0zcyq5
files_changed:
  - context-v/explorations/The-Gap-Between-What-We-Preach-And-What-We-Practiced.md
  - context-v/blueprints/Augment-It-as-Working-App-and-Architecture-Demo.md
  - context-v/plans/Component-Level-Documentation-Contracts.md
  - context-v/plans/Graphify-As-Standing-Practice-And-Per-Component-Diagrams.md
  - context-v/loops/Endow-A-Component-With-Its-Own-Contracts.md
  - context-v/loops/Create-or-Update-Archify-Diagrams.md
  - context-v/diagrams/augment-it-decomposed-architecture.architecture.json
  - context-v/diagrams/augment-it-decomposed-architecture.html
  - .gitignore
---

# Setting Up to Retrofit Lossless Disciplines & Vigilance

::image{src="https://ik.imagekit.io/xvpgfijuw/augment-it/retrofit-lossless-disciplines/Archify__Decomposed-Architecture--In-Editor_20260913T050048Z.jpg" alt="Archify-generated architecture diagram of Augment-It open in an editor, showing one shell hosting four grouped microfrontend clusters, three backend service groups behind a NATS bus, and SurrealDB Cloud as the canonical layer, with the context-v diagrams folder expanded in the file tree" caption="Forty units, twelve boxes. The first diagram augment-it has ever generated of itself — validated against a geometry engine that rejected our first eleven attempts."}

## Why Care?

We tell clients three things about building software in the agentic era. Code is
regenerable given proper context, so **context is the durable asset**. Decompose
harder than feels justified — **microservices and microfrontends, each in its own
repo** — because agents are fast enough that quality control, not authorship,
becomes the bottleneck. And apply **API-first, documentation-first,
design-system-first, changelog-first** to *every unit*, not just the system.

Augment-it is the project we point at when we say that. So before recommending it
again, we counted how well our own flagship actually complies.

It doesn't, in a specific and instructive way: **we were rigorous at the system
level and absent at the component level.** That isn't a random lapse. It's the
exact failure mode the recommendations exist to prevent, experienced from the
inside rather than asserted from a slide — and it turns out to be the most
credible thing we could put in front of a client.

## What's New?

- **A counted self-audit** — [[The-Gap-Between-What-We-Preach-And-What-We-Practiced]],
  the numbers below and what each gap costs
- **The doctrine, finally written** — a blueprint stub dormant since 2026-06-01,
  whose body literally read *"to develop with the user,"* developed into the
  three-part argument including why adopting decomposition *alone* is the anti-pattern
- **Two remediation plans** — per-component contracts, and visual engineering as a
  standing practice rather than a one-time event
- **Two loops** — one to endow a single component with its contracts, one (a stub)
  for creating and updating Archify diagrams
- **Archify installed** into the tree as a nested submodule, and the first
  architecture diagram augment-it has ever generated of itself

## The audit, counted

Augment-it is **40 independently deployable or publishable units**: 1 shell, 20
federated microfrontends, 12 microservices, 7 shared packages.

| Artifact | System level | Component level |
|---|---|---|
| `README.md` | ✅ | **14 / 40** |
| `DESIGN.md` | ✅ + `design-manifest.json` | **0 / 40** |
| `changelog/` | ✅ 101 entries | **0 / 40** |
| `context-v/` | ✅ 196 docs, 14 folders | **0 / 40** |
| API contract | — | **0 / 40** |

The README distribution is the diagnostic part. Six of twenty microfrontends have
one — largely the early, hand-built ones. Two of twelve services. Six of seven
packages, the exception being `packages/federation`, which is the single most
load-bearing contract in the system and explains itself nowhere. The shell, which
hosts all twenty remotes, has none.

**Documentation happened where a human sat and thought, and did not happen where an
agent generated a working unit and moved on.** Velocity outran the contracts.

And the repo shape made it worse. All 40 units share one git repo — one branch, one
PR queue, one CI surface. That was a deliberate deferral at v4.0.0.1, not an
oversight, and the bill arrived on schedule: a
[[2026-08-15_01_Every-Frontend-Deploy-Had-Been-Failing-For-Twelve-Days-On-One-Missing-COPY|twelve-day
silent outage]] from one missing `COPY` line in a Dockerfile. Every frontend broken,
invisible, because no individual frontend owned a build surface that could go red on
its own. That is a single-repo failure mode in its purest form.

We are **not** splitting the repo this week — a forty-unit relocation inside this
tree trips the anchor monorepo's three-precondition hard stop. The lesson gets named
and costed instead.

## This is a continuation, not a standing start

The retrofit is only affordable because the expensive half already exists, here and
across the tree.

**Context vigilance is the part we actually did.** 196 documents across fourteen
folders — 35 specs, 37 plans, 31 explorations, 50 issues, 10 blueprints, 5 loops —
plus 101 changelog entries and Spec Kit coexisting with `context-v/` rather than
competing with it. The shortfall was never rigor. It was **scope**: all 196 describe
the system, and not one describes a single component from that component's own point
of view.

**Chroma is live as agent-memory and agent-context-search.** Four collections in
`ai-labs/context-vigilance-kit` aggregate the whole tree — section-chunked
`context-v/` files, every repo's changelog, every prior Claude Code message turn,
and every prior tool invocation with its success flag — wired into sessions over
MCP. "What did we decide about X" stopped being a question you answer from memory.

**Graphify already ran here, and that's the interesting correction.** The premise
going in was that we'd never implemented it. Wrong: on 2026-08-06 it extracted
**4,330 nodes and 6,011 directed edges across 490 source files for zero tokens** —
AST parsing needs no LLM — and produced a real shipped artifact that found ~500
cleanly deletable lines, 11 near-identical `mount.ts` files, and *disproved* our
assumption that the frontend was full of copy-pasted CSS.

Then it never ran again. The proof is exact: the graph's community list still reads
**"Strategy Curator App."** We renamed that app to `corpora-curator` on 2026-08-08 —
two days later. The instrument is describing a system that no longer exists.

So the 1b gap was never "we don't do visual engineering." We did it once, well, and
let it rot. **A graph nobody re-runs is a document, not an instrument.**

**The federated design system is the most complete thing here.** `packages/theme` as
sole token source, an F1–F11 contract, and `design-drift.mjs` turning those rules
from prose into executed checks — all 108 text-on-surface pairs passing 4.5:1. That
is the shape every other component contract should aim at.

## Archify, installed properly

The obvious move was `npx skills add tt-a1i/archify -g`. We did that first and it
was wrong — the skills manager copies into `~/.claude/skills/` **and six other agent
directories**, none of them in our tree, none version-controlled.

Removed all six and did it the way Chroma is done: a **nested git submodule** in the
`agent-skills` repo, tracked as a gitlink so none of its ~8MB enters our history, and
hand-symlinked because the skill sits one level inside a wrapper repo — the same
nesting that forces `chroma-local` to be hand-linked. Updates come from `git pull`,
not from an installer.

```
context-v/agent-skills/.gitmodules
  [submodule "chroma-agent-skills"]  → chroma-core/agent-skills.git
  [submodule "archify"]              → tt-a1i/archify.git     ← new
```

## The authoring loop is adversarial, and that's the point

The objection to natural-language diagram tools is that an LLM drawing a plausible
picture is a hand-drawn diagram with extra steps — it inherits the same silent-rot
problem. Archify answers that, and not gently.

Our first candidate returned **eleven errors**. Not style notes — coordinate-level
geometry proofs:

```
"prompt-bus" shares a 133px corridor with "store-canonical"
  at [1085, 300] -> [1085, 433] (minimum 8px)

Label "row + workspace reads" overlaps component "fe-resolvers"
  label rect: [720, 173, 111, 14]
  component rect: [510, 180, 220, 66]
  Suggested fix: labelAt [775, 260] or labelDy +77 (below)
```

Restructuring the layout so each microfrontend cluster sat horizontally adjacent to
the service group it calls took it to two. Then one of *our* fixes was wrong —
shifting a label 44px left pushed it into another component, and the validator caught
that too. A 16px nudge on the other axis cleared it. Final: **9/9 artifact checks,
0 errors, 0 warnings**, delivered with SHA-256 receipts for both spec and artifact,
then browser-verified at 1440×900 and 2048×1320 in both themes.

You cannot ship a sloppy diagram through this thing. Two details matter more than the
picture: `--repo-root` makes the architecture type **inspect repository evidence**
rather than accept a description, and `compare --receipt` diffs two specs — so a
diagram can announce its own staleness instead of rotting quietly, which is precisely
what the August graph failed to do.

## The diagram found something we weren't looking for

Building it forced a reconciliation between `DESIGN.md` and the disk, and `DESIGN.md`
is materially stale:

| | On disk | In `DESIGN.md` |
|---|---:|---:|
| Microfrontends | 20 | **16** |
| Shared packages | 7 | **2** |
| Services | 12 | **0** |

Unregistered remotes: `docs-portal`, `org-workbench`, `search-and-add`,
`search-results`. The document's own description still says *"sixteen sovereign
micro-frontends."*

This is worse than bookkeeping. **`design-drift.mjs` reads its member registry from
`DESIGN.md`'s frontmatter** — so those four remotes are outside F1–F11 enforcement
entirely, silently. It's the same pattern as another finding from the audit: the
[[Sweep-Local-Federated-Design-System-for-Fidelity]] loop instructs agents to read
"the member's `DESIGN.md`, including *Deviations*" — a file that exists for **zero**
members. Tooling pointed at contracts that don't exist yet.

`DESIGN.md` also can't describe a system on its own: `services/` appears zero times
in it. It's a design-system document, and the entire backend half of the diagram had
to come from the directory tree.

## What's Next

- **Re-run Graphify and diff against August.** Cheapest high-value move available —
  zero tokens, the AST cache makes it near-free, and a month of structural change
  including which `Partially-Shipped` refactors actually landed
- **Reconcile `DESIGN.md`** so the four unregistered remotes re-enter drift enforcement
- **`packages/federation` and `shell/` first** in the contract sweep — everything else
  binds to one or both
- **Decide the forcing function.** Writing 40 files once doesn't close a structural
  gap. The strongest option without new repos is making per-unit docs render *in the
  running app*, so a service with a blank docs panel is visibly wrong to anyone using
  it — discipline as part of the demo rather than a tax on it

## References

The counts in this entry come from the repository as of 2026-09-13; the audit
document carries the full derivation.

- [[The-Gap-Between-What-We-Preach-And-What-We-Practiced]] — the audit
- [[Augment-It-as-Working-App-and-Architecture-Demo]] — the doctrine
- [[Component-Level-Documentation-Contracts]] — remediation for the four "firsts"
- [[Graphify-As-Standing-Practice-And-Per-Component-Diagrams]] — remediation for visual engineering
- [[Endow-A-Component-With-Its-Own-Contracts]] — the per-unit loop
- [[Create-or-Update-Archify-Diagrams]] — the diagram loop (stub)
- [[Structural-Refactors-Surfaced-by-the-Codebase-Graph]] — what the August graph produced
