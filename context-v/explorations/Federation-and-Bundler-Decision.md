---
title: "Federation and Bundler Decision — Bun + Rsbuild + Module Federation, Workspace State, Optional Chat"
lede: "We federate: Module Federation on rsbuild, bun over turbo, and state of truth in `@augment-it/workspace` — chat is just one consumer."
date_created: 2026-05-18
date_modified: 2026-05-25
date_archived: 2026-05-25
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
semantic_version: 0.0.1.0
tags:
  - Exploration
  - Augment-It
  - Module-Federation
  - Rsbuild
  - Bun
  - In-App-Agent-Chat
  - Workspace-Pattern
  - Architecture-Decision
status: Archived
site_uuid: 140701b4-7382-4e2f-9269-187800531577
hex_code: 4hr8nm
date_authored_initial_draft: 2026-05-25
date_authored_current_draft: 2026-05-25
---

# Federation and Bundler Decision

> **Framework note (2026-05-18):** This document mentions React in passing (e.g., `@rsbuild/plugin-react`, "React 19", "thin React component"). The augment-it implementation is **Svelte 5** — matching memopop-ai and the broader Lossless family. Read every React reference as a placeholder for the Svelte 5 equivalent: `@rsbuild/plugin-svelte` for the bundler plugin; a Svelte 5 component for the shell layout; `$state` runes for the workspace's reactive primitives. The bundler + federation + bun decisions are framework-neutral and stand as written.

## Why this doc exists

The prior-art survey ([[Augment-It-Prior-Art-Survey]]) ended on three open architectural questions. This doc resolves the federation + bundler one — *do we federate, and on what bundler* — and frames it in light of the workspace-vs-chat-package split codified in [[Per-App-Workspace-Conventions]].

The decision doc is journey-mode, not a spec. It picks an answer with stated reasoning so the rewrite can proceed; revisit if reality pushes back.

## The answers, up front

| Question | Decision |
|---|---|
| Federate at all? | **Yes.** |
| Federation version | **Module Federation 2.0** (`@module-federation/rsbuild-plugin`) |
| Bundler | **rsbuild** (Rspack under the hood) |
| Workspace + script orchestrator | **bun** (drop turbo) |
| Package manager | **bun** (drop pnpm for this repo; memopop-ai already uses bun) |
| State of truth | **`@augment-it/workspace`** — per-app package, follows [[Per-App-Workspace-Conventions]] |
| Chat surface | **`@lossless/in-app-agent`**, mounted via `<AgentProvider adapter={adapter}>`. Optional — augment-it ships with it, but the workspace doesn't require it. |
| Shell layout | **Thin React component.** Mounts `<AgentProvider>` around `<ChatSurface>` + `<ActiveViewMount />`. No state ownership. |
| Remotes | The six pipeline-stage microfrontends, mounted on demand based on `workspace.activeView` |
| Shared state across host + remotes | Module Federation `singleton: true` for `@augment-it/workspace` AND `@lossless/in-app-agent`. Every consumer sees the same instance. |
| TypeScript across federated boundaries | `@module-federation/dts-plugin` |

The rest of this doc explains why each call lands where it does.

## Is bun a bundler?

Bun ships `bun build`, but it does **not** support Module Federation. The MF ecosystem is webpack/rspack-born — federation primitives, runtime, dts-plugin, and the 2.0 specification all live in that lineage. Vite has a federation plugin (`@module-federation/vite`); bun's bundler does not.

So bun's role in this stack is:

- **Workspace manager** — `package.json` workspaces work natively
- **Script runner** — `bun run`, `bun --filter @augment-it/foo dev` for parallel per-workspace scripts
- **Package installer** — faster than npm or pnpm
- **Test runner** — for anything that doesn't need a browser
- **Runtime** — for any scripts, server-side code, CLIs

Not bun's job: bundling the frontend microfrontends. That's rsbuild.

This is the same shape memopop-ai already uses — bun orchestrates, Vite bundles the SvelteKit apps. The pattern is proven inside the family.

## Why drop turbo?

Turbo's main value-add is **build-output caching across CI runs**. For local dev — which is where the rewrite lives this week — bun's `--filter` plus per-app `dev` scripts is enough. Turbo can be re-added later if CI cache hit rate becomes meaningful.

Memopop-ai uses bun without turbo and runs fine. We follow the family pattern.

## Why rsbuild and not Vite?

Tanuj's federation experiment ([[Tanuj-Request-Reviewer-As-Built]]) used Vite + `@module-federation-vite/*`. Three reasons we pick rsbuild instead for the rewrite:

1. **Module Federation's home is webpack/rspack.** It was born there, and Module Federation 2.0's first-class integration is `@module-federation/rsbuild-plugin`. The Vite plugin is the popular newcomer, not the canonical implementation. When something breaks at the federation seam, the rspack path has more tooling and more documented gotchas.
2. **The current rebuild branch already picked rsbuild.** `augment-it/package.json` declares `@rsbuild/core` and `@rsbuild/plugin-react`. Switching back to Vite would mean throwing away the rebuild branch's substrate choices in addition to Tanuj's Vite work. Better to commit to one path.
3. **Speed.** Rspack is Rust-based and meaningfully faster than Vite on large federated graphs. For a six-remote setup with workspace and chat hosts, this compounds.

Cost of the choice: rebuilding Tanuj's `@module-federation-vite/ui/RecordCard` extraction on the rsbuild substrate. Real work but not enormous — the *pattern* survives, only the bundler config changes.

## Things to know about rsbuild going in

Five real challenges first-timers hit. None of them are show-stoppers; all of them cost time if you don't see them coming. **Captured operationally in [[Module-Federation-Rsbuild-Dev-Loop-Gotchas]]** — read that doc when setting up a new app:

1. **Module Federation config lives inside `tools.rspack`** — the escape hatch to raw rspack config.
2. **TypeScript across federated boundaries needs `@module-federation/dts-plugin`** — easy to forget, painful to retrofit.
3. **Cross-origin HMR setup is finicky.** Silent-failure shaped. Save in a remote, no update in the host. CORS detail.
4. **Module Federation 2.0 ≠ 1.0.** Most online tutorials are 1.0.
5. **Plugin ecosystem smaller than Vite's** but rsbuild can consume most webpack plugins.

## The load-bearing realization — state lives per-app, chat is one consumer

Yesterday's mental model: six co-equal microfrontends, each owning its pipeline stage UI, sharing state somehow. This is the model that produced Tanuj's smoking gun — `RecordCard` federated cleanly as a dumb atom, `generateDefaultPrompt` copy-pasted between siblings because there was nowhere to share stateful logic.

Today's mental model: **`@augment-it/workspace` is the source of truth**. It's a per-app package that holds records, prompt templates, responses, highlights, jobs, tenant, user, and the discriminated `activeView` union. The chat surface (`@lossless/in-app-agent`) is **mounted as one consumer of the workspace** — it speaks to the workspace through a typed `WorkspaceAdapter` interface, calls `workspace.invoke()` for capabilities, and renders transcripts + character-cast. The six pipeline-stage UIs are federated remotes that mount based on `workspace.activeView`. Both Window and Chat subscribe to the same workspace singleton; updates mirror in realtime through Module Federation's `singleton: true` guarantee.

What this dissolves:

| Old problem | Resolution under workspace-as-source-of-truth |
|---|---|
| Where does the shared store live? | In `@augment-it/workspace`. Federation `singleton: true` guarantees one instance across host + remotes. |
| How do remotes coordinate state changes? | `workspace.invoke('entity.verb', args)` — the only documented mutation surface, per [[Per-App-Workspace-Conventions]]. |
| How does the user navigate between stages? | `workspace.activeView` transitions. Either driven by chat capability invocations (with `display_hint`) or by Window buttons (direct `invoke()`). |
| How do we test microfrontends in isolation? | Each remote is a standalone React component that calls `useWorkspace()`. Federation is build-time, not test-time. Mock the workspace in tests. |
| Two patterns in one codebase (atoms federated, logic copy-pasted) | One pattern: visual atoms federate as components; logic federates as the singleton'd workspace; state writes always go through `invoke()`. |
| Does the chat lock us into a chat-primary UX? | No. The workspace is the source of truth regardless of whether chat is mounted. Headless workflows and Window-only apps consume it the same way. |

This is a cleaner architecture than what Tanuj was reaching for, and it converges Augment-It with the rest of the Applied AI Labs family — same workspace conventions as memopop and dididecks, same `WorkspaceAdapter` contract for the chat package, same federation discipline.

What this *introduces* as real constraints:

- **`@augment-it/workspace` must be MF-singleton'd in every host and remote.** Otherwise each remote loads its own workspace instance and "shared state" silently fragments.
- **`@lossless/in-app-agent` must also be MF-singleton'd in apps that ship chat.** Same reason, for transcript and chat context.
- **The chat must mount and unmount federated remotes dynamically** based on `workspace.activeView` transitions. That's a real piece of work inside the chat package, but it's the work that's needed for memopop and dididecks too — augment-it isn't paying a unique cost. Specified in [[Remote-Mount-Contract-for-In-App-Agent]].

## What this means for the package and apps layout

A first-cut sketch of the rewrite's structure, to be replaced by real sitemap docs as we go:

```
augment-it/
├── packages/
│   ├── workspace/             # @augment-it/workspace — state class, capability registry,
│   │                          #   useWorkspace() hook, adapter, ActiveView union
│   ├── shared-services/       # response handlers, prompt builders, CSV parser,
│   │                          #   per-research-agent implementations
│   ├── shared-ui/             # RecordCard, RecordList, ErrorBoundary,
│   │                          #   atomic display components
│   ├── shared-types/          # Record, PromptTemplate, AIResponse, Highlight,
│   │                          #   AgentResult — shared across workspace + remotes
│   └── config/                # rsbuild presets, shared tsconfig, eslint base
├── shell/                     # Thin layout: <AgentProvider adapter>, <ChatSurface>,
│   │                          #   <ActiveViewMount />. No state ownership.
│   └── src/App.tsx
├── apps/                      # federated remotes, one per pipeline stage
│   ├── record-collector/      # ingest views (ImportModal, RecordList)
│   ├── prompt-template-manager/  # prompt CRUD + library
│   ├── request-reviewer/      # pre-flight inspection
│   ├── response-reviewer/     # post-flight inspection (NEW — never built standalone)
│   ├── highlight-collector/   # distill stage (NEW — only in bolt)
│   └── insight-manager/       # CRM write-back staging + adapters
└── splash/                    # marketing / docs site (already built)
```

Three changes from the current state:

1. **`packages/workspace/` is new.** Per [[Per-App-Workspace-Conventions]], every app ships its own workspace package. This is augment-it's. Imports flow inward (`apps/*` and `shell/` import from `packages/workspace`); the workspace imports nothing app-specific.
2. **`shell/` is a thin layout component**, not the chat host. It mounts `<AgentProvider>` with the workspace adapter, places `<ChatSurface>` and `<ActiveViewMount />`, handles top-level auth gating. ~50 lines of React.
3. **Two genuinely new app remotes** (`response-reviewer/`, `highlight-collector/`) need to be created from scratch — the bolt monolith has the patterns but they were never split into their own deployables.

This sketch is a hypothesis, not a commitment. The forward sitemap docs will refine it.

## What this means for state ownership

Per [[Per-App-Workspace-Conventions]] — `@augment-it/workspace` owns:

1. **Records.** Imported rows from CSVs / CRM exports.
2. **Prompt templates.** The library, with `{{variable}}` placeholders.
3. **Responses.** Raw LLM/research-agent outputs per (record × agent).
4. **Highlights.** User-confirmed spans extracted from responses, ready for CRM write-back.
5. **Jobs + job events.** The fan-out runs (per [[Multi-Agent-Research-Fan-Out-Per-Row]]); the SSE event stream with `lastSeenSeq` dedup.
6. **Tenant, user, identity.**
7. **`activeView`.** The discriminated union driving which remote is currently mounted.
8. **The capability registry.** All of augment-it's `entity.verb` handlers — the only mutation surface.

`@lossless/in-app-agent` owns (separately, in its own singleton):

1. **Transcript.** The conversation history.
2. **Character cast.** Which named agents are currently working — shared display pattern across memopop and augment-it.
3. **AgentClient.** The streaming connection to the LLM.
4. **Conversational state.** `isStreaming`, current model selection, etc.

Remotes own (locally, not federated):

1. **UI state.** Form values, expanded/collapsed sections, focus, selection.
2. **Derived views.** Each remote derives its render from workspace state; the derivation logic is local.

The seam between remotes and workspace: `useWorkspace()` for reads, `workspace.invoke('entity.verb', args)` for writes. The seam between chat and workspace: the `WorkspaceAdapter` interface, instantiated once per app, passed to `<AgentProvider>`. Specified in [[Remote-Mount-Contract-for-In-App-Agent]].

## What's still open after this doc

1. **Where the response-reviewer + highlight-collector live as remotes** — they're new, and the bolt-era analyses are the only existing description. Forward sitemap docs will spec them.
2. **CRM write-back adapter layout.** Insight-manager is the "land" stage, but it needs per-CRM adapters (HubSpot, Salesforce, Affinity, Notion). Probably a sub-package per CRM under `packages/shared-services/crm-adapters/`. Out of scope here.
3. **State-management library inside `@augment-it/workspace`.** [[Per-App-Workspace-Conventions]] leaves the choice to each app: hand-rolled `useSyncExternalStore`, Zustand, or Jotai. Pick one; don't mix.
4. **What happens to the bolt analyses we lifted.** Once the forward sitemap files exist, the `Bolt-*-Analysis.md` files become reference-only ancestors and can be cross-linked from `superseded_by:` fields on the forward docs.

## Next actions enabled by this decision

In order:

1. **Update the parent monorepo's stack.** `package.json` workspaces field already exists; drop turbo, swap pnpm for bun. Adjust `rsbuild.config.ts` to declare host vs. remote presets. Add `@module-federation/rsbuild-plugin` and `@module-federation/dts-plugin`. Declare `@augment-it/workspace` and `@lossless/in-app-agent` as MF `singleton: true`. ~30 min of config work; verify by running an empty graph.
2. **Stub `packages/workspace/` and `packages/shared-types/` first**, then the six `apps/*` and remaining packages as intentional READMEs describing what they'll hold. No code yet. Per the prior-art survey's "what needs to happen this week" #3.
3. **Implement `@augment-it/workspace`** per [[Per-App-Workspace-Conventions]] — state class, capability registry, adapter, hook. This unblocks every remote.
4. **Author the forward sitemap.** Per-microfrontend, per-shared-package standalone docs. Each one cites the corresponding `Bolt-*-Analysis.md` or `Tanuj-*-As-Built.md` as its prior-art ancestor.

## Related

- [[Augment-It-Prior-Art-Survey]]
- [[Bolt-Monolith-As-Built]]
- [[Tanuj-Request-Reviewer-As-Built]] — the federation experiment this decision builds on
- [[Module-Federation-Rsbuild-Dev-Loop-Gotchas]] — operational reference for the five rsbuild gotchas
- [[Multi-Agent-Research-Fan-Out-Per-Row]] — the augment-it-specific runtime concern the workspace's job model serves
- [[Per-App-Workspace-Conventions]] (ai-labs) — the shared discipline this decision sits inside
- [[Remote-Mount-Contract-for-In-App-Agent]] (ai-labs) — the chat-to-workspace seam this decision adopts
- [[In-App-Chat-as-Agent-Surface-for-Client-Apps]] (ai-labs) — the chat substrate
- [[In-App-Agent-Chat-Walking-Skeleton]] (ai-labs) — the package skeleton this decision integrates with
- `augment-it/package.json` — current rebuild branch stack declaration
- Memopop-ai — reference for bun-as-orchestrator pattern and the FlowState that taught us the workspace pattern

## Version notes

- **0.0.0.1** (2026-05-18) — Initial draft. Framed "chat is the shell" with state owned by the chat package.
- **0.0.1.0** (2026-05-18) — Revised after the workspace-vs-chat split was clarified in [[Per-App-Workspace-Conventions]]. State of truth now lives in `@augment-it/workspace`, not inside the chat package. Chat becomes an optional consumer of the workspace via `WorkspaceAdapter`. Shell layout becomes a thin React component that mounts `<AgentProvider>` and `<ActiveViewMount />`. `packages/workspace/` added to the layout sketch as the load-bearing new package. State-ownership section rewritten to reflect the three-way split (workspace owns business data; chat owns conversational state; remotes own UI ephemera). Module Federation `singleton: true` requirement now applies to both `@augment-it/workspace` and `@lossless/in-app-agent`.
