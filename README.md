![Augment-It Working Banner Image](https://i.imgur.com/JFdSlQt.png)
***

# Augment It

A multi-tenant web app for augmenting tabular data with AI. Upload a CSV or spreadsheet, fire enrichment passes against it (custom LLM prompts or source-bound packs like LinkedIn / X / Bluesky / Wikipedia), triage the responses, accept the good ones back onto rows, promote enhanced rows into new canonical record sets, and continue.

The codebase is a federated set of small Svelte 5 microfrontends mounted into a shell, backed by stateless TypeScript microservices that talk over NATS. Every column on every row is tenant-defined — no hardcoded schema anywhere — so the same tool serves a foundation's grantee pipeline, a VC's deal flow, a recruiter's candidate list, or whatever spreadsheet a user happens to upload.

## Tech stack

### Build & runtime

- **pnpm** workspaces + **Turborepo**
- **Rsbuild 2** with `@module-federation/rsbuild-plugin` 2.x — every app is an independently-served federated remote
- **TypeScript 6** end-to-end
- **Docker Compose** for the backend stack (NATS + services)

### UI

- **Svelte 5** (runes — `$state`, `$derived`, `$effect`, `$props`) — **not React, not Next.js**
- CSS custom properties only — three-mode theme system (`light` / `dark` / `vibrant`) via `packages/theme/theme.css`
- Each remote namespaces its own CSS classes (`.rc-app`, `.pr-app`, etc.) so styles can't leak across federation boundaries

### Backend

- **NATS** as the message bus — every service subscribes to a subject via the `@nats-io/transport-node` v3 client (migrated off the legacy `nats@2` package); the browser talks to the backend via the workspace capabilities router
- **libSQL** / **JSON-stored row + response data** behind small TS services
- **SurrealDB Cloud** as the canonical entity layer — persons, organizations, and domains/sources (the corpus catalog: strategies, theses, topics) live here, shared across every client workspace and resolved via `record-surrealdb-resolver`. This is the "start from data already in the canonical layer" side of the app, alongside the original CSV-first pipeline — see [Core concepts](#core-concepts)
- **didi.sh** as the shared identity plane — magic-link sign-in, org/membership-gated access, actor attribution (`created_by`/`updated_by`) on every canonical write. One account works across this app and its sibling Lossless VC-tooling apps (dididecks, memopop)
- **Anthropic** for free-form prompt enrichment (via `prompt-runner`) and the in-app chat agent ("didi") — same service, two jobs
- **Search providers are pluggable** (via `social-search`): a `connectors/` seam with a common `Connector` interface, dispatched per-fire with an optional `provider_override`, plus a capability-style connector registry (`registry/`) that resolves providers by intent, free-tier first. **SearXNG** (self-hosted, no API key) is the default for the social packs; **Tavily**, **SerpApi**, **GDELT**, **Google News RSS**, and **Exa** (neural search, `EXA_AI_API_KEY`) are registered peers. Response Reviewer's by-record view exposes per-provider re-fires, and the `search-and-add` remote exposes the same registry as a chip palette behind an always-editable search term (additive; never overrides accepted data)

## App structure

```zsh
augment-it/
├── apps/                              # Federated Svelte 5 remotes
│   ├── record-collector/        :3002 # CSV ingest, per-cell editing, socials chip row
│   ├── prompt-template-manager/ :3003 # Custom-prompt authoring (paired with pack-runner)
│   ├── request-reviewer/        :3004 # Pre-flight review of fan-out plans
│   ├── response-reviewer/       :3005 # By-record triage cockpit (post-flight)
│   ├── chat/                    :3006 # "didi" — the in-app chat verb surface; curator + enrichment verbs, inbox triage
│   ├── enhanced-records-list/   :3007 # Promoted canonical sets, generic cell rendering
│   ├── record-db-resolver/      :3008 # Generic DB-agnostic match/create bridge for organizations, one record at a time
│   ├── pack-runner/             :3009 # Source-bound pack invocation (paired with PTM)
│   ├── person-db-resolver/      :3010 # Match-or-create a person + their org, RELATE the affiliation edge (sibling of record-db-resolver)
│   ├── records-surface/         :3011 # Live view of promoted record sets over the workspace WebSocket
│   ├── affiliation-rating-resolver/ :3012 # Rate + enrich person↔org affiliations in place — links, corpus, relevance — one screen per edge
│   ├── sort-filter-lens/        :3013 # First Lens — sort/filter/inline-edit over the active record set
│   ├── org-workbench/           :3014 # "Augment from DB" — org-first workbench: search to a canonical org, work its links/streams/corpus/people card in place
│   ├── person-enrichment/       :3015 # Sparse-person triage — name/socials/org/web presence, one attendee at a time
│   ├── search-and-add/          :3016 # Editable-term web search + stream scan, paired with org-workbench — one-click add to the launching entity
│   ├── strategy-curator/        :3017 # "Corpora Curator" — build a strategy/thesis corpus from the SurrealDB canonical layer, live multi-operator sync
│   ├── highlight-collector/           # planned — collect highlights from AI responses (scaffold)
│   └── insight-manager/               # planned — manage insights across responses (scaffold)
│
├── shell/                       :3100 # Window manager, peek-deck rotation, pair-mode, Flows registry, didi.sh sign-in
│
├── services/                          # Stateless TS over NATS
│   ├── ingest/                        # CSV → record_set.create (dynamic schema from headers)
│   ├── xlsx-ingest/                   # XLSX workbook → record_set.create (same shape as CSV)
│   ├── workspace/                     # Browser-facing capabilities router; didi.sh session verify, chat dispatch, per-workspace .env
│   ├── row-store/                     # Rows, record sets, promote-fold, row.fields write-back (+ socials, predecessor lineage)
│   ├── prompt-store/                  # Persists custom prompt templates
│   ├── prompt-runner/                 # Anthropic, custom prompts, per-row fan-out, chat_turn dispatch
│   ├── response-store/                # Sibling payload (prose + structured Candidate)
│   ├── content-ingest/                # Jina-extracted .md + binary PDFs for both the funder-content corpus and the domain/strategy-thesis corpus; record_uuid + published_at stamping, /promote-snapshot
│   ├── record-surrealdb-resolver/     # Canonical entity layer — persons, organizations, domains/sources (the corpus catalog), affiliations — against the shared SurrealDB Cloud instance
│   ├── social-search/                 # Pack search/fan-out, pluggable connectors (SearXNG default, Tavily peer)
│   └── decile-mcp/                    # MCP server wrapping the Decile Hub API — a per-client VC CRM + fund-admin connector
│
├── packages/                          # Shared code
│   ├── workspace/                     # Shared types (Row, ResponseRecord, Candidate, SocialProfile) + the workspace singleton every remote connects through
│   ├── theme/                         # CSS tokens, three modes
│   ├── shared-ui/                     # First reusable Svelte components (ConfidencePill, …)
│   ├── config/                        # planned — cross-app/package config (scaffold)
│   └── shared-services/               # planned — shared service helpers (scaffold)
│
├── context-v/                         # Living documentation
│   ├── blueprints/                    # Durable pattern codifications (Packs-and-Bundles, …)
│   ├── explorations/                  # Pre-spec investigation
│   ├── specs/                         # Checkpoint specifications
│   ├── plans/                         # In-flight implementation arcs
│   ├── prompts/                       # Scoping docs for build sessions
│   ├── reminders/                     # Session pickup notes
│   └── issues/                        # Filed-but-not-yet-executed decisions
│
├── clients/                           # Per-tenant corpus trees (git submodules); funder dirs hold .md + binary PDFs
├── splash/                            # GitHub Pages splash site (Astro 7 + Pagefind)
├── changelog/                         # Ship log — every coherent build session writes one
├── scripts/                           # dev.sh, backup-stores.sh, backfill-corpus-{record-uuid,published-at}.mjs
├── docker-compose.yml                 # NATS + services
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

## Core concepts

- **Multi-tenant by default.** Every row's columns are derived per-upload from CSV headers. The code carries no hardcoded knowledge of any specific column name — rendering is type-driven (scalar → text, object/array → JSON), the promote-fold is type-driven (arrays merge, objects merge by key, scalars overwrite), the schema union is presence-driven (any key with a value is a column). See `changelog/2026-05-23_03_All-Data-Continues-Generic-Rendering.md` for the rule and its history.
- **Packs and bundles.** A **pack** is the atomic enrichment unit — one source, one prompt-snippet template, one extraction schema, one render config. A **bundle** is a workflow composition of packs with orchestration, carry-forward between passes, and a single chat verb that fires the whole thing. The contracts are locked in `context-v/blueprints/Packs-and-Bundles-Pattern.md`.
- **Sibling-payload responses.** Every response record carries both prose AND an optional structured `Candidate` (url, display_name, confidence 0–100, snippet, source_metadata), plus an `outcome` enum (`found | not_found | error | skipped | pending`). The renderer in Response Reviewer branches on outcome.
- **Inline correction + human-supply on one surface.** The by-record view in Response Reviewer lets the user edit URLs, edit display_names, edit entity-names (the row's identity column), or supply a URL the pack didn't find — all riding the same `response.set_structured` subject.
- **Federation-host shell, multiple Flows.** The shell used to walk one hardcoded `ROTATION`; it now owns a `FLOWS` registry (`shell/src/flows.svelte.ts`) — each Flow (`Improve a CSV`, `Build Corpora`, `Augment a CSV of Event Attendees`, `Augment a CSV of People`, `Rate Affiliations`, `Augment from DB`, …) is a named use-case with its own rotation, switched via the header's "Flows" popdown. Within a Flow the shell still handles peek-deck tile rotation, co-existence (50/50 splits), and runtime cross-remote communication via `window` events + localStorage. A single-tenant (pinned) deploy defaults to its one relevant Flow rather than the first-registered one.
- **Lenses.** A *lens* is a federated remote that re-presents the active record set under a different affordance shape — sort/filter, inline-edit, per-row corpus add — without leaving the record. `sort-filter-lens` is the first; registered as a third member of `AUGMENT_COMPOSITE` alongside PTM + Pack Runner. Lenses auto-fall-back to the newest non-archived record set when localStorage points at an archived one, so they survive `/promote-snapshot` cleanly.
- **Funder-content corpus.** Per-client, per-funder directory of source materials backing each row. Two entry vectors land into the same shape: the chat `/inbox <url>` verb (with active-client context) and the per-row inline "+ URL" affordance in the lens. Both run fire-and-forget through `services/content-ingest/`, Jina-extract markdown, preserve original PDFs as LFS binaries, and stamp `record_uuid` + `published_at` into frontmatter. Manual-paste URLs land regardless of domain (operator curation trumps the same-host rule, which only binds pack outputs).
- **Corpus chips tell the truth.** `corpus.list_for_record` joins by `corpus_funder_slug` as primary (one dir scan) with `record_uuid` lineage as fallback — chips stay accurate across `/promote-snapshot` cuts. `/promote-snapshot` itself derives `corpus_*` columns from filesystem state when cutting a new record set, and stitches `predecessor_record_set_id` for lineage walks.
- **The canonical layer — a second, DB-first way to build a corpus.** Every flow above starts from an uploaded CSV. `strategy-curator` ("Corpora Curator" in the UI) starts the other direction: pick or create a **domain** — a `type`-discriminated grouping (`strategy`, `thesis`, `topic`, `market-segment`, …) stored in SurrealDB, not the filesystem — and gather **sources** into it (Jina-fetched metadata, full-content fetch, tags, pasted extracts). `record-surrealdb-resolver` owns the DB side (the `domains`/`sources`/`source_usages` tables plus `persons`/`organizations`/`affiliations`); `content-ingest` mirrors every write to an on-disk corpus file. `person-db-resolver`, `record-db-resolver`, and `affiliation-rating-resolver` are the sibling canonical-layer flows — matching/creating people and organizations, then rating the relevance of the affiliation between them — all writing into the same shared entity graph rather than a per-upload CSV schema.
- **Augment from DB — the org-first workbench.** The newest canonical-layer flow inverts the CSV pipeline completely: start from an **organization already in SurrealDB**. `org-workbench` autocompletes to an org (names, aliases, or domains), then shows one card that views AND edits in place — identity/social links, pulse streams (`media_streams`), corpus items, and a reveal of every affiliated person with nested links of their own. Adding a person generates the `affiliations` edge + observation automatically (`person.affiliate`, org pre-bound — no affiliation UI needed, N orgs per person by construction). Every list carries a 🔍 that opens `search-and-add` in a paired tile: the search term stays always-editable, providers swap via the registry palette (SearXNG default, Exa a chip away), and each result row one-click-adds to exactly the list that launched the search. Streams go further — a per-stream **scan** fires the entity-pulse blog machinery at the stream URL and badges anything already in the `content_items` ledger, so "what's new on their blog" is one click and only genuinely-new items get added. Spec: `context-v/specs/Augment-From-DB-Flow.md` (Shipped).
- **Live multi-operator sync.** Domain and source mutations on the canonical layer broadcast over NATS (`domain.created`, `source.added`, …); every connected session in the same workspace refetches automatically. Two people signed into the same client see each other's edits without a refresh.
- **didi.sh identity + actor attribution.** Sign-in is magic-link only (no passwords, invite-only), via the shared `id.didi.sh` service — one account works across this app and its sibling Lossless VC-tooling apps. A signed-in session's `didi_id` rides every capability call and gets stamped as `created_by`/`updated_by` on canonical writes (DB rows and corpus frontmatter alike), so every mutation on the canonical layer carries who did it. The in-app chat agent ("didi") writes through the same envelope, tagged `via: didi-agent`, so an agent-driven edit is distinguishable from a manual one.

## Setup

Install dependencies:

```bash
pnpm install
```

Provide API keys via `.env` (see `.env.example`):

```bash
ANTHROPIC_API_KEY=…   # required for prompt-runner
TAVILY_API_KEY=…      # optional — only packs routed to the Tavily connector need it.
                      # Social packs default to SearXNG (self-hosted container, no key),
                      # so pack search works out of the box without this.
```

Pack search runs against a **SearXNG** container that comes up with the stack — no account, no API key. SearXNG isn't an index of its own; it's a metasearch *aggregator* that queries upstream engines (Google, Bing, DuckDuckGo, Brave) and merges their results, which is why we get metasearch breadth for free. Override its instance secret with `SEARXNG_SECRET` if you like (a dev default is baked in).

## Get started

Start the full stack (Docker services + every federated remote + shell) with one command:

```bash
pnpm stack up
```

The shell will be available at [http://localhost:3100](http://localhost:3100) (`:3000` is deliberately skipped — reserved locally for Open WebUI). Every remote is also independently reachable at its own port (`:3002`–`:3017`, see [App structure](#app-structure) for the full list) — useful for debugging Module-Federation cross-origin errors which the shell's DevTools console scrubs to `'Script error.'`.

Other common commands:

```bash
pnpm dev          # Run just the frontend remotes (no Docker services)
pnpm stack down   # Stop the Docker services
pnpm build        # Production build
pnpm preview      # Preview the production build
```

The `scripts/dev.sh` script prints the full URL list on start.

## Deployment

The humain-vc single-tenant instance runs live on **Railway** at
[`https://augment.didi.sh`](https://augment.didi.sh) — 8 services (NATS +
4 backend microservices + 3 federated frontends), two persistent volumes,
and a custom `*.didi.sh` domain (required for the shared `didi_session`
cookie). See **[`DEPLOYMENT.md`](DEPLOYMENT.md)** for the full service
list, environment variables, redeploy commands, and the real gotchas hit
getting it there (Railway CLI quirks, Module Federation cross-origin
asset resolution, `nats-server` config).

## Conventions

- **Branch tiers:** `development` → `main` → `master`. Parent on tier X → all submodules on tier X.
- **`context-v/`** is the living documentation tree — specs, prompts, blueprints, reminders, explorations, issues. Every file carries YAML frontmatter with a four-part `semver`; reads as a journey doc with revisions appended over time.
- **`changelog/`** entries get written at the end of any coherent build session — the format follows the Lossless `changelog-conventions` skill (date-prefixed filename, frontmatter with `publish: true`, lede + Why care / What's new / How it works / What's still loose).
- **No hardcoded column names anywhere in the rendering, fold, or schema-union code.** This is load-bearing for multi-tenant correctness.
- **Microfrontends namespace their CSS** (`.rc-app`, `.rr-app`, `.pr-app`, …) so federation can't leak styles.

## Learn more

- [Rsbuild documentation](https://rsbuild.rs)
- [Module Federation Rsbuild plugin](https://module-federation.io/)
- [Svelte 5 runes](https://svelte.dev/docs/svelte/what-are-runes)
- [NATS](https://nats.io/)
