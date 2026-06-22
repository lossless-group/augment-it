---
title: "Grilling on the DB Resolver — questions to settle before v0.0.0.2 / v0.0.0.3"
lede: "Before building the next resolver iterations, a hard pass over the open decisions — where the join key lives, whether a slug can be edited without breaking everything, and whether 'opportunities' reopens the CRM-stays-in-Decile call. Answers get folded back into the spec."
date_created: 2026-06-22
date_modified: 2026-06-22
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.8 (1M context)
semantic_version: 0.0.0.1
status: Open
tags:
  - Issue
  - Augment-It
  - Record-DB-Resolver
  - Open-Questions
  - Canonical-Entity-Registry
  - SurrealDB
  - CRM
  - Opportunities
---

# Grilling on the DB Resolver

## Why this exists

The [[Record-DB-Resolver]] spec's iteration roadmap (v0.0.0.2 / v0.0.0.3) plus
two newer ideas (fast navigation, a changes-log view) hide several load-bearing
decisions — and a couple of places where the new asks quietly contradict
decisions already locked in v0.0.0.1. This is the grilling: the sharp questions
to answer **before** building, so we don't ship a join model that can't survive a
rename or a CRM table we said would live in Decile.

Each item carries a **Decision** slot. The operator fleshes these out one by one;
resolved answers get promoted into [[Record-DB-Resolver]] as locked decisions.

---

## v0.0.0.2 — the three asks hide one hard problem: what is the join key?

### 1. Source of truth — CSV vs row-store vs SurrealDB

The spec now says "we're working from a CSV file as represented in state" and "a
new version of the CSV that includes the canonical entity matches." But what was
**built** reads the **row-store** (`row.list`) and writes **SurrealDB** — it never
touches a CSV and (by the v0 decision) doesn't write back to the row at all.

- (a) Is the CSV/row the operator's mutable working copy, SurrealDB the canonical,
  and the "new CSV version" just an **export/snapshot** that reflects matches
  (i.e. the existing `/promote-snapshot` → v11 with a `resolved_org_*` column)? Or
  is the match stamped live onto the row?
- (b) If the match lives in the CSV as a column, **which column** — the slug or the
  immutable id? (This is the whole game; see #2.)

**User Perspective:** The `augment-it` tool is a sequence of processes/operations/features in Microfrontend/Microservice architecture that allows users to work with data and step by step move through sparse or limited data and build a much more robust and complete dataset.

One important concept is "traceability" or "version control" - as more of an analogy now than a concrete implementation from an engineering perspective.  

The journey of the data SHOULD and would USUALLY be from a CSV file or a CRM or Database App connector into the system, then through the augmentation process, and then out to a final destination (CSV, CRM, Database, etc.). HOWEVER, in the interim there are many contextual steps that can help move towards a more "cannonical" and complete data set.  

In addition, rather than this being an abstract product, we are using it to serve clients on real projects. So, building a cannonical data set on the DB can create a lot of value for the client and for us.  

However, the stakeholder/client will still kind of be thinking in the original CSV or table they started with.  The sent output will not be DB access (at first, or usually), but a CSV or similar format, possibly an export back into a CRM or Database App connector.

Thus, making sure that once the DB is being used for cannonical entitites, the match tracking is maintained and can be used to export back to the original format, that's very important.  

I would say if there's a slug change, that should somehow be tracked in the CSV file and the data state, so that when we export back to the original format, we can maintain the connection.

**Decision (distilled from the perspective above — confirm):**

- **Round-trip traceability is the governing principle.** SurrealDB is the
  canonical store, but augment-it is a *pipeline* — data comes in (CSV / CRM /
  connector), gets augmented toward canonical + complete, and goes back out (CSV /
  CRM / connector). The client keeps thinking in their original table, and the
  delivered output is usually that format, not DB access. So **the canonical match
  must round-trip**: it is carried in the row / CSV state and survives export back
  to the origin format.
- **The bond is a stable id, not the slug.** Because the slug is editable (see #2)
  and the client's own name/terminology is preserved, the durable link stamped into
  the row/CSV is the immutable canonical **id** (`resolved_org_id`), with the
  current **slug + canonical name** carried alongside as human-readable,
  re-stampable columns. A slug change refreshes those display columns on the next
  export but never breaks the id bond — that is precisely how "maintain the
  connection" survives a rename. *(This pre-answers contradiction #1 in favor of
  id-as-bond + slug-as-display.)*
- **Where the match lives:** stamped onto the **row** (this resolves v0's deferred
  row write-back) so it's queryable in-state, and surfaced in an **exported CSV
  version** via the existing `/promote-snapshot` mechanism — e.g. v11 carrying
  `resolved_org_id`, `resolved_org_slug`, `resolved_org_name`, while the client's
  original name column is left untouched.

Resolved sub-questions:
- (i) **Export column names — out of scope here.** They belong to a dedicated
  exporter / destination connector, built later. It's fine for the augmented row to
  accumulate many columns (or JSON-style columns) as it gets richer — worst case the
  client ignores what they can't use. What matters is that the operator driving the
  augmentation has step-by-step **traceability + versioning**, not a tidy schema.
- (ii) **Stamp live on match, not only at export.** Prior surfaces materialized only
  at the promote/export step, but for the resolver that risks *losing matches* if the
  operator doesn't finish, or the system goes down mid-session. So each apply writes
  `resolved_org_id` + `resolved_org_slug` **straight onto the row** (row-store, which
  persists to disk immediately) — crash-safe and incremental. Export/promote then
  just materializes the already-stamped state into a CSV version.
  - **Build implication:** `resolver.apply` becomes a *two-write* op — the additive
    canonical write **plus** a `row.update` stamping the bond. This un-defers the v0
    "row write-back" that was previously parked as out-of-scope.

Still open:
- (iii) **Re-import idempotency** — largely follows from (ii): a row that already
  carries `resolved_org_id` lets a re-entering CSV version skip / fast-confirm an
  already-matched record. Exact re-entry UX still TBD.

**Decision:** _#1 LOCKED — round-trip traceability; id-as-bond + slug-as-display;
match stamped live onto the row (apply = canonical write + row.update). Only the
(iii) re-import UX remains._

### 2. "Edit name/slug without losing the match" breaks if the slug is the bond

Today the **slug is the dedup/join key** everywhere: `organizations.slug`,
`content_items.about[].org_slug`, the corpus directory path
`clients/reach-edu/corpus/<funder_slug>/`, and the CSV's `corpus_funder_slug`. The
moment you rename `howard-schulz-foundation` → `schulz-family-foundation`:

- (a) Do the **corpus files on disk** (path + frontmatter `funder_slug`) move and
  re-stamp, or do they orphan and break `surreal-reconcile-corpus`?
- (b) Do `content_items.about[].org_slug` rows get rewritten?
- **Contention: the slug can't be both editable and the join key.** The proposal:
  the immutable SurrealDB **RecordId (uuid v7) is the durable bond**, `slug` is
  demoted to display + an **`aliases[]`** of prior slugs so historical joins still
  resolve. Accept id-as-bond + slug-as-display + aliases, or build a true
  rename-and-migrate cascade? (Very different builds.)
- (c) The bond record↔org is `record_uuid` ↔ `org_id`. Stored **where** — only on
  the row (`resolved_org_id`), only on the org (a reverse edge/observation listing
  its records), or both? The reverse direction is required for v0.0.0.3 ("which
  records point at this org").
- (d) The client keeps "Howard Schulz Foundation" while canonical becomes "The
  Schulz Family Foundation" — so on rename the two names **deliberately diverge**
  and neither overwrites the other. Confirm: create seeds org name from the record;
  thereafter independent, bonded only by id. Show a "canonical: …" chip in the
  record view so the divergence is visible?
- (e) Petty but it's a *slug*: the example is spelled **Schul*t*z** (Howard
  Schultz). Which spelling is canonical? Slugs don't forgive typos.

**User Perspective:** Computing operations should use `resolved_org_slug` as the
slug, falling back to the original `slug`. The original `slug` stays a property in
the CSV, but once `resolved_org_slug` exists, operations pull it — that's the match
in the canonical DB.

**Decision (reconciled with #1's id-as-bond):**

- **Operative-slug rule (locked):** for slug-keyed lookups, use
  `resolved_org_slug ?? slug`. The original client slug (`corpus_funder_slug`) stays
  on the row as a property for traceability; once a resolution exists, operations
  prefer the canonical `resolved_org_slug`.
- **The durable bond stays `resolved_org_id`** (from #1), never the slug.
  `resolved_org_slug` is a *denormalized convenience* (display + slug-keyed joins),
  valid only while it mirrors the org's current slug. The trap: if the operator
  renames the canonical org *again* later, every row's `resolved_org_slug` goes
  stale. So:
  - on a canonical slug rename, **re-stamp `resolved_org_slug` on all bonded rows**
    (fan-out keyed by the immutable `resolved_org_id`), and
  - keep **`organizations.aliases[]`** of prior slugs so artifacts stamped *before*
    a rename — corpus dirs `clients/<client>/corpus/<slug>/`,
    `content_items.about[].org_slug` — still resolve. This is what stops a rename
    from orphaning the corpus.
- (c) **Reverse bond (org → records):** usable today by querying rows where
  `resolved_org_id = X` — no extra structure needed for the resolver itself. A
  SurrealDB-side edge/observation is optional and gets decided when **opportunities**
  (v0.0.0.3) needs graph traversal. _(deferred to v0.0.0.3)_
- (d) **Proposed:** show a "canonical: …" chip in the record view whenever the
  canonical name/slug diverges from the client's original, so the divergence is
  visible (the client keeps their term; the operator sees both).
- (e) **Proposed:** pick the real spelling at match time; because slug is now
  display + re-stampable (not the bond), a typo is fixable via rename without
  breaking anything — `aliases[]` catches the old one.

**Decision:** _#2 LOCKED — operative slug = `resolved_org_slug ?? slug`; id remains
the bond; rename triggers re-stamp + `aliases[]`. (c) reverse-bond structure
deferred to v0.0.0.3; (d)/(e) proposed, awaiting nod._

### 3. "Create a person from a record" — how do we know, and is it person xor org?

- (a) Signal for person-vs-org: a `Type` column, a heuristic on the name, or pure
  operator toggle on the card?
- (b) Candidate search today only queries `organizations`. Persons need their own
  pool (1,059 of them). Unified candidate list across both with an entity-type
  picker?
- (c) The subtle one: "Howard Schultz" (person) and "Schultz Family Foundation"
  (org) can both be implied by one record. Is it ever **both** — create the person
  *and* their foundation joined by an affiliation edge — or strictly one entity per
  record?

**Decision:** _pending_

---

## v0.0.0.3 — "opportunities" reopens a decision we just closed

### 4. This contradicts the CRM-stays-out-of-canonical call

v0.0.0.1 locked: CRM/pipeline columns (Stage, $, Owner, Notes) are **not written**
to canonical because they're reach-edu-private and **Decile is their home**. An
`opportunities` table is *precisely* CRM data.

- (a) Does the opportunities table live in **SurrealDB canonical** (shared across
  clients → leaks reach-edu's pipeline) or is it **client-scoped**? If shared, how
  do you not leak? If client-scoped, that's a different storage shape than the org.
- (b) **Is the opportunities table the home for the CRM columns we deferred?** That
  would resolve the earlier "where do Stage/$/Owner go" question — not on the org,
  but on the opportunity. Is that the intent?
- (c) **Decile already has `pipeline-prospects`** (`decile_list_pipeline_prospects`
  + upsert). Are augment-it "opportunities" a *duplicate* of Decile's pipeline, a
  *working copy that syncs* to Decile, or a *replacement*? If Decile owns the
  pipeline, maybe opportunities push there rather than live in SurrealDB.

**User answer (2026-06-22):** Only **humain-vc** uses Decile. (Confirmed on disk —
the connector + swagger live under `clients/humain-vc/`; reach-edu's pipeline is the
CSV tracker, no Decile.)

**Decision (Decile sub-point — locked):**

- **The contradiction dissolves.** The CRM-out-of-canonical lock protected the
  *shared* `organizations` row from cross-client leak. A **client-scoped**
  opportunities store doesn't leak — it's exactly where client-private CRM data
  belongs. So opportunities are never hung off the shared org, but they *can* live
  in augment-it, client-partitioned.
- **"Opportunities = Decile pipeline-prospects" is dead as a universal model.**
  reach-edu has no Decile, so opportunities **must** live in augment-it
  (client-scoped). **Decile is a per-client *push target* (humain-vc only), not the
  store or the source.** Build augment-it-native; sync to Decile later for clients
  who use it.

**User answer (2026-06-22):** **YES — opportunities outlive a single CSV import.**
SurrealDB is the canonical truth (one DB, client-tagged — no per-client DBs); this
is The Lossless Group's intel across every client we augment. The likely near-term
flow is *another export / DB-app / API pull that ADDs or UPDATEs the existing
canonical DB.* Crucially: **losing an opportunity is the cardinal sin** ("you don't
have the three opportunities we have for Accelerate the Future"); **duplicate
opportunities from different record sets are harmless.** Closing opportunities + a
lifecycle UI may come later.

**Decision (#4 home — LOCKED):** a dedicated **client-scoped `opportunities` table**
in SurrealDB. First-class, persists across imports, accumulates over time, never
hung off the shared org (client-partitioned via a `client` field per
[[Client-Tagging-on-Canonical-Writes]]). Decile stays a humain-vc-only push target.
This makes the reverse bond (org → opportunities — the #2(c) deferral) a native
query on the table.

### 5. What is an opportunity, cardinally?

For `accelerate-the-future`: multiple records, one org, "separate opportunities."

- (a) Is opportunity **1:1 with a record** (every resolved record = one opportunity
  bonded to an org)? If yes, "opportunity" is basically the name for "a record
  bonded to a canonical org" — i.e. the **bond table itself** (`record_uuid →
  org_id` + CRM fields). Is that the model, or can one record hold several
  opportunities / one opportunity span several records?
- (b) When the 2nd `accelerate-the-future` record resolves, the resolver must
  **match the existing org without creating a duplicate** (additive already does
  this) **and** mint a *second* opportunity rather than treating it as a re-run.
  How does the UI distinguish "new opportunity for a known org" from "I already
  resolved this record"?
- (c) `record_subset of type opportunity` — concretely, is `record_subset` a
  row-store concept or a SurrealDB one? What would a *second* subset type be, so
  the abstraction earns itself rather than being speculative generality? (If you
  can't name the second one, hardcode `opportunities` and abstract later.)

**Decision (#5 — LOCKED; ethos: redundancy over normalization, never lose data):**

- (a) **Cardinality:** an opportunity is **1:1 with a source record** (`record_uuid`)
  and **many:1 to the canonical org** (`resolved_org_id`). The three
  accelerate-the-future records → three opportunities, one org. Each opportunity
  carries its provenance — source record set + `source` (which CSV/API import
  produced it) — so "the DC list" / "the June tracker" stay queryable sets.
- (a) **CRM fields live on the opportunity.** This answers the long-open "where do
  the deferred Stage / $ / Owner / Next-Step columns go" — onto the **client-scoped
  opportunity**, never the shared org. The row/CSV keeps its own copy as the
  working/export layer; the redundancy is fine and intended.
- (b) **Default: do NOT force-merge.** Duplicates across imports are harmless and
  must never be silently dropped. Same `record_uuid` re-resolved = **update** the
  existing opportunity; different record, same org = a **new** opportunity.
  Matchmaking-to-merge is optional, best-effort, and a *later* feature — never a
  gate. Losing data is the only failure mode that matters. (Mirrors the
  [[Funder-Fit-Engine-Org-Corpora-and-the-Story-Unlock-Cycle|"each list is its own
  entity; aggregation rides on top"]] principle.)
- (c) **Hardcode `opportunities`** now as its own SCHEMALESS (document-flexible)
  table; do **not** abstract to `record_subset` until a genuine second subset type
  is named. The flexible doc shape absorbs CRM columns that vary across clients and
  imports.

**Residual (small, lean noted):** creation trigger — **auto-mint an opportunity
whenever a record resolves** (lean: yes — each resolved record *is* an opportunity)
vs an explicit operator step. Confirm.

**Decision:** _#5 LOCKED per above; only the auto-mint-on-resolve trigger awaits a
yes/no._

---

## Navigation (proposed v000x) — useful, but pattern it, don't localize it

### 6. Fast nav, ToC scroller, back-to-beginning

The "type `1` where `86/96` is, jump there" + ToC scroller + back-to-beginning is
good. But:

- (a) **person-enrichment has 1,059 records** and needs this far more than the
  resolver's 96. Is fast-nav a **resolver feature or a shared pulse-surface
  affordance**? Building it twice is the smell.
- (b) A raw index jump ("go to 1") is weaker than it sounds — do you want
  **jump-by-name / search** ("type carnegie → jump"), and a ToC that shows
  **resolution status per record** (resolved ✓ / created ＋ / unresolved ○) so you
  can jump straight to the unresolved ones? That turns the ToC into a worklist, not
  just a scrollbar.
- (c) Should position **persist per record-set** (resume where you left off across
  sessions)?
- (d) If you later filter (unresolved-only) or sort by match-confidence, "86/96"
  changes meaning — does jump operate on the **filtered** view or absolute row
  order?

**Decision:** _pending_

---

## Changes-log (proposed v000x) — probably a view, not a new log

### 7. Do you need a new logfile, or a view over provenance you already write?

Every `resolver.apply` already stamps `last_touched_at` / `last_touched_by` /
`source` on the org and `reconciled_at` on `content_items`, and returns the
appended counts.

- (a) Is the "changes log" a **query/view over existing observations +
  content_items** (cheap, already the audit trail), or a separate
  `resolution_events` table / on-disk logfile (because you want **skips, no-ops,
  and the diff** that canonical rows don't record)?
- (b) **Scope** of "what the fuck happened": per curation-session, per record-set,
  per-client, or global timeline?
- (c) An entry = timestamp · record · action (match/create/skip) · org · fields
  appended (counts + the actual URLs) · operator. Is that the shape?
- (d) The tempting trap: a changes-log invites **undo**. Read-only audit, or
  actionable (undo a match / revert an append)? Undo is much harder — additive
  writes, `content_items` refcounts, slug aliases. Push for read-only v1 unless
  there's a concrete "I fat-fingered a match" recovery story.
- (e) Event-sourcing it for free: `resolver.apply` could `nc.publish(
  'resolver.applied', …)` (same pattern as `row.updated` / `corpus.added`); the
  changes-log subscribes/persists. Want that, or write a log row inline?

**Decision:** _pending_

---

## The two contradictions to settle first

These gate the rest — answer these before the numbered items above harden.

1. **Slug is currently a join key AND you want it editable.** Pick:
   immutable-id-as-bond + slug-aliases (recommended), or full rename-migration.
   Everything in v0.0.0.2 hinges on this.
2. **CRM data was exiled to Decile, then an `opportunities` table was proposed.**
   Pick: opportunities live client-scoped in augment-it (and become the home for
   the deferred CRM columns), or opportunities ARE Decile pipeline-prospects and we
   push rather than store.

**Decision:** _pending_

## Related

- [[Record-DB-Resolver]] — the spec these questions feed back into.
- [[Funder-Fit-Engine-Org-Corpora-and-the-Story-Unlock-Cycle]] — the substrate;
  source of the identity/stream/corpus-item model.
- [[Canonical-Entity-Registry-on-SurrealDB-Cloud]] — the `organizations` table and
  immutable-RecordId question.
- [[Client-Tagging-on-Canonical-Writes]] — the client-scoping the opportunities
  question must respect.
- `decile-hub-connector` skill — Decile's `pipeline-prospects`, relevant to #4(c).
