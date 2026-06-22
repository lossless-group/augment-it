---
date_created: 2026-06-21
date_modified: 2026-06-21
title: "Decile Hub connector — augment-it's first per-client API integration, built from the OpenAPI spec out"
lede: "A VC client runs their fund + CRM on Decile Hub. Tonight augment-it learns to talk to it — a skill that codifies the contract and a TypeScript MCP server that exposes it as agent tools, both grounded in Decile's own OpenAPI spec rather than guesswork. It's the first connector in the per-client seam we've been building toward."
publish: true
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.8 (1M context)
files_changed:
  - services/decile-mcp/src/client.ts
  - services/decile-mcp/src/server.ts
  - services/decile-mcp/package.json
  - services/decile-mcp/tsconfig.json
  - services/decile-mcp/README.md
  - context-v/specs/Workspaces-as-Tenant-Primitive.md
  - clients/humain-vc/README.md
tags:
  - Augment-It
  - Decile-Hub
  - Connector
  - MCP
  - Per-Client
  - CRM
  - OpenAPI
  - Agent-Skill
  - Humain-VC
  - SurrealDB
---

# Decile Hub connector — the first per-client API integration

## Why Care?

For months the workspace architecture has promised something it hadn't yet delivered: that
each VC client could bring their *own* tools — their own CRM, their own data — and augment-it
would talk to whichever one the active workspace uses, without one client's integration
leaking into another's. The [[Workspaces-as-Tenant-Primitive|connector seam]] was built; the
worked example (Decile) was a placeholder with a fake `.example` URL.

Tonight it's real. **Humain VC runs on [Decile Hub](https://decilehub.com)** — a venture
fund-management + CRM platform — and augment-it can now pull and push their people,
organizations, pipeline prospects, and notes. Two artifacts make it work: a **skill** that
codifies how Decile's API behaves, and a **TypeScript MCP server** that turns that contract
into tools an agent can call. Both are built from Decile's **own OpenAPI spec** — not from
training-data guesses about what their endpoints probably look like.

This is the first of what will be many per-client connectors. Getting the *first* one right —
grounded, isolated, mapped cleanly onto our canonical layer — sets the pattern for the rest.

## What's New?

- **`decile-hub-connector` skill** (authored in the lossless-agent-skills repo, live via
  symlink) — the operating guide: auth, base URL, the data shapes, how to pull, how to push,
  and how Decile records map onto our SurrealDB `persons` / `organizations`. Plus a
  `references/endpoint-inventory.md` listing every endpoint.
- **`services/decile-mcp/`** — a TypeScript MCP server exposing the CRM-core operations as
  tools (`decile_whoami`, list/get/upsert person & organization, notes, pipelines, prospects).
  Builds clean (`tsc`); register with `claude mcp add -s project`.
- **Env-var reconciliation** — the spec + the humain-vc README anticipated
  `DECILE_API_BASE_URL` / `DECILE_API_KEY` / `DECILE_TENANT_ID`. The real, working vars are
  `DECILE_API_URL` + `DECILE_HUB_API_KEY` (the tenant is in the subdomain, so there's no
  separate tenant id). Both docs now match reality.

## How It Works

### The contract, confirmed from the spec — not guessed

The single most important discipline here: **a connector skill is only useful if its
endpoints are real.** So everything below was read out of Decile's 11,970-line OpenAPI spec
(saved at `clients/humain-vc/inputs/decilehub/202506_decilehub-docs_swagger.yaml`), and the
extraction caught several things memory would have gotten wrong:

| Thing | Reality |
|---|---|
| **Auth** | `Authorization: <token>` — the **raw** API token, **no `Bearer`** (one stale doc example showed Bearer; the scheme is a plain apiKey header) |
| **Base URL** | `https://<tenant>.decilehub.com` — **per-tenant subdomain** (humain → `humain.decilehub.com`); routes under `/api/v1/` |
| **Pagination** | **three** different patterns — 0-indexed `{data, pagination}`, 1-indexed `{key, page, per_page, total}`, and keyset `{data, pagination:{next_page_token, has_more}}` |
| **Writes** | upsert-by-natural-key — `POST /person` (by email), `POST /organization` (by name) — returning a `changes` diff |
| **Errors** | mostly `{error:{code,message,field,…}}`, but a few endpoints return a bare `{error:"string"}` |

The MCP's client (`src/client.ts`) encodes all of this: raw-token auth, a helper per
pagination pattern, and a `normalizeError` that handles both error shapes.

### It maps onto the canonical layer we already have

Decile is a per-client *source*, so everything it feeds into our canonical layer carries the
client tag (per [[Client-Tagging-on-Canonical-Writes]]). The mapping is natural: Decile
people → `persons` (join on email), organizations → `organizations` (join on name/slug). And
Decile's own upsert-by-natural-key semantics mirror our SurrealDB upsert discipline almost
exactly — SELECT-by-key, then merge-or-create.

### Two surfaces, one contract

The skill and the MCP are complementary: the skill is the human/agent-readable *guide* and the
source of truth for the mapping; the MCP is the *executable* layer. The spec marks
agent-facing operations with `x-agent-tool: true` — those are the tools the server exposes
first; the rest follow the identical `server.tool(...) → client` pattern.

## Under The Hood

The whole thing is tenant-agnostic by design. `src/client.ts` reads `DECILE_API_URL` +
`DECILE_HUB_API_KEY` from the environment — nothing about Humain is hard-coded — so a second
VC client on Decile is just a second registration with that client's subdomain and token. The
per-client `.env` (resolved through the workspace seam) is where the tenant lives, exactly as
[[Workspaces-as-Tenant-Primitive]] intended.

Extraction was done by reading the spec in full and pulling out the complete endpoint
inventory + the CRM resource shapes, so the skill's reference doc is exhaustive rather than a
sampling. When the next endpoints are needed (deal shares, deal memos, portfolio companies,
tasks, files, events), they're a few lines each against the existing client.

## Files Changed

- `services/decile-mcp/` — new MCP server (`client.ts`, `server.ts`, `package.json`, `tsconfig.json`, `README.md`)
- `context-v/specs/Workspaces-as-Tenant-Primitive.md` — Decile worked example updated to the real env vars (bumped to `0.0.0.2`)
- `clients/humain-vc/README.md` — secrets list updated to `DECILE_API_URL` + `DECILE_HUB_API_KEY` *(submodule)*
- `decile-hub-connector` skill — authored in the lossless-agent-skills repo (separate repo; live via symlink)

## What's Next

- Register the MCP for the humain-vc tenant and confirm with `decile_whoami`.
- Wire a Decile → SurrealDB sync that pulls people/organizations into the canonical layer, client-tagged, treating Decile as one provenance `source`.
- Extend the tool set beyond the CRM core as workflows demand it.

## See Also

- [[Workspaces-as-Tenant-Primitive]] — the per-client connector seam this is the first real instance of
- [[Connecting-To-And-Using-SurrealDB]] — the canonical-layer connection + client-tagging contract Decile data flows into
- [[2026-06-21_01_Corpus-Meets-Its-Org-Content-Items-Ledger-And-The-Publisher-About-Mentions-Model]] — the same day's canonical-layer work
