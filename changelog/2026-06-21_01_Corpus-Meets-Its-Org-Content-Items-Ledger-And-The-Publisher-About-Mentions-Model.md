---
date_created: 2026-06-21
date_modified: 2026-06-21
title: "The corpus meets its org — a content_items ledger connects 500 fetched files to canonical entities, and a publisher / about / mentions model says how"
lede: "528 markdown files on a laptop and 129 organizations in the cloud database knew nothing about each other. Tonight a reconcile pass joins them: every fetched URL becomes a content_items row that records who published it, who it's about, and (soon) everyone it mentions — 500 rows, zero leakage, idempotent and re-runnable."
publish: true
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.8 (1M context)
files_changed:
  - scripts/surreal-reconcile-corpus.mjs
  - scripts/surreal-define-content-items-schema.mjs
  - context-v/blueprints/Connecting-To-And-Using-SurrealDB.md
  - .env.example
tags:
  - Augment-It
  - SurrealDB
  - Canonical-Layer
  - Content-Items
  - Corpus
  - Funder-Fit
  - Reconciliation
  - Publisher-About-Mentions
  - Reach-Edu
  - KAG
---

# The corpus meets its org

## Why Care?

For weeks augment-it has had two halves of a brain that couldn't talk to each other. On disk: ≈528 markdown files of funder content — blog posts, press releases, articles — pulled from the web into `clients/reach-edu/corpus/`. In SurrealDB: 129 canonical organizations, hand-enriched, with names and domains and link inventories. The files knew a `funder_slug`. The orgs knew a `slug`. Nobody had ever introduced them.

That gap is the thing standing between "we have a pile of text" and "we can reason over a funder's published thinking." You can't do retrieval-augmented anything — let alone the graph-grounded **KAG** the [[Funder-Fit-Engine-Org-Corpora-and-the-Story-Unlock-Cycle|Funder-Fit Engine]] is reaching for — until each piece of content has a clean, addressable connection to the entity it concerns.

Tonight we built that connection: a **`content_items` ledger** where every fetched URL is one row, and that row knows three different things about how it relates to our orgs — **who published it, who it's about, and everyone it mentions.** 500 files reconciled, every one client-tagged `reach-edu`, nothing from any other client touched. It's the unglamorous plumbing that makes everything downstream possible.

## What's New?

- **A `content_items` ledger that mirrors the corpus.** A new `surreal-reconcile-corpus.mjs` walks every corpus file, reads its frontmatter, and upserts one row per unique fetched URL (keyed on `url`, UNIQUE). 498 created + 2 updated, **0 errors**, ~53s.
- **A three-way org relationship model** on `content_items`, because a piece of content relates to an organization in more than one way:
  - **`published_by`** (exactly one) — who put it out, derived from the URL's domain.
  - **`about[]`** (one or many) — the primary subject(s): `{ funder_slug, org_slug }`.
  - **`mentions[]`** (a laundry list) — every organization *or person* named anywhere in it.
- **Safe-by-default tooling.** The reconcile runs **dry-run first** (read-only, reports the overlap) and only writes with `--write`. Both new scripts are idempotent — re-running upgrades the data as resolution improves, never duplicates it.
- **The corpus-to-SurrealDB contract, written down.** A new blueprint, [[Connecting-To-And-Using-SurrealDB]], codifies the connection handshake, the client-tagging write rule, and the env contract — plus `.env.example` now documents the six `SURREAL_*` vars that were previously undocumented.

## How It Works

### Two stores, one Venn diagram

The corpus on disk and the orgs in SurrealDB overlap *partially* — and nobody was keeping them aligned. The reconcile's first job is just to tell the truth about that overlap:

```
   ON DISK (fetches that happened)          IN SURREAL (canonical entities)
   clients/reach-edu/corpus/<slug>/*.md     organizations (slug, domains, org_corpus[])
          │  exact_url, funder_slug                 │
          └──────────────┐         ┌────────────────┘
                         ▼         ▼
                    content_items  (the ledger that joins them)
                      url ── published_by ──► organizations   (domain match)
                          ── about[]  ───────► { funder_slug, org_slug }
                          ── mentions[] ─────► every org / person named
```

Join keys: corpus `exact_url` → `content_items.url`; corpus `funder_slug` → `organizations.slug`; corpus `url_domain` → `organizations.domains[]`.

### Why three relationships, not one

The honest realization that drove the whole model: **`funder_slug` was secretly doing two jobs at once**, and a third was missing entirely.

- A post on `ecmcfoundation.org` about ECMC's own work is **published_by** ECMC and **about** ECMC — the publisher and subject are the same org. That's the first-party, degenerate case.
- A post on one outlet's media that *references* three funders is **published_by** the outlet but **about** those three funders. Publisher ≠ subject, and `about` is plural.
- And either kind might **mention** a dozen more orgs and people in passing — not the subject, but worth knowing for co-occurrence and graph queries later.

So `about` is an **array** of `{ funder_slug, org_slug }` (funder_slug always present, org_slug filled when it resolves to a canonical org), `published_by` is a single record link, and `mentions` is a flexible heterogeneous list that can hold both orgs and people. First-party content is just the case where `published_by` equals the lone `about` entry.

### The reconcile result, honestly

```
content_items total   : 722   (224 prior + 498 new)
on_disk = true        : 500
about[] populated     : 500   (every fetched URL)
about resolved to org :  27
about unresolved      : 473   (funder_slug retained, org_slug null)
publishers resolved   :   0
errors                :   0
```

27 of 500 is not a bug — it's the map of work left to do, and it splits cleanly:

- **Publishers resolved 0** because only **3 of 129 orgs have any `domains[]` populated**. The domain → publisher match is deterministic; it just has almost nothing to match against yet.
- **About resolved 27** because the corpus's `funder_slug` vocabulary (`arthur-blank-foundation`, and buckets like `inbox` with 132 files) drifted from the org `slug` vocabulary (minted separately from DC-event company names).

Crucially, the 473 unresolved rows **still carry their `funder_slug` in `about[]`** — nothing is lost. Because the script is idempotent, re-running it after we populate org domains or build a `funder_slug → org_slug` crosswalk upgrades those rows in place. The ledger gets smarter every pass.

## Under The Hood

### `mentions` is initialized but never clobbered

There's no entity-extraction over corpus text yet, so the reconcile can't *fill* `mentions` — but it sets `mentions = []` **on row creation only, never on update.** That way a future extraction pass (or an operator) can write real mentions into existing rows, and a later reconcile re-run won't wipe them. The field is present and protected, waiting for its data.

### A SurrealDB type gotcha that cost us a run

The first `--write` failed all 500 rows with:

```
Couldn't coerce value for field `published_by_slug`:
Expected `none | string` but found `NULL`
```

The field is typed `option<string>` (i.e. `NONE | string`). But a JavaScript `null` binds as SurrealDB **`NULL`** — which is a distinct value from `NONE`, and not a member of that type. Since zero publishers resolved this pass, every row tried to set `NULL` and got rejected. (Atomic CREATEs, so nothing persisted — the DB stayed clean.) The fix: only set `published_by` / `published_by_slug` **when a publisher actually resolves**, leaving them `NONE` otherwise.

The same `NONE`-vs-`NULL` distinction bites at read time, too. Filtering `WHERE org_slug != NONE` returns *everything*, because the unresolved entries hold `NULL`, and `NULL != NONE` is true. To count genuinely-resolved rows, use:

```surql
WHERE array::len(about[WHERE string::len(org_slug ?? "") > 0]) > 0
```

Worth tattooing on the wall before the next reconcile.

### Every write carries its client

Per the [[Client-Tagging-on-Canonical-Writes|client-tagging spec]], every `content_items` row the reconcile touches gets `client_access = ["reach-edu"]` and the touched-by stamps. The reconcile reads the client from each file's `client_id` frontmatter, falling back to `--client`. No implicit writes, no cross-client leakage — same discipline the rest of the canonical layer follows.

## What's Next

The ledger is the substrate; two data-side unlocks make it sing, and both are pure re-run wins:

1. **Populate org `domains[]`** — likely derivable from each org's existing homepage/links. Flips publisher resolution from 0 toward most-of-500.
2. **A `funder_slug → org_slug` crosswalk** — domain-based matching plus a small hand-alias map for the real funders, with `inbox` / `reach-edu-first-party` explicitly marked "no single org." Flips about resolution well past 27.

After that: an entity-extraction pass to fill `mentions[]`, then the read side — embedding the resolved corpus into a retrieval index and running the bidirectional funder-fit cycle the [[Funder-Fit-Engine-Org-Corpora-and-the-Story-Unlock-Cycle|exploration]] lays out.

## Files Changed

- `scripts/surreal-reconcile-corpus.mjs` — **new.** Phase-0 reconcile: walk corpus → upsert `content_items` → connect to orgs → report the Venn. Dry-run default, `--write` to apply.
- `scripts/surreal-define-content-items-schema.mjs` — **new.** Additive, idempotent schema amendment defining `published_by`, `published_by_slug`, `about`, and `mentions`.
- `context-v/blueprints/Connecting-To-And-Using-SurrealDB.md` — **new.** The connection + write-contract blueprint for the whole SurrealDB layer.
- `.env.example` — documents the six `SURREAL_*` vars (previously undocumented).

## See Also

- [[Funder-Fit-Engine-Org-Corpora-and-the-Story-Unlock-Cycle]] — the exploration this is Phase 0 of; the `published_by` / `about` split is its `from_stream` / `about` edges made concrete.
- [[Connecting-To-And-Using-SurrealDB]] — how anything in augment-it talks to SurrealDB.
- [[2026-06-15_02_SurrealDB-Canonical-Layer-Lands-With-Cross-Client-Visibility]] — the night the canonical layer landed; tonight connects the corpus to it.
- [[JuiceFS-Pinned-Path-Off-Local-Substrate]] — where the corpus filesystem lives (R2 via rclone), orthogonal to this DB-side join.
