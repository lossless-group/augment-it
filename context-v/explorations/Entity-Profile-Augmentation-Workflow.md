---
title: "Entity-Profile Augmentation Workflow — Common Social + Vertical-Specific Sources, Per Entity Type"
lede: "A common workflow in augment-it is filling in 'who is this' and 'where are they on the web' for every row in a dataset — LinkedIn, X, BlueSky, YouTube for everyone, plus type-specific sources (ProPublica Nonprofit Explorer + Candid for philanthropic orgs, SEC EDGAR for public companies, Crunchbase for startups, etc.). Today this work happens prompt-by-prompt, one column at a time. This doc converges on a two-tier abstraction: **packs** as atomic, source-bound microfrontend+microservice units (one per data source), and **bundles** as workflow-shaped compositions of packs (a `profile-builder` for philanthropic orgs vs for VC firms). Verification rides the existing Response Reviewer surface with a structured-output extension."
date_created: 2026-05-25
date_modified: 2026-05-25
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
semantic_version: 0.0.0.3
revisions:
  - 2026-05-25 — Initial draft.
  - 2026-05-25 — User answered 6 of 7 open questions inline. Resolutions folded back: two-pass execution with data carry-forward; pre-flight agent-scan against existing helpful_links; confidence as numeric 0-100 with color pill; sibling-payload + optional archival-markdown for structured responses; `outcome` enum for response types. Q7 (user's additional philanthropy sources) still open.
  - 2026-05-25 — Pack vs bundle distinction introduced per user. **Pack** = atomic, source-bound, one-per-microfrontend/microservice (deployment unit). **Bundle** = workflow-shaped composition of packs (orchestration unit). Layer 2 re-split; blueprint fork renamed to `Packs-and-Bundles-Pattern`.
tags:
  - Exploration
  - Augment-It
  - Profile-Augmentation
  - Packs-and-Bundles
  - Multi-Agent-Fan-Out
  - MCP-Servers
  - Web-Search
  - Verification
  - Response-Reviewer
status: Draft
---

# Entity-Profile Augmentation Workflow

## Why this exploration

Across every augment-it dataset, the same first-pass enrichment keeps recurring:
*for each row, find this entity on the web.* The verbs are nearly identical
across entity types (find their LinkedIn, their X, their YouTube), but the
useful sources diverge sharply once you leave the common social platforms
(public companies want SEC filings; nonprofits want IRS 990s; startups want
Crunchbase). The user-facing intent is also nearly identical: *"augment this
dataset of [type] with their public profiles."*

This is the work the in-app chat's `prompts.draft → improve → apply` triad
was built to gate, and the work that [[Multi-Agent-Research-Fan-Out-Per-Row]]
described as augment-it's "real" capability runtime. This doc is the
exploration that connects those two — what is the right abstraction layer,
what sources matter per entity type, and how does verification land inside
the surfaces we already have (Response Reviewer, Response Store).

The destination forks: a blueprint at
[[Entity-Packs-Capability-Pattern]] for the registration + dispatch shape,
plus eventually a Spec-Kit feature for the first end-to-end implementation.

## The three layers, pulled apart

The intuition that something "widget-like" is needed is real but
mislocated. Three layers, each first-class:

### Layer 1 — Sources (MCP capabilities)

Each platform that returns "candidate profiles for an entity" is a *source*.
A source has:
- A typed input (name, optional entity-type hint, optional disambiguators).
- A typed output (zero-or-more candidate profiles, each with URL, snippet,
  retrieval timestamp, source-specific metadata, and a per-candidate
  confidence score).
- A tier (see Verification below): tier-1 known-shape, tier-2 vertical
  API/DB, tier-3 open web search.

The right shape for these in this codebase is an **MCP server per source**
(or per small cluster — e.g., one `social-platforms` server covering the
common five). The decision to **build our own MCP servers** has corpus
value beyond augment-it: it produces a Lossless library of typed
data-source servers that the other applied-AI-labs apps (memopop, dididecks)
can reuse. Same reusability dividend as the agent-skills library.

### Layer 2 — Packs and Bundles (the two-tier composition)

**Refined 2026-05-25 per user.** The original draft conflated two
distinct concepts. Pulling them apart:

#### Pack — the atomic unit, one-per-microfrontend/microservice

A **pack** is bound to a single source (or a tight cluster — e.g.,
"social-platforms" if the URL-shape work is genuinely shared). A pack
is a *deployment unit*: it ships as its own microfrontend + its own
backing microservice (the MCP server for that source). Examples:

- `linkedin-pack` — microfrontend renders LinkedIn candidate cards;
  microservice is the LinkedIn MCP server.
- `candid-pack` — microfrontend renders Candid/GuideStar nonprofit
  cards; microservice is the Candid MCP server.
- `propublica-npo-pack` — same shape, different source.

A pack carries:
1. **A prompt template snippet** scoped to its source — *"find the
   verified {{entity_name}} on LinkedIn"*. Not a full prompt; a
   parameterizable fragment the orchestrating bundle composes.
2. **The MCP server interface** — typed search input/output for its
   source.
3. **An extraction schema** — the structured-output shape this source
   produces (often `{ url, display_name, confidence, snippet,
   source_metadata }` but per-source variations are allowed).
4. **Render configuration** — how this source's result renders in
   Response Reviewer (confidence pill + URL + source badge + collapsible
   snippet, with source-specific affordances if needed).

The microfrontend/microservice pairing per pack matches the existing
augment-it discipline: every enrichment surface is its own remote, and
every domain service is its own container.

#### Bundle — the workflow composition, one-per-workflow

A **bundle** is a named composition of packs assembled around a common
user workflow. Examples:

- `profile-builder.common` — bundles `linkedin-pack`, `x-pack`,
  `bluesky-pack`, `youtube-pack`, `facebook-pack`. Two-pass aware (pass 1).
- `profile-builder.philanthropic-org` — bundles the common-five-packs
  plus `candid-pack`, `propublica-npo-pack`, `irs-990-pack`,
  `grantable-pack`, `foundation-directory-pack`. (Pass 2.)
- `profile-builder.venture-capital-firm` — common-five-packs plus
  `crunchbase-pack`, `pitchbook-pack`, `angellist-pack`, `sec-form-d-pack`.

A bundle carries:
1. **The pack roster** — which packs participate and in which pass.
2. **The orchestration** — single-pass or two-pass; data carry-forward
   between passes; per-pack timeouts; concurrency limits.
3. **The chat verb shape** — the user-facing handle the chat invokes
   (`profile-builder` with an entity-type parameter, e.g.).
4. **The pre-flight dedup hook** — invokes `profiles.dedup.scan`
   against the target row's existing `helpful_links` before firing the
   roster.

So the user picks a bundle from the chat (`profile-builder` for a row
typed `philanthropic-org`). The bundle dispatches its pass-1 packs in
parallel, waits for triage, dispatches pass-2 packs enriched by
pass-1 outputs, and aggregates results. Each pack runs in its own
remote + service. Response Reviewer renders the combined per-row
response set with each source's pack-specific render config.

This separation matters because it maps cleanly onto the existing
architecture:
- **Packs reuse the microfrontend + microservice discipline.** Each
  new source is one new remote + one new MCP server. Familiar shape.
- **Bundles are workflow-level config** — they live in
  prompt-template-manager (or its evolution), like a saved
  template-plus-orchestration-plan. No new container; new file shape.
- **The prompt-runner still does per-pack execution.** Bundles
  orchestrate; they don't replace the runner.

```
profile-builder.philanthropic-org   (bundle)
├── pre-flight: profiles.dedup.scan
├── pass 1 (parallel):
│     ├── linkedin-pack       (microfrontend + MCP server)
│     ├── x-pack
│     ├── bluesky-pack
│     ├── youtube-pack
│     └── facebook-pack
├── carry-forward: pass-1 triaged-good outputs → pass-2 prompt context
└── pass 2 (parallel):
      ├── candid-pack
      ├── propublica-npo-pack
      ├── irs-990-pack
      ├── grantable-pack
      └── foundation-directory-pack
```

### Layer 3 — Verification (Response Reviewer extension, **not** a new remote)

**Clarified 2026-05-25.** Verification does not get its own federated
remote. It lives inside the existing **Response Reviewer** surface.

What this means concretely:
- A pack run produces N responses per row (one per source invoked).
- Each response lands in `response-store` as today.
- Response Reviewer triages them with its existing good/partial/wrong
  vocabulary.
- The new requirement on Response Reviewer is to render **structured-output
  responses** — not just the free-form text it shows today. A profile-find
  response is more naturally `{ url, display_name, confidence, snippet,
  source_metadata }` than a blob of markdown. Either we attach structured
  output as a sibling payload to the prose, or we nest it inside the
  markdown with a known fence (the user noted this is undecided — captured
  as an open question below).

The promote-to-canonical flow handles the rest: verified responses get
written back to the row's `profiles.<source>` cluster on promote, the
same way every other shipped enrichment lands.

## The entity-type taxonomy

Five types cover the workload today. Each has a common-five overlap plus
a specialized tail:

| Entity type | Common-five sources | Specialized sources |
|---|---|---|
| **Public company** | LinkedIn, X, YouTube (BlueSky/FB rare) | SEC EDGAR, Yahoo Finance, investor-relations pages, press-release feeds |
| **Notable individual (HNWI)** | LinkedIn, X, BlueSky, Wikipedia (FB optional) | Forbes lists, OpenSecrets, news-mention search, public donations records, board memberships |
| **Philanthropic organization** | LinkedIn, X, Facebook, YouTube | Candid / GuideStar, ProPublica Nonprofit Explorer, IRS Form 990, Grantable, FoundationDirectory, [user has additional list — to be merged] |
| **Venture capital firm** | LinkedIn, X (BlueSky growing) | Crunchbase, PitchBook, AngelList, SEC Form D filings, portfolio pages |
| **Startup** | LinkedIn, X | Crunchbase, AngelList, ProductHunt, GitHub orgs, employee-count proxies |

Two-phase common pattern: pack runs `profiles.augment.common` first (the
common-five), then `profiles.augment.<entity-type>` for the specialized
tail. Or one pack does both internally — implementation detail for the
blueprint.

## Source registry (first pass — to be expanded)

### Tier 1 — Known URL shapes, mostly via search-then-confirm

- LinkedIn (`linkedin.com/in/`, `linkedin.com/company/`)
- X / Twitter (`x.com/`, `twitter.com/`)
- BlueSky (`bsky.app/profile/`)
- YouTube (`youtube.com/@`, `youtube.com/channel/`)
- Facebook (`facebook.com/`)
- GitHub (`github.com/`, `github.com/orgs/`)
- Wikipedia (`en.wikipedia.org/wiki/`)

### Tier 2 — Vertical APIs / structured databases

- **Philanthropy**: Candid (GuideStar), ProPublica Nonprofit Explorer,
  IRS Form 990 PDFs, Grantable, FoundationDirectory, GrantStation
- **Public companies**: SEC EDGAR, Yahoo Finance, MarketWatch
- **VC / startup**: Crunchbase, PitchBook, AngelList, SEC Form D
- **Individuals (public-record)**: OpenSecrets, FEC filings, court
  records (state-by-state)

### Tier 3 — Open web search, no domain whitelist

Firecrawl, Tavily, or direct search-engine APIs. The catch-all. Verification
load lands here heavily — the user reviews more on tier-3 results than
tier-1/2.

## Verification strategy

- **Tier 1** — URL shape regex match + HEAD check confirms the page exists +
  optional `og:title` / page-title heuristic against the entity name →
  high-confidence auto-attach proposal, still flows through Response
  Reviewer but pre-marked `good` with the human able to override.
- **Tier 2** — Structured API returns include identifier (EIN, ticker
  symbol, etc.) → confidence high if exact-name-match, medium if
  fuzzy-match-only, surfaced to Response Reviewer for confirmation.
- **Tier 3** — Always flows in `pending-review` state, never auto-marked.

Confidence scoring per response gets stored alongside the response in
`response-store` (extension to the existing schema). The triage_states
cementing on promote (Tier 1 from the recent [[Enhanced-Records-List-and-Promotion-Checkpoint]]
follow-ups) handles writing the verified results back.

## Build-our-own MCP servers — the corpus angle

Decision noted: we build our own MCP servers per source rather than
adopting third-party ones. Rationale:

1. **Consistency of typed shapes.** The fan-out machinery needs every source
   to expose the same I/O contract (entity-name in, candidate-profiles out
   with confidence). Third-party MCP servers have whatever shape their
   authors picked; aligning shapes by writing thin adapters is the same
   work as writing the server.
2. **Provenance discipline.** Every response carries retrieval timestamp +
   source URL + source-server version, baked into the schema. Easier to
   enforce in our own code.
3. **Corpus value.** A library of typed-data-source MCP servers becomes a
   reusable Lossless asset — the same shape as the agent-skills library.
   memopop and dididecks both need profile-augmentation eventually;
   building the servers once and sharing them across the family is
   higher-leverage than wrapping per-app.
4. **Rate-limit + cache control.** Per-source rate limits and result
   caches are central to fan-out efficiency. Owning the server means
   owning that policy.

The trade is build cost. Tier-1 sources without official APIs (LinkedIn,
X) will be search-then-confirm scrapers, which is fragile. Worth a separate
exploration if the fragility becomes an operational issue.

## Open questions

These resolve before the blueprint forks, or get explicitly left to the
blueprint:

1. **Structured output shape inside Response Reviewer.** ✅ **Resolved.**
   (a) sibling payload — the response object has both `prose: string`
   and `structured: { url, confidence, ... }`; (b) fenced-in-markdown
   — the prose contains a known fenced block.

  USER: I think (a) is better, though there may be a need to save responses in markdown format for archival purposes.

  → **Resolution:** Sibling-payload wins as the wire shape. Archival
  concern noted: response-store gets an optional `archival_markdown`
  serialization (the structured payload rendered down to markdown
  alongside the prose) so the archival format stays human-readable
  without forcing the runtime to parse markdown. Extends the
  response-store schema; the new fields are `structured: object` +
  `archival_markdown: string?`.

2. **Confidence schema.** ✅ **Resolved.** Numeric 0-1, or banded
   (low/med/high)?

   USER: I think 0-100% with some color scale in a small pill in front of the url value is fine.

   → **Resolution:** Numeric 0-100 on the wire. Color-scale pill
   rendered immediately before the URL value in Response Reviewer.
   Color bands (for the pill, not for storage) likely red <40, amber
   40-70, green >70 — to be locked in the blueprint with theme tokens.
   
3. **Pack registration locus.** ✅ **Resolved — and reframed.**
   Per-app vs shared was the original question. The user's answer
   reshaped the pack concept itself (see Layer 2 above).

   USER: The user perspective will be "profile-builder" pack. This might pre-load a set of common prompts or one prompt, an attachment to the prompt (like a set of common sources to search), and a set of common fields to extract. And then how the structured output renders in response.

   → **Resolution:** Packs are **prompt-bundles** with four
   sibling attachments — `prompt` + `sources` + `schema` + `render`.
   The user-facing name is `profile-builder` (entity-type implied
   from context, or carried as a parameter). Registration locus
   stays per-app for v1 since packs live inside prompt-template-manager;
   sharing across apps happens later by promoting a pack to a
   Lossless package.
   
4. **Two-phase vs one-pass.** ✅ **Resolved — two-pass with data carry-forward.**

  I think it would be two passes, because information from the common five (like name and organization) could be used to inform the philanthropy search.

  → **Resolution:** Two passes, sequential not parallel. Pass 1 runs
  `profile-builder.common` against the row. Pass 2 runs
  `profile-builder.<entity-type>` against the row **enriched by pass 1's
  triaged-good results** — so the specialized search has the confirmed
  display_name, employer, role, etc. from social profiles to disambiguate.
  Implications:
  - The pack runtime needs an explicit *carry-forward* step between
    phases. Pass 2's prompt template can reference pass 1's structured
    outputs (e.g., `{{linkedin.display_name}}`).
  - Pass 2 cannot fire until pass 1 has at least *some* responses
    triaged (or a configurable timeout falls through with whatever's
    available). User-in-the-loop between passes is the default; the
    chat affordance is "ready to run pass 2 against these N rows."
  - This changes the chat verb shape: a pack invocation is not one
    `prompts.apply` call but a multi-step plan the chat narrates.

5. **Dedup against existing `helpful_links`.** ✅ **Resolved — agent-driven pre-flight scan.**

  USER: I think an agent should scan and see if there are existing links, and if so, pre-populate the response as `good` with the existing URL.

  → **Resolution:** Before a bundle runs, an agent pre-flight step
  scans each target row's `helpful_links` (and any existing
  `profiles.*` cluster from prior runs). For each source the bundle
  would fire, if a matching URL already exists, that source's response
  is pre-populated as `good` with the existing URL and skipped from
  the run. Surfaced in the chat narration ("3 of 8 sources already
  have URLs in helpful_links; firing the remaining 5"). The dedup
  agent is itself a small capability — candidate name
  `profiles.dedup.scan` — that runs synchronously before pass 1.

6. **Negative results.** ✅ **Resolved.**

   USER: I think a "not-found" response type is fine.

   → **Resolution:** Response-store gains a discriminated `outcome` field
   with values: `found` (one or more candidates), `not_found` (source ran
   cleanly, zero candidates), `error` (source failed), `skipped`
   (pre-flight dedup pre-populated), `pending` (in-flight). Each maps to
   a distinct render in Response Reviewer — `not_found` is informational,
   not a triage state.

7. **The user's additional philanthropy sources.** The user mentioned a
   list they couldn't locate. To be merged into the Tier-2 philanthropy
   row once recovered.

## What forks from this exploration

When this exploration converges:

- **Blueprint**: [[Packs-and-Bundles-Pattern]] —
  `context-v/blueprints/Packs-and-Bundles-Pattern.md`. Codifies:
  (1) the **pack** shape — microfrontend + MCP-server pairing per
  source, prompt-snippet + extraction-schema + render-config;
  (2) the **bundle** shape — pack-roster + orchestration plan
  (single-pass / two-pass with carry-forward) + chat verb registration
  + pre-flight dedup hook;
  (3) confidence-pill rendering contract, response-store `outcome`
  enum, and the structured-payload schema extension.
- **Spec(s)** *(via Spec-Kit when ready)* — per-source MCP servers
  (probably one feature per server, starting with the common-five social
  cluster), the Response Reviewer structured-output extension, and the
  first end-to-end pack run.
- **A philanthropy-sources companion exploration** — if the vertical
  source list balloons past what fits in a row of the taxonomy table.

## References

- [[Multi-Agent-Research-Fan-Out-Per-Row]] — the still-forward exploration
  this builds on
- [[Response-Reviewer-and-Response-Store]] — the surface verification
  extends (status: Shipped)
- [[Enhanced-Records-List-and-Promotion-Checkpoint]] — promote-to-canonical
  mechanic that handles verified results
- [[Original-and-Enhanced-Record-Instances]] — record-instance model the
  results land in
- [[Augment-It-as-CRM-Augmentation-Pipeline]] — top-level vision
- [[In-App-Chat-v0-0-1-for-Augment-It]] — the chat surface where packs get
  invoked (`McpCapability` is named as a v0.0.2 deferred item there;
  packs are one of the things `McpCapability` makes possible)
