---
title: "First-Pass Corpus Quality Scan for reach-edu — a measured before/after baseline of the RAG corpus"
lede: >-
  A read-only baseline of 517 markdown files across 57 funder dirs, taken before RAG is wired, so 'after' has a 'before' to compare to.
date_created: 2026-06-18
date_modified: 2026-06-18
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.8 (1M context)
semantic_version: 0.0.0.2
status: Draft
tags:
  - Plan
  - Augment-It
  - Corpus
  - RAG
  - Quality-Baseline
  - reach-edu
  - Diagnostic
  - Before-After
site_uuid: 9c64800e-fbdf-43e2-805a-8f464e7d194b
hex_code: svunxl
date_authored_initial_draft: 2026-06-18
date_authored_current_draft: 2026-06-18
publish: true
---

# First-Pass Corpus Quality Scan for reach-edu

> **For the executing Claude Code session:** this is a **read-only diagnostic**. Do NOT edit corpus files, write to SurrealDB, fetch URLs, or build the RAG index. Your only output is a baseline report written under `clients/reach-edu/corpus-quality/`. The point is to measure quality *now* so the same scan re-run *after* the corpus + RAG work shows the delta.

## Why this plan exists

The reach-edu corpus is about to become the **grounding source** for two things: the funder-fit RAG/KAG cycle and the reach-edu deck (slides grounded in cited evidence). Before investing in retrieval and grounding, the operator wants to **see corpus quality before and after** — a measured baseline, not a vibe. This session produces that baseline: an honest, quantified picture of what the 517 files actually are, where the gaps and junk live, and a per-funder quality read — written so it can be re-run later and diffed.

Read these three explorations first for the *why* and the quality dimensions (they define the model this scan measures against):
- `context-v/explorations/Funder-Fit-Engine-Org-Corpora-and-the-Story-Unlock-Cycle.md` — Problem A (filesystem↔DB convergence/sync, the Venn), Problem B (corpus-class: publisher/thin/private/noise), first-party vs third-party.
- `context-v/explorations/Best-Way-to-RAG-Over-the-Corpus.md` — what retrieval needs from the corpus (metadata facets, chunk identity, freshness).
- `context-v/explorations/The-Moat-Is-Grounded-Deliverable-Production-Not-Chat.md` — the corpus grounds the deck; citations must trace back to source, so citation-readiness is a quality metric.

## What's there right now (validated 2026-06-18 — confirm, don't trust)

- Path: `clients/reach-edu/corpus/` — **58 dirs** (57 funder/org slugs + `inbox/`), **517 `.md` files**.
- `inbox/` holds **140 files** — the **single largest bucket, and likely holds more research than any funder dir** (unfiled, not lesser). There's some junk (`*_access-denied.md`), but treat it as a **primary content source**, not a cleanup queue.
- Heaviest funders: arthur-blank-foundation (22), jff (15), upmobility-foundation-urban-institute (14), arnold-ventures (14), annie-e-casey (14), stand-together-trust (13), charles-koch-foundation (12), walton-family-foundation (11).
- Per-file frontmatter (varies): `title`, `exact_url`, `fetched_at`, `published_at` *(present on some, not all)*, `record_id`, `record_uuid`, `response_id`, `client_id`, `funder_slug`, `pack_id`, `tags`, `extra_metadata.{jina_status, content_length_bytes}`. **No `org_slug` / SurrealDB link yet** (the convergence gap).
- ~5 files with `jina_status != 200` (failed fetches).
- The pipeline funder list is `clients/reach-edu/inputs/2026-06-10_Master-Pipeline-Tracker--Active-Pipeline_v10.csv` (~100 funders) — the coverage denominator.

## Scope

**In:** read-only scan of `clients/reach-edu/corpus/**`; cross-reference the inputs CSV for coverage; produce a baseline report + machine-diffable metrics.

**Out (do none of these):** editing/deleting/moving corpus files; writing to SurrealDB; fetching any URL; building embeddings or a vector index; triaging the inbox; the reconcile pass. Those are *later* plans — this one only measures and recommends.

## The metrics to compute (define them now so before/after diffs cleanly)

Compute these by parsing frontmatter + bodies with a script (node/python/bash — your choice; read-only). Report each **overall** and **per-funder-dir**. Treat `inbox/` as a **first-class content bucket, not a sidecar** — it's the largest single pile and probably the richest (see metric 9); give it the same scrutiny as the richest funder.

1. **Inventory** — file count, total content bytes, `fetched_at` and `published_at` date ranges.
2. **Metadata completeness** — % of files with each of: `exact_url`, `published_at`, `record_uuid`, non-empty `tags`, `jina_status == "200"`, `content_length_bytes`.
3. **Citation-readiness** — % of files that could emit a `reach-edu-hub` `Sources.astro` `Citation` (needs at minimum `title` + `exact_url`; bonus `published_at` for the date). This is the moat metric — ungrounded files can't be cited in the deck.
4. **Coverage / the Venn** — of the ~100 funders in the inputs CSV, how many have a corpus dir, how many have none; which corpus dirs have **no** matching CSV funder (orphans). (Read-only report of the Venn; do not reconcile.)
5. **Depth + corpus-class pre-score** — per funder, suggest `publisher | thin | private | noise` from signals: file count, total content length, recency, presence of a datable stream. **Suggestion only** — flag it as needing operator confirmation (web-research isn't auto-accept; the operator drives classification).
6. **Freshness** — `published_at` distribution; share older than 12/24 months; share with no date at all.
7. **First-party vs third-party** — derive each file's `exact_url` domain; compare to the funder's own domain (best-effort). Report the first-party / third-party / unknown split. (Both matter — third-party is not second-class — but the *mix* is a quality signal.)
8. **Junk / integrity** — count: `jina_status != 200`; near-empty bodies (e.g. body < ~500 chars after frontmatter); likely duplicates (same `exact_url` across ≥2 files); PDFs stored as binaries with thin extracted text (`binary_asset` present + tiny body).
9. **Inbox as a primary research store (NOT just "debt")** — `inbox/` (140 files) is the largest bucket and likely holds *more research than any funder dir* — unfiled, not lesser. Assess it on equal footing: run metrics 1–8 over it, AND **profile what it covers** — the topics / entities / funders its files relate to (from titles, `exact_url` domains, body skim) — so we know what it could ground and where it might later be attributed. Separately count the genuine junk subset (access-denied / error / near-empty). The deliverable here is *"here's the research sitting in inbox and what it's about,"* not *"here's a cleanup queue."*
10. **Qualitative substance sample** — actually *read* a small sample (≈2–3 files from each of the top ~10 funders, **a generous sample from `inbox/`** since it's the biggest and likely richest bucket, plus a random tail sample). For each, judge: is this **substantive** (real priorities/strategy/grants/research) or **noise** (nav boilerplate, generic PR, cookie/consent text, washed marketing)? Summarize the substantive-vs-noise read per bucket. This is the human-judgment layer the numbers can't capture.

## Output (what to write)

Write to a **visible** folder (not dot-prefixed): `clients/reach-edu/corpus-quality/`.

1. `clients/reach-edu/corpus-quality/2026-06-18_baseline.md` — the human-readable report:
   - One-paragraph headline verdict (is this corpus RAG-ready, mostly-ready, or needs cleanup first?).
   - Overall metrics table.
   - Per-funder table (the metrics above, one row per funder).
   - The Venn (covered / uncovered funders / orphan dirs).
   - Top integrity issues, with example file paths.
   - The qualitative substance read.
   - **Recommended fixes before RAG** — ordered, each tagged to a later plan (reconcile/convergence, inbox triage, dedup, thin-org third-party sourcing, metadata backfill). Do not perform them.
2. `clients/reach-edu/corpus-quality/2026-06-18_metrics.json` (or `.csv`) — the same numbers, machine-readable, so a future re-run diffs numerically. Include a `generated_at` and a `corpus_file_count` so drift is visible.

Keep the report honest and specific (name the worst offenders by path). Length is not a factor — enough to convince + enough to act on.

## The before/after discipline (the operator's actual ask)

This baseline is **"before."** Define "after" as: *re-run this exact scan after the corpus cleanup + RAG grounding lands.* To make that trivial:
- Put the metric-computation in a small committed script (e.g. `scripts/scan-corpus-quality.mjs`) so "after" is one command, not a re-derivation.
- The script writes a new dated report + metrics file into `corpus-quality/`; comparison is a diff of two `*_metrics.json`.
- Headline deltas to watch later: citation-readiness %, metadata-completeness %, junk count, **inbox research surfaced/attributed** (not "inbox emptied" — the goal is using it, not clearing it), publisher-class coverage of the active pipeline.

(Corpus quality is the *input* baseline. A complementary "after" measure — **retrieval quality** — belongs to the RAG build itself: a small JSONL of operator-curated query→expected-source pairs, per `Best-Way-to-RAG-Over-the-Corpus.md` §eval. Note it as a forward pointer; it's not in this plan's scope.)

## Suggested session flow

1. Read the three explorations above (context for the quality model).
2. Confirm the validated numbers (file/dir/inbox counts) against the live tree.
3. Write `scripts/scan-corpus-quality.mjs` (read-only) computing metrics 1–9; run it.
4. Do metric 10 (qualitative sampling) by hand — read real files, write the substance read.
5. Assemble the baseline report + metrics file under `corpus-quality/`.
6. End with the ordered "recommended fixes before RAG," each pointing at the plan that should do it. Stop — do not execute fixes.

## Open questions (surface in the report; don't decide unilaterally)

- corpus-class thresholds (what file-count / recency makes a funder "publisher" vs "thin"?). Pre-score with a stated heuristic; let the operator tune.
- `inbox/` is **in-scope and likely the single richest source** — the question isn't *whether* to include it but *how to attribute/surface* its research (it spans many funders/topics, unfiled). Report what it covers so attribution can happen later; never treat it as junk-by-default.
- First-party domain detection is heuristic (a funder's own domain may differ from its slug). Report confidence; don't overstate.

## See also

- `context-v/explorations/Funder-Fit-Engine-Org-Corpora-and-the-Story-Unlock-Cycle.md` — the quality model (Venn, corpus-class, first/third-party, the filesystem↔DB convergence this scan measures but does not fix).
- `context-v/explorations/Best-Way-to-RAG-Over-the-Corpus.md` — what retrieval needs; the retrieval-quality eval that complements this corpus-quality baseline.
- `context-v/explorations/The-Moat-Is-Grounded-Deliverable-Production-Not-Chat.md` — why citation-readiness is a first-class corpus metric (the deck cites the corpus).
- `context-v/plans/Download-PDFs-into-Corpus-Inbox.md` — the inbox/binary-asset shape the scan will encounter.
- `clients/reach-edu/corpus/` — the target. `clients/reach-edu/inputs/2026-06-10_Master-Pipeline-Tracker--Active-Pipeline_v10.csv` — the coverage denominator.
