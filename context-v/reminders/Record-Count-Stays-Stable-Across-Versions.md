---
title: "Record Count Stays Stable Across Versions — Augmenting Adds Columns, Never Rows"
lede: "One dataset, one row count, forever — augmenting adds columns, not rows. 231 rows in the store for a 96-record dataset is a symptom."
date_created: 2026-06-02
date_modified: 2026-06-02
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
status: Active · Invariant
tags:
  - Reminder
  - Invariant
  - Augment-It
  - Data-Integrity
  - Record-Set
  - Row-Count
  - Augment-Adds-Columns
site_uuid: ce87c630-3736-4365-8776-548ca82edf31
hex_code: 3oaz84
date_authored_initial_draft: 2026-06-02
date_authored_current_draft: 2026-06-02
publish: true
---

# Record Count Stays Stable Across Versions

## The invariant

**One dataset has one record count. Forever.**

If the user starts with 96 records, every surface — Record Collector,
Records Surface, Response Reviewer, the chat, the splash, every
diagnostic — must show 96 (or some clearly-scoped subset of 96).

The user's mental model is: *I have 96 records, and I'm augmenting them.*

The system's mental model must match.

## Augmenting adds COLUMNS, not rows

When the user fires a connector, fan-out, prompt, agent, or
hand-curation against a record:

- The record gets a new **field** populated, or an existing field updated.
- The field becomes a new **column** on the record set's schema if it
  didn't exist there before.
- The **row count does not change**. Not in the store, not on the
  surface, not in the database.

If a record gets 5 new fields filled in, that's 5 new columns on the
same 96 rows. Not 5 × 96 = 480 new rows.

## What I just observed (the trigger for this reminder)

Audit of the row-store backup at
`.backups/2026-06-02_records-surface-acceptances/rows.json`:

```
total rows in store: 231
user's expected:      96
```

That extra ~135 rows is a problem. Likely causes (per
[[../issues/Augment-Transformations-Not-Reliably-Persisting]]):

- **Version multiplication.** The user has at least v3, v4, v5 of
  their 96-record set. If each version stores its own copy of all 96
  rows in the same row-store namespace, 3 × 96 = 288. Some archived
  → 231. The "store" pretends each version is its own set of rows
  rather than treating "row" as immortal-identity + version-of-fields.
- **Ghost rows from prior sessions** that weren't promoted, archived,
  or cleared.
- **Duplicate-by-identity** that the promote merge missed.

Whatever the cause, **the user does not care.** From the user's seat
the dataset is 96 records. The row-store showing 231 is the system
exposing its own implementation detail at the wrong level of
abstraction.

## What this means for the architecture

Either:

1. **The row-store stops multiplying rows across versions.** A row is
   identified by its identity across versions; versions hold the field
   values, not row duplicates. Adding a column to v5 doesn't clone the
   96 rows from v4; it adds a column to the same 96 row identities.
   Row count stays at 96. Forever.

   OR

2. **Every surface filters to the active record set's row count.**
   Even if the store multiplies internally, no surface displays a
   number larger than the active record set's row count. The store's
   total is an internal accounting concern the UI never surfaces.

Lean: (1) is the right long-term shape (row-as-immortal-identity is
the natural model for augmentation). (2) is the immediate-fix shape
that closes the trust gap without rearchitecting persistence.

## How to apply this rule going forward

When I'm tempted to write code that:

- Counts "rows in the store" and surfaces that number → **don't**.
  Count rows in the active record set instead.
- Stores a fresh copy of all 96 records when the user promotes →
  **don't**. Add a version layer on top of stable row identities.
- Imports a CSV / XLSX as new rows when the user already has the
  same 96 records → **don't**. Match by identity, treat as version
  update, not as ingest.
- Reports diagnostics like "total rows in row-store: N" → **don't**
  surface that to the user without explaining what subset they're
  looking at.

When I see a number that doesn't match the user's expected record
count, that's a bug worth catching before they catch it.

## Related

- [[../issues/Augment-Transformations-Not-Reliably-Persisting]] — the
  data-loss issue this reminder grew out of; promote / version model
  is the load-bearing piece
- [[../specs/Flow-for-Bundles-Packs]] — the new Records Surface
  surface should never show a number other than the active record
  set's row count
- `services/row-store/src/store.ts` — current promote + storage
  implementation; the row-multiplication-across-versions behavior
  lives here if (1) above turns out to be the right fix

## Status

Active invariant. Apply on every Augment-It surface, every
diagnostic, every fix going forward. Discovering a count mismatch is
a bug, not a curiosity.
