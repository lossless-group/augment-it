---
title: "Corpora Builder Harmony — the evolving test registry"
lede: "Every proposed and implemented test guarding the corpora builder and the systems it must harmonize with — identity, workspace connector, transport, state, canonical layer, files — in human language, MECE, one ✓-phrase each."
date_created: 2026-07-30
date_modified: 2026-08-01
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
  - Claude Code on Claude Opus 4.8
semantic_version: 0.0.0.3
status: Implementing · 9 of 10 Groups Landed
tags:
  - Spec
  - Augment-It
  - Testing
  - Corpora-Builder
  - Workspace-Auth
  - Test-Registry
---

# Corpora Builder Harmony — the evolving test registry

**This spec will evolve.** It is the living registry of every test we
propose and implement, described in human language: what each test is
for, where the test lives, and where the functionality it guards lives
in the repo. When a test is written, its entry here moves from
*Proposed* to *Implemented* and gains its real file path. When new
functionality ships, its tests get registered here first. A test that
exists but isn't in this registry is invisible; a registry entry with no
test is a promise — this document is where both states are visible at
once.

The harness decisions live in
[[Test-Coverage-Harness-And-Regression-Floor]] (Vitest + Playwright
here; ExUnit in id-didi-sh). This spec starts with the **corpora
builder** and every system it must work in harmony with, because that's
where the live pain is ([[Troubleshooting-Workspace-DB-State-Alignment]]).

> **Status 2026-08-01 — 9 of 10 groups Implemented, 39 tests green.** This
> table is authoritative; per-group ✓-phrase sub-labels below may lag.
>
> | Group | Area | Tests | Where |
> |---|---|---|---|
> | A | Identity contract (ExUnit) | 5 | `id-didi-sh/test/id_didi_sh_web/controllers/identity_contract_test.exs` |
> | B | Session tenancy | 5 | `services/workspace/test/tenancy.test.ts` |
> | C | Transport resilience | 4 | `packages/workspace/test/transport.test.ts` |
> | D | Workspace registry | 3 | `services/workspace/test/workspaces.test.ts` |
> | E | Canonical CRUD | 7 | `services/record-surrealdb-resolver/test/domains.test.ts` |
> | F | Corpus file layer | 3 | `services/content-ingest/test/corpus-files.test.ts` |
> | G | Curator state (runes) | 5 | `apps/strategy-curator/test/curation.test.ts` |
> | H | Chat corpora slab | 2 | `services/workspace/test/chat-corpora-slab.test.ts` |
> | I | End-to-end | — | **Deferred** — see Group I |
> | J | Alignment audit | 5 | `services/record-surrealdb-resolver/test/alignment.test.ts` + `scripts/audit-corpora-alignment.mjs` |
>
> **Two bugs caught by the suite, not by a human:** (1) Group C's property
> test *"no invoke silently vanishes"* exposed a real reconnect bug — the
> transport's reconnect chain died on any *refused* connection because
> Node's WebSocket signals that only via `error`, never `close`, and only
> `close` scheduled a reconnect (fixed in `transport.ts`, now guarded).
> (2) Group J's audit, on first run against live data, flagged two real
> drifts: `strategy:rural-income-boosts` in the DB but not on humain-vc's
> disk (the known mis-scope), and `strategy:upward-mobility` on reach-edu's
> disk with no DB row (a new orphan-folder finding).
>
> **No new runtime dependencies** — only test libraries (vitest,
> @sveltejs/vite-plugin-svelte, jsdom). The `ws` package stays out: the
> transport tests use a hand-rolled RFC-6455 server, and Group B tests the
> tenancy logic directly rather than over a cookie-bearing socket.

## Why Care?

The corpora builder is the heart of the product's research loop: an
operator (or didi, on their behalf) files sources into thesis /
strategy / topic corpora, per workspace, and everything downstream —
briefs, enrichment, exports — reads from what lands. It only works when
seven layers agree: the identity service says who you are, the session
carries which workspaces you may touch, the transport actually delivers
your invokes, the workspace registry knows each client's defaults, the
canonical layer records the domain and its sources, the file layer
mirrors them as markdown, and the surface state shows you the truth.
This week we watched that harmony fail silently — corpora created that
never landed, a rail that renders "empty" indistinguishably from
"broken." These tests make each handshake in the chain assert itself.

## The chain under test (orientation)

```
Browser (strategy-curator / org-workbench / didi chat)
  └─ packages/workspace           state singleton + WS transport
       └─ services/workspace      session, tenancy, capability dispatch
            ├─ id.didi.sh         (Elixir) JWT, JWKS, /api/me, refresh
            ├─ NATS               verb → subject fabric
            ├─ services/record-surrealdb-resolver   domains, sources,
            │                     usages, tags → SurrealDB Cloud (main/main)
            └─ services/content-ingest   corpus markdown files, Jina
                                  fetch → clients/<slug>/corpus/…
```

---

## Group A — Identity contract (id-didi-sh, ExUnit)

*Functionality lives in:* `id-didi-sh/lib/` (accounts, auth flow,
session controller). *Tests live in:* `id-didi-sh/test/` (suite already
exists; these extend it). The point of this group: the Elixir service
asserts the exact contract that augment-it's fake id-plane fixture
mimics — if the contract moves, this suite fails before the fake
silently lies.

- ✓ **a signed-in session mints a JWT carrying only didi_id and session id**
  — Purpose: the token stays deliberately minimal; tenancy never rides
  in the token. Status: Proposed.
- ✓ **the JWKS endpoint serves the key that verifies a freshly minted JWT**
  — Purpose: workspace-service's verification path has a stable,
  self-consistent key source. Status: Proposed.
- ✓ **/api/me returns org workspace memberships for the session's didi_id**
  — Purpose: the membership list workspace-service maps onto workspaces
  is correct and complete. Status: Proposed (partially covered by
  existing `auth_flow_test.exs` — audit and extend).
- ✓ **/api/session/refresh re-mints an expired JWT while the session row lives**
  — Purpose: the zombie-session fix depends on this exact behavior;
  guard it on the side that owns it. Status: Proposed.
- ✓ **/api/session/refresh refuses when the session row is dead**
  — Purpose: sign-out and revocation actually end access; refresh is
  not a resurrection spell. Status: Proposed.

## Group B — Session admission & tenancy (services/workspace)

*Functionality lives in:* `services/workspace/src/didi.ts` (JWT verify,
membership cache), `tenancy.ts` (sid-keyed state), `capabilities.ts`
(`enforceTenant`), `ws.ts` (session frame, scoped broadcasts). *Tests
live in:* `services/workspace/*.test.ts`, service tier, against the fake
id-plane fixture. Seeded by converting `scripts/prove-session-tenancy.mjs`
(20 assertions) and `prove-didi-auth.mjs`.

- ✓ **a member of one org is admitted and sees only that org's workspaces**
  — Purpose: the org-mapped gate replaces the legacy binary check
  correctly. Status: Proposed (conversion of existing prove assertions).
- ✓ **a session's workspace switch moves that session only — other users' sockets see nothing**
  — Purpose: per-sid tenancy; one client user can never swap another's
  data out from under them. Status: Proposed (conversion).
- ✓ **a capability frame naming a workspace outside the session's allowed set is refused, not remapped**
  — Purpose: `enforceTenant` makes contamination structurally
  impossible; refusal is the contract. Status: Proposed (conversion).
- ✓ **a restricted session's chat turn has its client_id overwritten from the session**
  — Purpose: didi chat can't be steered into another tenant's corpus by
  a forged context. Status: Proposed (conversion).
- ✓ **an id-service outage fails closed — nobody new is admitted**
  — Purpose: losing the identity plane degrades to locked, never to
  open. Status: Proposed (conversion).

## Group C — Client transport resilience (packages/workspace)

*Functionality lives in:* `packages/workspace/src/transport.ts` (queue,
claim protocol, deadlines, auth-death handling, refresh cadence) and
`state.svelte.ts`. *Tests live in:* `packages/workspace/*.test.ts`
against a scripted test server (`test/workspace-socket-test-server.ts` —
a hand-rolled RFC-6455 endpoint over `node:http`, ZERO runtime deps, the
`ws` package deliberately stays out) that drops/reopens sockets at
controlled moments. **This group encodes the live bugs** — suspects 0/2
in [[Troubleshooting-Workspace-DB-State-Alignment]] and the open issue
[[Search-And-Add-Invokes-Never-Reach-The-Workspace]]. **Implemented
2026-07-30** in `packages/workspace/test/transport.test.ts` (4/4 green);
the property test caught and drove the fix of a real reconnect bug (see
the ⚑ note below). Timing seam added to `transport.ts` so deadlines/
backoff are assertable in ms.

- ✓ **no invoke silently vanishes — every invoke resolves or rejects within its deadline, across every socket-churn scenario**
  — Purpose: THE property test. Frames enqueued pre-OPEN, in-flight
  during a drop, and mid-claim on reconnect must all terminate.
  Status: **Implemented** — failed first exactly as predicted, and the
  failure was real. ⚑ **Bug found & fixed:** the transport only
  scheduled a reconnect from the WebSocket `close` handler, but a
  *refused* connection (server down / mid-restart) fires only `error`
  on Node's native WebSocket — no `close`. So the reconnect chain died
  on the first failed attempt and the surface wedged until a full page
  reload. Fix: `error` on a never-opened socket now runs the same
  reconnect tail, idempotently. This is a live production fix, not just
  a test artifact — a plausible mechanism behind the zombie / lost-
  creation symptoms.
- ✓ **an invoke fired before the socket opens is delivered exactly once after open**
  — Purpose: the mount-time window (curator bootstrap, search pane
  auto-fire) is the observed failure site; pin the flush-on-open leg.
  Status: **Implemented**.
- ✓ **on close 4401 the transport fails all pending work immediately with "session expired"**
  — Purpose: auth-death is announced, never a 120-second mystery.
  Guards the `9fc2543` zombie fix. Status: **Implemented**.
- ✓ **after auth-death the transport tries one silent refresh-then-reconnect, then retries at 30 seconds — never a storm**
  — Purpose: mid-flight expiry heals invisibly; a dead session doesn't
  hammer the server at 2/sec. Status: **Implemented** (both phases:
  refresh-succeeds-reconnects, refresh-fails-waits-no-storm).
- ✓ **the hourly and on-focus token refresh actually fires and replaces the token**
  — Purpose: the proactive half of the zombie fix keeps sessions fresh
  before expiry ever hits. Status: Proposed (lives in state.svelte.ts,
  not the transport — next wave).

## Group D — Workspace registry & per-client config (services/workspace)

*Functionality lives in:* `services/workspace/src/workspaces.ts`
(clients/ scan, `.env` freeze, `default_domain_type`, `org_id`,
`WORKSPACE_ORG_MAP` fallback). **Implemented 2026-07-30** in
`services/workspace/test/workspaces.test.ts` (3/3 green) — unit tier,
each test building a throwaway `clients/` root on disk and loading the
module fresh (WORKSPACE_ORG_MAP parses once at import, so the env
fallback needs module isolation).

- ✓ **a workspace with DEFAULT_DOMAIN_TYPE=thesis reports default_domain_type "thesis"; one without reports "strategy"**
  — Purpose: suspect 1 — the humain-vc rail queries the right domain
  type only if this survives every env/volume permutation.
  Status: **Implemented**.
- ✓ **workspace.json org_id wins over the WORKSPACE_ORG_MAP env fallback; either alone suffices**
  — Purpose: the file-vs-env precedence that production tenancy hangs
  on. Status: **Implemented**.
- ✓ **a workspace directory with no .env still lists, flagged has_env false**
  — Purpose: a half-seeded volume degrades visibly, not invisibly.
  Status: **Implemented**.

## Group E — Corpora canonical CRUD (record-surrealdb-resolver)

*Functionality lives in:*
`services/record-surrealdb-resolver/src/domains.ts` (createDomain,
listDomains, retypeDomain, assembleDomain, source add/fetch/retry/
remove/update/attach, source_usages, tag vocab). *Tests live in:*
`services/record-surrealdb-resolver/*.test.ts` against a **disposable**
SurrealDB (never the shared cloud instance — the harness refuses the
production URL).

- ✓ **creating a domain registers it under exactly the requesting workspace's client slug**
  — Purpose: the rural-income-boosts mis-scope class — a corpus lands
  where it was created, nowhere else. Status: Proposed.
- ✓ **creating an existing domain from a second workspace unions the client slug instead of duplicating the row**
  — Purpose: shared domains are one row with many clients, by design;
  idempotent create is the contract. Status: Proposed.
- ✓ **domain.list filtered by type and client returns exactly that client's domains of that type**
  — Purpose: the query the corpora rail lives on. Status: Proposed.
- ✓ **domain.list with no type filter returns every domain for the client — the didi-chat view**
  — Purpose: chat's "Existing corpora" slab and the rail must be two
  views of one truth. Status: Proposed.
- ✓ **retyping a domain moves the row and every source usage with it, for all clients at once**
  — Purpose: strategy → thesis retype (the humain-vc history) can't
  strand usages under the old type. Status: Proposed.
- ✓ **adding the same URL to the same corpus twice yields one source and one usage**
  — Purpose: additive, idempotent source registration; re-adds never
  duplicate. Status: Proposed.
- ✓ **removing a source from one corpus leaves its usages in other corpora untouched**
  — Purpose: usages are per-(client, domain) edges; removal is scoped,
  never cascading across tenants. Status: Proposed.

## Group F — Corpus file layer (content-ingest)

*Functionality lives in:* `services/content-ingest/src/handlers.ts` +
`corpus.ts` (corpus.source.add/fetch/remove/update/attach/extract —
markdown files with frontmatter under
`clients/<slug>/corpus/<type-plural>/<domain-slug>/`). *Tests live in:*
`services/content-ingest/*.test.ts` against a temp clients root; Jina
mocked (no network in tests).

- ✓ **adding a source writes its markdown file into the right client, type, and domain folder**
  — Purpose: DB row and disk file are born together; the path encodes
  the same identity the row does. Status: Proposed.
- ✓ **removing a source deletes its file and binary sibling; the DB and disk agree after**
  — Purpose: the mirror stays a mirror through the destructive path
  too. Status: Proposed.
- ✓ **a domain retype moves the corpus folder and patches frontmatter for every client that shares it**
  — Purpose: the cross-service half of retype (resolver → ingest) is
  where partial failure bites; assert the re-run heals it.
  Status: Proposed.

## Group G — Curator surface state (apps/strategy-curator)

*Functionality lives in:*
`apps/strategy-curator/src/curation.svelte.ts` (bootstrap, domain-type
resolution, workspace-change handling, error surfacing). *Tests live
in:* `apps/strategy-curator/*.test.ts`, unit tier with a stubbed
workspace singleton.

- ✓ **bootstrap resolves the active workspace's default domain type before the first domain.list fires**
  — Purpose: the humain-vc rail asks for "thesis" from its very first
  query — the flat fallback never masks a loaded workspace.
  Status: Proposed.
- ✓ **switching workspaces resets the list, the active corpus, and the domain type to the new workspace's default**
  — Purpose: no state bleeds across a switch; reach-edu's "strategy"
  never haunts humain-vc's rail. Status: Proposed.
- ✓ **a workspace change broadcast from another remote re-scopes this surface too**
  — Purpose: the no-shared-singleton federation design holds — the
  cross-remote event listener is the only bridge, so it must work.
  Status: Proposed.
- ✓ **a handler error reply surfaces as a visible error, never as an empty rail**
  — Purpose: "broken" and "empty" become distinguishable — the exact
  ambiguity that stalled this week's triage. Status: Proposed.
- ✓ **a saved corpus selection is restored only if it exists in the freshly loaded list**
  — Purpose: stale localStorage from another workspace or a removed
  corpus can't wedge the surface. Status: Proposed.

## Group H — Chat curation verbs (services/workspace didi chat)

*Functionality lives in:* `services/workspace/src/chat.ts`
(CURATOR_CHAT_VERBS, existingCorporaSlab, source.add / domain.create /
corpus.inbox.add routing — the [[inbox-curation]] discipline).
**Implemented 2026-07-30** in
`services/workspace/test/chat-corpora-slab.test.ts` (2/2 green) — service
tier with capability-dispatch + NATS mocked, so the slab's contract is
pinned without a live bus. `existingCorporaSlab` was exported from
`chat.ts` for the test (previously module-private).

- ✓ **the chat prompt's "Existing corpora" slab lists every domain in the active workspace, all types**
  — Purpose: didi resolves names against reality, never fabricates a
  corpus. Status: **Implemented** (asserts the dispatch is UNFILTERED by
  type — the load-bearing difference from the curator rail's typed query).
- ✓ **when domain.list fails, the slab is omitted and the turn still completes**
  — Purpose: a resolver hiccup degrades chat gracefully instead of
  killing the turn. Status: **Implemented**.

## Group I — End-to-end harmony (Playwright, browser tier)

*Functionality:* the whole chain at once. **Status: Deferred (2026-08-01)
— a separate infrastructure effort, not a skip.** Every *layer* the E2E
would traverse is now covered at the unit/contract tier: identity (A),
tenancy (B), transport (C), registry (D), canonical CRUD (E), files (F),
curator state (G), chat (H), alignment (J). What Group I adds on top is the
full-chain walk as the operator lives it — and that requires standing up
the frontend federation stack (shell + remotes via rsbuild), Playwright,
and an auth path (real id.didi.sh or a fake id-plane serving a didi
cookie). That's a CI-infrastructure project of its own, and until it's
built the manual **browser-drive rung** (CLAUDE.md) covers the full walk.
*What it would take:* a `docker compose` (or built-preview) bring-up of
the shell + curator + workspace-service against a fake id-plane, Playwright
wired as a top-level `e2e/` suite, and a seeded disposable canonical layer.
*Tests would live in:* a top-level `e2e/` suite; these would double as the
codified browser-drives per the anchor-root blueprint.

- ✓ **sign in, land in your workspace, and see its corpora by name**
  — Purpose: the backstop for every suspect at once — asserts what the
  operator actually sees, regardless of which layer would have broken
  it. Status: Proposed.
- ✓ **create a corpus, reload the page, and it is still there**
  — Purpose: creation is durable end-to-end — the invoke left the
  browser, landed in the DB, and survives a fresh session. The
  lost-creations bug, as one sentence. Status: Proposed.
- ✓ **add a source by URL and watch it appear in that corpus's source list**
  — Purpose: the daily curation gesture, proven through all seven
  layers. Status: Proposed.
- ✓ **switch workspaces and see only the new workspace's corpora**
  — Purpose: tenancy isolation as the operator experiences it.
  Status: Proposed.
- ✓ **when the session expires the sign-in wall appears — no zombie surface, no silent empty rail**
  — Purpose: auth-death is honest in the real browser, not just in the
  transport's unit harness. Status: Proposed.

## Group J — Alignment audit (standing consistency check)

*Functionality:* the invariant across layers rather than any one of
them. *Lives in:* a runnable check (service tier + script form) usable
in CI and ad-hoc, flag-don't-fix per the surrealdb-canonical-layer
discipline.

- ✓ **for every client, the DB's domains, the corpus folders on disk, and domain.list's answer all name the same corpora**
  — Purpose: the check performed by hand on 2026-07-30 (which caught
  the missing humain-vc corpora), made permanent. Drift between the
  three stores is flagged with specifics, never auto-healed.
  Status: Proposed.

---

## MECE accounting

Each group owns one seam and no test appears twice: **A** what the
identity service promises · **B** what the session may touch · **C**
whether frames survive the wire · **D** what each workspace declares ·
**E** what the canonical layer records · **F** what the disk mirrors ·
**G** what the surface shows · **H** what didi may do on your behalf ·
**I** the whole chain as the operator lives it · **J** the standing
agreement between stores. Groups A–H are exhaustive over the layers in
the orientation diagram; I and J deliberately cross-cut them — I from
the operator's seat, J from the data's.

## Registry maintenance rules

1. New capability → register its tests here (Proposed) before or with
   implementation; the ✓-phrase is written first, as the sentence you
   want to see turn green.
2. Test implemented → entry flips to Implemented and gains the real
   test-file path.
3. Test intentionally removed or superseded → entry stays, marked so,
   with a line saying why.
4. `date_modified` and `semantic_version` bump on every registry change.

## See also

- [[Test-Coverage-Harness-And-Regression-Floor]] — harness choices, phases, fixtures
- [[Troubleshooting-Workspace-DB-State-Alignment]] — the live bug this registry's first wave encodes
- [[No-Test-Coverage-TDD-Deferred-Despite-Agentic-Fit]] — the original debt
- [[Search-And-Add-Invokes-Never-Reach-The-Workspace]] — reproduced by Group C
- [[Session-Expiry-Turns-The-App-Into-A-Zombie]] — pinned by Groups A/C/I
