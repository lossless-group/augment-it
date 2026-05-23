---
title: "The post-flight triage round — the loop survives contact with 207 real records"
lede: "Last night's commit shipped Request Reviewer + Response Reviewer as code that typechecked. Tonight they survived a 207-record enrichment run against a real CSV with the user as the human in the loop — and every place the loop was thin, this round repaired. The Save / Apply ergonomics on Prompt Templates, the firing indicator and Cancel button and coverage strip on Request Reviewer, the per-row 90-second timeout and run-level cancellation in prompt-runner, the autosave-on-blur on Response Reviewer's edit textarea (after the first run lost 75 manually-typed URLs), helpful_links as a side-channel field on every row, a needs-human triage flag, an icon action row with instant CSS tooltips, per-bucket counts on the filter chips, a fire-time blank-row filter at csv ingest, and the spec for the next checkpoint — enhanced-records-list and the promotion loop — captured in context-v as the build target for the next session."
publish: true
date_created: 2026-05-22
date_modified: 2026-05-22
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
tags:
  - Augment-It
  - Prompt-Template-Manager
  - Request-Reviewer
  - Response-Reviewer
  - Prompt-Runner
  - Helpful-Links
  - CSV-Ingest
  - Human-in-the-Loop
  - Enhanced-Records-List
files_changed:
  - apps/prompt-template-manager/src/App.svelte
  - apps/prompt-template-manager/src/app.css
  - apps/request-reviewer/src/App.svelte
  - apps/request-reviewer/src/app.css
  - apps/response-reviewer/src/App.svelte
  - apps/response-reviewer/src/app.css
  - packages/workspace/src/types.ts
  - packages/workspace/src/index.ts
  - services/ingest/src/parse.ts
  - services/prompt-runner/src/anthropic.ts
  - services/prompt-runner/src/run.ts
  - services/prompt-runner/src/server.ts
  - services/response-store/src/handlers.ts
  - services/response-store/src/store.ts
  - services/row-store/src/handlers.ts
  - services/row-store/src/store.ts
  - services/workspace/src/capabilities.ts
  - services/workspace/src/ws.ts
  - context-v/specs/Enhanced-Records-List-and-Promotion-Checkpoint.md
  - context-v/prompts/Helpful-Links-on-Records-Captured-During-Triage.md
  - context-v/reminders/Pickup-Enhanced-Records-List-Build.md
  - .gitignore
---

# The post-flight triage round — the loop survives contact with 207 real records

## The set-up

Yesterday the four-remote pipeline went live as code: Prompt Templates →
Request Reviewer → Fire → Response Reviewer, all typechecking, none of it
yet exercised. Tonight the user pointed it at a real CSV — a Master
Pipeline Tracker with 207 prospect organisations — ran the
"Find Organisation URL" prompt over the whole set, and worked the human
side of the triage loop end-to-end. Every rough edge between code-that-
runs and tool-that-feels-good showed up. This commit set is the repair
pass.

## What the user actually did with it

A real human-in-the-loop research session: open Response Reviewer,
step through 207 responses, fix the URLs the model got wrong (or where
it returned the literal string "unknown"), Google-search the unclear
prospects, decide which were valid orgs to enrich further, which needed
the team to clarify, which weren't real prospects at all, and capture
adjacent links found along the way. The session ran ~25 minutes of
focused triage before the first wall: text typed into the editable
response textarea wasn't being saved unless the user clicked the
Accept button between every step. 75 manually-researched URLs vanished.

That moment shifted the round from "ship the next thing" to "fix every
place the loop was lying to the user about what was persisted."

## The trust-rebuilding work

### Save / Apply on Prompt Templates

The previous editor had one ambiguous button ("create" / "save") and
silently shipped the selected prompt across to Request Reviewer the
moment any sidebar row was clicked. The flow conflated authoring with
handoff, and made it easy to mash "create" on an empty placeholder-
populated form and produce duplicate prompts (the smoking gun: three
identical "Find Organisation URL" rows visible in the sidebar).

Now: a snapshot of the last-saved field values drives a derived
`isDirty` flag. The Save / Create button is disabled when the form is
clean or required fields are blank. A new `Apply →` button is the
explicit handoff — only enabled when a saved prompt is loaded and not
dirty, so unsaved edits can never be invisibly sent over. Selecting a
sidebar row now just loads into the editor, no side effect. Per-row ×
delete in the sidebar lets duplicates be cleaned without first loading
each one into the editor.

### The firing indicator + Cancel + per-row guardrails

Request Reviewer's Fire button used to silently disable the moment it
was clicked, with no visible signal that the run had started until the
first progress event arrived — which, for an Opus + web-search run on a
vague prompt, could be 60-90s away on row 1. The user reasonably thought
nothing was happening. The earlier wall: a stuck row hung the entire run
for 17 minutes before anyone noticed.

Now: the `firing…` indicator appears the instant `firing` flips, with a
spinner and an explainer about LLM latency, then swaps to
`firing… N / M` once the first progress event lands. A red `Cancel run`
button appears next to the Fire buttons while a run is in flight; it
calls a new `prompt.run.cancel` capability that signs an `AbortController`
on the runner side, which the runner has been refactored to thread
through into `anthropic.messages.create({ signal })` — so a cancellation
actually closes the HTTP request to Anthropic, not just walk away from
the promise.

The runner also grew per-row diagnostic logging (`row started` /
`row completed` with `elapsed_ms` and `chars`, or `row failed` with the
error and elapsed-ms) and a 90-second per-row timeout via the same
`AbortController` plumbing — a stuck row now fails fast with
`[error: row timed out after 90000ms]` and the loop continues. The
cancellation map is keyed by `record_set_id` so a follow-up "Fire
remaining" against the same set deliberately supersedes any prior
hanging run.

### Coverage strip + Fire remaining

The user fired the first 25 rows, then asked: how do I run the rest?
Without coverage tracking, the only fire mode was "first N from the
top" — re-running on rows that were already done.

Now: a new `response.coverage` capability against response-store returns
`{ covered_row_ids, needs_rerun_row_ids }` for a given prompt × record
set. A row is "covered" if it has at least one response NOT flagged
`needs-rerun`. Request Reviewer shows a coverage strip between the row
stepper and the model knobs: `12 / 207 covered · 3 needs-rerun · 192
remaining`, colored chips, auto-refreshed on response events. A new
`Fire remaining (N)` button passes the uncovered row_ids explicitly to
`prompt.run`, so the next pass touches only the genuinely-new rows. An
`+ include needs-rerun` checkbox folds the rerun-queued set into the
remaining batch.

### Autosave on Response Reviewer's edit textarea

The moment the round broke trust: the textarea said "Response —
editable; your edits are what 'accept' writes" but the underlying state
was overwritten the moment the user stepped to the next response, and
edits not followed by an Accept click silently vanished. 75 URLs the
user had manually researched and typed in were gone.

Now: a new `edited_text` field on every ResponseRecord (backfilled to
null for older records on load). The textarea autosaves to this field
on blur — clicking away, tabbing out, hitting an icon button, stepping
with the arrows. The `$effect` that swaps the response now calls
`flushEdit()` on the outgoing response BEFORE assigning the new
response's text into the editor. A `beforeunload` handler does a
last-ditch flush on tab close.

A status pill on the response heading reads `saving…` / `unsaved`
(red, danger-tint background) / `saved Ns ago`. The Accept action's
precedence is now `explicit value → edited_text → response_text`, so
even if autosave hasn't fired yet, Accept catches the latest editor
state. Three new NATS subjects (`response.set_text.requested`,
`response.edited`, `response.deleted`) and the matching workspace
capabilities + WS broadcast list got wired in.

### Triage ergonomics

Multiple smaller changes that compound during a long triage session:

- The `needs-human` flag joined the triage set (alongside good / partial
  / wrong / needs-rerun). For records where the prompt fired correctly
  but the entity identity is itself unclear — *"this row says 'Smith
  Foundation'; there are six. Which one?"* The bucket counts as
  "covered" for the purposes of Fire remaining: the model did its job;
  the human's call is owed, but not the model's.
- Per-bucket counts pinned to the filter chips at the top
  (`all 96 · good 62 · needs-human 34 · …`), with a small tabular-
  numeric badge that takes the chip's color when active.
- The triage flag chips moved INLINE with the stepper row — a
  `[ ◀ response N / N ▶ · flag-pill · | · triage: good partial wrong
  needs-rerun needs-human ]` strip. One mouse movement from step to
  flag, no more arduous trip to the bottom of the page.
- A bottom border on the filter row separates the view-zone (top)
  from the current-response-zone (just below).
- The actions row became icon-only with CSS tooltips that appear
  instantly on hover (no browser-imposed delay): `✓` accept, `↻` re-run,
  `✦` distill (stubbed, future stage), `🗑` delete this response.
  Tooltips appear on `:focus-visible` too for keyboard a11y; aria-labels
  carry full text for screen readers.
- The bulk `🧹 Clear "<filter>" (N)` button moved up to the filter row
  (top-right) with a count badge — destructive bulk action lives next
  to the filter that defines its scope.
- New `response.delete` + `response.delete_all` capabilities on
  response-store; the latter takes a ResponseFilter so the UI scopes
  the bulk clear to whatever filter is active.

### Helpful links on records — the side-channel that survives derivations

The user's research turned up adjacent links worth keeping: a
foundation's About page when the URL prompt couldn't find it; a
LinkedIn profile when the "org" was actually a person; a press piece
linking to a related grantee. Today those links would die in the
clipboard.

Now: `helpful_links` is an array side-channel field on every Row
(`Row.fields.helpful_links` — NOT a CSV-derived schema column, per the
dynamic-schema discipline). Each link carries
`{ link_id, url, label, note, source, added_at, response_id }`. The
`source` field is `'manual' | 'distill' | 'enrichment'` — only `manual`
is populated in v1, but the enum anticipates the highlight-collector's
future automated extraction and the themed-link enrichment described
in the new spec.

In Response Reviewer, the left Context panel grew a "Helpful links for
this record" section: list of existing links (each with favicon-style
hostname, optional note, remove ×) + an inline form (URL + optional
note + add button). New backend pieces: `row.get`, `row.helpful_links.add`,
`row.helpful_links.remove` capabilities; `addHelpfulLink` /
`removeHelpfulLink` in row-store; an `HelpfulLink` type in
`@augment-it/workspace`. Adding a link silently records the
`response_id` you were viewing as provenance.

The links attach to the **row** (the parent set's row, since
prompt-runner already records `response.row_id` against the parent
identity), not the response. Stepping to a different response on the
same record shows the same link set. The full cross-derivation-chain
hoist is deferred to the spec below.

### CSV ingest drops fully-blank rows

The xlsx-ingest service already filtered fully-blank rows
(`parse.ts:69`); CSV ingest didn't. The Master Pipeline Tracker upload
brought 261 ",,,,"-shape blank rows into row-store, which then fired
as empty-token prompts ("Find the website for .") during the first
enrichment run, returned "unknown", and burned the user's attention
during triage. This commit closes the parity.

Note: this catches *fully* blank rows. Rows that have spreadsheet
auto-formula cells populated (`Probability (auto): 0.0%`) but no
identity column are still ingested; those need a fire-time guard in
prompt-runner (skip rows where the template-referenced tokens all
resolve to empty) — deferred. For the current data they were cleaned
up by a one-shot surgery against the live row-store and response-store
files, with pre-surgery snapshots backed up to `.backups/` (now in
`.gitignore`).

## The spec for what comes next

The session ended with the user articulating the next checkpoint surface
clearly enough to warrant its own spec rather than just a TODO. Filed:

- `context-v/specs/Enhanced-Records-List-and-Promotion-Checkpoint.md` —
  a new record-grained microfrontend that snapshots the whole triage
  state per `record_uuid` into a new canonical record set on promotion.
  The data model adds `record_uuid` (stable identity across derivations),
  per-row `triage_states` (the flag cemented at promotion time, mutable
  on the current canonical set, frozen only when a new canonical set is
  promoted on top of it), and row-level `archived` (the only mechanism
  for a record to drop out of the lineage — triage state alone never
  excludes). Promotion is a **snapshot**, not a filter: every non-row-
  archived record carries forward with its cemented triage state, so
  the team-meeting workflow ("filter to needs-human, walk the team
  through, re-flag or archive in place") is a first-class checkpoint.
  Eight acceptance criteria.

Related specs filed in the same arc:

- `context-v/prompts/Helpful-Links-on-Records-Captured-During-Triage.md`
  — the spec the helpful_links work in this commit implements (plus
  the cross-derivation-chain hoist deferred to the next-canonical-set
  pass).

The next-session pickup notes are at
`context-v/reminders/Pickup-Enhanced-Records-List-Build.md` — points at
the spec, summarises this round's state, and queues the concrete first
step (the `record_uuid` plumbing + one-shot backfill script against the
live ~96 + ~232-row state).

## The end state

The user finished the round having triaged all 96 records (62 `good`,
34 `needs-human`), captured helpful links on the unclear ones, and
shipped the next-round spec. The walking skeleton's pre-flight + post-
flight loop is now genuinely usable — not just typechecked. Tomorrow
opens on the checkpoint surface.

## See also

- [[2026-05-22_03_Review-UIs-Live]] — yesterday's "the code typechecks"
  shipped state; this round is what happened when it met real data
- [[Enhanced-Records-List-and-Promotion-Checkpoint]] — the spec this
  round queued up
- [[Helpful-Links-on-Records-Captured-During-Triage]] — the spec the
  helpful_links work in this commit implements
- [[Pickup-Enhanced-Records-List-Build]] — next-session pickup
