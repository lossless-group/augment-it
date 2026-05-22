---
title: "Original and Enhanced Record Instances — the Record-Instance Model"
lede: "augment-it does not mutate an uploaded record set, and it does not spawn a new derived set per prompt run. It keeps an immutable original import and a single mutable enhanced instance that accumulates every enrichment in a round. The user can promote an enhanced instance to be the source of the next round, so the model is generational — original → enhanced → promote → enhanced' — with an id-map that holds across every generation so the eventual write-back into the system of record always knows its target. Two classes of enhancement — lookup and judgment — flow through this model very differently."
date_created: 2026-05-21
date_modified: 2026-05-21
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
semantic_version: 0.0.0.1
tags:
  - Blueprint
  - Augment-It
  - Record-Instance-Model
  - Original-And-Enhanced
  - Enhancement-Rounds
  - Id-Mapping
  - Human-In-The-Loop
  - Write-Back
  - Data-Model
status: Draft
---

# Original and Enhanced Record Instances

## What this is

The record-instance model is the spine of augment-it. augment-it's whole job is
to take structured records, enrich them, and return the enrichment to the
system the records came from. This blueprint defines *what a record set is* once
enrichment enters the picture — and it **supersedes** an earlier walking-skeleton
decision (see [§What this supersedes](#what-this-supersedes)).

Co-designed 2026-05-21 in the conversation that produced
[[Build-the-Shell-Tiling-and-Peek-Deck]]; that prompt carries a summary, this
blueprint is the full model.

## The model at a glance

```
   original import        enhanced instance            (promote)
   (immutable)      ──▶    of round 1          ──────────────────┐
   generation 0           generation 1                          │
                          accumulates every                     │
                          run in the round                      ▼
                                                       enhanced instance
                                                       becomes the SOURCE
                                                       of round 2
                                                              │
                                                              ▼
                                                       enhanced instance
                                                       of round 2
                                                       generation 2 …
```

Three nouns: **original import**, **source**, **enhanced instance**. One verb
that makes it generational: **promote**.

## 1. Original import

The record set as uploaded — CSV or XLSX, parsed by the ingest services. It is
**immutable**. Nothing ever writes to it. It is generation 0, the true origin,
and it is never overwritten — not by enrichment, not by promote, not by export.

## 2. Source — a pointer, not a fixed thing

An **enrichment round** runs against a *source*. The source is a pointer:

- Round 1's source is the original import.
- After a promote, a later round's source is a prior enhanced instance.

The source is "what this round of enrichment builds on."

## 3. Enhancement round → enhanced instance

A round takes its source and produces **one enhanced instance**. Every prompt
run in that round — whether a single-record run or a batch run — **accumulates
into that same enhanced instance**: it adds columns, it fills cells. The
enhanced instance is **mutable** and grows over the life of the round.

This is the key break from "one derived set per run." A round may involve a
dozen prompt runs; they all land in one enhanced instance. The enhanced
instance is the round's single accumulating working copy.

The enhanced instance is created **lazily** — on the first enrichment of a
round, not before. A source with no enrichment yet has no enhanced instance.

## 4. Promote — the model is generational and circular

The user can **promote** an enhanced instance: it becomes the **source** of the
next round. The next round's enhancement then builds on top of the last round's
results.

```
original ──▶ enhanced₁ ──promote──▶ enhanced₁ is now source ──▶ enhanced₂ ──▶ …
```

Promote is a deliberate, **click-based** action — a button labelled something
like *"Promote enhanced records"* or *"Update source records."* It should feel
like magic: one click, and the working baseline moves forward a generation.

**Promote never overwrites the original CSV.** The original import stays
immutable forever. Promote only advances which instance is the working source.
An enhanced instance is "an updated enhanced version," never a replacement of
the origin.

**Why the model must allow this now even though the button can wait:** if the
data model hardcodes "exactly one enhanced instance per original, forever,"
then adding promote later is a schema migration. If the model instead says "an
enhanced instance may itself be the source of another enhanced instance,"
promote is a button added whenever, with zero data reshaping. The generational
*capability* is a cheap allowance now and an expensive retrofit later — so it
is part of the model from day one. The promote *button* is a deferrable
feature (see [§Core now vs deferred](#core-now-vs-deferred)).

## 5. id-mapping holds across every generation

Every enhanced row carries a **clear id-map** back to the row it was derived
from. Across generations the chain holds: an `enhanced₂` row maps to its
`enhanced₁` row maps to its `original` row.

This is not bookkeeping for its own sake. It is what makes the **terminal
write-back possible**: when augment-it eventually pushes enriched values back
into the system of record (a CRM, or a database app like Airtable), it must
know *which system-of-record row* each enriched value belongs to. The id-map,
held unbroken from generation N back to the original import, is that knowledge.

## 6. Two classes of enhancement

Enrichments are not uniform. They split by how much human-in-the-loop attention
each result needs — and the two classes move through augment-it very
differently.

### Lookup enhancements

Retrieval of a fact that is simply absent. *"Get each company's website URL."*
*"Get each person's Twitter and LinkedIn handles."* The record set describes
companies but happens not to carry their URLs — so go and fetch them.

Flow: **run across the set → quick human audit → accept → enhanced.** Low
friction. Batch-shaped. Once a human has glanced over the results and they look
right, the enhancement is done.

### Judgment enhancements

Synthesis that requires interpretation. *"Summarize the active grant programs."*
*"Estimate annual giving based on the financial reports."* There is no single
correct string to retrieve; the model produces an interpretation.

Flow: **run → human edits the result, highlights it → often re-run with the
prompt augmented at runtime → repeat, per record.** This is iterative and
record-by-record. It is exactly the use case that
[[Build-the-Shell-Tiling-and-Peek-Deck]]'s **Mode B** (record-collector and
prompt-template-manager co-existing, side by side) exists to serve — so a human
can sit with one record and iterate the prompt against it. Judgment
enhancements are also what will eventually feed the review and distill stages
(response-reviewer, highlight-collector — currently empty stubs).

The class distinction is **load-bearing already**: the tiling prompt commits to
Mode B, and Mode B exists for the judgment class. Whether "class" becomes a
stored field on a prompt template (`lookup | judgment`) is an implementation
question for the prompt-template work — but the distinction is real now.

## What this supersedes

[[Prompt-Template-Manager-Walking-Skeleton]] — Phases 1–3 of which shipped in
changelog `2026-05-21_04` — decided that **every prompt run produces a new
derived record set**, and framed repeated enrichment as a **lineage chain**
(`Tracker.csv` → `…+url` → `…+url+brand-assets`). That was a deliberate
walking-skeleton simplification: "new set per run" is the simplest thing that
demonstrates the loop.

This blueprint replaces that decision:

| Walking-skeleton model | Record-instance model (this blueprint) |
|---|---|
| Every run → a new derived record set | Every run → accumulates into the round's one enhanced instance |
| Repeated enrichment → a lineage chain of sets | Repeated enrichment → one enhanced instance that grows; promote advances a generation |
| `RecordSet.derived_from` names one parent + one prompt | An enhanced instance has a source; per-column provenance records which prompt produced which column |

The walking-skeleton code that creates a derived set per run is not wrong — it
is the v0 of this model. The implementing work folds many-runs-into-one-instance
and the source pointer onto it.

## Core now vs deferred

What the model must carry from the start, and what is a later feature:

**Core now (in the data model):**

- Original import is immutable; enhanced instance is mutable and accumulates.
- A round's many prompt runs land in one enhanced instance.
- The id-map, unbroken back to the original.
- The model *allows* an enhanced instance to be a source — the generational
  capability — even before any promote UI exists.
- The lookup vs judgment distinction is acknowledged (it already drives Mode B).

**Deferred (features, not model):**

- The **promote button** itself — the UI. The model allows it; build the
  button when the iterative flow needs it.
- The **export** surface and the **write-back** into the system of record.
  Export is the nearer step; write-back into a CRM / Airtable is the eventual
  goal. The id-map makes both possible; neither is built yet.
- The **review / distill stages** — request-reviewer, response-reviewer,
  highlight-collector are empty `apps/*` stubs. The judgment class will need
  them; shipping the model does not.
- A stored `class` field on prompt templates — likely useful, not required to
  hold the model.

## Implications for the services

Not a schema — the implementing spec settles that. The shape of the change:

- **row-store** — a record set is either an `original` import or an `enhanced`
  instance. An enhanced instance references its **source** record set (which
  may be an original *or* another enhanced instance — that is the generational
  allowance). Enhanced instances are mutable; originals are not. Rows carry the
  id-map to their source rows.
- **prompt-runner** — a run targets the round's enhanced instance, creating it
  lazily on the first run of a round. `prompt.run` gains the ability to target
  specific rows (a `row_ids` argument, for the single-record case) and writes
  results into the existing enhanced instance rather than minting a new set.
  Column provenance (which prompt produced a column) moves to per-column.
- **record-collector** — shows original vs enhanced, surfaces the id-map
  lineage, and (later) hosts the promote button and the export action.

## Terminal — export and write-back

The point of all of it. Once an enhanced instance is good enough:

1. **Export** the enhanced records — a file, a download. The nearer milestone.
2. **Write-back** — push the enriched values into the system of record the
   records came from: a CRM (HubSpot, Salesforce, Affinity) or a database app
   (Airtable, Notion). The eventual goal; the reason the id-map is
   non-negotiable. *"Information back into the CRM"* is augment-it's whole
   thesis ([[Augment-It-as-CRM-Augmentation-Pipeline]]).

## See also

- [[Build-the-Shell-Tiling-and-Peek-Deck]] — the prompt this model was
  co-designed alongside; Mode B exists for the judgment class.
- [[Prompt-Template-Manager-Walking-Skeleton]] — the plan whose derived-set /
  lineage-chain decision this supersedes.
- [[Augment-It-as-CRM-Augmentation-Pipeline]] — the pipeline framing; export
  and write-back are its final stages.
- [[feedback_augment_it_dynamic_schema]] — enhanced instances grow columns;
  the dynamic-schema discipline still holds.
