---
title: "Create or Update Archify Diagrams"
lede: "The repeatable procedure for turning a unit — or the whole system — into a validated, explorable Archify diagram that reflects real code rather than a plausible story."
date_created: 2026-09-12
date_modified: 2026-09-12
semantic_version: 0.0.0.1
status: Stub
tags:
  - Loop
  - Augment-It
  - Archify
  - Visual-Engineering
  - Architecture-Diagrams
  - Mermaid
  - Client-Presentation
site_uuid: 8d055f66-546f-45fd-8842-8a5e31c5b56b
hex_code: bf9j8e
date_authored_initial_draft: 2026-09-12
date_authored_current_draft: 2026-09-12
publish: false
---

# Create or Update Archify Diagrams

<!-- STUB captured 2026-09-12, the session that installed Archify into the tree.
     The install facts and the tool's real surface are recorded below so the
     next session doesn't re-derive them. The *procedure* — the numbered steps,
     the hard rules, the per-unit conventions — is the part still to develop
     with the user. Do not treat the sketch below as the loop. -->

## Purpose (sketch)

Recommendation 1b — [[../plans/Graphify-As-Standing-Practice-And-Per-Component-Diagrams|Visual
Engineering]] — has two halves. Graphify answers *what is structurally true*.
Archify answers *what does this look like to a human being shown it*, which is
the half that reaches a client deck.

This loop will cover both directions of use:

- **Create** — a unit, flow, or whole-system diagram that does not exist yet.
- **Update** — an existing diagram whose underlying code has moved, which is the
  failure mode the whole of 1b exists to prevent. A diagram nobody re-derives
  rots exactly the way the 2026-08-06 graph did, and rots *silently* if it is a
  raster.

## Install — as done, 2026-09-12

Resolved the ambiguity flagged in the tree's
[[../../../../self-host-stack/context-v/explorations/Watchlist-Interesting-Tools|watchlist]]:
the one we use is **`tt-a1i/archify`** (MIT, skill v2.17), not
`Harrison-Yuan/archify-webui`.

Installed on the **Chroma pattern**, not via the `npx skills` manager — the
manager copies into `~/.claude/skills/` and six other agent directories,
bypassing the tree entirely:

- Added as a **nested git submodule** at `context-v/agent-skills/archify/` —
  registered in the `agent-skills` repo's own `.gitmodules`, exactly as
  `chroma-agent-skills` is. Tracked as a gitlink `160000`, so none of its ~8MB
  enters our history; a teammate gets it via `git submodule update --init`.
- Symlinked by hand: `~/.claude/skills/archify → context-v/agent-skills/archify/archify`
- The hand-link is required because the skill is nested one level inside a
  wrapper repo (`archify/archify/SKILL.md`), and `sync-skills-symlinks.sh` only
  scans direct children of `agent-skills/`. Same reason `chroma-local` and
  `chroma-cloud` are hand-linked. **Re-running the sync script does not disturb it.**
- Updates come from `git -C context-v/agent-skills/archify pull`, not from the
  skills manager.

Verified on install: runs with **no `npm install`** (zero runtime deps), and
`node bin/archify.mjs doctor` reports all fifteen checks green.

## What the tool actually offers

Five diagram types: `architecture`, `workflow`, `sequence`, `dataflow`,
`lifecycle`. Output is a self-contained HTML file with inline SVG, dual theme,
optional trace motion; exports to PNG/JPEG/WebP at 4×, static SVG, WebM, and
1200×630 share cards.

The commands that matter, from the skill's own CLI:

```
archify validate <type> <input.json> [--json]     # typed JSON IR is validated, not vibes
archify preview  <type> <input.json> [out.html]
archify deliver  <type> <input.json> [out.html] [--open] [--json]
archify compare  architecture <base.json> <head.json> [--receipt path]
archify visual-check <output.html> [--json]
archify guide [scenario or question]
```

Three of these are why this is a loop and not a one-off, and each needs a step
written around it:

- **`--repo-root <path>`** (architecture type only) — Archify inspects repository
  evidence rather than accepting a description. This is what separates it from
  "an LLM drew a plausible diagram," which is the objection raised against this
  whole category in
  [[../plans/Graphify-As-Standing-Practice-And-Per-Component-Diagrams]]. **The
  loop should make `--repo-root` mandatory for architecture diagrams**, not
  optional.
- **`compare` + `--receipt`** — diffs two architecture specs. This is the update
  half: a diagram that can be diffed announces its own staleness instead of
  rotting quietly.
- **It accepts pasted Mermaid** (`flowchart`, `sequenceDiagram`, `stateDiagram`)
  as input. The 13 files in this repo already carrying Mermaid are the obvious
  first corpus — a conversion pass, not a from-scratch authoring pass.

## To develop with the user

- **The numbered procedure.** Nothing above is a step yet.
- **Where the JSON IR lives.** The typed spec is the durable artifact — the HTML
  is a render of it. Committing the `.json` and gitignoring the HTML is the
  obvious move, but where: alongside the unit, or a central `diagrams/` dir?
  This decides whether diagrams federate down per
  [[../plans/Component-Level-Documentation-Contracts]] or stay system-level.
- **Relationship to Mermaid.** Archify *renders* Mermaid but is not a
  replacement for it. Current lean: Mermaid stays the in-README default
  (diffable plain text, renders on GitHub with no build); Archify is for
  **presentation-grade and client-facing** output. Needs deciding, not assuming.
- **Which diagram a unit kind owes.** `sequence` for a service's request
  lifecycle, `dataflow` for an ingest path, `architecture` for the shell +
  twenty remotes? Should align with the per-kind contract table in
  [[../plans/Component-Level-Documentation-Contracts]].
- **Whether this loop merges into [[Endow-A-Component-With-Its-Own-Contracts]]**
  as its step 3, or stays separate. Separate for now — that loop is per-unit and
  this one also serves whole-system client visuals, which have no unit.
- **The client-presentation path.** Share cards and WebM motion exist; the
  meeting this was installed for is the first real test of whether they land.

## Related

- [[../plans/Graphify-As-Standing-Practice-And-Per-Component-Diagrams]] — the plan this loop executes the second half of; also carries the Archify-ambiguity resolution and the "generated, not hand-drawn" argument
- [[../plans/Component-Level-Documentation-Contracts]] — where per-unit diagrams attach
- [[Endow-A-Component-With-Its-Own-Contracts]] — the per-unit loop this may fold into
- [[../blueprints/Augment-It-as-Working-App-and-Architecture-Demo]] — recommendation 1b in the doctrine
- [[../explorations/The-Gap-Between-What-We-Preach-And-What-We-Practiced]] — why 1b was judged a gap despite 13 Mermaid files
- [[../refactors/Structural-Refactors-Surfaced-by-the-Codebase-Graph]] — the Graphify half, and the staleness cautionary tale
