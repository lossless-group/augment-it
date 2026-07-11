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
- **Anthropic** for free-form prompt enrichment (via `prompt-runner`)
- **Search providers are pluggable** (via `social-search`): a `connectors/` seam with a common `Connector` interface, dispatched per-fire with an optional `provider_override`. **SearXNG** (self-hosted, no API key) is the default for the social packs; **Tavily** stays wired in as a peer for content-RAG packs. Response Reviewer's by-record view exposes both — each record has a SearXNG row and a Tavily row of per-pack run icons, so any source can be re-fired on any record through either provider (additive; never overrides accepted data)

## App structure

```zsh
augment-it/
├── apps/                              # Federated Svelte 5 remotes
│   ├── record-collector/        :3001 # CSV ingest, per-cell editing, socials chip row
│   ├── enhanced-records-list/   :3002 # Promoted canonical sets, generic cell rendering
│   ├── prompt-template-manager/ :3003 # Custom-prompt authoring (paired with pack-runner)
│   ├── request-reviewer/        :3004 # Pre-flight review of fan-out plans
│   ├── response-reviewer/       :3005 # By-record triage cockpit (post-flight)
│   ├── chat/                    :3006 # In-app chat verb surface (/inbox lands URLs as corpus)
│   ├── pack-runner/             :3009 # Source-bound pack invocation (paired with PTM)
│   ├── sort-filter-lens/        :3013 # First Lens — sort/filter/inline-edit over the active record set
│   ├── highlight-collector/           # planned — collect highlights from AI responses (scaffold)
│   └── insight-manager/               # planned — manage insights across responses (scaffold)
│
├── shell/                       :3000 # Window manager, peek-deck rotation, pair-mode
│
├── services/                          # Stateless TS over NATS
│   ├── ingest/                        # CSV → record_set.create (dynamic schema from headers)
│   ├── xlsx-ingest/                   # XLSX workbook → record_set.create (same shape as CSV)
│   ├── workspace/                     # Browser-facing capabilities router
│   ├── row-store/                     # Rows, record sets, promote-fold, row.fields write-back (+ socials, predecessor lineage)
│   ├── prompt-store/                  # Persists custom prompt templates
│   ├── prompt-runner/                 # Anthropic, custom prompts, per-row fan-out
│   ├── response-store/                # Sibling payload (prose + structured Candidate)
│   ├── content-ingest/                # Funder-content corpus: Jina-extracted .md + binary PDFs, record_uuid + published_at stamping, /promote-snapshot
│   └── social-search/                 # Pack search/fan-out, pluggable connectors (SearXNG default, Tavily peer)
│
├── packages/                          # Shared code
│   ├── workspace/                     # Shared types (Row, ResponseRecord, Candidate, SocialProfile)
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
- **Federation-host shell.** The shell handles peek-deck tile rotation, co-existence (50/50 splits), paired-only remotes (`pack-runner`, `chat` — not in the rotation, reached via the `augment-it:navigate` event), and runtime cross-remote communication via `window` events + localStorage.
- **Lenses.** A *lens* is a federated remote that re-presents the active record set under a different affordance shape — sort/filter, inline-edit, per-row corpus add — without leaving the record. `sort-filter-lens` is the first; registered as a third member of `AUGMENT_COMPOSITE` alongside PTM + Pack Runner. Lenses auto-fall-back to the newest non-archived record set when localStorage points at an archived one, so they survive `/promote-snapshot` cleanly.
- **Funder-content corpus.** Per-client, per-funder directory of source materials backing each row. Two entry vectors land into the same shape: the chat `/inbox <url>` verb (with active-client context) and the per-row inline "+ URL" affordance in the lens. Both run fire-and-forget through `services/content-ingest/`, Jina-extract markdown, preserve original PDFs as LFS binaries, and stamp `record_uuid` + `published_at` into frontmatter. Manual-paste URLs land regardless of domain (operator curation trumps the same-host rule, which only binds pack outputs).
- **Corpus chips tell the truth.** `corpus.list_for_record` joins by `corpus_funder_slug` as primary (one dir scan) with `record_uuid` lineage as fallback — chips stay accurate across `/promote-snapshot` cuts. `/promote-snapshot` itself derives `corpus_*` columns from filesystem state when cutting a new record set, and stitches `predecessor_record_set_id` for lineage walks.

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

The shell will be available at [http://localhost:3000](http://localhost:3000). Every remote is also independently reachable at its own port (`:3001`–`:3006`, `:3009`) — useful for debugging Module-Federation cross-origin errors which the shell's DevTools console scrubs to `'Script error.'`.

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
5 backend microservices + 3 federated frontends), two persistent volumes,
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
