---
title: "Pickup — Build the Enhanced Records List + Promotion Checkpoint"
lede: "Next session opens with the full spec already in hand: enhanced-records-list, a record-grained checkpoint surface that snapshots the whole triage state per record_uuid into a new canonical record set on promotion. This pickup points at that spec, summarizes the uncommitted-but-working state from the 2026-05-22 session (Save/Apply on Prompt Templates, autosave on response edits, helpful_links on rows, runner observability/cancel, response triage state ergonomics, the needs-human flag, blank-row cleanup), and queues the concrete first build step: the record_uuid plumbing + backfill."
date_created: 2026-05-22
date_modified: 2026-05-25
date_completed: 2026-05-23
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
status: Archived
tags:
  - Augment-It
  - Pickup
  - Enhanced-Records-List
  - Phase-5
---

# Pickup — Build the Enhanced Records List + Promotion Checkpoint

## Read this first

**The spec is finished.** Open and follow:
[[Enhanced-Records-List-and-Promotion-Checkpoint]] —
`context-v/specs/Enhanced-Records-List-and-Promotion-Checkpoint.md`

It is self-contained — data model, the microfrontend surface, the
promotion-as-snapshot semantics, the cemented `triage_states` on rows,
the row-level `archived` flag (the only way a record drops out of the
lineage), the iterative loop, and 8 acceptance checkpoints.

Also relevant:
[[Helpful-Links-on-Records-Captured-During-Triage]] —
`context-v/prompts/Helpful-Links-on-Records-Captured-During-Triage.md`
(the helpful-links shape, already implemented end-to-end in this session
and feeding into the spec above).

## Where things stand at the close of 2026-05-22

The session shipped a lot of working code, mostly **uncommitted on
branch `rebuild/turbo-rsbuild`**. Only one commit landed:

- `82c7ca4 fix(record-collector, prompt-template-manager): clear a11y warnings on sidebar list items`

Everything below is on disk and live in the running stack but **not yet
committed**. The walking skeleton's pre-flight + post-flight loop is now
genuinely usable.

### Prompt Templates (`apps/prompt-template-manager`)
- Per-row `×` delete in the sidebar (no need to load each prompt into the editor to delete it).
- The Create/Save button is dirty-aware — disabled when nothing has changed.
- New `Apply →` button: explicit handoff to Request Reviewer (was silently auto-dispatched on selection before).

### Request Reviewer (`apps/request-reviewer`)
- A `firing…` indicator the instant `firing` flips true, with a spinner, regardless of whether progress events have landed yet.
- `Cancel run` button while a run is in flight — wired to a new `prompt.run.cancel` capability; the runner aborts the in-flight Anthropic request via `AbortSignal`.
- **Coverage strip** between the row stepper and the model knobs: `12 / 207 covered · 3 needs-rerun · 192 remaining`. Auto-refreshes on response events. New `Fire remaining (N)` button passes `row_ids = uncovered` so the next pass doesn't re-fire what's already done.
- `include needs-rerun` checkbox to fold the rerun-queued set into the remaining-batch.

### Response Reviewer (`apps/response-reviewer`)
- New `needs-human` triage flag (the "model said unknown but the entity is itself unclear, a human needs to clarify what this even is" bucket).
- Per-bucket counts on the filter chips at the top (`all 96 · unflagged 0 · good 62 · needs-human 34 · partial 0 · wrong 0`).
- The bulk `🧹 Clear` button moved up next to the filter chips (top-right) — filter-scoped clear with the count visible.
- The triage flag chips moved INLINE with the stepper row (`◀ response N / N ▶ flag-pill | triage: good partial wrong needs-rerun needs-human`) — one mouse movement from step to flag.
- Actions row converted to icon-only with **CSS tooltips** (instant on hover): `✓` accept · `↻` rerun · `✦` distill (stubbed, disabled) · `🗑` delete this response.
- A bottom border separates the filter zone (top) from the current-response zone (just below).
- **Critical bug fixed**: response text edits now **autosave** to a new `edited_text` field on the response, on textarea blur AND before stepping to the next response. A visible save-state pill on the response heading reads `saving…` / `unsaved` (red) / `saved Ns ago`. `beforeunload` does a last-ditch flush. **75 URLs were lost before this fix** — the user re-researched them.
- **Helpful links on every record**: capture URLs + optional notes during triage; lives in `Row.fields.helpful_links` (NOT in the CSV schema). New capabilities `row.helpful_links.add` / `row.helpful_links.remove` / `row.get` in the workspace. Survives across record-set derivations because it lives on the row. Provenance: each link stores the `response_id` being triaged when it was captured.

### Prompt Runner (`services/prompt-runner`)
- Per-row diagnostic logging: `row started` / `row completed` (with `elapsed_ms`, `chars`) / `row failed` (with `elapsed_ms`, `error`).
- Per-row 90-second timeout via `AbortController` → SDK closes the HTTP request → row fails fast with `[error: row timed out after 90000ms]` → loop continues.
- Run-level cancellation: keyed by `record_set_id`, `Map<record_set_id, AbortController>` in `server.ts`, fired on `prompt.run.cancel.requested`.
- The runner now propagates an `AbortSignal` into `runPrompt` and through to `anthropic.messages.create({ signal })`.

### CSV ingest (`services/ingest`)
- Now drops fully-blank rows on import (matches xlsx-ingest's existing behaviour). Logs the dropped count.
- The current 261 partial-blank rows (only `Probability (auto)`-style auto-formula cells populated, no real prospect data) were surgically removed from row-store + response-store in this session — see `.backups/` for the pre-surgery snapshots.

### Response store
- `edited_text` + `edited_at` added to `ResponseRecord`; backfilled to null on load for older records.
- `response.set_text` capability + `response.edited` broadcast.
- `response.delete` + `response.delete_all` capabilities + `response.deleted` broadcast.
- `response.coverage` capability — returns `{ covered_row_ids, needs_rerun_row_ids }` for a given prompt × record set.

### Row store
- `row.get` capability (was missing).
- `row.helpful_links.add` / `row.helpful_links.remove` capabilities + handlers; both broadcast `row.updated`.

### Data state
- 4 record sets in row-store: parent (96 rows, blank-org removed), RSVP list (39, untouched), and two derived `+ url` sets (25 + 71 = 96).
- 96 responses in response-store, all flagged (62 good + 34 needs-human). Zero unflagged.
- 21 row cells in the parent set have accepted URLs written; the remaining 75 are where edits-were-lost-before-autosave-landed.

### Pre-surgery backups still on disk
`augment-it/.backups/responses_2026-05-22_180004.json` + `rows_2026-05-22_180004.json` (the pre-cleanup snapshot) and `responses_cleaned.json` + `rows_cleaned.json` (what got copied back in). Keep until the next commit is sanity-checked.

## Concrete first step for the next session

Per the spec, the smallest forward move is the **`record_uuid` plumbing**:

1. **Define the field** in `Row.fields` (side-channel; not a schema column).
2. **At ingest** (`services/ingest/src/parse.ts` and `services/xlsx-ingest/src/parse.ts`): mint a `rec_<base36>` for every new row.
3. **At derivation** (`services/prompt-runner/src/run.ts`): propagate `record_uuid` from parent row to derived row alongside the existing field-spread.
4. **One-shot backfill script** in `services/row-store/scripts/backfill-record-uuid.ts`:
   - Parent rows in each non-derived set get fresh `record_uuid`s.
   - Derived rows match to their parent by within-set order (the derivation preserves order); inherit the parent's `record_uuid`.
   - Run against the live row-store via NATS (or directly mutate the JSON with the row-store stopped, the same pattern as the blank-row cleanup).

Once `record_uuid` lands everywhere, the `enhanced-records-list` microfrontend can be scaffolded — Svelte 5 + workspace-singleton pattern, port 3006 likely, register in `shell/src/remotes.ts`, pair with Record Collector per the spec's PAIRINGS note.

## Housekeeping when you open the next session

1. **Commit the uncommitted stack**. The 2026-05-22 work is in one branch's worth of unrelated-but-coherent changes. Split into logical commits per the `git-conventions` skill:
   - `feat(prompt-template-manager): Save / Apply ergonomics + sidebar deletes`
   - `feat(request-reviewer): firing indicator, cancel, coverage strip, fire-remaining`
   - `feat(response-reviewer, response-store): edited_text autosave, needs-human flag, triage chip relocation, icon actions with CSS tooltips, delete + clear all, filter counts`
   - `feat(row-store, response-reviewer): helpful_links on rows`
   - `feat(prompt-runner): per-row logging, timeout, cancellation`
   - `feat(ingest): drop fully-blank rows on import`
   - Plus a changelog entry — Phase-5 is the natural framing: "the post-flight pre-checkpoint round."
2. **Check the running stack** — `docker ps` should show all 8 containers up. The cleaned data is live.
3. **Read the spec** before writing any code: `context-v/specs/Enhanced-Records-List-and-Promotion-Checkpoint.md`.
4. **Open this pickup again** if anything below is unclear.

## See also

- [[Enhanced-Records-List-and-Promotion-Checkpoint]] — the spec, the build target
- [[Helpful-Links-on-Records-Captured-During-Triage]] — already implemented, feeds into the spec
- [[Pickup-2026-05-23]] — the previous session's pickup (now superseded by the work that's landed since)
- [[Response-Reviewer-and-Response-Store]] / [[Request-Reviewer-Pre-Flight-Surface]] — the per-stage specs the new surface complements
