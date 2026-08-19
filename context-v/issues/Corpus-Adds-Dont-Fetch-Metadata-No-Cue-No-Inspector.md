---
title: "Corpus adds don't fetch metadata — and the row gives no cue either way, and there's no inspector to see or fix it"
lede: "`organization.corpus.add` writes url, kind, and domain then stops — the Jina metadata fetch never fires, and nothing on the row says so."
date_created: 2026-07-24
date_modified: 2026-07-24
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
semantic_version: 0.0.0.1
tags:
  - Issue
  - Usability
  - Augment-It
  - Corpus
  - Org-Workbench
  - Content-Items
  - Metadata
status: Open · Jotted
site_uuid: 9f6e1135-59b2-4bd3-9dbe-d7bd491d45bc
hex_code: jt03b7
date_authored_initial_draft: 2026-07-24
date_authored_current_draft: 2026-07-24
publish: true
---

# Corpus adds don't fetch metadata; no cue; no inspector

## The answer to the operator's question

**It didn't.** `organization.corpus.add` / `person.corpus.add` →
`findOrCreateContent` writes `url`, `kind`, `url_domain`, and counters to the
`content_items` ledger — full stop. No title, no fetch, no enrichment. This
is the same hole [[Corpus-Items-Not-Visible-On-Person-Cards-Coverage-Hard-To-Assess]]
noted from the read side ("content_items has no title field"); this doc is
the write side of it.

## Three wants (one flow)

1. **Fetch metadata on add — the way we already do it.** The precedent is
   content-ingest's `source.add`: a Jina metadata fetch (title, excerpt,
   authors, publisher, bibliographic fields — `services/content-ingest/src/corpus.ts`,
   the "METADATA-ONLY file" path). Entity corpus adds should ride the same
   machinery: the ➕ (and search-and-add's per-row add) triggers the fetch,
   `content_items` grows the metadata columns (title, authors?,
   published_at?), and every corpus render hydrates from the ledger.
2. **A visual cue on the row.** Fetched → the row shows the title (host+path
   stays the un-fetched fallback per
   [[List-Rows-Show-Hostname-Only-Same-Domain-Entries-Indistinguishable]]);
   un-fetched or failed → a visible mark (badge/dot) that says "bare URL,
   metadata pending/failed". The operator should never have to ask the
   question this issue opens with.
3. **An inspector.** Click a corpus row → see what the ledger holds and
   adjust it: title, kind, date, maybe authors. The in-place patch shipped
   for streams ([[Pulse-Streams-Need-Editable-Kind-And-User-Facing-Names]])
   is the edit precedent; a corpus row wants the same, plus the fetched
   fields. Human adjusts, per [[human-in-drivers-seat]] — Jina's guess is a
   candidate, not truth.

## Machinery notes (jotted)

- `content_items` is SCHEMALESS — adding `title` etc. is free; the work is
  the fetch trigger + hydration reads + the row UI.
- Where does the fetch run? The resolver could call content-ingest over NATS
  at add time (sync — the cue is immediate), or a fire-and-forget that
  patches the ledger after (async — needs the pending/failed cue anyway).
  The failed/pending badge is wanted regardless, so async is viable.
- `organization.detail` / `affiliation.detail` / `organization.affiliations`
  would hydrate title via `content_id` → `content_items` (the join noted in
  the #20 issue).
- Backfill: existing bare corpus entries (all of them, today) want a
  re-fetch pass — same additive discipline as the person-name backfill
  (fill missing metadata, never overwrite operator-adjusted fields).

## Open questions

- [ ] Sync fetch on add (immediate cue, slower ➕) vs async patch (fast ➕,
  needs pending state) — or Jina-on-add with a short timeout and async
  retry?
- [ ] Does the inspector edit `content_items` (shared ledger — edits visible
  to every referencing entity) or the per-entity corpus entry? Probably the
  ledger for metadata, the entry for kind.
- [ ] Does search-and-add's one-click add fire the same fetch (it should —
  same verb underneath)?
