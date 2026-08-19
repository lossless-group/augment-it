---
title: "Implement-Feature Loop — plan → gh tickets → code/verify/changelog/commit per ticket → human browser test → ship"
lede: "The generic feature-execution cadence: a signed-off plan becomes gh tickets, each ticket lands as verified code + a changelog beat + a conventions-clean commit, and the run closes with a human browser test and a ship() commit."
date_created: 2026-07-27
date_modified: 2026-07-27
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
semantic_version: 0.0.1.0
proven_on: "[[../plans/Org-Relations-Parent-Child-Peer-Plus-Org-Tags]] — tickets #49–#57, init 570d0b6 → ship a89cb47, 2026-07-27, same day as authored. Human gate spawned one fix-ticket (#57) and a superseding pilot ruling — the gate earning its keep is the loop working, not a deviation."
tags:
  - Loop
  - Augment-It
  - Feature-Execution
  - GH-Issues
  - Git-Conventions
  - Changelog-Conventions
  - Browser-Drive
status: Proven-Once
site_uuid: e556fadc-ae70-4003-b055-d09fe60e98ca
hex_code: ne4ysb
date_authored_initial_draft: 2026-07-27
date_authored_current_draft: 2026-07-27
publish: true
---

# Implement-Feature Loop

> `context-v/loops/` is **experimental** (per the context-vigilance skill).
> Unlike its sibling
> [[Loop-through-Spec-Write-Plans-Implement-Test-Changelog-Commit]] — which
> was codified retrospectively and asked that the next loop be authored
> *before* running — this one is written first. The doc is the durable
> definition; each session that runs it is an execution.

## What this loop is

A per-**ticket** execution cadence for a feature whose plan already exists in
`context-v/plans/`. The plan is the contract; gh issues are the visible work
trail; every iteration lands one ticket as working, verified code with its
changelog beat and its own commit. The run is bookended by two named commits —
`init(feature, <feature-name>)` opens it, `ship(feature, <feature-name>)`
closes it — with a **human browser test as the gate between "all tickets
done" and "shipped."**

Distinct from the sibling spec-loop: that one iterates *phases of a spec*
(authoring a plan each turn); this one iterates *tickets of a plan* that is
already written. Run that loop to produce plans; run this one to burn a plan
down.

## Parameters (set at loop start)

- `<feature-name>` — kebab-case handle used in both bookend commits
  (e.g. `org-relations`).
- `<plan-doc>` — the `context-v/plans/*.md` file being executed
  (e.g. [[../plans/Org-Relations-Parent-Child-Peer-Plus-Org-Tags]]).
- `<changelog-file>` — minted in Phase 0 per changelog-conventions
  (`changelog/YYYY-MM-DD_NN_<Title>.md`).

## Skills to load at loop start (exact names)

1. **`context-vigilance`** — frontmatter, status discipline, where artifacts go
2. **`pseudomonorepos`** — which repo you're actually in; branch-tier
   awareness (augment-it trunk is `rebuild/turbo-rsbuild`, not the documented
   tiers); never bump parent gitlinks as a side effect
3. **`git-conventions`** — header syntax, body structure, pre-commit checklist
4. **`gh-cli-projects-tasks-conventions`** — ticket bodies link the context-v
   file as a **GitHub URL in the file's own repo** (not a deep parent-monorepo
   path); prefill labels/milestones/types from what the repo actually has
5. **`changelog-conventions`** — the stub's frontmatter (publish, lede, ISO
   dates) and the ship-note register

Also confirm the **Playwright MCP** is connected (`.mcp.json` project scope;
`claude mcp add -s project playwright -- npx @playwright/mcp@latest` if
absent — remembering a newly added server loads in the **next** session).
Browser-simulated checking is part of the loop, not an optional extra.

## Phase 0 — setup (once per run)

1. **Check the plan.** Read `<plan-doc>` end to end against the live working
   tree — plans go stale the moment code moves. Flag divergences in the plan
   doc (a `## Superseded by reality` note, sibling-loop style) rather than
   silently improvising. Flip the plan's `status:` → `Implementing`
   (+ `date_modified`, patch bump).
2. **Write the tickets.** One gh issue per plan step/phase-slice, per the
   gh-cli-projects skill: body leads with the clickable GitHub URL to
   `<plan-doc>`, sidebar prefilled from the repo's real labels/milestones.
   The issue list IS the loop's work queue — order it by the plan's
   dependency order.
3. **Initiate the changelog stub.** Create `<changelog-file>` with full
   frontmatter and a **narrative** opening — why this feature, what changes
   for the operator — plus an empty `## What landed` section the loop
   appends to. It ships as a stub on the first commit; it's polished at the
   end, not written at the end.
4. **First commit:**

   ```
   init(feature, <feature-name>): tickets opened, changelog stubbed, loop begins
   ```

   Body per git-conventions: link `<plan-doc>` and enumerate the gh issue
   numbers. Push. This commit is the run's opening bracket.

## The iteration (once per gh ticket, in queue order)

```
pick ticket → code → verify (svelte-check / typecheck / logs / browser drive)
     → changelog beat → commit → close ticket with the hash → next
```

1. **Pick the next open ticket** and note its number — the whole iteration
   hangs off it.
2. **Write the code.** Match surrounding idiom; scope strictly to the ticket
   (scope creep spawns a *new* ticket, it doesn't widen this one).
3. **Verify — the ladder, cheapest rung first:**
   - `pnpm exec svelte-check` in each touched `apps/*` (and
     `pnpm -r typecheck` when services changed) — code logic sound, nothing
     breaking. (`pnpm exec`, the current form of `pnpx`.)
   - **Monitor server logs** while exercising the change:
     `docker compose logs -f --tail=50 <touched-services>` — watch for
     errors/failures the type layer can't see (NATS timeouts, handler
     throws, refused boots).
   - **Browser drive** for any UI-facing ticket: Playwright MCP against the
     local shell — navigate, click the new affordance, assert via
     accessibility snapshot (screenshots only for visual questions). Reads
     unrestricted; **writes only against throwaway/test entities, never
     canonical data.**
   - Run the plan's proof script if the ticket lands capability surface.
4. **Update the changelog** — append to `## What landed`: the step, a short
   code sample of the interesting part, and any gotcha hit. Beats are
   written while the context is hot; the polish pass only reorders and
   tightens.
5. **Commit** per git-conventions (action verb + effort grouping, impact
   before implementation, `Refs #<ticket>` in the body). One ticket, one
   commit, as a rule; riders per the skill when a trivial fix tags along.
   Push.
6. **Close the ticket with the receipt:**

   ```bash
   gh issue close <n> --comment "Landed in <short-hash>. <one-line note: what proved it / anything the next ticket should know>"
   ```

   The commit hash in the closing comment is mandatory — it's what makes the
   issue trail auditable later.

**Blocked ticket?** Comment the blocker on the issue, label it, skip it, and
continue the queue — return after the others. Two consecutive passes with the
same blocker = stop the loop and surface to the operator.

## Exit conditions → the human gate → ship

The loop's iterations end when **every gh ticket is closed** and the full
ladder is green (svelte-check + typecheck clean, logs quiet, agent browser
drives passed, proof script green if one exists).

Then, in order:

1. **Human browser test.** Hand the surface to the operator with a short
   click-path script (what to try, what changed). The agent's Playwright
   drives proved the buttons *work*; this rung judges whether the surface is
   *usable* — it is the gate, and it augments, never replaces, the drives
   that preceded it. Findings become fix-tickets and the loop re-enters the
   iteration above for them.
2. **Polish the changelog.** Narrative pass over `<changelog-file>`: tighten
   the lede, order `## What landed` for a reader instead of a chronology,
   keep the best code samples, add the ship note.
3. **Close the plan.** `<plan-doc>` `status:` → `Shipped`
   (+ `date_first_published`); check off any tracking issue's boxes
   (e.g. the source issue's worklist).
4. **Ship commit:**

   ```
   ship(feature, <feature-name>): <one-line what the operator can now do>
   ```

   Body: link the changelog entry and `<plan-doc>`, enumerate the closed
   issue numbers, note the human test passed. Push. Closing bracket; loop
   over.

## Commit-verb note (extends git-conventions for this loop)

`init(feature, …)` and `ship(feature, …)` are this loop's bookend markers —
kin to the sibling loop's `attempt()`/`milestone()` verbs. Everything between
the bookends uses the standard git-conventions vocabulary (`feat`, `fix`,
`progress`, …). If the bookends prove out across runs, propose them upstream
into the git-conventions skill; until then they're loop-local.

## Anti-patterns (learned house rules, restated so the loop can't forget)

- **No time estimates** in tickets, changelog, or commits.
- **Don't batch commits** across tickets "to keep history clean" — the
  ticket↔commit↔changelog-beat correspondence *is* the cleanliness.
- **Don't polish the changelog mid-loop** — beats stay raw until the ship
  pass, or the polish work gets done twice.
- **Don't let the agent's browser drive substitute for the human test**, and
  don't ask for the human test before the drives are green — the human's
  attention is the scarcest resource in the loop.
- **Don't touch parent pseudomonorepo gitlinks** as part of any commit here.

## See also

- [[Loop-through-Spec-Write-Plans-Implement-Test-Changelog-Commit]] — the
  sibling loop that produces the plans this one consumes
- `context-v/blueprints/Browser-Drive-Verification-For-Agent-Sessions.md`
  (anchor monorepo root) — the two-rung verification pattern
- The five skills named above — this doc orchestrates them, it doesn't
  restate them
