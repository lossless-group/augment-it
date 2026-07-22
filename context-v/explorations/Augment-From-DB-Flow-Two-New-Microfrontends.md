---
title: "Augment from DB — the org-first workbench flow, and the two new microfrontends it needs"
lede: "A new flow that starts from SurrealDB instead of a CSV: pick Organizations, smart-search to one org, see its identity links / socials / pulse streams, reveal its affiliated people, and augment any of it through pluggable search packs (SearXNG default, Firecrawl option, Exa planned) with a one-click add-to-corpus results surface — plus a pulse-stream scanner for LinkedIn walls, Facebook walls, and blogs."
date_created: 2026-07-21
date_modified: 2026-07-21
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
semantic_version: 0.0.0.1
tags:
  - Exploration
  - Augment-It
  - Augment-From-DB
  - Microfrontends
  - SurrealDB-Canonical-Layer
  - Search-Providers
  - Packs-and-Bundles
  - Pulse-Streams
  - Affiliations
  - Corpus-Building
status: Draft
---

# Augment from DB — the org-first workbench flow

## Why care?

Every prior augment-it flow starts from a file: a CSV lands, becomes a RecordSet, and the pipeline fans out from rows. But the canonical layer in SurrealDB has quietly become the richer starting point — hundreds of `organizations` and `persons` rows with links, streams, corpora, and a real affiliation graph between them. [[Augment-From-Affiliations]] proved the inversion works (it was the first shipped flow whose input is the DB, not a CSV), but it enters through *affiliations that already exist*. There is no surface where the operator starts from **an organization**, sees everything the canonical layer knows about it — identity links, social profiles, pulse streams, corpus items, affiliated people — and augments any of it in place, including adding *new* people whose affiliations materialize automatically.

That's this flow. It's also the flow where the search side finally becomes what [[Search-Providers-as-First-Class-SearXNG-Default]] and [[Packs-and-Bundles-Pattern]] have been pointing at: provider-pluggable search packs (SearXNG free default, Firecrawl as an option, Exa as a to-be-built pack) firing behind an **operator-editable search term**, with results landing in a display that adds an item to a corpus in one click.

## The flow, step by step (as requested)

1. **Connect to a DB.** Only option now: SurrealDB with the operator's credentials.
2. **Select tables (objects) to augment from.** Only use case now: `organizations`.
3. **List organizations**, headed by a smart search — autocomplete, but flexible enough to surface *relevant* orgs, not just prefix matches.
4. **Org augment view.** Shows the org's social media, pulse, and identity links, with a reveal for affiliated people (each person's identity, socials, pulse links nested). Every list has a ➕ to add properties/values and corpus items. Search fires through packs: SearXNG default, Firecrawl option, Exa pack to be implemented — pack options for API-based search generally.
5. **Results display UI** with easy one-click add of any result to corpus items.
6. **NEW — add a person from an organization.** Adding key team members; affiliations must be "magically" generated and preserved as state.
7. **NEW — nested people list per org.** From an org's people, drill into each person's identity links, social profiles, pulse content; search and add to them too.
8. **NEW — pulse-stream scanning.** Scan an org's LinkedIn page wall, Facebook page wall, and (most important) blog; spot new relevant content; add individual items to corpora.

**Standing constraint:** every search term is displayed and editable — the operator rewrites variants because intuition about phrasing beats any fixed template.

## What already exists (the encouraging part)

The two background scans (docs + code, 2026-07-21) show most of steps 1–7 has real substrate. The honest summary: **the data model and the verbs exist almost completely; the surfaces are the gap.**

### Data model — nothing new needed

The canonical layer already models exactly what step 4 and 7 display (see [[How-People-Orgs-And-Relationships-Actually-Enter-SurrealDB]], the authoritative account, and the `surrealdb-canonical-layer` skill):

| Concept in this flow | Where it already lives |
|---|---|
| Org identity + social links | `organizations.org_links[]` (`{url, kind, url_domain, added_at}`, kind auto-inferred) |
| Org pulse streams | `organizations.media_streams[]` (blog_index, newsroom, rss, youtube_channel, substack — the recurring *publisher*, per [[Record-DB-Resolver]]) |
| Org corpus items | `organizations.org_corpus[]` → `content_items` ledger (`url` UNIQUE, `published_by`, `about[]`, `mentions[]`) |
| Person identity/socials | `persons.personal_links[]` |
| Person corpus/pulse content | `persons.personal_corpus[]` → `content_items` (people corpus is DB-only by decision — no filesystem dir) |
| Person ↔ org affiliation | `affiliations` RELATE edge — the *only* home of relevance ratings, per [[Augment-From-Affiliations]] |
| Audit trail of every addition | `observations` (append-only; written alongside affiliations by `person.affiliate`) |

The "magic" of step 6 is already a capability: `person.affiliate` (in `services/record-surrealdb-resolver/src/person-resolver.ts`) creates the edge and its paired observation, and is callable N times per person — [[Person-DB-Resolver-Needs-Multiple-Organizations-Per-Person]] confirms the schema supports many affiliations per person; only UI has ever limited it to one. This flow must build the UI *assuming N*, not 1.

### Verbs — the add-buttons already have backends

- `organization.corpus.add`, `person.corpus.add`, `organization.links.add` / `person.links.add` — the ➕ buttons of steps 4 and 7 (`resolver.ts` / `person-resolver.ts`).
- `person.candidates` / `person.search` / `person.apply` / `person.affiliate` / `person.add_observation` — step 6 end to end.
- `source.add` (metadata-only), `source.fetch` (gated full fetch later), `corpus.inbox.add` (capture-first fallback) — the domain-corpus side of one-click add, per the `inbox-curation` skill and `services/workspace/src/chat.ts` `CURATOR_CHAT_VERBS`.
- All ride NATS request/reply (`<noun>.<verb>.requested`) with past-tense broadcasts fanned to browsers over the workspace WebSocket — the new surfaces follow the same contract.

### Search packs — the pluggable axis is built, minus Exa

`services/social-search/src/` already is the provider-pluggable layer this flow wants:

- `registry/` — intent→connector registration (`ConnectorRegistration`, capability tiers, `register-connectors.ts` boots **searxng** (free default), tavily, serpapi, gdelt, google-news-rss).
- `connectors/` — adapters including `searxng.ts` and `firecrawl.ts` (Firecrawl is extract/crawl-focused and deliberately not in the search registry yet — invoked directly from packs).
- `packs.ts` — the common-six social packs (`linkedin-pack`, `x-pack`, `bluesky-pack`, `youtube-pack`, `facebook-pack`, `instagram-pack`) with connector chains and domain whitelists, per [[Common-Six-Social-Packs]] and [[Packs-and-Bundles-Pattern]].
- `entity-pulse/packs/` — `official-blog-pack.ts`, `official-pressrelease-pack.ts`, `official-social-posts-pack.ts` — step 8's scanning logic already exists as fire-and-review packs.

**Exa is a genuine zero** — no code, no env var, no reference anywhere. Implementing it is a clean, small task: an `exa.ts` connector + `EXA_REG` registration following the tavily pattern. That keeps the flow's "pack options" promise a *registry extension*, not a parallel abstraction — the exact discipline [[Search-Providers-as-First-Class-SearXNG-Default]] locked.

SearXNG itself runs in `docker-compose.yml` (port 8080, settings in `services/social-search/searxng/`).

### One correction to the brief

There is **no standalone SearXNG results-display frontend** in this repo. The belief that "we already have one somewhere" is half-right: the closest surfaces are `apps/response-reviewer/` (renders connector results with accept/re-run triage) and `apps/pack-runner/` (`ConnectorPalette.svelte` / `ConnectorChip.svelte` — per-record connector selection before firing). Those are the components to *borrow from*, but the step-5 results display with one-click add-to-corpus must be built. (Also for the record: augment-it's event namespace is `augment-it:*` — `augment-it:navigate`, `augment-it:enrich-record`, etc.; the `ddd:` namespace and `--ddd-chrome-*` tokens belong to the dididecks shell, not here.)

## The two new microfrontends

Per the standing thesis — remotes deliberately small and single-focus, never conflated ([[Augment-It-Has-Outgrown-One-Flow-The-Choose-A-Flow-Front-Door]], [[Operator-Built-Flows-Beyond-The-Universal-Pipeline]]) — the flow decomposes into **two new remotes plus heavy reuse**, with step 8 as an open question (below).

### Remote A — `org-workbench` (working name) — steps 1–4, 6, 7

The org-anchored surface: connect → pick table → smart search → one org's full picture → people reveal.

Criteria: must be "workspace aware" - and filter the org list to only show orgs that are a match of the current workspace. First use case will be reach-edu workspace. 

- **Connect + table pick (steps 1–2).** A thin front door. Honest scoping: with one DB and one table in scope, this is a header strip ("SurrealDB · main/main · Organizations ▾"), not a wizard. Build it as a real selector only insofar as it costs nothing; don't gate the org list behind ceremony. Connection follows [[Connecting-To-And-Using-SurrealDB]]: connect→signin→use, five `SURREAL_*` env vars. **Decision needed:** browser-direct creds (the current dev-only posture of person-enrichment/strategy-curator) vs. the proxy-service posture [[Record-DB-Resolver]] declares as the destination (generic UI never holds creds; `record-surrealdb-resolver` does). Leaning: new capabilities land in `record-surrealdb-resolver` (e.g. `organization.search`, `organization.detail`), and the remote stays credential-free — this flow shouldn't add a *third* browser-creds surface while the stated direction is the proxy.
- **Smart org search (step 3).** Reuse the autocomplete pattern from `apps/person-enrichment/src/App.svelte` (org autocomplete + pick-existing) and `apps/person-db-resolver`. "Kinda smart" = candidate matching over `complete_name` + `conventional_name` + `aliases[]` + `domains[]` + fuzzy contains, the same shape as `findCandidates` in `resolver.ts` — an `organization.search` capability mirroring `person.search`.
- **Org augment view (step 4).** Render `org_links[]` (grouped by inferred kind: identity / social), `media_streams[]` (pulse), `org_corpus[]` — each list with ➕. The card shape to copy is the [[Augment-From-Affiliations]] four-additive-lists card (`apps/affiliation-rating-resolver`): additive lists, URL-kind auto-detection, each commit independent. One screen that views AND edits in place — the operator already rejected "two loops, two apps."
- **People reveal (step 7).** Expand the org into its affiliated persons (graph query over `affiliations`), each person nesting `personal_links[]` / `personal_corpus[]`. The composition pattern is [[Pulse-Pattern]]: pulse-dimensions (`LinkList.svelte`, `AffiliationCard.svelte`, `NameFields.svelte`, `OrgCreate.svelte` from `apps/person-enrichment/src/pulse-dimensions/`) hosted by a pulse-surface. These components were built to be reused — this is their second surface.
- **Add a person (step 6).** Inline person-create/match inside the org context: `person.candidates` → `person.apply` → `person.affiliate` (org pre-bound, so the affiliation is generated without the operator ever "managing" an edge — that's the requested magic). Observations ride along automatically. Must support adding the same person to *other* orgs later without breakage (N-affiliation assumption).

### Remote B — `search-and-add` (working name) — steps 4-search, 5, and the editable-term constraint

The provider-pluggable search surface + results display + one-click corpus add.

- **Editable search terms as first-class UI.** Each fired search shows its term in an editable field; re-fire on edit. This generalizes the per-record re-fire loop that [[Connector-Inventory-and-Per-Record-Palette]] specifies ("hot-swap providers, re-fire one record at a time") — same loop, DB-entity-anchored instead of row-anchored. Term templates seeded from entity context (org name + person name + "LinkedIn", etc., per pack) but always operator-rewritable.
- **Provider/pack palette.** Borrow `ConnectorPalette.svelte` / `ConnectorChip.svelte` from pack-runner; providers resolve through the social-search registry with `provider_override` (SearXNG default → Firecrawl → Exa once its connector lands).
- **Results display (step 5).** Result rows patterned on `apps/response-reviewer` rows + `apps/strategy-curator`'s `SourceList`/`SourceDetail`; each row carries one-click actions targeting whatever entity/list launched the search: `organization.corpus.add`, `person.corpus.add`, `*.links.add`, or `source.add` into a domain corpus. This surface is precisely the [[Source-Curation-Gate]] (ai-labs blueprint) rendered as a remote: raw retrieval in, human-promoted grounded corpus out.
- **Gating discipline.** One-click add is metadata-first (`source.add` semantics — no full fetch at add time; `source.fetch` later, per [[Corpora-Builder-System-Design]]'s two-tier-fetch constraint). Bulk unchecked enrichment is the product's origin sin; this remote never batch-adds.

Remote B is launched *from* Remote A (a ➕ or 🔍 next to any list opens search pre-scoped to that entity+slot) but is its own remote so it can also serve other flows — the same search-and-add surface is obviously wanted from strategy-curator and person-enrichment eventually. That reusability is the argument for it being a remote rather than a component inside A.

**Mount mechanics for both:** register in `shell/src/flows.svelte.ts` as a new `augmentFromDb` flow ("Augment from DB") with its rotation; add to `REMOTES` in `shell/src/remotes.ts` + the federation map in `shell/rsbuild.config.ts`. Free ports in the remote band: **3014 and 3016** (3018+ if a third surface materializes). Consider a `PAIRINGS` entry so A and B can tile side-by-side (search results next to the entity being augmented) rather than B replacing A in the slot.

## Step 8 — the pulse-stream scanner (deliberately unresolved)

The user flagged this as "might be another microfrontend or not sure how." The exploration's current read: **the scanning logic is a service concern that already exists; the open question is only where its review surface lives.**

What exists: `services/social-search/entity-pulse/` fires official-blog / official-pressrelease / official-social-posts packs against an entity; [[Entity-Pulse-Bundle]] specifies the three-category model (OfficialUpdates = the entity's own voice — exactly LinkedIn wall / Facebook wall / blog); [[Pulse-Curation-Layer-and-UI]] specifies the raw → curated → finalized triage layers the results must ride (a hard prior-art warning lives in [[Corpora-Builder-System-Design]]: post-generation per-URL triage once produced a 99.7% reject rate — the *stream* is curated per-object first, then items flow).

Three options, in current preference order:

1. **A mode of Remote B.** Scanning a `media_streams[]` entry is "search where the term is a stream URL and the provider is a fetch pack" — same results display, same one-click add, plus a "seen before" dedup against `content_items.url` (UNIQUE index makes this cheap). Cheapest; honors microfrontends-stay-small by *not* minting a remote.
2. **A third remote (`pulse-scanner`)** if the recurring/temporal nature (new-since-last-scan, per-stream cadence, bulk skim of many items) makes the UI shape genuinely different from search results. [[Pulse-Curation-Layer-and-UI]]'s three-layer triage suggests it might be.
3. **Not a UI at first** — a scheduled/agent-fired scan that lands candidates in the corpus inbox (`corpus.inbox.add`), triaged through existing inbox curation. Lowest build, but loses the "I want to look at the wall myself" operator experience the user described.

Fetching LinkedIn/Facebook walls reliably is the real risk here (auth walls, JS rendering) — SearXNG was chosen as social default partly for sparse JS-rendered social pages, but wall *timelines* are harder than profile *existence*. Firecrawl's crawl mode and the blog/RSS path (`media_streams` kinds rss/blog_index) are the dependable 80%; treat LinkedIn/Facebook wall depth as an experiment inside whichever option wins, not a launch commitment.

## Constraints this flow inherits (must not contradict)

1. **Multiple flows, not one pipeline** — own FLOWS entry; never spliced into `CSV_AUGMENTATION_ROTATION` ([[Augment-It-Has-Outgrown-One-Flow-The-Choose-A-Flow-Front-Door]]).
2. **Remotes stay small and single-focus** — two remotes, heavy reuse of pulse-dimensions and resolver capabilities; no monolith.
3. **Relevance lives on the affiliation edge only** — never on persons/organizations (multi-tenant leakage) ([[Augment-From-Affiliations]]).
4. **N affiliations per person** — UI never assumes 1:1 ([[Person-DB-Resolver-Needs-Multiple-Organizations-Per-Person]]).
5. **Client-tagging on every canonical write** — `client_access ∪ [client]`, `first/last_touched_by` ([[Client-Tagging-on-Canonical-Writes]]).
6. **Gate every enrichment step** — metadata-first adds, fetch later, no bulk auto-add; pulse triage rides raw/curated/finalized.
7. **One connector registry** — Exa and any future pack extend `services/social-search/src/registry`; no parallel search abstraction.
8. **Files-are-truth for domain corpora; people corpus stays DB-only** (`personal_corpus[]` — no filesystem dir for people).
9. **Additive, dedup-by-URL writes** — `shapeLink` / `findOrCreateContent` semantics; never destructive merges.
10. **Search terms always visible and editable** — the flow's own standing constraint, now recorded.

## Open questions

1. **Creds posture for Remote A:** browser-direct SurrealDB (fast, matches person-enrichment today) vs. everything through `record-surrealdb-resolver` capabilities (the declared destination). Leaning proxy — needs `organization.search` / `organization.detail` capabilities added.
2. **Remote B launch context contract:** what envelope does A pass B (entity ref + target list + seed term)? Via the `augment-it:*` CustomEvent bus, a shared-state composite, or a PAIRINGS tile with a NATS-backed session? (The no-`shared`-federation posture means no shared memory — broadcast is the tool.)
3. **Step 8 shape:** mode-of-B vs. third remote vs. inbox-first agent scan (see above).
4. **"Kinda smart" search depth:** is candidate-matching over names/aliases/domains enough, or does this want embedding-assisted relevance (the KAG direction [[Funder-Fit-Engine-Org-Corpora-and-the-Story-Unlock-Cycle]] argues)? Start with candidates; leave a seam.
5. **Where do org-corpus adds land on disk?** `org_corpus[]`/`content_items` is DB-side; [[Corpora-Builder-System-Design]] flags the SurrealDB↔filesystem gap (corpus files carry no `org_slug` link yet). Does this flow write files at all, or DB-only like people corpus?
6. **Exa pack scope:** search-only connector, or also Exa's contents/similarity endpoints as separate capabilities?

## Prior art index

**Closest ancestors:** [[Augment-From-Affiliations]] (first DB-first flow, shipped) · [[Record-DB-Resolver]] (org resolver + UI/backend split contract) · [[How-People-Orgs-And-Relationships-Actually-Enter-SurrealDB]] (authoritative data model) · [[Sparse-Person-Enrichment-Surface]] (per-person enrich pattern) · [[Entity-Profile-Augmentation-Workflow]] (who-is-this/where-on-the-web workflow).

**Architecture:** [[Augment-It-Has-Outgrown-One-Flow-The-Choose-A-Flow-Front-Door]] · [[Operator-Built-Flows-Beyond-The-Universal-Pipeline]] · [[Packs-and-Bundles-Pattern]] · [[Module-Federation-Rsbuild-Dev-Loop-Gotchas]] · [[Connecting-To-And-Using-SurrealDB]].

**Search & curation:** [[Search-Providers-as-First-Class-SearXNG-Default]] · [[Connector-Inventory-and-Per-Record-Palette]] · [[Source-Curation-Gate]] (ai-labs) · [[Source-Curation-Surface-Component-Spec]] (ai-labs) · [[In-App-Browser-Or-Plugin-For-Corpus-Add]] · [[Corpora-Builder-System-Design]] (corpora-builder).

**Pulse:** [[Entity-Pulse-Bundle]] · [[Pulse-Curation-Layer-and-UI]] · [[Pulse-Pattern]] · [[Funder-Fit-Engine-Org-Corpora-and-the-Story-Unlock-Cycle]].

**Code anchors:** `shell/src/flows.svelte.ts` · `shell/src/remotes.ts` · `services/social-search/src/{registry,connectors,packs.ts,entity-pulse/}` · `services/record-surrealdb-resolver/src/{resolver.ts,person-resolver.ts,domains.ts}` · `apps/person-enrichment/src/pulse-dimensions/` · `apps/{pack-runner,response-reviewer}/src/ConnectorPalette.svelte` · `apps/strategy-curator/src/` · `services/workspace/src/chat.ts` (CURATOR_CHAT_VERBS).

**Skills:** `surrealdb-canonical-layer` · `inbox-curation` · `crawl-fetch-ingest` (the Firecrawl→Tavily fallback cascade this generalizes).
