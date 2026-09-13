---
title: "Component-Level Documentation Contracts — Giving All Forty Units Their Own Four Firsts"
lede: "Forty deployable units, fourteen READMEs, zero DESIGN.md files. The contract set each kind of unit owes, and the order to pay it down in."
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
  - API-First
  - Documentation-First
  - Design-System-First
  - Changelog-First
  - Microservices
  - Microfrontends
  - Design-System
  - Client-Recommendations
status: Proposed
site_uuid: f9a91970-482f-40b8-bfa8-6cc06b2f3a27
hex_code: 8krefg
date_authored_initial_draft: 2026-09-12
date_authored_current_draft: 2026-09-12
publish: true
---

# Component-Level Documentation Contracts

## Why Care?

We recommend the four "firsts" to clients as **per-unit** contracts, and
augment-it honours all four at the system level and none of them at the unit
level. The counts are in
[[../explorations/The-Gap-Between-What-We-Preach-And-What-We-Practiced]]: 14 of
40 units carry a README, 0 of 40 carry a `DESIGN.md`, a `changelog/`, a
`context-v/`, or an API contract.

The reason to close this is not tidiness. It is that **the system is already
built assuming these files exist.**
[[../loops/Sweep-Local-Federated-Design-System-for-Fidelity]] instructs an agent
to read "the member's `DESIGN.md`, including *Deviations*" — for members that
have none, so the loop cannot distinguish a violation from a declared exception
and its most useful check silently no-ops. That is the shape of the whole
problem: contracts referenced by tooling, enforced by nothing, existing nowhere.

## The shape of the problem

Forty units, four kinds, and the kinds owe genuinely different things. A shared
package has no API surface in the HTTP sense; a service has no design surface at
all. Applying one uniform checklist to all forty is how this kind of effort
turns into forty stub files nobody reads.

| Kind | Count | Has README | The distinguishing obligation |
|---|---:|---:|---|
| Shell (`shell/`) | 1 | 0 | Hosts all twenty remotes — owes the composition contract |
| Microfrontends (`apps/`) | 20 | 6 | Owe a design declaration and a remote contract |
| Microservices (`services/`) | 12 | 2 | Owe a machine-readable API contract |
| Shared packages (`packages/`) | 7 | 6 | Owe an exported-surface contract and a stability posture |

Two entries in that table deserve to be uncomfortable. **`packages/federation`
has no README** — it is the single most load-bearing contract in the system, the
thing every one of the twenty remotes and the shell binds to, and it explains
itself nowhere. And **the shell has no README** — twenty remotes mount into it
and the rules of mounting live only in the heads of people who have read
`rsbuild.config.ts`.

## The contract set, by kind

### Every unit, regardless of kind

- **`README.md`** — what this unit is, what it owns, what it depends on, how to
  run it alone, how to know it's working. Written from the unit's point of view,
  not the system's. This is Documentation-First, and it is the floor.
- **`changelog/`** — the unit's own history, following
  [[../../../../context-v/agent-skills/changelog-conventions/SKILL|changelog conventions]].
  Backfilling forty histories from 101 system entries is not the goal; the goal
  is that the *next* change to a unit lands in that unit's log.

### The second axis — who is reading

*Added 2026-09-13. The contract set above is organised by unit KIND. That is one
axis and it is not the only one: a single unit owes different documents to
different readers, and a README that tries to serve all three serves none.*

| Reader | Wants | Fails when |
|---|---|---|
| **The engineer stepping in** | What it owns, what it depends on, how to run it alone, how to know it is working | Written from the system's point of view instead of the unit's |
| **The non-specialist** — management, a client, anyone who must *understand* the module without operating it | What this thing is FOR, what it does for a user, why it exists as its own unit at all | Written in the vocabulary of the implementation |
| **The integrator** — human or agent, calling it rather than reading it | The API surface, the state matrix, the error cases, the events it emits and consumes | Prose where a table was needed |

**The third reader is increasingly an agent**, which raises the value of the
machine-readable artifacts — the OpenAPI document, the gallery catalog, the state
matrix — above the prose ones. It also means "we have a README" is not an answer
to any of the three.

The second reader is the one nobody writes for, and the one who makes the system
legible to the people who fund it. A client cannot read a component library. They
can read *"this is where a researcher decides which of the candidate URLs is
actually the company's official blog, and why picking the wrong one is
expensive."*

### Microservices additionally owe an API contract

A machine-readable description of every route, its request shape, its response
shape, and its error modes. This is the largest genuine gap — twelve services,
zero contracts, and a caller's only recourse is reading handler code.

This connects directly to [[../specs/API-First-In-App-Documentation]], the
2026-06-01 stub whose body was never developed. That spec wants each surface to
**reveal its own docs inline at runtime** — an icon-CTA showing the data flowing
in, the calls fired, the response shapes. A static contract file per service is
the substrate that feature needs; developing the spec without it means
hand-writing the docs the contract should have generated. **Write the contracts
first, then develop the spec against them.**

### Microfrontends additionally owe a design declaration

A `DESIGN.md` per remote, declaring which federal tokens from `packages/theme`
it consumes and — critically — **which federal rules it deviates from and why**.
The federal contract (F1–F11) already exists; the member declarations do not.
This is what makes the fidelity sweep able to do its job, and it follows
[[../../../../context-v/agent-skills/maintain-design-md/SKILL|the Stitch-spec
DESIGN.md discipline]] already used at the system root.

A remote also owes its **remote contract**: what it exposes through federation,
what props or context it expects from the shell, what events it emits.

### Shared packages additionally owe an exported-surface contract

What is public, what is internal, and what the stability posture is. A consumer
should be able to tell from the package, not from grep, whether an export is
safe to bind to.

### The shell owes the composition contract

How a remote gets mounted, what the shell guarantees it (theme, workspace
context, routing, error boundary), and what it demands in return. Twenty remotes
depend on this being true; none of it is written down.

## The federation model generalises past design

*Added 2026-09-13, after the design-system convergence produced a governance model
that turned out not to be about design.*

The contract governing the design system is **diverge → promote → enforce**:
members build what they need, recurrence becomes evidence, evidence becomes a
federal primitive, and the primitive is checked rather than described. Nothing in
that loop is specific to CSS.

**It is the same shape for every artifact class a unit owes:**

| Artifact | Diverge | Promote | Enforce |
|---|---|---|---|
| **UI kit** | a member builds a local component | it recurs in 3+ members | it lands in `shared-ui`, and `design:drift` checks it |
| **Docs** | a unit writes its own README | a section recurs across units | it becomes a template, and an F6-style check requires it |
| **Changelog** | a unit logs its own history | conventions converge | `changelog-conventions` enforces the shape |
| **`context-v/`** | a unit keeps its own specs and issues | folder patterns recur | the roles become contract |

> **The design system went first because it is the only one with cleanup to do.**
> 158 button rule-sets, 170 phantom tokens, three invisible members. The others
> are not in a worse state — **they are in no state at all.** Nothing needs
> un-drifting; it needs implementing.

That inverts the usual expectation about cost. Design was expensive because every
change was archaeology against decisions nobody recorded — a token whose name
lied, a list asserted rather than measured, a count that was 40% noise. Per-unit
changelogs and READMEs carry no archaeology. **The first one written is correct by
construction**, and the only question is whether the next change lands in it.

**So the remaining classes should move faster than design did, not slower.** A
sequencing plan that budgets them like the design work will under-commit.

## Sequencing

Not alphabetical, and not all at once. Ordered by how much pain the absence is
currently causing.

**First — the two that are actively load-bearing and undocumented.**
`packages/federation` and `shell/`. Every other unit in the system binds to one
or both. Documenting these makes all thirty-eight other units easier to
document, because their READMEs can reference a contract instead of restating it.

**Second — the twelve services' API contracts.** Largest gap, clearest value,
and the unblocker for [[../specs/API-First-In-App-Documentation]]. Services are
also the easiest kind to contract honestly, because a route either exists or it
doesn't — there is no judgement call the way there is with a design deviation.

**Third — the twenty microfrontends' `DESIGN.md` files.** This one has a
sequencing subtlety worth respecting: writing a member `DESIGN.md` *is* running
the fidelity sweep, because you cannot declare deviations without finding them.
So this step doubles as the first real execution of
[[../loops/Sweep-Local-Federated-Design-System-for-Fidelity]], and it will
surface violations. That is the point — but it means this step produces findings
to triage, not just files.

**Fourth — READMEs for the twenty-six units lacking them, and `changelog/` for
all forty.** Deliberately last. A README written after the unit's contracts
exist is a short, honest pointer; a README written before them is prose invented
to fill a heading.

## The forcing function problem

The reason this gap opened is structural, and writing forty files once does not
close it. With all forty units in a single repo, nothing makes an author write a
contract — no separate landing page, no separate release, no separate CI check,
no separate reviewer. Agentic velocity fills the space faster than any human
ritual keeps up. See the
[[../blueprints/Augment-It-as-Working-App-and-Architecture-Demo|doctrine
blueprint]] on why #2 without #3 is worse than either alone.

Since we are **not** splitting the repo now, the forcing function has to be
supplied some other way. Three candidates, in ascending order of how much they'd
actually work:

1. **The loop.** [[../loops/Endow-A-Component-With-Its-Own-Contracts]] makes
   "give this unit its contracts" a named, repeatable task an agent runs
   deliberately rather than a virtue it's expected to remember.
2. **A CI check.** A unit that gains a source file without having a README fails
   the build. Mechanical, unambiguous, and it makes the contract's absence *red*
   rather than invisible.
3. **A per-unit surface that looks broken when empty.** The
   [[../specs/Design-System-Portal]] and
   [[../specs/API-First-In-App-Documentation]] both render per-unit
   documentation **in the running app**. A service whose docs panel is blank is
   visibly wrong to anyone using the product. This is the strongest forcing
   function available without new repos, and it is the one most aligned with the
   architecture-demo identity — it makes the discipline part of the demo rather
   than a tax on it.

Option 3 is the recommendation. Options 1 and 2 are what carry the effort until
it exists.

## Open questions

- **API contract format.** OpenAPI is the default answer and is what an external
  consumer would expect. But several services here are NATS-messaged rather than
  HTTP-routed, and OpenAPI describes those badly. Does the contract format vary
  by transport, or do we accept a lossy uniform format for uniformity's sake?
- **`context-v/` per unit.** The audit counts it as a gap, but it may not be
  one. Per-unit specs and plans may genuinely belong in the system corpus where
  cross-unit work can see them, with only README/DESIGN/changelog federating
  down. Worth deciding explicitly rather than defaulting either way.
- **Changelog backfill.** Leave the 101 system entries where they are, or
  attribute the unit-specific ones down into per-unit logs? Leaning strongly
  toward leaving them — the system log is a true record of how the system
  actually evolved, and rewriting it into forty fictional per-unit histories
  would trade a true artifact for a tidy one.

## Related

- [[../explorations/The-Gap-Between-What-We-Preach-And-What-We-Practiced]] — the audit that counts this gap
- [[../blueprints/Augment-It-as-Working-App-and-Architecture-Demo]] — the doctrine this plan serves
- [[../loops/Endow-A-Component-With-Its-Own-Contracts]] — the repeatable executor
- [[../loops/Sweep-Local-Federated-Design-System-for-Fidelity]] — the loop currently written against member `DESIGN.md` files that do not exist
- [[../specs/API-First-In-App-Documentation]] — the runtime surface these contracts feed
- [[../specs/Design-System-Portal]] — the design-side equivalent
- [[../specs/Federated-Design-System-Architecture]] — the federal contract members must declare against
- [[../plans/Graphify-As-Standing-Practice-And-Per-Component-Diagrams]] — the visual half of the same effort
