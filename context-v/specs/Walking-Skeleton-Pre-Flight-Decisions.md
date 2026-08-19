---
title: "Walking-Skeleton Pre-Flight Decisions — Augment-It Rewrite"
lede: >-
  Five substrate decisions — state, transport, persistence, auth, agent scaffolding — settled before code so no session re-walks the tree.
date_created: 2026-05-18
date_modified: 2026-05-25
date_completed: 2026-05-21
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
semantic_version: 0.0.0.2
revisions:
  - 2026-05-25 — Status swept to Shipped; foundation built per changelog 2026-05-21_01..02. Note: Decision 2 (Transport — HTTP fetch) was revised mid-flight by [[Augment-It-Workspace-Walking-Skeleton]] to WebSocket + NATS for the 26-product client demo. All other decisions held.
tags:
  - Spec
  - Augment-It
  - Walking-Skeleton
  - Pre-Flight
  - State-Management
  - Transport
  - Persistence
  - Auth
  - Bun-Sidecar
status: Shipped
site_uuid: baa60859-b0c8-4fed-8d1b-ef14ccccf4a5
hex_code: zfhtul
date_authored_initial_draft: 2026-05-25
date_authored_current_draft: 2026-05-25
publish: true
---

# Walking-Skeleton Pre-Flight Decisions

> **Framework note (2026-05-18):** This document was originally drafted with React 19 as the implied UI framework. The augment-it implementation is **Svelte 5** — matching memopop-ai and the broader Lossless family. The architectural decisions below remain valid; Decision 1's pick has been updated in-place to reflect Svelte 5 `$state` runes (the corresponding React `useSyncExternalStore` plumbing is preserved in the "considered and not picked" section for cross-framework reference).

## Why this doc exists

The architectural docs ([[Federation-and-Bundler-Decision]], [[Per-App-Workspace-Conventions]], [[Remote-Mount-Contract-for-In-App-Agent]], [[Multi-Agent-Research-Fan-Out-Per-Row]]) settled the *shape* of the rewrite. This doc settles the *substrate* — the five concrete picks that have to exist for the first line of code to be writeable.

Stating them out loud so:

- A future session loading these docs cold can move to implementation without re-running the decision tree
- The team has one place to push back on these calls if any of them feel wrong on contact with the code
- The pattern of "decide before code" is preserved across the project; the user has been explicit that ducttape now costs more than discipline now

The five items in order:

1. State management library inside `@augment-it/workspace`
2. Transport pattern for capability handlers
3. Persistence story for v1
4. Auth shape — sessions and user IDs without OAuth
5. `@lossless/in-app-agent` scaffolding ownership *(still open as of 2026-05-18)*

## Decision 1 — Svelte 5 `$state` runes on a workspace class

**Pick:** A singleton class with `$state` runes on its fields. The same pattern as memopop's `FlowState` (`memopop-ai/apps/memopop-native/src/lib/stores/flow.svelte.ts`). Svelte components import the singleton directly; reactivity is native — no hook plumbing, no manual listener Set, no `useSyncExternalStore` bridge.

**Why:**

- **Matches memopop verbatim.** Pattern lift-and-shift, not translation. Reduces architectural drift across the family.
- **Native reactivity.** Svelte 5 runes track field mutations directly; subscribers re-render automatically when the singleton's fields change. No manual `subscribe` / `notify` plumbing required.
- **The class is still portable.** Same singleton runs in headless workflow scripts (no Svelte renderer loaded — runes degrade gracefully when not in a component context, or use plain fields with `$state.raw` for non-reactive contexts), in tests (instantiate directly), in any context.
- **Less code than the React alternative.** No `listeners: Set<() => void>`, no `notify()`, no `useSyncExternalStore` boilerplate. The class declares its fields with `$state(...)`; mutations are direct.

**Reference implementation sketch** (will be expanded into real code in `@augment-it/workspace/src/state.svelte.ts`):

```ts
// @augment-it/workspace/src/state.svelte.ts
import type { WorkspaceSnapshot, ActiveView, JobEvent, FileEntry } from './types';

class AugmentItWorkspace {
  activeView = $state<ActiveView>({ kind: 'idle' });
  records = $state<Record<string, Row[]>>({});
  responses = $state<QueryResponse[]>([]);
  highlights = $state<Highlight[]>([]);
  events = $state.raw<JobEvent[]>([]);            // raw — append-only, high-frequency
  files = $state.raw<Map<string, FileEntry>>(new Map());
  user = $state<UserContext | null>(null);
  private lastSeenSeq = -1;                        // SSE dedup — plain field, not reactive

  async invoke(capability: string, args: unknown) {
    const result = await this.registry.dispatch(capability, args);
    if (result.display_hint) {
      this.activeView = this.viewFromHint(result.display_hint);
    }
    return result;
  }

  ingestEvent(event: JobEvent) {
    if (event.seq <= this.lastSeenSeq) return;
    this.lastSeenSeq = event.seq;
    this.events = [...this.events, event];          // new reference triggers reactivity
    if (this.events.length > 2000) this.events = this.events.slice(-2000);
  }
}

export const workspace = new AugmentItWorkspace();
```

Svelte components consume directly — no hook layer:

```svelte
<!-- inside a component -->
<script lang="ts">
  import { workspace } from '@augment-it/workspace';

  async function handleEnrich(recordId: string) {
    await workspace.invoke('enrich.row', { record_id: recordId, agents: ['social_profiles'] });
  }
</script>

{#if workspace.activeView.kind === 'record_list'}
  <RecordList recordSetId={workspace.activeView.recordSetId} />
{:else if workspace.activeView.kind === 'enrichment_job'}
  <JobView jobId={workspace.activeView.jobId} />
{/if}
```

**Considered and not picked:**

- **Hand-rolled React `useSyncExternalStore`.** Would work if augment-it were React. Roughly equivalent in semantics — a class with `subscribe`, `getSnapshot`, and a listener `Set`, bridged to React via the hook. Preserved here as cross-framework reference because the conventions blueprint ([[Per-App-Workspace-Conventions]]) documents it as the React equivalent; if augment-it ever has a React-rendered surface (a public-web embed, for example), this is the pattern to use.
- **Zustand.** Solid library, ~1KB, devtools available. Real friction is the TS-generic dance when stacking middleware, the selector-discipline cliff, and the immutable-update-by-default discipline. All workable, none preferred when memopop already proves the `$state`-class pattern works.
- **Jotai.** Atom-based, React-first. Wrong framework, wrong shape.
- **Svelte stores (writable / readable).** The older Svelte 4 pattern. Svelte 5 runes are the modern replacement; the writable-store pattern is mostly legacy now and doesn't compose as cleanly with class methods.

**Considered and not picked:**

- **Zustand.** Solid library, ~1KB, devtools available. Real friction is the TS-generic dance when stacking middleware (`create<T>()(devtools(persist(...)))`), the selector-discipline cliff (naive `useStore()` whole-state re-renders), and the immutable-update-by-default discipline (feels old-fashioned coming from MobX or Redux-Toolkit-with-Immer). All workable, none preferred when we can own ~25 lines instead.
- **Jotai.** Atom-based, finer-grained subscriptions, popular for React-first projects. Wrong shape for our class-with-methods workspace pattern.
- **MobX.** Mutable proxies. Pleasant DX but introduces a runtime and a mental model. Overkill.

## Decision 2 — HTTP fetch to a bun sidecar at `localhost:8787`

**Pick:** Capability handlers in `@augment-it/workspace` make `fetch()` calls to a bun-served HTTP sidecar running at `localhost:8787` in dev. The sidecar lives at `augment-it/apps/sidecar/`. The rsbuild dev server proxies `/api/*` to the sidecar so the frontend can use relative URLs.

**Why this exists at all:**

Capability handlers cannot run entirely in the browser. Three independent forcing functions:

1. **API keys** for Anthropic, Perplexity, news APIs, etc. cannot ship in a browser bundle.
2. **Web crawling** can't happen from the browser (CORS, no robots.txt honor, no per-domain politeness).
3. **Rate-limit coordination** needs a single authoritative process; browser tabs are bad at sharing this.

A server is non-negotiable; the question was which shape.

**Why bun sidecar over alternatives:**

- Same package manager as the frontend; same TypeScript runtime; one mental model.
- `bun --watch apps/sidecar/src/server.ts` is the dev command. Hot reload works.
- The same code deploys to production later as a long-running process on a VPS, or with minor adjustments as a Vercel/Cloudflare worker. No throwaway scaffolding.
- Memopop-ai already runs a server-side orchestrator (FastAPI). The pattern is family-consistent; the language differs by intentional choice (TS over Python in augment-it because the per-research-agent backends are easier to type-share with the frontend).

**Considered and not picked:**

- **All-in-browser.** Impossible per the forcing functions above.
- **Serverless from day one.** Production-shape but slow inner loop (deploy roundtrips, harder debugging) and unnecessary infrastructure for laptop dev.
- **Python FastAPI** like memopop. Adds a second language runtime to one repo. Loses the bun-everywhere benefit. Reasonable if augment-it had to share orchestrator code with memopop, but it doesn't.

**Concrete shape:**

```ts
// augment-it/apps/sidecar/src/server.ts
import { serve } from 'bun';
import { resolveSession } from './sessions';
import { handlers } from './capabilities';

serve({
  port: 8787,
  async fetch(req) {
    const session = await resolveSession(req);
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) {
      const capability = url.pathname.replace('/api/', '').replace(/\//g, '.');
      const handler = handlers[capability];
      if (!handler) return Response.json({ error: 'unknown_capability' }, { status: 404 });
      const args = req.method === 'POST' ? await req.json() : Object.fromEntries(url.searchParams);
      const result = await handler(args, { user: session.user_id, org: session.org_id });
      return Response.json(result);
    }
    return new Response('Not Found', { status: 404 });
  },
});
```

```ts
// rsbuild.config.ts (frontend)
export default {
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
};
```

## Decision 3 — Sidecar persists to local JSON files; libSQL when multi-device demands it

**Pick:** The bun sidecar persists records, prompt templates, responses, highlights, and sessions to JSON files under `augment-it/data/` (gitignored). Files are read on each request for v1; in-memory caching can be added if it becomes a real bottleneck.

**Why:**

- The sidecar already exists for transport (Decision 2). Persistence is essentially free — `Bun.write(path, JSON.stringify(...))` and `Bun.file(path).json()`.
- Solves the "annoying to re-upload the CSV every refresh" pain point with zero additional infrastructure. State survives reloads, dev-server restarts, even checkouts.
- Same pattern memopop already uses for its orchestrator (per-deal YAML/markdown artifacts on disk). Proven inside the family.
- The files are inspectable, diffable, and recoverable. When debugging, you can `cat data/records.json` and see exactly what state the system holds.

**Files (initial set):**

```
augment-it/data/
├── records.json          # { record_set_id: Record[] }
├── prompts.json          # PromptTemplate[]
├── responses.json        # { record_id: { agent: AgentResult }[] }
├── highlights.json       # Highlight[]
├── jobs.json             # { job_id: JobState }
└── sessions.json         # { session_token: Session }
```

All gitignored. A `data/.gitkeep` preserves the directory shape.

**When to graduate to libSQL/Turso:**

- When you and a client are looking at the same record set from different devices (real multi-tenancy)
- When queries beyond "give me everything" matter (filter, paginate, sort across thousands of records)
- When parsing on every request becomes measurable latency — probably around the time `records.json` exceeds 5MB

Until then, JSON files are not a compromise. They're correct for the scale.

## Decision 4 — Opaque session tokens auto-minted on first contact

**Pick:** The sidecar mints an opaque session token (a UUID) on the browser's first request. The token is returned to the browser, stored in `localStorage`, and sent on every subsequent request via an `x-augment-it-session` header. The sidecar maintains a `sessions.json` file mapping tokens to `{ user_id, org_id, role, name, created_at, last_seen }`. Every capability invocation receives a `user` field in its context resolved from the session.

**Why:**

- No login flow required. Open the app, get a session, work.
- Real `user_id` flows through every capability — transcripts, audit logs, future per-org tenancy all work from day one.
- Real session concept — clear `localStorage` to "sign out"; the next request mints a fresh user.
- Multiple identities for free — a private browser window is a different user, useful for testing role-based behavior.
- Clean upgrade path. When real auth lands (OAuth, magic links, whatever) the same token shape can be issued by an authenticated flow; capability handlers don't change.

**Shape:**

```ts
// augment-it/apps/sidecar/src/sessions.ts
import { randomUUID } from 'node:crypto';

interface Session {
  user_id: string;
  org_id: string;
  role: 'viewer' | 'user' | 'admin';
  name: string;             // friendly, defaults to 'Anon-{first-7-of-uuid}'
  created_at: string;
  last_seen: string;
}

const sessions = await loadSessions();  // from ./data/sessions.json

export async function resolveSession(req: Request) {
  const token = req.headers.get('x-augment-it-session');
  if (token && sessions.has(token)) {
    const s = sessions.get(token)!;
    s.last_seen = new Date().toISOString();
    await persistSessions();
    return { token, ...s };
  }
  // First contact — mint a new session + user
  const newToken = randomUUID();
  const newUserId = `user_${newToken.slice(0, 8)}`;
  const session: Session = {
    user_id: newUserId,
    org_id: 'lossless-internal',
    role: 'admin',
    name: `Anon-${newToken.slice(0, 7)}`,
    created_at: new Date().toISOString(),
    last_seen: new Date().toISOString(),
  };
  sessions.set(newToken, session);
  await persistSessions();
  return { token: newToken, ...session };
}
```

```ts
// frontend bootstrap, in @augment-it/workspace/src/bootstrap.ts
let token = localStorage.getItem('augment-it-session');
const r = await fetch('/api/session', {
  headers: token ? { 'x-augment-it-session': token } : {},
});
const session = await r.json();
localStorage.setItem('augment-it-session', session.token);
workspace.setUser(session);
```

**Optional sugar (v1.1):**

- A "set your name" UI that hits `PATCH /api/session/me` so you don't stare at `Anon-7f3a` in the transcript
- A "reset session" button that clears `localStorage` and reloads

**Role default for v1:** every new session gets `role: 'admin'`. Tier gating exists in the capability registry but isn't enforced in single-user dev. When multi-user becomes real, role assignment moves into the session mint flow.

**Default `org_id`:** `'lossless-internal'` for everything until per-client tenancy lands per [[In-App-Agent-Chat-Walking-Skeleton]] Phase 2.

## Decision 5 — Augment-it drives the `@lossless/in-app-agent` scaffolding

**Pick:** Augment-it's first implementation session scaffolds a minimal `@lossless/in-app-agent` alongside `@augment-it/workspace`. The full contract surface exists from day one; the implementations behind it are stubs that get filled in over subsequent sessions.

**Rationale:** Claude Code is reliably strong on broadly-scoped, coherent, well-documented work. The full architecture is documented across [[Per-App-Workspace-Conventions]], [[Remote-Mount-Contract-for-In-App-Agent]], and [[Federation-and-Bundler-Decision]]; scaffolding both packages in one focused session is well within scope. The alternative (ship augment-it Window-only first, scaffold the chat package later) delays integration without buying any clarity we don't already have.

**What "minimally" means for `@lossless/in-app-agent` in this session:**

The package's *contract surface* is complete; its *behavior* is stubbed. Concretely:

```
ai-labs/packages/in-app-agent/
├── package.json               # name: @lossless/in-app-agent
├── tsconfig.json
├── README.md                  # one paragraph + link to spec
├── prompts/
│   └── system.md              # first cut of the static system prompt (per walking-skeleton Phase 1)
└── src/
    ├── index.ts               # re-exports
    ├── types/
    │   ├── WorkspaceAdapter.ts   # the typed interface — FULLY DEFINED
    │   ├── CapabilityResult.ts   # FULLY DEFINED
    │   ├── ChatContext.ts        # what useChat() returns — FULLY DEFINED
    │   └── AgentClient.ts        # interface only — no implementation
    ├── provider/
    │   └── AgentProvider.tsx     # React Context provider — works, holds adapter, no chat behavior
    ├── chat/
    │   └── ChatSurface.tsx       # renders an empty <div>; props typed correctly
    ├── hooks/
    │   └── useChat.ts            # returns stub: { transcript: [], cast: [], isStreaming: false, sendMessage: async () => {} }
    └── registry/
        ├── runtime.ts            # dispatch via adapter.invoke(); validate args; record transcript entries
        └── types.ts              # Capability, CapabilityContext
```

What this lets augment-it do in session 1:

- Mount `<AgentProvider adapter={augmentItAdapter}>` in the shell — real provider, real adapter, real context propagation
- Mount `<ChatSurface>` as a placeholder — renders nothing useful but proves the layout works
- Wire workspace capability invocations through `adapter.invoke()` — full path is exercised
- Have the `WorkspaceAdapter` interface enforced at the type level — every property of the contract is real

What's deferred to session 2+:

- The actual `AgentClient` HTTP implementation (Anthropic streaming, tool-use formatting)
- The chat UI inside `<ChatSurface>` (message list, composer, character-cast row)
- The transcript persistence (lives in the workspace; the chat just reads from there)
- Prompt-cache breakpoints in the system prompt

This is the **walking-skeleton Phase 1** from [[In-App-Agent-Chat-Walking-Skeleton]], adapted: augment-it drives it because augment-it is the first consumer to ship.

**Cost:** ~2 hours of additional scaffolding in the first session. Acceptable in exchange for the integration arriving early.

**Open follow-up:** which capability gets implemented end-to-end first. Recommendation in the "Implementation order" section: `records.import` for state-flow proof, then `research.social_profiles` for the multi-agent fan-out proof.

## What this doc does not cover

- **Per-research-agent backend implementations.** Captured in [[Multi-Agent-Research-Fan-Out-Per-Row]]. First agent to wire end-to-end is `research.social_profiles` (recommended — fastest, cleanest API surface).
- **The exact rsbuild + MF config.** Captured operationally in [[Module-Federation-Rsbuild-Dev-Loop-Gotchas]]. Walking skeleton starts as a single bundle; federation is session 2.
- **CRM write-back target.** Deferred until insight-manager is built. This week's client deliverable goes through CSV-out.
- **Display-hint vocabulary.** Grows as remotes are built; each remote's introduction adds variants to the `ActiveView` discriminated union.
- **Forward sitemap docs.** Better written as each remote ships than predicted upfront.

## Implementation order this enables

1. Configure rsbuild + bun + workspaces in the parent monorepo (~30 min). No MF yet — single bundle for the walking skeleton.
2. Stub `apps/sidecar/` with `serve()`, the session resolver, and one capability stub (`records.import`). Run `bun --watch` (~30 min).
3. Stub `packages/workspace/` per [[Per-App-Workspace-Conventions]] — the class, `getSnapshot`, `subscribe`, `invoke`, the `useWorkspace` hook (~60 min).
4. Resolve Decision 5; either scaffold `@lossless/in-app-agent` minimally or skip it for now (~30 min if scaffolding, 0 if skipping).
5. Build the first capability end-to-end: `records.import` from a CSV → records visible in a stub React component via `useWorkspace()` (~60 min).
6. Wire `research.social_profiles` as the first research agent — sidecar fetches a public API, returns a result, gets stored in `responses.json`, visible in the UI (~90 min).
7. Add Module Federation in session 2 once the single-bundle walking skeleton works end-to-end.

Estimated total for steps 1–6: one focused day. The five gotchas from [[Module-Federation-Rsbuild-Dev-Loop-Gotchas]] can mostly be skipped at this stage because we're single-bundle.

## Related

- [[Augment-It-Prior-Art-Survey]]
- [[Federation-and-Bundler-Decision]]
- [[Multi-Agent-Research-Fan-Out-Per-Row]]
- [[Module-Federation-Rsbuild-Dev-Loop-Gotchas]]
- [[Per-App-Workspace-Conventions]] (ai-labs)
- [[Remote-Mount-Contract-for-In-App-Agent]] (ai-labs)
- [[In-App-Agent-Chat-Walking-Skeleton]] (ai-labs) — Phase 1 ownership pending (Decision 5)
- `memopop-ai/apps/memopop-orchestrator/` — reference for the bun-sidecar-equivalent pattern (Python FastAPI variant)
- `memopop-ai/apps/memopop-native/src/lib/stores/flow.svelte.ts` — reference for the workspace class pattern (Svelte variant)
