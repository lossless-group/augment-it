---
title: "Workspaces become a tenant primitive — top-right switcher in the shell, per-workspace `.env` loaded scoped (not into `process.env`), `client_id` flows through every chat turn, hardcoded reach-edu retires"
lede: "augment-it was filing all its work under one tenant (reach-edu) and the slab that told the chat what `client_id` to use literally hardcoded the string. Tonight that ends. The shell grows a workspace switcher in the top-right of the header that lists every directory found under `clients/` (today: humain-vc, reach-edu), and clicking one persists the choice to localStorage, broadcasts it via `augment-it:workspace-changed`, and tells the workspace-service which `client_id` is process-wide active. The chat slab now reads the operator's pick from `ctx.client_id` (forwarded on every chat turn) and falls back to the server's process-wide active value — the hardcoded reach-edu string is gone. The load-bearing piece is the env-var seam: `clients/<slug>/.env` gets loaded into a frozen, in-memory map keyed by slug at workspace-service boot. We deliberately do NOT merge into `process.env` because the workspace-service runs in one process and serves all tenants — `process.env` would bleed Decile keys from humain-vc into a reach-edu chat turn. The connector-config seam (LLM / search / CRM / MCP / storage) the spec calls for lands in step 2; tonight surfaces the raw env, hides nothing, and gives Decile a clean home to slot into next."
publish: true
date_created: 2026-06-11
date_modified: 2026-06-11
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
tags:
  - Augment-It
  - Workspaces
  - Tenant-Boundary
  - Shell-Chrome
  - Workspace-Switcher
  - Env-Var-Seam
  - Multi-Tenant
  - Humain-VC
  - Reach-Edu
  - Baby-Step
semver: 0.0.1
---

# Workspaces as tenant primitive — baby step 1

## Why care

Until tonight, augment-it knew about exactly one client and the knowledge
was three layers deep: hardcoded in the chat slab as the literal string
`reach-edu`, implicit in every `clients/<id>/` filesystem path callers
typed by hand, and silent in the operator's head as "the only one." The
moment a second client (humain-vc) showed up — different funder list,
different corpus, different CRM (Decile, with its own API keys) — the
operator had to choose between trampling reach-edu's state every time
they switched, or carrying two checkouts. Neither is sustainable.

The fix is a tenant primitive — a **workspace** — that the operator
toggles between in the shell header. Every service that already takes a
`client_id` argument now gets it from the operator's pick, and the per-
workspace `.env` lands in a scoped, frozen map so adding humain-vc's
Decile keys doesn't bleed into a reach-edu chat turn.

## What's new

**Shell header workspace switcher (top-right).** A pill button next to
the chat/mode toggles shows the active workspace's display name; click
opens a menu listing every directory found under `clients/`, with the
active row checked, slug shown in mono underneath, and an `env` chip
when a `.env` is present. Click a row to switch. The choice persists to
`localStorage` (`augment-it:active-client-id`) and broadcasts
`augment-it:workspace-changed` so other remotes (chat first; lenses next)
update without polling.

**Workspace-service grew a registry.** New module `services/workspace/
src/workspaces.ts` discovers workspaces by scanning `CLIENTS_ROOT` (env
var; `/clients` in docker, `../../clients` in local dev). Each immediate
child directory IS a workspace; no manifest required. Three new
capabilities served locally (no NATS round-trip — workspace-service owns
this state):

- `workspace.list` → `{ workspaces: [{client_id, display_name, has_env}], active_client_id }`
- `workspace.activate` → set the process-wide active slug + return the summary
- `workspace.active` → just the active slug

Capability dispatch (`services/workspace/src/capabilities.ts`) checks a
`LOCAL_CAPABILITIES` map before falling through to the NATS path, so the
WebSocket invoke surface stays uniform for the browser.

**Per-workspace `.env` loaded scoped.** At boot, the registry reads
`clients/<slug>/.env` (when present) into a frozen `Record<string, string>`
keyed by slug. The minimal parser handles `KEY=value`, `#` comments,
single/double quoted values, and skips blank lines — no expansion (which
would only cause surprise in a per-tenant context). The map is held in
the workspace-service process and **not** merged into `process.env` —
that would bleed Decile credentials across tenants the moment any
service downstream reads from `process.env` at dispatch time.

**The chat slab stops lying.** `services/workspace/src/chat.ts` no longer
hardcodes "reach-edu." The slab reads `ctx.client_id` from the chat turn
(forwarded by the chat surface from `workspace.active_client_id`), falls
back to the server's process-wide active slug, and refuses client-scoped
capabilities when both are null. The wire field stays `client_id` —
lived-with naming collision with the prior `Workspace Service` substrate
plan, resolved in prose at the top of `[[Workspaces-as-Tenant-Primitive]]`.

**Workspace package grew an active-client surface.** `@augment-it/
workspace` exposes `workspace.workspaces`, `workspace.active_client_id`,
`workspace.loadWorkspaces()`, and `workspace.activateWorkspace(id)`.
Each federation remote gets its own singleton (no shared block in the
shell's rsbuild config); a window-event listener in the constructor keeps
every remote's `active_client_id` in sync when any switcher fires. The
chat surface's `sendContext` derived value automatically includes
`client_id` on every chat turn.

**Docker-compose mounts `clients/` read-only into workspace-service.**
Volume `./clients:/clients:ro`. The same mount that content-ingest
already had now extends to the workspace-service.

## How it works

```
clients/                            (the registry — directories are workspaces)
├── humain-vc/                      (alphabetical first → default active)
│   ├── .env                        DECILE_API_KEY=… DECILE_API_BASE_URL=…
│   └── .gitignore                  guards its own .env
└── reach-edu/                      (the prior single tenant; still works)
    ├── corpus/                     existing per-funder dirs
    ├── inputs/                     existing CSV snapshots
    └── …
```

```
boot ──▶ workspace-service reads CLIENTS_ROOT, discovers slugs, loads .envs
         into a frozen Map<slug, env>; sets active = ACTIVE_CLIENT_ID env
         or first slug alphabetically (humain-vc)

shell ──▶ WorkspaceSwitcher mounts; onMount fires workspace.list; the
         persisted localStorage pick is reconciled against what exists
         on disk (gracefully falls back to server's active if the
         persisted slug is gone — same shape as Sort & Filter Lens'
         archived-set fallback)

click ──▶ workspace.activate(client_id) → server flips its active value,
         singleton persists to localStorage, dispatches WORKSPACE_CHANGED_EVENT;
         chat remote (separate singleton) listens for the event, updates
         its own active_client_id reactively

chat ──▶ every chat_turn now includes context.client_id; chat.ts in the
         workspace-service reads it directly into the contextSlab; the
         model sees "The active client is: humain-vc" and routes
         corpus.inbox.add / pipeline.promote_snapshot with the right slug
```

## What's still loose

- **Connector-config seam** (the next baby step). The spec calls for a
  typed `ConnectorRegistry` — `llm | search | crm | mcp | storage` — that
  resolves from the raw env map per prefix (`DECILE_*` → `crm.decile`,
  `ANTHROPIC_*` → `llm.anthropic`, etc.). Tonight surfaces the raw env;
  the typed resolver lands next.
- **`workspace_slug` on every NATS envelope.** Today the slug rides only
  on chat turns and the explicit `client_id` arg on existing capabilities
  (`corpus.add`, `pipeline.promote_snapshot`). The spec calls for it on
  every envelope so a future audit log has a single place to read tenancy.
- **humain-vc tracking decision.** `clients/humain-vc/` is currently
  untracked. The workspace-service discovers it from disk regardless, but
  the operator should decide whether to mirror the reach-edu pattern
  (submodule) or commit in-tree.
- **`.env` hot reload.** The registry primes at boot. Editing
  `clients/humain-vc/.env` requires a restart today; a file-watcher lands
  whenever the connector seam gives it something to do.
- **Per-workspace theme, RBAC, audit log, registration flow.** All named
  in the spec's "Terminal vision" section as explicit later moves.
- **Sibling pillar apps (`memopop-ai`, `dididecks-ai`) adopting the same
  contract.** The shape is shared; the inheritance is per-pillar on each
  pillar's own schedule. `packages/workspace/` graduates to `ai-labs/
  packages/workspace/` when the second pillar picks it up.

## See also

- [[Workspaces-as-Tenant-Primitive]] — the spec this implements
- [[Cloud-Variant-of-Dididecks-AI-Workspace]] — the cross-cutting
  exploration that informed the privacy/adapter framing
- [[Augment-It-Workspace-Walking-Skeleton]] — the prior plan whose
  "Workspace Service" name lives alongside this one (intentionally)
