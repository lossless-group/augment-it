---
title: "Workspaces as Tenant Primitive — toggling, tenant-aware microservices, per-tenant env-var pickup, and the seam that lets MCPs and connectors vary per client"
lede: >-
  `workspace` is the tenant boundary — humain-vc vs reach-edu. The vision is stated once, then step 1 is cut down to filesystem-only bones.
date_created: 2026-06-11
date_modified: 2026-06-21
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
semantic_version: 0.0.0.2
tags:
  - Spec
  - Augment-It
  - Workspaces
  - Tenant-Boundary
  - Multi-Tenant
  - Connector-Config
  - Env-Var-Adapter
  - Filesystem-Backed
  - Cross-Cutting-Pillar-Contract
  - Humain-VC
  - Reach-Edu
status: Draft
site_uuid: dbffa0a4-189b-420e-a29e-94faa0c8c6b0
hex_code: 5ja6op
date_authored_initial_draft: 2026-06-11
date_authored_current_draft: 2026-06-11
---

# Workspaces as Tenant Primitive

## What this spec is

This spec defines the **workspace** as the tenant boundary inside augment-it,
pins the long-arc vision so future feature work has a target to compose against,
and scopes baby step 1 down to a filesystem-only walking version that is
genuinely small but does not paint future steps into a corner. Sibling pillar
apps in `ai-labs/` — `memopop-ai` and `dididecks-ai` — adopt the same shape
later via the same contract; this spec is the cross-cutting one even though
the implementation lands first in augment-it.

It is **inspired by** [[Cloud-Variant-of-Dididecks-AI-Workspace]] and reuses
that exploration's privacy-properties table as a forward-looking constraint,
but it diverges in two ways the reader should know up front:

1. **Storage:** the cloud-variant exploration is reasoning about S3 + KMS +
   Postgres RLS. This spec is filesystem-backed (`clients/<slug>/`) because
   that is the actual current ground truth. The seam is designed so the
   cloud-variant's adapters can be slotted in later without re-cutting the
   workspace contract.
2. **Scope:** the cloud-variant exploration is dididecks-only. This spec is
   the cross-cutting contract — workspace is the tenant primitive across all
   three pillar apps. The shape has to be sharable.

## Name collision (lived with, not renamed)

There is a prior plan, [[Augment-It-Workspace-Walking-Skeleton]], that uses
the word **workspace** in a different sense — the singular architectural
substrate (Svelte 5 singleton + Node/Fastify Workspace Service + NATS bus)
that holds row state for the running app. That substrate shipped.

This spec uses **workspace** to mean **tenant boundary** — one of many
per running app, the thing the operator toggles between to switch from
humain-vc to reach-edu.

Both meanings live. Resolution is in prose where ambiguity matters:

- The prior plan's **Workspace Service** (the container) keeps its name; it
  is the runtime substrate that now also has to become tenant-aware.
- This spec's **workspace** (lowercase, the tenant) is the new concept; every
  occurrence of "workspace" below means *tenant boundary* unless explicitly
  qualified.
- When we need to disambiguate in code, we use `tenant_slug` / `workspace_slug`
  as the field name on the wire (substrate-irrelevant) and `WorkspaceService`
  (PascalCase, container name) for the substrate component.

This is deliberate — see [[feedback_context_v_evolves_in_prose]]. The context-v
record carries the evolution; we do not rewrite history to dodge a name
collision.

## Terminal vision (what workspaces eventually do)

Locked here so baby step 1 does not foreclose any of it. None of the following
ships in baby step 1; it ships in named later steps.

1. **Tenant identity.** A workspace is the unit of "whose data am I working
   in right now." Every record set, every corpus directory, every fire, every
   response, every audit-log entry, every env-var resolution is workspace-
   scoped.
2. **Team membership, roles, permissions.** A workspace has members; members
   have roles; roles confer permissions. The admin surface for managing this
   lives inside the workspace, governed by an `admin` role. Default roles:
   `admin`, `editor`, `viewer`. Permissions are capability-gated at the
   workspace boundary, not at the record-set level.
3. **Registration and auth flow.** A user signs up, joins or creates a
   workspace, and from then on every session is workspace-bound. Switching
   workspaces is a first-class action — not a re-login but a context switch.
   Inherits from [[Install-Auth-Across-Applied-AI-Labs-Apps]] (the auth
   blueprint) once that lands.
4. **Per-workspace branded theme.** Each workspace controls design tokens
   (colors, typography, spacing) via a `theme.css` override layered on top
   of the shipping three-mode theme system. Inherits from the `theme-system`
   skill's two-tier-token discipline.
5. **Per-workspace connector configuration.** The headline mechanic. A
   workspace declares which LLM provider it uses, which CRM (Decile,
   HubSpot, Salesforce, custom), which MCP servers (Gmail, Drive, GitHub,
   custom), which search providers (SearXNG, Tavily, SerpApi), which storage
   destination (filesystem-now, S3, Powabase later). Each connector reads
   from the workspace's `.env` namespace and is resolved at request time.
6. **Cross-cutting across pillar apps.** memopop-ai and dididecks-ai adopt
   the same workspace contract. A user with workspaces `humain-vc` and
   `reach-edu` sees the same toggle in every pillar app; the active
   workspace is shared across apps in the same session.
7. **Tamper-evident audit log.** Every workspace-scoped operation writes
   to an append-only log inside the workspace (`clients/<slug>/audit/`)
   keyed by user + capability + payload-hash + timestamp. Filesystem-first;
   moves to a separate trust boundary when the cloud variant arrives.
8. **Termination and export.** Deleting a workspace deletes its
   `clients/<slug>/` tree (modulo retention). Exporting a workspace is a
   zip of the same tree. Filesystem-now makes both trivial; the seam stays
   the same when storage moves.

Items 2–4 and 7–8 are explicitly **out of scope** for baby step 1. They are
named here so the seam designed in step 1 absorbs them later without re-cut.

## Why filesystem-first

Stated plainly so future agents do not skip to the cloud shape prematurely:

- Local-fs makes the privacy properties from the cloud-variant exploration's
  table mostly free; we should consume that gift while it is on offer.
- A DB schema for workspaces invites premature commitment to RBAC tables,
  membership tables, audit tables before the connector-config seam is
  exercised against real per-tenant integrations.
- The operator (the human) is currently the only user; multi-user / auth
  arrives later and the shape it takes is informed by what the connector
  seam produces, not the other way around.
- `clients/<slug>/.env` is already the working convention (humain-vc has one;
  reach-edu has one). Designing toward what already works beats inventing
  a workspace-config DB.

## Baby step 1 — scope

The smallest end-to-end version that exercises the workspace primitive
through every layer of the existing stack. Five mechanics, all filesystem-
backed, none of them admin-grade.

### 1. Workspace registry (filesystem-discovered)

`clients/` is the registry. Each immediate child directory is a candidate
workspace. A workspace exists when its directory exists and contains at
minimum:

```
clients/<slug>/
├── .env                    # per-workspace environment, gitignored
├── .gitignore              # at minimum guards .env
└── (corpus/, inputs/, outputs/ created lazily)
```

No `workspace.json` manifest, no registry DB. The directory IS the workspace.
A future step adds a `clients/<slug>/workspace.yaml` for display name, theme
overrides, member list — but baby step 1 derives display name from the slug
(title-case-with-dashes-broken).

### 2. Active workspace, persisted

The shell holds `active_workspace_slug` in localStorage. On boot, the shell:

1. Reads the persisted slug.
2. If it points to a directory that no longer exists, falls back to the
   first slug in alphabetical order (`humain-vc` today; resilient to additions).
3. Publishes `workspace.active.changed` on the NATS bus so every service
   that holds workspace-scoped state can react.

Following the pattern from [[dffaac6 — Sort & Filter Lens auto-falls-back]] —
when localStorage points at a now-gone target, fall back gracefully.

**Workspace vs. Flow — orthogonal axes.** `active_workspace_slug` answers
*which client*. It is deliberately independent of *which use-case* (augment
records vs. curate a domain/thesis vs. reconcile to canonical DB) — see
[[../explorations/Augment-It-Has-Outgrown-One-Flow-The-Choose-A-Flow-Front-Door]],
which proposes a header-level "jumbo popdown" navigate-action for the
domain/thesis-curation use-case (no persisted state of its own, unlike this
spec's workspace slug — keep the two conceptually separate regardless).
Note also: this spec's "Flow 1" language
elsewhere in the docs (the humain-vc user-journey plan) and the shell's
`ROTATION` numbered nav are two more senses of the word "flow" — that
exploration's §"three senses of Flow" disambiguates all three.

### 3. Toggle UI

A workspace switcher lives in the shell chrome — not inside any single
remote. Minimum shape:

- A button or chip showing the active workspace's display name.
- Click → dropdown of all discovered workspaces.
- Selecting one fires `workspace.activate` on the workspace-service.
- The shell broadcasts the change; remotes that care re-render against the
  new context.

No design tokens shift in baby step 1 — the theme stays the shipping
three-mode default. Per-workspace theme is item 4 of the terminal vision and
is explicitly later.

### 4. Tenant-aware envelope on every microservice request

Every NATS message envelope gains a required field:

```jsonc
{
  "kind": "invoke",
  "id": "inv_abc123",
  "workspace_slug": "humain-vc",
  "capability": "row.list",
  "args": { ... }
}
```

`WorkspaceService` (the container) injects `workspace_slug` from the
session's active workspace on every outbound NATS request. Domain services
treat unscoped requests as a programming error and refuse them with a clear
log line — not a runtime crash, but a refusal that makes the missing-slug
case loud.

Implication for existing handlers:

- `services/content-ingest/` — `corpus.list_for_record`, `corpus.add`,
  `corpus.list_for_record`, `promote-snapshot` — all gain a `workspace_slug`
  parameter and resolve paths against `clients/<slug>/corpus/` instead of
  the hardcoded one.
- `services/row-store/` — record sets are workspace-scoped; the JSON store
  becomes per-workspace (`clients/<slug>/rows.json` or `data/<slug>/rows.json`,
  TBD in implementation phase).
- `services/social-search/`, `services/prompt-runner/`,
  `services/response-store/`, `services/ingest/`, `services/xlsx-ingest/`
  — each receives `workspace_slug` and uses it to scope state and to
  resolve connector configuration (see § 5).

### 5. Per-workspace `.env` pickup via a connector-config seam

The load-bearing design moment of baby step 1. Done well, the rest of the
vision composes onto it; done thoughtlessly, every future integration
re-cuts the wire.

#### The seam

A workspace's `.env` is loaded into a **scoped config object** keyed by
workspace slug, NOT merged into `process.env`. Merging into `process.env`
would create cross-workspace bleed the moment we have two workspaces active
in the same Node process (which we do, because `WorkspaceService` serves
all sessions).

```ts
// packages/workspace/src/config.ts
export interface WorkspaceConfig {
  slug: string;
  env: Readonly<Record<string, string>>;     // raw .env contents, frozen
  connectors: ConnectorRegistry;             // resolved typed connectors
}

export interface ConnectorRegistry {
  llm?:     LLMConnectorConfig;     // anthropic | openai | local | ...
  search?:  SearchConnectorConfig;  // searxng | tavily | serpapi | ...
  crm?:     CRMConnectorConfig;     // decile | hubspot | salesforce | ...
  mcp?:     MCPConnectorConfig[];   // arbitrary set of MCP servers
  storage?: StorageConnectorConfig; // filesystem | s3 | powabase | ...
}
```

Services do not read `process.env.ANTHROPIC_API_KEY` directly. They request
the workspace's resolved `connectors.llm` from `WorkspaceService` (in-process
when running together, via NATS request/reply when separated).

#### The Decile worked example

`clients/humain-vc/.env` contains:

```sh
DECILE_API_URL=https://humain.decilehub.com
DECILE_HUB_API_KEY=...
```

(These are the real Decile Hub var names, confirmed against the API spec — the
tenant is encoded in the subdomain, so there is no separate `DECILE_TENANT_ID`,
and the token is sent raw in the `Authorization` header. See the
[[decile-hub-connector]] skill.)

The connector resolver maps the `DECILE_*` prefix to a `crm` connector of
kind `decile`. A future `crm.list_deals` capability dispatches against
`workspace.connectors.crm` — when the active workspace is `humain-vc` it
resolves to the Decile config; when the active workspace is `reach-edu`
(which does not have Decile configured) it returns `null` and the capability
publishes a `crm.not_configured` event instead of erroring.

The pattern generalizes: every connector kind has a **prefix or set of
prefixes** in the env namespace, a **resolver** that maps from prefix to
typed config, and a **fallback** of either another configured provider or
`not_configured`. Adding a new CRM (HubSpot) is: register the `HUBSPOT_*`
prefix, write the resolver, ship.

#### What the seam buys us

- Decile lands without touching any other client's behavior.
- A new MCP server (say, Gmail for one client, Drive for another) is a
  registry entry, not a rewrite.
- The cloud-variant's "per-workspace KMS keys" property has a place to live
  later — the resolver gains a "fetch from KMS" branch alongside the
  "read from .env" branch.
- The `connectors` object is the *only* surface domain services read
  workspace-scoped configuration from. That makes the audit story tractable:
  every connector access can be logged at the resolver, not at every caller.

### Migration: reach-edu → humain-vc as primary

The submodule pointer on `rebuild/turbo-rsbuild` is currently
`clients/reach-edu`. Baby step 1 makes `humain-vc` the default active
workspace (alphabetically first; matches the user's stated intent of
building humain-vc functionality first and back-porting to reach-edu).

Concretely:

- `clients/humain-vc/` is committed to the repo (currently untracked with
  `.env` + `.gitignore`). Submodule or in-tree TBD by the
  pseudomonorepos relocation discipline — `.env` is sensitive, must be
  backed up before any move.
- `clients/reach-edu/` (submodule) stays where it is; loses primacy but
  not presence.
- The toggle defaults to humain-vc on a fresh localStorage; users who had
  reach-edu active retain it (the persisted slug survives the change).

## What is explicitly NOT in baby step 1

- Auth, registration, sessions tied to humans. The "active workspace" is
  per-browser, not per-user.
- RBAC, roles, permissions. The operator is the only role.
- Per-workspace theme. The three-mode theme is unchanged.
- Audit log. The seam exists at the connector resolver; the writer doesn't.
- Cross-app workspace sync (sibling pillar apps inheriting the same
  active-workspace context). The contract is shared; the inheritance
  ships per-app, on each pillar's own schedule.
- A workspace-creation UI. Workspaces are created by `mkdir
  clients/<slug>/` and dropping a `.env` in. The toggle picks them up
  on next boot.
- Connector kinds beyond the registry shape. The `LLMConnectorConfig`,
  `SearchConnectorConfig`, etc. types are declared and at least one is
  exercised end-to-end (likely `search` via the existing SearXNG +
  Tavily seam, since that code already exists). Decile is the design
  target for the *next* step's worked example, not the one baby step 1
  has to ship working.

## Forward inheritance — sibling pillar apps

memopop-ai and dididecks-ai are explicit consumers of this contract. The
shared parts live in `packages/workspace/` inside augment-it; they
graduate to `ai-labs/packages/workspace/` (a shared package) when the
second pillar app picks them up. Until then, the contract is exercised
in augment-it, with copies-for-now allowed in the other pillars if their
own walking-skeletons land before extraction.

What inherits:

- The `WorkspaceConfig` and `ConnectorRegistry` interfaces.
- The `workspace_slug`-on-every-envelope discipline.
- The `clients/<slug>/.env` convention (or each app's equivalent root —
  memopop-ai may use `users/<slug>/`, dididecks-ai may use
  `client-sites/<slug>/`; the *seam* is shared, the *root directory name*
  is per-app).
- The `workspace.active.changed` event semantics.

What does not need to be shared:

- The toggle UI (each app has its own shell chrome).
- The fallback rules (each app may have a different "first" workspace).

## Open questions

- **Same-session multi-workspace.** Can a single browser tab hold two
  workspaces open side-by-side (e.g., comparing humain-vc and reach-edu
  in a split view)? Baby step 1 assumes no — one active workspace per
  session. If yes becomes a requirement, the WS-envelope `workspace_slug`
  scales fine, but the shell's "active" notion has to fork into "active
  per pane."
- **Per-workspace data files inside `clients/<slug>/`.** Today the corpus
  lives there but the row-store JSON lives in `services/row-store/data/`.
  Does the row-store JSON move into `clients/<slug>/rows.json` so the
  workspace is truly self-contained on disk? Lean yes; makes export and
  termination trivial. Decide in implementation.
- **`.env` reloading without restart.** When the operator edits
  `clients/humain-vc/.env` to add a Decile key, do we expect them to
  restart the stack or do we file-watch and re-resolve? Lean toward
  file-watch for the dev experience; trivial with `chokidar`. Worth
  pinning in the implementation plan.
- **What happens when a workspace's `.env` references a secret store**
  (1Password CLI, `op://...` URLs) instead of plain values? The resolver
  has a clean place to grow that branch. Out of scope to build now; in
  scope to not foreclose.
- **Where does the toggle live in dididecks-ai and memopop-ai?** The
  shell chrome differs across pillars. Likely each pillar reuses a
  shared component but mounts it in its own chrome. Confirm when the
  second pillar adopts.
- **Theme override loading.** When per-workspace theme arrives, where
  do the override tokens live — `clients/<slug>/theme.css` (filesystem)
  or a `theme:` block in `clients/<slug>/workspace.yaml`? The
  `maintain-design-md` skill prefers prose-with-frontmatter; aligns
  toward the YAML option.

## See also

- [[Augment-It-Workspace-Walking-Skeleton]] — the prior plan whose
  "workspace" names the architectural substrate (lived-with collision).
- [[Cloud-Variant-of-Dididecks-AI-Workspace]] — the exploration this
  spec is inspired by; the privacy-properties table is the forward
  constraint the connector seam has to absorb when storage moves
  off filesystem.
- [[Funder-Content-Corpus-Workflow]] — the corpus convention that
  established `clients/<slug>/corpus/` as the per-tenant content root;
  this spec generalizes that pattern from corpus-only to all per-tenant
  state.
- [[Install-Auth-Across-Applied-AI-Labs-Apps]] — the auth blueprint
  the workspace's eventual identity/RBAC layer inherits from.
- [[Per-App-Workspace-Conventions]] — the parent blueprint the prior
  walking-skeleton plan instantiated; this spec extends with the
  tenant-boundary dimension.
- [[feedback_context_v_evolves_in_prose]] — why the name collision
  with the prior plan is left in place.
