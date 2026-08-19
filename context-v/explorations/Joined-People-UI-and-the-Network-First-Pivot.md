---
title: "Joined People UI and the Network-First Pivot — augment-it's sibling-flow to org-first augmentation, and the canonical/proprietary layer split underneath it"
lede: "Org-first and people-first are two pivots on one join — and the split that matters is canonical (shareable) vs proprietary (client-only)."
date_created: 2026-06-15
date_modified: 2026-06-15
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
semantic_version: 0.0.0.3
status: Draft
revisions:
  - 2026-06-15 — Fifth addendum added: storage-substrate question. The filesystem-markdown-yaml-json posture that's carried augment-it so far hits a conceptual (not technical) limit at the canonical/proprietary blend. Surveys Postgres, Mongo, NocoDB/Baserow, JuiceFS, SurrealDB; lands on a hybrid recommendation — real DB for the canonical entity registry, filesystem for proprietary commentary, slug as the join. Repositions the storage-substrate question as a sibling forcing function to [[Per-Client-Privacy-and-the-Path-Off-Local]].
  - 2026-06-15 — Four addendums added after the operator-led discussion: (1) both directions are the same primitive — org→people and people→org are two pivots over the same join, killing the "sibling row store" branch of the open questions; (2) the canonical / proprietary layer split named explicitly, with the canonical pipeline (Crawlbase, LinkedIn DOM extraction) repositioned as feeders to our canonical layer rather than standalone tools; (3) prior-art read on Attio / Affinity / Gong / SalesQL / Crawlbase — what each got right and where each stops being right for consulting-led sub-scale work; (4) sub-scale as differentiator argument — ~30K-entity venture universe is enumerable, curatable, and small enough to be opinionated about, which the big CRMs structurally cannot be.
  - 2026-06-15 — Initial draft. Captures the network-first pivot, the joined-UI three-thing requirement (filter / tag / rank), and an open-questions list (storage scope, tag vocabulary, corpus-type status of the LinkedIn pipeline, table-first vs tag-editor-first slicing).
tags:
  - Exploration
  - Augment-It
  - Network-First
  - Org-People-Join
  - Canonical-Vs-Proprietary
  - CRM-Augmentation
  - LinkedIn
  - Sub-Scale-Domain
  - Venture-Fundraising
  - Storage-Substrate
site_uuid: 57af009e-276e-4607-8909-57ed8797a2f8
hex_code: 8s9gh7
date_authored_initial_draft: 2026-06-15
date_authored_current_draft: 2026-06-15
publish: true
---

# Joined People UI and the Network-First Pivot

The thread of tonight's work — extract row data from LinkedIn profiles, download CV PDFs, slug-rename them, write a manifest that pairs each PDF back to the right person — has been driving toward something larger than "tools for a dinner short list." We've been building, from the operator side, the data substrate for a second kind of augment-it flow: **people-first, not org-first**.

## What augment-it has assumed

The pseudomonorepo's mental model so far has been:

- The operator hands over an organization list (funders, grantees, sponsors, accounts).
- The system iterates, scraping and enriching each org's public surface.
- Outputs are organizational fact tables — the corpus is org-shaped, the chips are org-shaped, the lenses are org-shaped.

That's [[Entity-Profile-Augmentation-Workflow]] working as designed. Reach-Edu's funder lens, humain-vc's sponsor lists — every workspace tonight is org-first.

## What the consulting engagements keep surfacing

Fundraising-assistance work routinely starts somewhere else:

- "We'll be in New York next week — who do you know there?"
- "We were at the AdvisorTech summit and here's the attendee list. Who maps to our top-of-funnel?"
- "Pull together a dinner. Twelve people. LPs you'd want in the room, plus two notable founders."

The starting input in all three is **a list of people**, not a list of organizations. And the people are most often _the operator's own LinkedIn network_, not a public dataset. The augmentation goal isn't "tell me everything about this org" — it's "tell me which of MY people fit X criteria for THIS ask."

That's the pivot. Network-first is a sibling to org-first, not a replacement. Same primitives (chips, lenses, row store), different starting set.

## What we now have on disk for one such network

After tonight: ~250 enriched profile rows in `<workspace>/inputs/*.csv` (name, headline, location, current company, current school, about, follower/connection counts, photo URLs). ~200 LinkedIn CV PDFs renamed by vanity slug (`emilygoligoski.pdf`, etc.) so the join key against the CSV's `profile_url` is the filename itself. A `triggered_at` manifest written forward so we never need to `pdftotext`-reconcile again.

That's a queryable, semi-structured personal network. The data already exists; what's missing is a surface to look at it through.

## What the joined UI would need to do

Three things, in order of how often they'd be exercised:

**1. "Here's who we know."** Filter the personal network by location, company, role, school, recency-of-contact, mutual-connection count. Result lands in a table the operator can sort, multi-select, and export. This is the at-rest view — the substrate the other two operate on.

**2. "Tag them for THIS context."** Per-engagement classification. For the dinner, the operator wants to slap `LP`, `VC`, `HNWI`, `Notable-Talent`, `Corporate`, `Service-Provider` onto rows. The critical insight: **tags are not properties of the person — they're properties of how the person fits THIS use case**. Same person could be tagged `LP` for the March dinner and `Notable-Talent` for the May panel, both correct. The tag system has to be cheap-to-create, multi-per-row, contextual to the engagement folder, and persist alongside (not inside) the network row store.

**3. "Rank them on two axes."** _Relevance_ (does this person fit the criteria of this specific gathering?) and _Warmth_ (how close is our relationship?). Both ordinal, both editable by hand, both with sensible auto-priors:
- Relevance can be seeded from tag overlap with the engagement's target set, plus free-text match against the engagement brief.
- Warmth can be seeded from connection-recency proxies (mutuals count, message-thread frequency, last interaction date) but is fundamentally operator-edited because the ground truth lives in the operator's head.

The output for the dinner ask is then: rows where `relevance ≥ X AND warmth ≥ Y`, sorted by an operator-tuned weighting. With an export to whatever invite tool comes next.

## Where this collides with augment-it's current frame

The chip/lens vocabulary visible in [[Bolt-Record-Collector-Analysis]] and [[Bolt-Highlight-Collector-Analysis]] is org-shaped: a lens is "funder-content," a chip is "publication." For people-first flows the equivalent vocabulary needs to land — lens = "personal-network" maybe? — without renaming the existing org-side abstractions. The discipline of letting context-v evolve in prose says: live with the term collision, let the new sense earn its place through use, surface the evolution in this kind of doc rather than refactoring the lexicon.

[[Per-Client-Privacy-and-the-Path-Off-Local]] is load-bearing here. A consultant's personal LinkedIn network is _their_ data, possibly sensitive, almost certainly shared selectively per engagement. The joined UI cannot treat the network as a tenant-level asset the way we treat org records. Network rows belong to the **operator-user**; then get _surfaced into_ an engagement workspace with a curated subset and engagement-specific tags applied. This argues for two storage scopes that haven't been distinguished yet — operator-private (the network), and engagement-shared (the tags/rankings applied for one specific ask) — which is a real architectural decision and not just a UI question.

[[Operator-Built-Flows-Beyond-The-Universal-Pipeline]] anticipates exactly this. Operators want to build their own classification and ranking flows on top of common primitives. The dinner-prep flow doesn't belong in the universal pipeline; it should be _easy to assemble_ from primitives the universal pipeline produces. The joined UI is one such assembly, expressed for a recurring shape of ask.

## Open questions worth a spec when we're ready

- Does the network live in the same row store as org-first records, with a `kind: person` discriminator, or in a sibling store? (Lean: same store — the chip vocabulary already mostly applies, and joins across both kinds are exactly what the operator wants when "who do you know at <org>?" comes up.)
- Tags as a free-text field, or as a controlled vocabulary per engagement folder? (Probably free-text with autocomplete from previous engagement tag usage — the controlled-vocabulary instinct will be wrong here because each engagement invents its own categories.)
- Is the LinkedIn extraction-then-PDF-then-manifest pipeline a first-class corpus type, or is it the operator's job to convert it into row-store-shape before the UI sees it? (Tonight's tooling argues for first-class — what we produced is structured, sluggable, joinable; the conversion would be the same code every time.)
- For the dinner specifically: do we ship the table view first, or the tag editor first? The table view sells the product; the tag editor is what unlocks the actual workflow. There's a temptation to do both as one slice. The temptation should be resisted.

## Addendum — both directions are the same primitive

Stating the org-first / people-first pivot as if it were two flows is a useful simplification but ultimately wrong. They are two pivots over the **same join**: an org *is* its people, and a person *is* the orgs they've belonged to. Tonight's NYC list shows this plainly — every contact has a current organization (and usually several past), and every organization that matters for fundraising is identifiable by its key people (the GP at the fund, the founder at the portco, the family member who decides at the SFO).

The right read is: **augment-it is a workspace for navigating the org↔people join, with two starting pivots into it**. "Who do you know in NYC?" enters from the person side; "What's the read on this LP?" enters from the org side. The data underneath is one bidirectional graph. The UI treats the two pivots as siblings, not as modes.

The implication for the row-store question raised in the open-questions section above: yes, one store with a `kind` discriminator (`person` | `org` | `person_org_role` for the join), not a sibling store. Person rows carry refs to their current and past org rows; org rows surface their people via reverse lookup. This matches the shape that's already implicit in tonight's CSV — every row has a `current_company` field that *should* be a foreign key to a real org row instead of a free-text string. We won't get there in one slice, but the data can start carrying that intent now.

## Addendum — the canonical / proprietary layer split

The CRM-shaped tools the consulting practice has bumped into — Affinity, Attio, Gong, SalesQL, Crawlbase, Apollo — have all converged on a structural distinction worth naming explicitly: **there is a canonical layer that describes the world, and a proprietary layer that describes the client's view of the world**.

The **canonical layer** is reality at a point in time: this person's LinkedIn URL, current title, last three roles, school, X handle, GitHub. This org's website, founding year, funding history, parent corp. It is provider-neutral, factual, and can in principle be shared across clients without leaking anything confidential. It is also exactly what tonight's Crawlbase pulls and LinkedIn-DOM extraction produces — that pipeline is a canonical-layer pipeline whether we've called it that or not.

The **proprietary layer** is *this client's commentary*: who introduced us, what was discussed at the dinner, why this LP is "soft yes," whether this person is tagged `Notable-Talent` for the May panel and `LP` for the July fundraise. It is rich, free-form, longitudinal, and absolutely must not cross client boundaries.

What the existing CRM tools have shipped is mostly a database with the proprietary layer on top and a wobbly approach to the canonical layer (Affinity rebuilds it by scraping LinkedIn, Apollo by purchasing, Crawlbase by hosting the scrape itself). What augment-it can build — given the sub-scale advantage discussed below — is a workspace that **respects the split natively**: a canonical reference set that we maintain from sources we control, a proprietary commentary set that lives in the engagement folder, and a join that preserves both layers when either updates. Refreshing the canonical data on a person should NEVER overwrite the operator's note that they're a `soft-yes` from the March meeting; conversely, the operator deciding to tag someone differently shouldn't have to manually re-sync their LinkedIn title.

[[Per-Client-Privacy-and-the-Path-Off-Local]] is exactly this conversation, just framed through the privacy axis. Privacy lives at the proprietary layer; portability and freshness live at the canonical layer. Same split, different motivation.

## Addendum — what the data-API-first CRMs got right (and where they stop being right for us)

There's no point pretending the prior art doesn't exist. A short read on what each one nailed and where the bet fails our shape of work:

- **Attio** — opinionated relational schema as first-class. Records have shape, views are queries, the data model is exposed to operators rather than hidden behind a fixed UI. The miss: bring-your-own-records means the operator is responsible for keeping the canonical layer fresh. We can do better because we control the canonical pipeline end-to-end.
- **Affinity** — relationship-graph-as-canonical-layer. They infer warmth from email + calendar; the proprietary layer is implicit in observed outreach behavior. The miss: only works at scale (enterprise sales pricing, enterprise sales motion), and the "implicit warmth" model presumes the operator's behavior IS the signal, which fails when you know someone without ever having emailed them.
- **Gong** — conversation-intelligence-as-proprietary-layer. Call transcripts become structured commentary, automatically. The miss for us: we're not sales, we don't have transcribed calls, and the metaphors (deal stage, ICP fit, opportunity) don't fit consulting-led fundraising work.
- **SalesQL / prospecting engines** — canonical-only MVP, done right. Give me the email and the title, that's it. The miss: no notion of proprietary commentary at all; it's a lookup tool, not a workspace, and the operator's accumulated knowledge has nowhere to go.
- **Crawlbase** — the canonical-acquisition layer, done as a service. It's not a CRM, it's a scrape API. The implication for us is structural: augment-it is the canonical aggregator from the client's perspective, and Crawlbase is one upstream source feeding our pipeline. Not competitor; supplier.

The cumulative lesson: **nobody has done the canonical/proprietary split cleanly for sub-scale, domain-opinionated, consulting-led use**. CRMs are tools for sales operations; prospecting engines are tools for lookup; scrape APIs are tools for data acquisition. None of them imagine the operator as a consulting analyst who needs to maintain a per-client view of a known small universe and have it stay accurate without losing the commentary that gives it value.

## Addendum — sub-scale is the differentiator

The total addressable record set in venture consulting is small enough to be enumerable. Rough back-of-envelope from the engagements humain-vc and adjacent work has touched:

- **Startups** (the universe the deck library covers): ~8–10K active.
- **VC firms** (the universe LP intros and co-invest conversations work through): ~3–4K active.
- **LPs** (the universe fundraise pitches go to): ~10–15K — family offices, fund-of-funds, pensions, endowments, foundations.
- **Notable-Talent / Founder / Advisor pools**: bounded by the same trees, mostly already on someone's LinkedIn.

That's a domain where **the canonical reference set is finite, knowable, and curatable**. We don't need cloud-scale infrastructure. We don't need a search index that handles a billion records. We need a well-curated registry of roughly 30K entities with provenance, refreshable from the canonical pipeline, joinable to per-engagement proprietary commentary.

The big-CRM platforms can't be opinionated this way because they have to serve every industry. We can. That means specific architectural permissions we should give ourselves:

- **Hard-coded entity shapes** for `organization` type `startup`, `vc`, `lp`, and `person` make sense for us. They don't for Attio, who has to support 50 verticals.
- **The Funder-Content-Corpus rule set** already encodes opinionated extraction shapes for one entity kind. The same instinct, applied across entity types, gives us a domain-shaped data layer that CRMs structurally can't match.
- **Domain-specific tag taxonomies** can ship with the workspace (LP types, fund stages, deal verticals, dinner-role buckets) instead of being free-text-with-autocomplete forever. The tag list from tonight's exercise — `LP / VC / HNWI / Notable-Talent / Corporate / Service-Provider / Founder / Banker / Influencer / Growth-Investor / PE / SFO / CorpDev` — is already an opinionated venture taxonomy; it's not a bad starting registry.
- **Reference-data freshness** can be a sub-daily background job for the whole canonical layer, which Affinity-at-scale could never afford to do per-tenant. At 30K records and ~1KB per scrape result, a full refresh is cheap.

The risk in being opinionated is over-fitting to this quarter's fundraise. The mitigation is the layer split: keep the canonical layer truly factual (not opinionated about *meaning*), and let the proprietary layer carry the engagement-specific opinions. The tag taxonomy is proprietary commentary; the schema "people have current_company refs" is canonical. As long as that boundary holds, opinionated stays a strength rather than a debt.

## Addendum — storage substrate, where the filesystem stops working

augment-it has been carried this far by local markdown, yaml, and json on the filesystem. That posture has been a quiet superpower — a text editor is the IDE, git is the audit log, there are no migrations and no auth surface, every file is individually inspectable. Most of the funder corpus, the deck library, the changelog system, and tonight's tagged-network-briefing render workflow all live on that substrate, and the substrate has worked.

The limit we keep hitting isn't technical. Disk space, file count, even concurrent operator access are not the bottleneck. The limit is **conceptual: blending a universal canonical entity with this client's local notes**. A LinkedIn profile (refreshed nightly from the canonical pipeline) and the proprietary commentary attached to her ("met at SOSV '24, soft yes on the Series A, intro via Jane") want to live together in the operator's view — but they have different update cadences, different ownership, different visibility rules. The filesystem forces us into a choice neither side wants:

- **Co-locate them in one markdown file** (canonical fields in frontmatter, proprietary notes in the body): elegant to read, ergonomic to author, but the canonical part needs nightly machine updates and the proprietary part is human-edited prose. Git conflicts every refresh, and the merge story is hard to teach an operator who's mid-engagement.
- **Split them across two files** joined by a slug: cleaner separation, but now you've got a relational problem with no relations. The join lives in the operator's brain and in fragile glob patterns.

A short survey of the substrates that actually model the split, with what each costs us:

- **Postgres** — the classical answer. Canonical and proprietary as separate tables, foreign key on `person_id` / `org_id`, joins are first-class, transactions are real. The cost: operators don't think in SQL, the on-disk format is opaque without a UI on top, migrations are a real exercise. But it's the *boring* choice, which at our scale is usually the right one.
- **MongoDB** — one document per entity, sub-fields for canonical vs proprietary. Schema evolves freely without migrations. The cost: no joins, you re-invent foreign keys with refs and application-side resolution, and the markdown-readability we love disappears below a binary store.
- **NocoDB / Baserow** — Airtable-likes that put a sheet UI on top of Postgres or MySQL. This is probably the closest match for how the operator currently works — tonight's hand-tagging session in Numbers wasn't an accident; sheets are the right tactile UI for engagement-specific curation. The cost: vendor roadmap dependency (these are real products with real opinionated UIs), and the markdown editing flow we built the rest of the system around disappears below the sheet.
- **JuiceFS** — POSIX-over-object-storage. Keep the filesystem-as-substrate but make it cloud-backed and concurrently accessible across machines and operators. The cost: it solves NONE of the conceptual blending problem — same files, just stored differently. It's an answer to [[Per-Client-Privacy-and-the-Path-Off-Local]]'s portability question, not to this exploration's schema question. Useful, but not for here.
- **SurrealDB** — multi-modal (relational + document + graph in one engine). Canonical entity as a record, proprietary commentary as documents attached to it, graph edges for the org↔people join discussed in addendum 1. Closest to the architectural intent of this exploration. The cost: youngest of the lot, the least battle-tested, and "multi-modal" is exactly the kind of structurally-pleasing pitch that tends to bring its own debt — three half-good models in one engine vs. one boring model done right elsewhere.

The right move for augment-it at this scale and tempo is probably **not "pick a substrate and migrate everything."** It's a hybrid that picks the right tool for each layer:

1. **Keep the filesystem at the operator-facing surface.** Markdown for narrative, yaml for hand-edited structure, json for machine output. Tonight's briefing render workflow is a good case in point — the source markdown is editable in Numbers, the output is renderable to HTML and PDF, the whole thing is git-tracked. The filesystem isn't broken at this layer; replacing it would lose more than it gains.
2. **Introduce a proper-DB layer ONLY for the canonical entity registry.** The ~30K-record knowable universe from the previous addendum. This is the data that has refresh cadence, foreign-key joins to other entities, and needs to be queryable across engagements. Postgres is the boring choice; SurrealDB is the speculative one. Default to boring unless the graph/multi-modal story actively earns the complexity.
3. **Proprietary commentary stays in the engagement-folder filesystem.** Markdown per person, frontmatter for structured tags / relevance / warmth scores, joined to the canonical layer by slug. Same tactile feel as tonight's Numbers session, same git auditability, same human-readable diff history.

That positions the storage-substrate question alongside [[Per-Client-Privacy-and-the-Path-Off-Local]] — both routes into the same architectural decision, just framed through different forcing functions (privacy there, schema rigor here). The canonical-layer DB is also the surface where the "off local" move from [[Per-Client-Privacy-and-the-Path-Off-Local]] would land first; the proprietary-layer filesystem can stay local-per-operator for longer than the canonical layer can. Two halves of the same migration, with different urgencies.

The honest read: **we don't need to commit to a substrate this week**. We need to commit to the *shape* — canonical in a DB, proprietary on the filesystem, slug as join — so the work tonight (which is already producing slug-keyed records) compounds correctly. The substrate selection is a follow-on spec, decided when refresh cadence or cross-engagement querying first creates real pain.

## See also

- [[LinkedIn-Network-Explorer-For-Curated-Invites]] — original framing of tonight's tooling, before we had hands on the data.
- [[Entity-Profile-Augmentation-Workflow]] — the org-first sibling this exploration positions against — and now reframes as a sibling-pivot, not a sibling-flow.
- [[Operator-Built-Flows-Beyond-The-Universal-Pipeline]] — the assembly-from-primitives ethic that makes both pivots natural rather than special cases.
- [[Per-Client-Privacy-and-the-Path-Off-Local]] — privacy-axis framing of the canonical/proprietary split; the same architectural decision wearing different clothes.
- [[Inbox-Sort-by-Agent-Tasks]] — adjacent in spirit (operator-curated triage layer on top of structured data) and worth re-reading once this exploration matures into a spec.
- [[Funder-Content-Corpus]] — already an opinionated canonical-layer shape for one entity kind; the model worth extending.

This is the cluster moment. Next move is probably a spec that picks two or three of the open questions above — most pressingly, the storage-scope split between canonical and proprietary — and forces an answer. Then a thin slice of UI that proves the data shape works for the dinner before it tries to generalize.
