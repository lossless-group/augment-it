---
title: "Every remote hardcodes the workspace WebSocket to localhost — Org Workbench loads no data on augment.didi.sh"
lede: "Sixteen remotes dial `ws://localhost:3001/ws` with no env read. On prod that points at the visitor's own laptop, so the socket shows `closed` and the roster never fills."
date_created: 2026-08-21
date_modified: 2026-08-21
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5
semantic_version: 0.0.0.1
tags:
  - Issue
  - Augment-It
  - Org-Workbench
  - Deployment
  - Microfrontends
  - WebSocket
  - Reach-Edu
  - Module-Federation
status: Open · Diagnosed · Root cause pinned to a one-line source defect
site_uuid: c85ae72b-182a-4d7a-b8b7-ac47e8ffb3de
hex_code: 3jweyu
date_authored_initial_draft: 2026-08-21
date_authored_current_draft: 2026-08-21
publish: true
---

# Every remote hardcodes the workspace WS to localhost

## Why Care?

On `https://augment.didi.sh`, the **Org Workbench** surface for the
**reach-edu** workspace renders its chrome — title, `SurrealDB · Organizations`
badge, `client: reach-edu`, search box, `+ New organization` — and then shows
**nothing**. No coverage roster, no organizations, no people. A red **`closed`**
pill sits in the top-right corner. The same surface, same workspace, same commit
works perfectly on `localhost:3100`.

That "works local, dead on prod" split is the tell, and it is not a data
problem, a SurrealDB problem, or a tenancy problem. The remote is asking the
*visitor's own laptop* for its data.

## The root cause — one line, no env read

`apps/org-workbench/src/App.svelte:20`:

```ts
const WS_URL = 'ws://localhost:3001/ws';
```

That is the whole bug. Compare the pattern the shell, `chat`, and
`corpora-curator` all use correctly — for example `shell/src/App.svelte:41-43`:

```ts
const WS_URL =
  ((import.meta as { env?: Record<string, string> }).env?.PUBLIC_WS_URL as string | undefined) ||
  'ws://localhost:3001/ws';
```

rsbuild inlines `PUBLIC_`-prefixed vars into `import.meta.env` at build time.
Org Workbench never performs that read, so no build-time value can reach it.

**The deployment looks correctly configured, which is what makes this
expensive to spot.** `apps/org-workbench/Dockerfile:23-28` faithfully declares
and exports the variable:

```dockerfile
ARG PUBLIC_WS_URL
ENV PUBLIC_WS_URL=$PUBLIC_WS_URL
```

and Railway sets it per [[../../DEPLOYMENT]]. Every rung of the config chain is
green. The value simply lands in a build environment that no source line ever
consults, and is dropped on the floor.

## Two independent reasons it can never work in production

1. **Wrong host.** `localhost:3001` in a browser on `augment.didi.sh` resolves
   to the *viewer's* machine, not Railway's `workspace-service`. It works on
   the operator's laptop for the accidental reason that the laptop really is
   running `workspace-service` on `:3001` — the local stack masks the defect
   perfectly.
2. **Mixed content.** Even if a viewer *did* run the backend locally, an
   insecure `ws://` connection is blocked outright by every modern browser when
   the page origin is `https://`. Prod needs `wss://ws.augment.didi.sh/ws`.

## Blast radius — this is a family defect, not one surface

Sixteen remotes carry the identical hardcoded constant:

| App | Line | Deployed to prod? |
|---|---|---|
| `org-workbench` | `App.svelte:20` | **yes** — broken, this report |
| `search-and-add` | `App.svelte:22` | **yes** — same break |
| `search-results` | `App.svelte:16` | **yes** — same break |
| `corpora-curator` | `App.svelte:9` | yes — *works anyway*, see below |
| `chat` | `App.svelte:20` | yes — correct, reads env with localhost fallback |
| `record-collector`, `records-surface`, `pack-runner`, `sort-filter-lens`, `person-db-resolver`, `record-db-resolver`, `affiliation-rating-resolver`, `enhanced-records-list`, `prompt-template-manager`, `request-reviewer`, `response-reviewer` | various | no — latent, will break on the day they deploy |

**The entire Augment-from-DB flow is down on prod**, not just Org Workbench —
`org-workbench`, `search-and-add`, and `search-results` are the three services
that flow comprises, and all three share the bug.

Two nuances worth recording:

- **`corpora-curator` works by luck of file layout.** Its `App.svelte:9` has the
  same dead hardcoded constant, but its *real* client lives in
  `src/curation.svelte.ts:21-23`, which does read `PUBLIC_WS_URL`. The unused
  constant in `App.svelte` is a live trap for the next person who wires a socket
  there.
- **`chat` is the reference implementation.** `apps/chat/src/App.svelte:16-20`
  gets it exactly right, comment included.

This is a *different* axis from [[Move-Remaining-Remotes-To-Remote-Hosting-Prod-Falls-Back-To-Localhost]].
That issue is about where the shell fetches each remote's **`remoteEntry.js`
asset**. This one is about where an already-loaded remote opens its **data
socket**. Org Workbench proves they are independent: its asset *is* properly
hosted on Railway and loads fine — then it dials localhost for data.

## Why the symptom reads as "no data" rather than "error"

`apps/org-workbench/src/App.svelte:38` models the socket as:

```ts
let status = $state<'connecting' | 'open' | 'closed' | 'error' | 'auth_required'>('connecting');
```

The `closed` badge in the corner is that state, faithfully rendered. But the
main pane does not branch on it — it keeps showing the neutral instructional
copy, *"Pick an organization from the coverage roster on the left (fewest corpus
items first), or search above…"*, inviting the operator to use a roster that can
never populate. The UI tells the truth in a 60px pill and lies in the 1200px
region next to it. See [[Live-Not-Live-Indicator-Tooling-And-Cross-Service-Error-Surfacing]]
and [[No-User-Visibility-Into-State-Needs-A-State-Inspector]].

## The fix

1. **Replace the constant in all sixteen apps** with the env-reading form. This
   is mechanical and identical everywhere; `chat` is the template to copy.
2. **Delete the dead constant** in `corpora-curator/src/App.svelte:9` so it
   cannot be picked up by accident.
3. **Set `PUBLIC_WS_URL=wss://ws.augment.didi.sh/ws`** on the `org-workbench`,
   `search-and-add`, and `search-results` Railway services, then **rebuild** —
   `PUBLIC_*` is baked at build time, so `railway redeploy --service <name>
   --from-source` is required. A restart will not do it.
4. **Make the empty state honest** — when `status` is `closed` / `error`, the
   main pane should say the connection failed, not invite a roster pick.
5. **Guard it so it cannot regress.** Two cheap options: extend
   `scripts/design-drift.mjs` (or add a sibling lint) with a rule banning
   literal `ws://localhost` outside a fallback expression, or assert on it in
   the test harness named in [[No-Test-Coverage-TDD-Deferred-Despite-Agentic-Fit]].
   Without a guard this returns the next time a remote is scaffolded by copy-paste.

## Suggested verification

Per the browser-drive discipline in `CLAUDE.md`, the click-path is: load
`https://augment.didi.sh`, sign in, switch workspace to **Reach Edu**, open the
**Org Workbench** flow, and assert the connection pill reads `open` and the
coverage roster renders ≥1 organization. That drive currently fails at the pill
and is the regression test for this fix.

## Related

- [[Move-Remaining-Remotes-To-Remote-Hosting-Prod-Falls-Back-To-Localhost]] — sibling deployment defect, different axis
- [[Search-And-Add-Invokes-Never-Reach-The-Workspace]] — same flow; worth re-checking whether its prod symptom is actually *this*
- [[Domain-Type-Is-Ambient-State-So-A-Failed-Workspace-Load-Hides-Every-Corpus]] — the same failure-hidden-behind-a-neutral-empty-state shape
- [[A-Failed-Deploy-Is-Silent-Nothing-Watches-Production-After-Merge]] — why this survived undetected on prod
- [[Live-Not-Live-Indicator-Tooling-And-Cross-Service-Error-Surfacing]]
