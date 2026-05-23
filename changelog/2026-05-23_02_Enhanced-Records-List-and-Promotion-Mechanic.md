---
title: "Enhanced Records List and the Promotion Mechanic — the iterative-enrichment loop closes"
lede: "augment-it now has a checkpoint surface between enrichment rounds. You finish a pass of LLM-driven enrichment, open Enhanced Records, see every record in one place with its accumulated columns, and click Promote — the system snapshots the current state into a new canonical record set under a deterministic, versioned name, archives the predecessors, and gives you a clear success message with a one-click path back to the start of the arc to author the next round. record_uuid follows each record across every promotion so a single conceptual record stays traceable from original CSV through every round of refinement. This is the loop the walking skeleton has been building toward: enrich, triage, checkpoint, re-enrich on a cleaner base."
publish: true
date_created: 2026-05-23
date_modified: 2026-05-23
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
tags:
  - Augment-It
  - Enhanced-Records-List
  - Promotion-Mechanic
  - Record-Identity
  - Canonical-Sets
  - Iterative-Enrichment
  - Module-Federation
  - Shell-Layout
  - Cross-Remote-Navigation
files_changed:
  - apps/enhanced-records-list/
  - services/row-store/src/store.ts
  - services/row-store/src/handlers.ts
  - services/row-store/scripts/consolidate-to-canonical.ts
  - services/workspace/src/capabilities.ts
  - services/workspace/src/ws.ts
  - services/prompt-runner/src/run.ts
  - packages/workspace/src/types.ts
  - packages/workspace/src/state.svelte.ts
  - packages/workspace/src/anticipation.ts
  - packages/workspace/src/index.ts
  - shell/rsbuild.config.ts
  - shell/src/remotes.ts
  - shell/src/App.svelte
  - scripts/dev.sh
---

## Why Care?

If you've ever pointed an LLM at a spreadsheet of companies, contacts, or
prospects and asked it to enrich them, you know the failure mode of "one big
batch": a run goes sideways, fills the wrong cells, hallucinates a few
LinkedIn URLs, and now your dataset is a mix of human-trusted and
model-guessed values with no clean way to separate them.

The fix isn't a smarter model. It's a **gate** — somewhere between "the
model produced N answers" and "those answers are part of my canonical
roster" where a human says *which ones move forward*. And once that gate
exists, the workflow becomes a **loop**: enrich on a cleaner base, triage,
gate again, enrich again. Each round narrows the noise and deepens the
signal per record.

Today augment-it shipped that loop. The new **Enhanced Records** surface is
the gate. The **Promote** action is what moves a roster of records forward
through the gate as a single deliberate step. And **record_uuid** is the
identity that keeps each record traceable through every round so the
lineage doesn't fragment.

## What's New?

- **A new federated remote**: `apps/enhanced-records-list` (port 3006 — wait,
  actually 3007; chat took 3006 earlier). Mounted in the shell's Deck
  alongside Record Collector and the other surfaces. Paired with Record
  Collector in co-existence mode so you can flip between "all my raw data"
  and "the unified checkpoint" with one click.
- **A new backend capability**: `record_set.promote`. Takes a source record
  set, folds every derivation chained to it (parent + every prompt-run
  output that descends from it) into one canonical snapshot, mints
  `record_uuid` for any row that doesn't have one yet, archives the
  predecessors. Returns the new record set + its rows for immediate display.
- **Two supporting capabilities**: `record_set.archive` (mark a set archived
  without promoting) and `row.archive` (per-record archive flag — the only
  way a single record drops out of the canonical lineage at promotion).
- **A universal naming convention** for canonical sets:
  `<YYYY-MM-DD>_<Train-Case-Slug>_v<N>.<ext>`. First promotion is v2;
  subsequent promotions of the same lineage bump (v2 → v3 → v4 …). The
  slugifier strips noise words (DRAFT, WIP), preserves section breaks
  (` - ` → `--`), and is idempotent so re-promoting a canonical doesn't
  accumulate suffix cruft. Example: `Master Pipeline Tracker_ DRAFT - Active
  Pipeline.csv` → `2026-05-23_Master-Pipeline-Tracker--Active-Pipeline_v2.csv`.
- **A celebratory success banner** in Enhanced Records after Promote
  completes. Shows the new canonical's name in monospace, the row + column
  count, how many predecessor sets got archived, and two affordances:
  *"Do another round of enhancements →"* and *"Continue working with this
  canonical"*. The first one actually navigates — taking you to Prompt
  Templates to author the next prompt.
- **A cross-remote navigation event**: the shell now listens for
  `augment-it:navigate` window events. Any remote can dispatch
  `new CustomEvent('augment-it:navigate', { detail: { remoteId, mode } })`
  and the shell switches its focused Window accordingly. First use: the
  success banner's "Do another round" button.
- **A persistent left-side chat rail** in the shell (since the chat panel
  shipped earlier today and we wanted it adjacent to whatever Window the
  user is focused on, not in the tile rotation).
- **A one-time data migration script**:
  `services/row-store/scripts/consolidate-to-canonical.ts`. Designed for
  pre-existing data that predates the promote capability: identifies the
  parent + its derivations, matches them by identity column with
  positional disambiguation for duplicate identities, builds the canonical,
  archives the predecessors. Refuses to write if coverage isn't perfect.

## How it Works

The conceptual move: today's data model produces a new **derived record
set** per enrichment run. Run 1 against the parent set produces *"Master
Pipeline + url"* with 25 rows. *"Fire remaining"* produces a second derived
set with 71 rows. Three sets now exist for what is conceptually the same
96 records. This is correct as a persistence model (each derivation is
auditable; no data is overwritten) but wrong as a **human's mental model**.
The human thinks *"I have 96 records, some of which now have a URL."* They
do not want to reason about set lineage to figure out *"what's the latest
version of record X?"*

The Enhanced Records List fixes the gap on the read side: it unions the
parent and every derivation in memory, grouping rows by content (and now,
by `record_uuid` when present), showing the latest non-null fields per
column. The user looks at 96 unified records, not at four overlapping sets.

Promote fixes the gap on the write side: when the user is ready to commit
the unified view as the new baseline, one click creates a new RecordSet
containing 96 rows that ARE the unified view (parent's columns + every
enrichment column + every cell of accumulated data) — and archives the
predecessor sets so they hide from default UIs but remain available for
audit.

### The promote arc, end-to-end

1. **Click Promote** in Enhanced Records (with the source set selected in
   the parent picker)
2. **A confirm dialog appears**: *"Promote 96 records from `<source name>`
   into a new canonical set? This folds every derivation's columns + values
   into a single snapshot, mints record_uuid where missing, and archives
   the source + all its derivations."*
3. **On accept**: the workspace dispatches `record_set.promote` over the
   existing WebSocket → row-store creates the canonical + archives the
   predecessors → broadcasts `record_set.created` and `record_set.archived`
   → the workspace state syncs
4. **The success banner appears** with the new canonical's name prominent
5. **The parent picker auto-switches** to the new canonical (its
   `auto-pick` heuristic prefers the most-recently-created promoted set
   over CSV imports — because that's almost certainly what the user wants
   to look at next)
6. **The two affordances**: "Do another round of enhancements →" (which
   dispatches the cross-remote navigation event taking the user to Prompt
   Templates) and "Continue working with this canonical" (just dismisses
   the banner)

### record_uuid — the identity that follows a record across rounds

A new field minted by `row-store/src/store.ts` at row-creation time, carried
verbatim through prompt-runner's derivation (which spreads parent fields
into derived rows), and preserved through promote (which spreads source
row fields into canonical rows). The result: every row in row-store has
a stable identifier that ties together its lineage across every round.

The blueprint behind this is in
[[Original-and-Enhanced-Record-Instances]] and the spec at
[[Enhanced-Records-List-and-Promotion-Checkpoint]] under §"Data model
changes" — both authored before today's build session.

## Under the Hood

### The fold

When Promote runs against a source set with N derivations, the fold
algorithm walks each source row in order, identifies its corresponding
derived rows by identity column (with positional disambiguation for
duplicates — the Schusterman case from the live data), and merges each
derived row's non-empty fields onto the source row's fields.

The merge is **type-driven**, not field-name-driven (the principle
correction that's its own changelog entry —
[[2026-05-23_03_All-Data-Continues-Generic-Rendering]]):

- If both sides are arrays → concatenate + shallow-dedupe (so helpful_links
  accumulate across rounds rather than the last derivation's empty array
  erasing earlier captures)
- If both sides are non-null objects → merge by key
- Otherwise → incoming non-empty overrides existing

### The naming convention

Slugifier (in `services/row-store/src/store.ts` as `buildCanonicalName`):

```
input:  Master Pipeline Tracker_ DRAFT - Active Pipeline.csv
        ────────────────────────────────────────────────────
1.      strip extension .csv                  → Master Pipeline Tracker_ DRAFT - Active Pipeline
2.      strip legacy "· canonical · DATE"     → (no-op for fresh names)
3.      _ → space                              → Master Pipeline Tracker  DRAFT - Active Pipeline
4.      strip DRAFT/WIP word-boundary          → Master Pipeline Tracker   - Active Pipeline
5.      " - " → section break "--"             → Master Pipeline Tracker--Active Pipeline
6.      collapse multi-space                   → Master Pipeline Tracker--Active Pipeline
7.      spaces → hyphens                       → Master-Pipeline-Tracker--Active-Pipeline
8.      collapse 3+ hyphens → 2                → (no-op)
9.      strip leading/trailing hyphens         → (no-op)

output: 2026-05-23_Master-Pipeline-Tracker--Active-Pipeline_v2.csv
```

Idempotency: when promoting a name already in canonical form
(`<DATE>_<slug>_v<N>.<ext>`), the regex `^\d{4}-\d{2}-\d{2}_(.+)_v(\d+)(\.\w+)$`
captures the slug + version, strips any legacy markers from the slug,
bumps the version, swaps in today's date. v2 → v3 → v4 stays clean
across rounds.

### The chat rail (because the chat panel shipped earlier and needed a home)

The shell now distinguishes the chat from the rest of the tile rotation.
The chat lives in a **persistent left rail** (CSS `.chat-rail`, 360px
default with 280–480px clamps); the rest of the apps tile to its right
in the Window. A header toggle (`💬 chat`) hides/shows the rail and
persists the preference to localStorage. Per the four-roles model in
`context-v/blueprints/Chat-As-Verb-Surface-Patterns.md` (sibling repo):
**the chat is a peer to the Window, not a Window itself**, so it goes
WITH the user wherever they focus.

### The one-time consolidation script

`services/row-store/scripts/consolidate-to-canonical.ts` is the standalone
version of the promote logic, intended for data that predates the
capability. Used during this session's recovery (after a botched first
promote left a 24-column canonical without the URL enrichment folded in)
to restore from backup tarballs and re-promote cleanly. Safety: refuses to
write if the parent → derived coverage isn't perfect; backs up `rows.json`
to `.backups/` before mutating; designed to run with the row-store
container stopped.

## What's Next

The Enhanced-Records-List spec at
`context-v/specs/Enhanced-Records-List-and-Promotion-Checkpoint.md` lists
eight acceptance checkpoints. Today's work hits the first five — the
record_uuid plumbing, the table view, the helpful-links surfacing, the
promotion-as-snapshot mechanic, the lineage chain readable from any set's
`promoted_from`. What's deferred:

- **Triage-state cementing.** The spec calls for promote to write a
  `triage_states[prompt_id]` map onto each canonical row, sourced from the
  latest response per `(record_uuid, prompt_id)` in response-store. The
  capability + storage are in place; cementing on promote needs response-
  store as a NATS dep in row-store's promote handler.
- **Triage column + filter chips** in Enhanced Records reading that
  cemented state. The chips are rendered today as disabled placeholders.
- **Bulk row actions**: `↻ Queue for re-enrichment`, `🗑 Archive selected
  records`, `✎ Re-flag …`. The `row.archive` capability is wired; the UI
  selection state isn't.
- **Request Reviewer triage-state filter**: scope a fire to *"only records
  where triage = good ∪ accepted"* — the "between meetings, only push
  forward the good ones" path.

## References

- Spec: `context-v/specs/Enhanced-Records-List-and-Promotion-Checkpoint.md`
- Blueprint: `context-v/blueprints/Original-and-Enhanced-Record-Instances.md`
- Pickup: `context-v/reminders/Pickup-Enhanced-Records-List-Build.md`
- Companion entry on what got rewritten mid-build:
  `changelog/2026-05-23_03_All-Data-Continues-Generic-Rendering.md`
- The in-app chat that shipped earlier today, which made the chat rail
  necessary: `changelog/2026-05-23_01_In-App-Chat-v0-0-1.md`
