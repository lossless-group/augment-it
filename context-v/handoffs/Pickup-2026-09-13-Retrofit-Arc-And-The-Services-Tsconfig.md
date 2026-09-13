---
title: "Handoff — the retrofit arc, and the cheapest item it produced"
lede: "Everything is committed and pushed. Start with the services tsconfig: ten byte-identical files, fix already proven one directory away."
date_created: 2026-09-13
date_modified: 2026-09-13
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5 (1M context)
semantic_version: 0.0.1.0
status: Active
tags:
  - Handoff
  - Augment-It
  - Graphify
  - Archify
  - Context-Vigilance
  - Client-Recommendations
site_uuid: 245f35e8-db4c-4947-b639-955bf82155fa
hex_code: h8gaql
date_authored_initial_draft: 2026-09-13
date_authored_current_draft: 2026-09-13
publish: false
---

# Handoff — 2026-09-13

## Where everything stands

**Nothing is uncommitted. Nothing is unpushed.** Three repos moved:

| Repo | Branch | Head | State |
|---|---|---|---|
| `augment-it` | `rebuild/turbo-rsbuild` | `42ee931` | in sync with origin |
| `lossless-agent-skills` (`context-v/agent-skills`) | `main` | `e3891dd` | in sync |
| `lossless-monorepo` | `development` | `73963b17` | in sync |

`clients/reach-edu` is dirty in augment-it. **It was already dirty before this
session started — not ours, left alone deliberately.**

The `lossless-monorepo` parent carries dirty gitlinks for `ai-labs`,
`astro-knots`, `content`, `content-farm`, `context-v/agent-skills`, `lfm`, and
`self-host-stack`. Per [[../../../../context-v/reminders/Submodule-Pointer-Bumps-Belong-At-Wrap-Up|the
reminder written yesterday]] this is the expected state, **not drift**. Only
`ai-labs` and `context-v/agent-skills` moved because of this session. Someone else
is also working this tree — the anchor was 11 commits ahead mid-session — so the
collaboration exception applies and a pointer bump is more urgent than usual.

## Start here — the services tsconfig

The single cheapest, most-verified item this session produced.

```
10 of 11 service tsconfig.json files are byte-identical   (md5 540460bd…)
 0 of 11 extend anything
18 of 18 apps extend ../../tsconfig.base.json
```

`tsconfig.base.json` already exists and already works. It scoped itself to "every
federated member under `apps/`, plus the federation host in `shell/`" — reasonable
when written, stale the moment the services grew to twelve. The only outlier is
`services/decile-mcp`, which has its own variant and needs a look before being
folded in. `services/deploy-relay` has no `tsconfig.json` at all.

Found by diffing two graphs five weeks apart. **Neither reading the code nor
reading the docs would have surfaced it** — worth remembering when deciding whether
the graph earns its cadence.

## The rest of the queue, in order

1. ~~**Finish the `mount.ts` consolidation.**~~ **STRUCK 2026-09-13 — already
   shipped, and this item was a graph misreading.** `e51032d` (2026-08-06,
   ancestor of `HEAD`) collapsed seventeen `mount.ts` files into one
   `makeMount()` factory in `packages/federation` — 406 lines gone. The surviving
   files are 12–18 lines, mostly explanatory comment, wrapping one call, and the
   distinct export name per remote is *load-bearing* because Module Federation
   exposes it by name, so they cannot collapse further.

   Nineteen edges into `makeMount` is not a god node — it is nineteen consumers
   of one shared factory, which is exactly what the refactor was supposed to
   produce. 17 → 19 is two apps added, not duplication growing. **Centrality
   cannot distinguish "everyone duplicates this" from "everyone correctly
   depends on this."** Carried into
   [[../plans/Graphify-As-Standing-Practice-And-Per-Component-Diagrams]]; a graph
   finding is a hypothesis until someone runs `git log` on the file. See
   [[../issues/Structural-Invariants-Live-In-Prose-So-Sweeps-Stop-Halfway]].

2. **Reconcile `DESIGN.md` with the disk.** It registers 16 of 20 microfrontends
   and 2 of 7 packages, and mentions `services/` zero times. Because
   `design-drift.mjs` reads its member registry from that frontmatter,
   **`docs-portal`, `org-workbench`, `search-and-add` and `search-results` are
   outside F1–F11 enforcement entirely** — silently. The doc's own description
   still says "sixteen sovereign micro-frontends."

3. **`packages/federation` and `shell/` contracts first.** Per
   [[../plans/Component-Level-Documentation-Contracts]], these two are what every
   other unit binds to, so documenting them makes the other 38 cheaper. Run
   [[../loops/Endow-A-Component-With-Its-Own-Contracts]] — one unit per run, never
   a sweep.

4. **Decide the forcing function.** Writing 40 files once doesn't close a
   structural gap. Recommendation in the plan is option 3: render per-unit docs
   *in the running app*, so a service with a blank docs panel is visibly wrong to
   anyone using the product — discipline as part of the demo rather than a tax on
   it.

5. **Decide the graph re-run cadence.** Two builds five weeks apart produced four
   findings. Evidence favours a **structural** trigger (unit added / renamed /
   removed, federation contract changed) over a periodic one — every finding traced
   to a structural event, none to the passage of time.

## Open decisions nobody has made yet

- **Where the Archify JSON IR lives.** The typed spec is the durable artifact; the
  HTML is a render. Alongside the unit, or a central `diagrams/`? This decides
  whether diagrams federate down per-unit or stay system-level. Flagged in
  [[../loops/Create-or-Update-Archify-Diagrams]], still open.
- **Archify vs Mermaid.** Current lean: Mermaid stays the in-README default
  (diffable, renders on GitHub, no build); Archify is for presentation-grade and
  client-facing output. Not decided.
- **API contract format.** OpenAPI is the default answer, but several services are
  NATS-messaged rather than HTTP-routed and OpenAPI describes those badly. Vary by
  transport, or accept a lossy uniform format?
- **Per-unit `context-v/`.** Counted as a gap in the audit, but it may not be one —
  per-unit specs may genuinely belong in the system corpus where cross-unit work
  can see them. Decide explicitly rather than defaulting.

## Things that will bite you

- **The graph is not in git.** `graphify-out/` is gitignored regenerable output. A
  fresh clone has no graph, and an agent that assumes one exists will answer from
  training data. Ask for a build first, and **always check the build date** — a
  stale graph is wrong with confidence, which is worse than absent.
- **`ls` is aliased to `eza`** in this environment. `ls -la <dir> | wc -l` fails on
  flag parsing. Use `find`. Cost time twice this session.
- **macOS screenshot filenames contain U+202F**, a narrow no-break space, not a
  regular space. Typing the path fails; globbing works.
- **Archify needs its hand-made symlink.** `~/.claude/skills/archify →
  context-v/agent-skills/archify/archify`. `sync-skills-symlinks.sh` will not
  create it — the skill nests one level deeper than the script scans, same as
  `chroma-local`.

## What shipped today, for context

Two changelog entries in augment-it — the retrofit setup and the Graphify diff —
five new `context-v` docs (a counted gap audit, the doctrine blueprint developed
from a dormant 2026-06-01 stub, two remediation plans, two loops), the first
Archify diagram, and the second Graphify build. Three entries in the skills repo
covering Archify's install and the contact-list skill.

The audit is the artifact worth re-reading before the client meeting:
[[../explorations/The-Gap-Between-What-We-Preach-And-What-We-Practiced]]. 40
deployable units, 14 READMEs, 0 component-level design systems, changelogs,
`context-v/`, or API contracts. **We were rigorous at the system level and absent
at the component level** — which is the exact failure mode the three
recommendations exist to prevent, and the most credible thing to walk in with.

## Related

- [[../explorations/The-Gap-Between-What-We-Preach-And-What-We-Practiced]] — the counted audit
- [[../blueprints/Augment-It-as-Working-App-and-Architecture-Demo]] — the doctrine
- [[../plans/Component-Level-Documentation-Contracts]] — queue items 3 and 4
- [[../plans/Graphify-As-Standing-Practice-And-Per-Component-Diagrams]] — queue item 5
- [[../loops/Endow-A-Component-With-Its-Own-Contracts]] — the per-unit executor
- [[../loops/Create-or-Update-Archify-Diagrams]] — stub; procedure still to write
- [[../refactors/Structural-Refactors-Surfaced-by-the-Codebase-Graph]] — the August build
