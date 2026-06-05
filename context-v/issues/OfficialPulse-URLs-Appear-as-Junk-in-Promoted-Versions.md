---
title: "OfficialPulse URLs Appear as Junk in Promoted Versions — operator believes promote v6 → v7 → v8 wrote bad data into the array column; audit shows promote is clean and v6 itself already contained every URL"
lede: "The operator reports that v7 and v8 of the Master-Pipeline-Tracker carry 'junk' OfficialPulse URLs (news / blog / stories / grants / press indices) that weren't in v6, and proposes a recovery of (a) hand-fixing the v6 → v7 export, (b) deleting v8, (c) hardening the next promote so it doesn't recur. The audit inverts that framing: v5, v6, v7, and v8 all carry IDENTICAL `official_updates_index_urls` arrays — 122 URLs across 57 rows, zero per-row diffs across any consecutive pair. The promote is doing exactly what the 'All data continues' invariant from [[Original-and-Enhanced-Record-Instances]] requires. What the operator is *seeing* for the first time is the JSON content of an array column that used to render as a blank box in Record Collector — today's `apps/record-collector/src/logic/format.ts` formatter surfaced it. The operator's claim 'I had approved the proper links' is consistent with the pick-path code (`RecordRow.svelte:63 pick()` appends one URL at a time, no silent bulk-write), but multiple records-surface sessions accumulated to 122 URLs and the cumulative result is what's now legible. The real gap is a curation surface — Record Collector's structured-value branch is read-only; there is no per-URL remove affordance anywhere in the UI that operates on the canonical column. This issue closes the data question and reframes the next step as adding that affordance, plus a pre-promote audit step in PromoteBar."
date_created: 2026-06-05
date_modified: 2026-06-05
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
semantic_version: 0.0.0.1
revisions:
  - 2026-06-05 — Initial draft (0.0.0.1). Audit run end-to-end before write. Headline finding inverts the reported framing: promote is clean, v6 already had every URL, the renderer fix surfaced it. Recovery + prevention recommendations attached.
tags:
  - Issue
  - Augment-It
  - OfficialPulse
  - Promote
  - Record-Set-Versioning
  - URL-Curation
  - Records-Surface
  - Record-Collector
status: Open · Audit Complete · Awaiting Curation Affordance
---

# OfficialPulse URLs Appear as Junk in Promoted Versions

## Reported observation

The operator was running per-record connector fires in
`apps/records-surface` against v6 of the Master-Pipeline-Tracker,
accepting OfficialPulse-shaped URLs (news / blog / stories / grants /
press / publications / newsroom paths) one record at a time. After two
promotion rounds (v6 → v7, then accidentally v7 → v8 the same day),
the operator opened the now-active v8 in Record Collector — newly
able to see the array contents thanks to today's
`apps/record-collector/src/logic/format.ts` generic field renderer —
and read the accepted-URL array as containing junk that hadn't been
there in v6.

The operator's proposed recovery, verbatim:

> We both need to fix the export from v6 to v7 by hand, probably
> remove v8 by hand, and then we need to make sure that upon the
> next promotion that does not happen.

The operator also clarified: "I had approved the proper links."

## Audit methodology

Ran `docker compose exec row-store cat /data/rows.json` and walked
the four generations (v5 → v6 → v7 → v8) via the
`record_uuid` field, which carries through every promotion per
[[Enhanced-Records-List-and-Promotion-Checkpoint]] §4.

Per generation:

| set | cols | URL-rows | total URLs | helpful_link rows |
|---|---|---|---|---|
| v5 | 28 | 57 / 96 | **122** | 28 |
| v6 | 30 | 57 / 96 | **122** | 28 |
| v7 | 30 | 57 / 96 | **122** | 28 |
| v8 | 30 | 57 / 96 | **122** | 28 |

Then a per-row `record_uuid`-matched diff of
`official_updates_index_urls` between every consecutive pair:

- v6 → v7: **0 / 96 rows differ**
- v7 → v8: **0 / 96 rows differ**

Zero. The URL arrays are byte-identical across v6, v7, v8 row-for-row.

## What is actually happening

### The promote did NOT add junk

`record_set.promote` (in
`services/row-store/src/store.ts:447`) implements the "All data
continues" invariant — every key present on a row's `fields` in the
parent or any derived set is carried forward into the new canonical
set. The audit confirms it ran clean: nothing was *added* between v6
and v7, or between v7 and v8.

The mental model "promote wrote junk into the array" is incorrect for
this corpus. Both v7 and v8 are faithful copies of v6's URL data.

### The renderer fix surfaced what was always there

Until earlier today, Record Collector's per-field renderer in
`apps/record-collector/src/App.svelte:286` short-circuited to an empty
JSON branch (`field-value-json` at 11px muted color) for any value
whose `typeof === 'object'`. Arrays and objects rendered as
near-invisible blank boxes. The fix shipped in commit `2004770`
(`generic field rendering, split Augment-this-Set …`) replaced that
with the new `formatFieldValue` formatter and a readable 12px
non-muted style, plus a `(empty)` placeholder for null/empty cases.

The effect on this corpus: the operator opened v8 today and saw the
JSON contents of `official_updates_index_urls` for the first time on
every row that had ever been touched by the records-surface pick
flow. The aggregate of 122 URLs accumulated across **multiple
sessions** of the per-record connector loop. Some of those URLs were
picked weeks ago and forgotten.

### The pick path is single-click-per-URL, not bulk-write

`apps/records-surface/src/components/RecordRow.svelte:63` —
`pick(picked_url)` appends exactly one URL to the array per click and
calls `records.updateRowField(row.row_id, 'official_updates_index_urls', next)`.
There is no silent bulk-write path. No connector-fire response writes
candidates to the row without an explicit click. The operator's
recollection that they "approved the proper links" is consistent with
the code: every URL in the array was clicked through. What's
inconsistent is the cumulative count vs. the operator's mental
inventory of "what I picked this session."

### "Junk" vs "broader-than-expected" matters

A naive path-pattern regex (`/(news|blog|stories|press|grants|publications|newsroom|insights|updates|press-releases|press-room|media|articles)/`) classifies
89 of 122 URLs as on-pattern and 33 as off-pattern. But spot-checking
the "off-pattern" 33 finds many that are legitimately OfficialPulse:

- `schusterman.org/bright-spots/` — Schusterman's stories index
- `schusterman.org/news-and-insights/press-center` — press centre
- `ballmergroup.org/our-grants/` — grant announcements
- `lauderfamilyfund.org/in-the-news/` — news index
- `carnegie.org/our-work/` — work-stream announcements

Only a small minority look genuinely off-target:

- `gatesfoundation.org/ideas/` — could be argued either way
- `gitlabfoundation.org/cases-for-support` — fundraising pitch, not updates
- `hearstfdn.org/grant-recipients-database` — directory, not index
- `betterathjenfoundation.org/grant-recipients/` — directory

So "junk" overstates the problem. There's a small curation tail. The
real issue is the operator has no tool to fix that tail.

## What is actually wrong (still)

### The curation gap

Record Collector's structured-value branch (the `field-value-json`
DIV) is **read-only by design** —
`apps/record-collector/src/App.svelte:296` —
"Inline editing of JSON in a contenteditable is a data-loss vector."
That decision is correct for JSON-in-textarea editing. But it leaves
the operator with no UI affordance to remove a single URL from a
`URL[]` column in Record Collector.

Records Surface DOES have a remove-per-URL affordance —
`RecordRow.svelte:76 remove(url)` — but it operates per-row in the
active record set, not as a "show me everything I've ever accepted,
let me prune" surface. The audit-and-prune view doesn't exist
anywhere.

### The pre-promote audit gap

`apps/records-surface/src/components/PromoteBar.svelte` shows a count
("N rows with accepted URLs, M total URLs") but not a list. The
operator presses the button with no idea whether the cumulative
inventory matches their intent. A pre-promote "review what's about to
be saved" step would catch the
"I-picked-more-than-I-realized-across-sessions" pattern this issue
exemplifies.

## Recovery — what actually closes this issue

### Don't delete v7 / v8

They are clean snapshots of v6 with zero diffs in the URL column. The
variant family already groups them. Deleting them loses the dates and
gains nothing — the curation problem lives at the source (v6's URL
acceptance set), not in the promotions of it.

### Curate the URLs on v8 in place

Two options:

**Option A — Add a remove affordance in Record Collector** (best for
operator agency; ships the underlying capability we'll want anyway).
Add per-entry `×` buttons on each item of an array field in the
structured-value branch. Wire them to `row.update` with the filtered
array. Spec the change as a small addendum to
[[Flow-for-Bundles-Packs]] §"Record Collector" so the surface gains
audit-and-prune semantics.

**Option B — Curate via a one-shot script** (fastest for THIS
corpus). Write a small Node script that reads v8's
`official_updates_index_urls` row-by-row, presents each URL with the
entity name, prompts y/n, and writes the kept array back via
`row.update`. Reusable but feels like a Band-Aid; Option A produces a
durable surface.

Recommendation: **Option A**, because the next-time-this-happens
prevention requires the surface anyway. Build it once.

### After curating v8, **do not** re-promote yet

Promoting v8 → v9 right now would just snapshot the curated array
into a new set with no semantic gain. Hold the v9 promote until the
prevention work below lands, so v9 represents "first generation with
the audit step."

## Prevention — what should change before the next promote

### 1. Per-URL remove affordance in Record Collector

Per [Option A](#option-a--add-a-remove-affordance-in-record-collector).
Files: `apps/record-collector/src/App.svelte` (structured branch),
`apps/record-collector/src/app.css` (per-entry button style),
small helper in `apps/record-collector/src/logic/format.ts`
(detect array shape; expose per-entry render).

### 2. Pre-promote review step in PromoteBar

`apps/records-surface/src/components/PromoteBar.svelte` should expand
the confirm step from "promote N rows · M URLs?" to a scrollable
inline list grouped by entity, with a per-URL `×` to drop before the
fire. Re-fires the same `record_set.promote` underneath; the only
new thing is the friction.

### 3. Pick-time path-pattern hint in Records Surface

When the operator clicks `pick(url)` and the URL's path doesn't match
the OfficialPulse pattern, surface a small inline warning ("This
doesn't look like a news / blog / stories index — accept anyway?")
with Accept / Cancel. Suggestion-only, not blocking — same posture as
the variant-family suggestion from
[[Record-Set-Family-Grouping]]. Implementation lives in
`RecordRow.svelte:63 pick()`.

The three together close the loop: prevention at pick time, audit
before promote, prune after the fact.

## See also

- [[Augment-Transformations-Not-Reliably-Persisting]] —
  precedent for an issue where the user's "data disappeared" framing
  inverted into "renderer was hiding it." Same shape; same lesson.
- [[Original-and-Enhanced-Record-Instances]] §"All data continues"
  — the invariant that makes promote NOT a curation surface. Once
  data lands in `row.fields`, promote will carry it forward; curation
  must happen *before* promote, not *during* it.
- [[Flow-for-Bundles-Packs]] §"The connectors" — the records-surface
  pick flow this issue's prevention plan extends.
- [[Enhanced-Records-List-and-Promotion-Checkpoint]] §4 —
  `record_uuid` carries identity across promotes; used by this
  issue's audit methodology to do row-for-row diffs across versions.
- [[Record-Set-Family-Grouping]] — the spec that produced the
  suggestion-prompt pattern recommended for §Prevention #3.
