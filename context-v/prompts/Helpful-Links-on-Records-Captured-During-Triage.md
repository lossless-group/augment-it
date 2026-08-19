---
title: "Helpful Links on Records — Captured During Response-Reviewer Triage"
lede: >-
  The adjacent links a human finds while triaging die in the clipboard; `helpful_links` catches them in one click and survives derivations.
date_created: 2026-05-22
date_modified: 2026-05-25
date_completed: 2026-05-22
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
semantic_version: 0.0.0.2
status: Shipped
revisions:
  - 2026-05-25 — Status swept to Shipped; helpful_links landed in commit f1e9a80 per changelog 2026-05-22_04.
tags:
  - Prompt
  - Augment-It
  - Response-Reviewer
  - Row-Store
  - Human-in-the-Loop
  - Data-Model
site_uuid: 574cd0d1-4aa3-4688-bb78-15ca79aa984b
hex_code: 8f7c3z
date_authored_initial_draft: 2026-05-25
date_authored_current_draft: 2026-05-25
publish: true
---

# Helpful Links on Records — Captured During Response-Reviewer Triage

## The scenario that produced this

I am going through each record in Response Reviewer triaging the `url` responses.
For records flagged `needs-human` (or `wrong`, or any case where the model's
output isn't trustworthy), I'm google-searching the prospect myself. Three
outcomes are common:

1. **I find the canonical URL** — I edit the response and Accept → cell. Today
   this is fully covered.
2. **I find that the row refers to an *individual*, not a registered
   philanthropy** — there is no foundation URL to assign. But there's often a
   LinkedIn profile, a board-of-trustees bio at some other org, a press piece,
   or a personal site worth holding onto.
3. **I find adjacent material that the team will want later** — a related
   grantee's page, a relevant program announcement, a venture portfolio entry
   linking back, a research piece I want to read after triage is done.

In cases (2) and (3) the link is **valuable but not the canonical answer to
this prompt**. Today it dies in my clipboard. I want to **attach it to the
record without leaving Response Reviewer** so the next enrichment round, the
next human pass, and any downstream consumer (Dididecks deck-builder, memo
orchestrator, future research agents) can see what I saw.

## What to build

A `helpful_links` array field on every row, mutable from Response Reviewer.

### Data model

- **Storage**: row-store, on the existing `Row.fields` map. The field is named
  `helpful_links` and holds an **array of objects**, not just URLs, because the
  same URL can mean different things in different contexts.

  ```ts
  type HelpfulLink = {
    url: string;              // required, validated as http(s):// at write time
    label?: string;           // human-typed; falls back to og:title or the host
    note?: string;            // free-text "why I saved this"
    source: 'manual'          // captured by the human in Response Reviewer
          | 'distill'         // future: highlight-collector extracts from response_text
          | 'enrichment';     // future: a follow-up prompt produces links as output
    added_by: string;         // session_token slice or user id when shared-auth lands
    added_at: string;         // ISO timestamp
    response_id?: string;     // the response being triaged when this was added (provenance)
  };
  ```

- **Schema**: `helpful_links` is **not** added to `RecordSet.schema.fields` —
  it's a structured side-channel, not a column the user picked. The dynamic-
  schema discipline (see `[[feedback_augment_it_dynamic_schema]]`) says
  schema = CSV headers; this field is universal. Record Collector can opt in
  to rendering a column that shows the count + a popover with the links, but
  the table-column UX is secondary.

- **Persistence**: existing `row.update.requested` capability already accepts
  arbitrary `fields` patches; no new NATS subject needed for the mutate path.
  Add `row.helpful_links.add.requested` and `row.helpful_links.remove.requested`
  as thin sugar that does the array-push/filter server-side to avoid stale-
  state clobbering when two windows are open.

### UX in Response Reviewer

The Response Reviewer card already has a "Context" panel on the left
(`Prompt / Record set / Model / Output column`). Add a section below it,
titled **"Helpful links for this record"**, scoped to the **current row**,
not the current response.

- **Read state**: shows the row's `helpful_links` as a small stacked list.
  Each entry: domain favicon → label (linkified, opens in new tab) → tiny
  note line → remove × on hover.
- **Add affordance**: a single inline form — one text input for the URL,
  one optional input for a note, one button (➕ or "save link"). Pressing
  Enter in the URL field with a valid URL adds it; the label is auto-filled
  from the URL's host until the user types one.
- **Paste shortcut**: paste a URL into the textarea response area while
  Cmd/Ctrl is held → diverts to the helpful-links add input pre-populated.
  Keep this behind an off-by-default setting; risk is muscle-memory pastes
  going somewhere unexpected.
- **Provenance**: when the user adds a link while triaging
  `response_id = X`, save `response_id: X` on the HelpfulLink — this lets a
  later "show the path from prompt to decision" view reconstruct how a link
  got there.

### Cross-record-set behaviour (the gnarly bit)

Today, running a prompt produces a **derived record set** (parent rows + the
new output column). The row_ids in the derived set are NEW — they don't
share identity with the parent. If the user attaches a link while looking
at a row in the derived set, where does it live?

Three options:

1. **Attach to the derived row only** — simplest, but the link is invisible
   in the parent and to future enrichment runs. Probably wrong.
2. **Attach to the parent row** by walking the derivation chain — every
   derived row has `derived_from: { record_set_id }` on its set, and per-row
   provenance can be added. The Response Reviewer always writes to the
   *root* row in the chain. The derived rows derive `helpful_links` at view
   time.
3. **Attach to both, with the derived row taking the parent's links by
   reference at the moment of derivation, then diverging**. Closer to
   spreadsheet "values become independent" semantics but harder to model.

Recommend **#2** — single source of truth at the root row, derived sets
inherit by reference. This pairs with the future record-instance fold
([[Original-and-Enhanced-Record-Instances]]) where one mutable enhanced
instance accumulates state instead of minting a new derived set per run.

## Hooks into adjacent work

- **highlight-collector** (the deferred Distill stage in Response Reviewer)
  becomes the **automated link-extractor**: it reads `response_text`, pulls
  every URL the model cited (web_search puts them in `content`), and proposes
  them as `helpful_links` with `source: 'distill'` for the human to accept
  or reject. The manual capture this prompt describes is the v1; the
  distill-driven capture is v2 of the same surface.
- **Dididecks deck-builder**: rows that have rich `helpful_links` become
  better source material for credibility/team/portfolio slides — the
  `crawl-fetch-ingest` skill's "fill in the people" path can read these as
  "human-validated starting points" instead of crawling from scratch.
- **Record Collector** column UX: when `helpful_links.length > 0`, render
  a small 🔗N pip in the row cell that opens a popover.

## Out of scope for this prompt

- Tagging / categorising links (e.g. "linkedin", "press", "portfolio").
  Use `note` as a free-text catch-all in v1; categories arrive only if
  patterns emerge in the notes.
- Surfacing links from other rows on the current row ("this person also
  appears at row 47"). That's a graph problem and belongs to a future
  ingest enhancement.
- Sharing / exporting the links. Existing row-store JSON dump is the v1
  export. A proper CSV-with-helpful-links export comes later.
- Authentication / per-user link ownership. Until shared-auth lands,
  `added_by` is the session token slice. After shared-auth, it's the user id.

## Acceptance, when this is built

1. In Response Reviewer, every row's helpful_links are visible in the
   Context panel under a "Helpful links for this record" subhead.
2. I can paste a URL, optionally add a note, and hit Enter to attach it —
   the link appears in the list within a tick, and the underlying row in
   row-store reflects the new array.
3. Removing a link from the list removes it from row-store.
4. Closing and reopening Response Reviewer shows the same links.
5. When I re-fire the same prompt against the same record set producing
   a new derived record set, the derived rows show the parent's helpful_links
   (option #2 above).
6. The links carry `response_id` provenance pointing at the response I was
   triaging when I captured them.

## See also

- [[Response-Reviewer-and-Response-Store]] — the surface this lands in
- [[Original-and-Enhanced-Record-Instances]] — the record-instance fold this
  helps motivate
- [[Why-Response-Reviewer-and-Highlight-Collector-Exist]] — the rationale
  for the post-flight review zone; highlight-collector is the v2 auto-feeder
  for `helpful_links`
- [[feedback_augment_it_dynamic_schema]] — why this field is a side-channel,
  not a CSV-header-derived column
