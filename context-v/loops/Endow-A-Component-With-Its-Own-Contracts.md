---
title: "Endow a Component With Its Own Contracts"
lede: "The repeatable procedure for giving one unit — service, remote, package, or shell — the four firsts it owes. One unit per run, never a sweep."
date_created: 2026-09-12
date_modified: 2026-09-12
semantic_version: 0.0.1.0
status: Active
tags:
  - Loop
  - Augment-It
  - API-First
  - Documentation-First
  - Design-System-First
  - Changelog-First
  - Microservices
  - Microfrontends
site_uuid: c9482d37-8841-42fc-ad3c-de6c76e2b881
hex_code: 9g2jj2
date_authored_initial_draft: 2026-09-12
date_authored_current_draft: 2026-09-12
publish: true
---

# Endow a Component With Its Own Contracts

## Purpose

This loop takes **one** unit — a microservice, a federated remote, a shared
package, or the shell — and gives it the contracts it owes under
[[../plans/Component-Level-Documentation-Contracts]]: a README written from its
own point of view, an API or surface contract, a design declaration if it has a
design surface, and its own changelog.

It exists because the gap it closes was not created by ignorance. It was created
by velocity: forty units in one repo, no structural forcing function, and agents
generating working code faster than contracts get written. A named task beats a
remembered virtue.

## When to run

**By a developer:** when picking up a unit that has no README. Before handing a
unit to someone else. When a unit's shape has changed enough that its existing
contract lies.

**By an AI coding agent, self-directed:** when a task creates a *new* unit under
`apps/`, `services/`, or `packages/` — a new unit ships with its contracts or it
is not finished. When a task substantially changes a unit's public surface: a
new route, a changed response shape, a new federation export, a new dependency on
the shell.

**Not** as a preamble. An agent that runs this before every edit is wasting the
loop. It is a task, taken deliberately, on one unit.

## Procedure

### 1. Establish the unit's kind

Kind determines what is owed. Read
[[../plans/Component-Level-Documentation-Contracts]] § *The contract set, by
kind* and fix which set applies before writing anything.

| Kind | Owes |
|---|---|
| Microservice (`services/`) | README, changelog, **API contract** |
| Microfrontend (`apps/`) | README, changelog, **`DESIGN.md`**, **remote contract** |
| Shared package (`packages/`) | README, changelog, **exported-surface contract** |
| Shell (`shell/`) | README, changelog, **composition contract** |

### 2. Read the unit before describing it

Read every source file in the unit's `src/`. Read its `package.json` — its
dependencies are a claim about what it touches. For a remote, read its
`rsbuild.config.ts` federation block and its `mount.ts`. For a service, read
every route handler and every NATS subscription.

**Do not** write the README from the system-level spec. The system spec describes
the unit's role in a flow; the README describes the unit. If the two disagree,
that disagreement is a finding — record it, do not silently pick one.

### 3. Check what the graph already knows

Before hand-drawing anything, query the existing structural graph — it holds the
unit's real edges, extracted rather than remembered:

```
graphify explain "<UnitName>"
graphify path "<UnitName>" "<Something it touches>"
```

Note the graph's build date against today. **A stale graph is a hypothesis, not a
source** — verify anything it tells you against the files before writing it down.
See [[../plans/Graphify-As-Standing-Practice-And-Per-Component-Diagrams]].

### 4. Write the contract the unit's kind owes

**API contract (services).** Every route or subject: request shape, response
shape, error modes. Derived from handler code, not from how callers happen to
use it — a caller's usage is a sample, not a contract.

**Remote contract (microfrontends).** What it exposes through federation, what
props or context it expects from the shell, what events it emits.

**Exported-surface contract (packages).** What is public, what is internal, what
the stability posture of each export is.

**Composition contract (shell).** How a remote mounts, what the shell guarantees
it — theme, workspace context, routing, error boundary — and what it demands in
return.

### 5. Write `DESIGN.md` — microfrontends only

Read `packages/theme/theme.css` (Tier 1 and Tier 2 blocks) and the root
`DESIGN.md` § *The federation contract*, F1–F11. Then read every `.css` file and
every Svelte `<style>` block in the unit.

Declare which federal tokens it consumes, and — the part that matters — **every
place it departs from F1–F11, with the reason.**

This step *is* the first real execution of
[[Sweep-Local-Federated-Design-System-for-Fidelity]] for this member, and it will
surface violations. A violation is not automatically a deviation. A deviation is
a departure you can justify; a violation is one you cannot. **Write the honest
one.** Declaring a violation as a deviation to make the file look clean defeats
the entire purpose of the file, because the sweep will then treat it as sanctioned
forever.

### 6. Write the README

Last, not first. Now that the contracts exist, the README is a short honest
pointer rather than invented prose:

- What this unit is and what it owns
- What it depends on and what depends on it
- How to run it alone, and how to know it's working
- Links to its contract, its `DESIGN.md`, its changelog

Embed the unit's Mermaid diagram here (or in `DESIGN.md` for a remote) if step 3
produced one. **Mermaid fences only — no raster.** An image can't be diffed and
will rot without announcing it.

### 7. Create the changelog directory and log this run

`<unit>/changelog/`, following
[[../../../../context-v/agent-skills/changelog-conventions/SKILL|changelog
conventions]]. **Do not backfill** — the system's 101 entries are a true record
of how the system actually evolved, and splitting them into per-unit fiction
trades a true artifact for a tidy one. The first entry is this endowment.

### 8. Record what you could not answer

Anything the code did not tell you: an unclear ownership boundary, a route with
no discernible caller, a dependency nobody can explain, a disagreement between
the unit and the system spec.

These go to `context-v/issues/` — **not** into the README as confident prose.
A README that invents an answer is worse than one that has a gap, because the
gap is visible and the invention is not.

## Hard rules for agents

1. **One unit per run.** This loop does not sweep. Forty units endowed in one
   pass produces forty files of the same hedged prose, which is how this kind of
   effort becomes worthless.
2. **Read the code, not the system spec.** The system spec is context; the unit's
   source is truth. Where they conflict, that is a finding for
   `context-v/issues/`, not a judgement call to make quietly.
3. **Never invent a contract.** If a route's error modes aren't discoverable from
   the handler, say so. An API contract that documents behaviour the code doesn't
   have is a liability with a confident voice.
4. **A declared deviation must carry its reason.** "Deviates from F4" is not a
   declaration. "Deviates from F4 — raw `z-index: 9999` on the drag ghost because
   it must sit above the shell's own overlay layer, which the `--z-*` scale does
   not reach" is.
5. **A new unit is not finished until this loop has run on it.** This is the rule
   that stops the gap reopening. Everything else here is cleanup of a debt; this
   one prevents the next one.

## Related

- [[../plans/Component-Level-Documentation-Contracts]] — the plan this loop executes, including sequencing and the forcing-function problem
- [[Sweep-Local-Federated-Design-System-for-Fidelity]] — step 5 is this loop's first real run for a given member
- [[../plans/Graphify-As-Standing-Practice-And-Per-Component-Diagrams]] — where step 3's graph comes from
- [[../blueprints/Augment-It-as-Working-App-and-Architecture-Demo]] — the doctrine
- [[../explorations/The-Gap-Between-What-We-Preach-And-What-We-Practiced]] — the audit
- [[Loop-through-Spec-Write-Plans-Implement-Test-Changelog-Commit]] — the wider delivery loop this nests inside
