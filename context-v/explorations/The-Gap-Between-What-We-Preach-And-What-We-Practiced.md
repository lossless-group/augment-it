---
title: "The Gap Between What We Preach and What We Practiced"
lede: "Forty deployable units, one git repo, zero component-level design systems or changelogs. An honest audit of augment-it against the three recommendations we make to clients."
date_created: 2026-09-12
date_modified: 2026-09-12
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5 (1M context)
semantic_version: 0.0.1.0
tags:
  - Exploration
  - Augment-It
  - Methodology
  - Context-Over-Code
  - Extreme-Monorepo
  - API-First
  - Documentation-First
  - Design-System-First
  - Changelog-First
  - Self-Audit
  - Client-Recommendations
status: Active
site_uuid: f842fe54-7a2d-413f-bde6-5b4ee86fc934
hex_code: ucorp7
date_authored_initial_draft: 2026-09-12
date_authored_current_draft: 2026-09-12
publish: true
---

# The Gap Between What We Preach and What We Practiced

## Why Care?

Augment-it was built as a demonstration project. The thing it was supposed to
demonstrate was not a CRM augmentation pipeline — that's the *product*. It was
supposed to demonstrate a **way of building**: that context outranks code, that
extreme decomposition survives coding agent velocity, and that every unit of a system
maintains its own contracts before it earns its own features.

We are about to recommend that way of building to a client. Before we do, this
document establishes — with counts, not impressions — where augment-it actually
lands against it. The candor is the point. A methodology pitch that can't survive
its own author's audit is a sales deck; one that names its own shortfalls and the
cost of each is a practice.

The short version: **we were rigorous at the system level and absent at the
component level.** That is not a random failure. It is the specific, predictable
failure mode of building fast with agents, and it is the exact thing the
recommendations are supposed to prevent.

## The three recommendations

1. **Context over Code.** Code is regenerable and massively iterable given
   proper context. Context is the durable asset; code is the derivative.
   - 1a. **Spec-Driven Development on steroids** — [[../blueprints/Spec-Kit-and-Context-V-Coexistence|context vigilance]] as the working discipline.
   - 1b. **Visual Engineering, Visual Leadership** — the system made legible as
     a picture, not only as prose.
2. **Extreme Monorepo Architecture** — pseudomonorepos + microservices +
   microfrontends. Real overhead, deliberately accepted: agentic engineering is
   bewilderingly fast, **quality control becomes the bottleneck** (merge, PR,
   tests, the path from dev to production), and teams and agents write over each
   other with alarming ease when boundaries are soft. In addition, though context-windows
   are large, they are not infinite, and the cost of context overflow increases
   as the system grows. Working in smaller codebases is inherently more manageable
   and less error-prone for both humans and agents.
3. **API-First, Documentation-First, DesignSystem-First, Changelog-First** —
   the four "firsts," applied to *every* unit, not only to the system.

## The audit

Augment-it today contains **40 independently deployable or publishable units**:

| Kind | Count | Directory |
|---|---:|---|
| Shell (host) | 1 | `shell/` |
| Microfrontends (federated remotes) | 20 | `apps/` |
| Microservices | 12 | `services/` |
| Shared packages | 7 | `packages/` |

Against the four "firsts," per unit:

| Artifact | System level | Component level |
|---|---|---|
| `README.md` | present | **14 / 40** |
| `DESIGN.md` | present, plus `design-manifest.json` | **0 / 40** |
| `changelog/` | present — 101 entries | **0 / 40** |
| `context-v/` | present — 196 docs across 14 folders | **0 / 40** |
| API contract (OpenAPI or equivalent) | — | **0 / 40** |

The README distribution is itself diagnostic. Six of twenty microfrontends have
one (`highlight-collector`, `insight-manager`, `prompt-template-manager`,
`record-collector`, `request-reviewer`, `response-reviewer` — largely the
early, hand-built ones). Two of twelve services have one (`decile-mcp`,
`deploy-relay`). Six of seven packages have one; `packages/federation` — the
single most load-bearing contract in the entire system — does not. The shell,
which hosts all twenty remotes, has none.

The pattern is unmistakable: **documentation happened where a human sat and
thought, and did not happen where an agent generated a working unit and moved
on.** Velocity outran the contracts.

## Recommendation by recommendation

### 1a — Spec-Driven Development / Context Vigilance: the one we actually did

This is the strong one, and the client meeting should lead with it. The root
`context-v/` carries 196 documents across fourteen folders — including two
folders (`refactors/`, `backlogs/`) this project invented and deliberately kept
rather than normalizing away. There are 35 specs, 37 plans, 31 explorations,
50 issues, 10 blueprints, and 5 loops. There are 101 changelog entries. The
`.specify/` directory shows Spec Kit coexisting with context-v rather than competing with it.

The shortfall is not rigor. It is **scope**: all 196 documents describe the
system. Not one describes a single component from that component's own point of
view. A new agent opening `apps/search-and-add/` finds source code and nothing
else — it must reconstruct intent from the system-level spec that happens to
mention it.

### 1b — Visual Engineering: done once, as an event, not as a practice

The premise that we never implemented Graphify here is **wrong**, and the
correction matters because it changes the ask. `graphify-out/` was built
**2026-08-06** over 490 source files, producing **4,330 nodes and 6,011 directed
edges for zero tokens** — AST extraction needs no LLM. There is a `.graphifyignore`
scoping it. It produced a real, shipped artifact:
[[../refactors/Structural-Refactors-Surfaced-by-the-Codebase-Graph]], status
`Partially-Shipped`, which found ~500 lines that delete cleanly, 11 near-identical
`mount.ts` files, and — usefully — *disproved* the assumption that the frontend
was full of copy-pasted CSS.

So the graph worked. The gap is that it ran **once**. The artifact is a snapshot
of 2026-08-06 and the codebase has moved since. A graph that isn't re-run is a
document, not an instrument; it can no longer answer "what changed structurally
this month," which is the question that makes it worth having.

On the diagram side: Mermaid appears in 13 files across the repo — real, but
incidental. No component carries a picture of its own data flow or call surface.
`Archify`-shaped tooling (natural-language → architecture diagram) was never
tried; note that this tree's own
[[../../../../self-host-stack/context-v/explorations/Watchlist-Interesting-Tools|watchlist]]
already flags that **two distinct projects share the Archify name**
(`tt-a1i/archify`, a CLI/agent skill, and `Harrison-Yuan/archify-webui`, a
self-hostable web UI) and asks that whoever revisits it says which one was meant.

Remediation for both halves: [[../plans/Graphify-As-Standing-Practice-And-Per-Component-Diagrams]].

### 2 — Extreme Monorepo: the microservices are real, the repos are not

Augment-it is genuinely decomposed. Twenty federated microfrontends and twelve
microservices, wired through Module Federation over Rsbuild, each independently
deployable. The *architecture* recommendation was followed.

The *repository* recommendation was not. All 40 units live in a single git repo.
The only submodules are `clients/reach-edu` and `clients/humain-vc`, and both
are **client data**, not code. So there is exactly one branch, one PR queue, one
CI surface, and one review bottleneck serving forty units.

This was a deliberate deferral, not an oversight — it was not a priority at
v4.0.0.1, and augment-it has been split into multiple repos in earlier
incarnations. But the cost showed up precisely where the recommendation predicts
it: **quality control became the bottleneck.** The evidence is in the changelog.
`2026-08-15_01_Every-Frontend-Deploy-Had-Been-Failing-For-Twelve-Days-On-One-Missing-COPY`
is a single-repo failure mode in its purest form — one Dockerfile line, silently
breaking every frontend for twelve days, invisible because no individual
frontend owned a build surface that could have gone red on its own.

**We are not splitting the repo now.** Forty-unit relocation inside this tree
triggers the [[../../../../CLAUDE|three-precondition HARD STOP]] and is not a move
to make with a client meeting this week. The recommendation stands; the lesson
is named and costed here, and that is the honest position to take into the room.

### 3 — The four "firsts": practiced at the system, absent at the component

This is the cleanest finding and the easiest to act on. Zero of forty components
carry a `DESIGN.md`, a `changelog/`, a `context-v/`, or an API contract. Fourteen
carry a README.

What this costs, concretely:

- **No API contract** means a microservice's shape is discoverable only by
  reading its handler code. Twelve services, twelve archaeology expeditions.
  There is already a spec for the fix — [[../specs/API-First-In-App-Documentation]],
  stubbed 2026-06-01, body never developed.
- **No per-component `DESIGN.md`** means the federated design system has a
  federal contract (`packages/theme`) and no member declarations. The
  [[../loops/Sweep-Local-Federated-Design-System-for-Fidelity]] loop explicitly
  reads "the member's `DESIGN.md`, including *Deviations*" — a file that exists
  for zero members. **The enforcement loop is already written against documents
  that don't exist.**
- **No per-component `changelog/`** means all 101 entries are system-scoped. You
  cannot answer "what changed in `response-store` this quarter" without reading
  everything.
- **No per-component `context-v/`** means intent lives one level up from the code
  that implements it, permanently.

Remediation: [[../plans/Component-Level-Documentation-Contracts]], executed via
[[../loops/Endow-A-Component-With-Its-Own-Contracts]].

## The causal read

These are not four independent lapses. They are one lapse with four faces.

Decomposing into 40 units multiplies the number of places a contract *should*
live by forty. Keeping all 40 in one repo removes every structural forcing
function that would have made an author write one — no separate README landing
page, no separate release, no separate CI badge, no separate reviewer. Agentic
velocity then fills the space faster than any human ritual can keep up.

So the failure is: **we took on the overhead of extreme decomposition without
taking on the discipline that pays for it.** That is worse than either choice
made cleanly. It is also, precisely, the warning the recommendation contains —
"it does add significant overhead" — experienced from the inside rather than
asserted from a slide.

## Why this is the right thing to bring to the client

A consultant who shows up with three best practices is selling. A consultant who
shows up with three best practices, a count of where their own flagship project
violated each one, the specific twelve-day outage that resulted, and a plan
already written to close the gap, is **demonstrating the practice itself** —
because noticing, writing it down, and sequencing the fix *is* context vigilance.

The audit is not an embarrassment to manage around. It is the single most
credible artifact we could walk in with.

## Related

- [[../blueprints/Augment-It-as-Working-App-and-Architecture-Demo]] — the doctrine these three recommendations constitute, and the dual identity that makes augment-it the vehicle for it
- [[../plans/Component-Level-Documentation-Contracts]] — remediation for #3
- [[../plans/Graphify-As-Standing-Practice-And-Per-Component-Diagrams]] — remediation for #1b
- [[../loops/Endow-A-Component-With-Its-Own-Contracts]] — the repeatable executor
- [[../refactors/Structural-Refactors-Surfaced-by-the-Codebase-Graph]] — what the one graph run actually produced
- [[../specs/API-First-In-App-Documentation]] — the 2026-06-01 stub this audit reactivates
- [[../loops/Sweep-Local-Federated-Design-System-for-Fidelity]] — the loop written against member `DESIGN.md` files that do not yet exist
- [[../blueprints/Spec-Kit-and-Context-V-Coexistence]] — how the 1a discipline is actually wired here
