---
title: "Refactoring for API Speed — a single-user app should boot in milliseconds, not a minute"
lede: "Refreshing the page takes 60s+ for the logged-in workspaces to appear, and every microfrontend/microservice hop adds latency waiting for the others to respond or 'acknowledge' each other. There is ONE user. The distributed mesh — 7+ Railway services, per-remote WebSockets, NATS request/reply, a remote cloud DB, a separate auth service — imposes coordination cost that dwarfs the actual work. This is the diagnosis and the refactor design space, measure-first."
date_created: 2026-08-02
date_modified: 2026-08-02
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.8
semantic_version: 0.0.0.1
tags:
  - Issue
  - Augment-It
  - Performance
  - Architecture
  - Refactor
  - Boot-Latency
status: Open · Diagnosed · Refactor Backlog
---

# Refactoring for API Speed

## MEASURED — 2026-08-03 (the refactor premise was WRONG)

Step 0 ran (boot instrumentation shipped, shell redeployed, operator refreshed).
The result overturns the diagnosis below:

- **The backend is fast.** `shell:mount → workspaces:ready = ~543ms` total:
  `ws:open` 430ms, `workspace.list:returned` +110ms (2 workspaces, humain-vc
  active). **There is no 60s retry race. The API/mesh is not the problem.**
- **The perceived minute had two real causes, neither architectural:**
  1. **A stale shell deploy.** The live build was from 2026-07-28; a fresh
     rebuild + redeploy alone made it "way faster" per the operator.
  2. **A dozen undeployed federation remotes falling back to `localhost:3XXX`.**
     The shell eagerly loads `http://localhost:3002…3015/remoteEntry.js` for
     remotes that aren't deployed (record-collector, PTM, response-reviewer,
     pack-runner, the resolvers, …); those fetches fail — and on some networks
     **hang on a TCP connect timeout**, which is where a minute can come from.
     The *deployed* remotes (chat 3006, org-workbench 3014, search-and-add 3016,
     strategy-curator 3017) load fine and were never in the failure list.

**So the mesh-refactor design space below is RETRACTED as the cause.** The
remaining, much smaller work is a **build/federation-config cleanup**: prune the
prod federation manifest to deployed remotes only, and/or lazy-load remotes
(fetch `remoteEntry.js` on demand when a Flow opens, not eagerly at boot) so no
boot ever waits on a doomed `localhost` fetch. Tracked as its own follow-up.

The design space below is kept for the record — it is what we would have wasted
days on without Step 0.

---

## Why Care? (original hypothesis — superseded by the measurement above)

On refresh, the workspaces the operator is logged into take **60s+** to appear.
Interactions wait on microfrontends and microservices responding to — and
"acknowledging" — each other. There is exactly **one user**. This should be
milliseconds. The cost is not the work; it's the **coordination** between too
many independently-deployed parts.

## The topology being paid for (with one user)

- **7+ separate Railway services**: `shell` (augment.didi.sh), `strategy-curator`,
  `chat` (+ other federation remotes: org-workbench, search-and-add,
  search-results…), `workspace-service` (WS gateway), `record-surrealdb-resolver`,
  `content-ingest`, `prompt-runner`.
- **`id.didi.sh`** — a separate identity service (different repo/runtime) for
  JWKS verification + `/api/me` memberships.
- **SurrealDB Cloud, aws-use1** (`wss://…surreal.cloud`) — every query is a
  network round-trip to AWS us-east.
- Each **microfrontend opens its OWN WebSocket** to workspace-service and does
  its **own** auth handshake (shell App.svelte notes "each federation remote
  also connects, those instances are separate").
- Services talk **service→service over NATS request/reply**.

Every one of those boundaries adds fixed latency: TLS, cold start, DB round
trip, NATS hop, and — worst — **retry backoff**.

## Root causes (code-grounded, ordered by leverage)

1. **Retry-as-readiness is masking a boot race — the acute one.** The recent
   commit: *"retry `workspace.active.requested` up to ~60s before crashing."*
   `shell/src/App.svelte:375` also backs off 8× on `loadWorkspaces`. That ~60s is
   the shell **waiting for a dependency to become ready** (cold service, DB
   connection warming, NATS responder not yet registered), not doing work.
   Suspected to be most or all of the observed minute.
2. **Cold starts, in series.** One boot call traverses shell → workspace-service
   → NATS → resolver → SurrealDB Cloud. A cold service anywhere on that path
   wakes on the request; multiple cold hops compound.
3. **Sequential remote-DB round trips on boot.** Memberships, workspace list,
   active workspace, rows — each a separate cross-country round trip to aws-use1
   if issued back-to-back.
4. **Cross-service auth on every connect.** Each WS upgrade verifies the JWT and
   fetches `/api/me` from id.didi.sh (cached only ~60s, `didi.ts:96`) — and every
   remote repeats it.
5. **Per-remote fan-out.** Boot cost multiplies by the number of microfrontends,
   each with its own transport + auth + initial capability calls.
6. **NATS request/reply between co-located services** is pure serialization
   overhead when there's no concurrency to justify it.

## The thesis

The system is a distributed, multi-tenant-shaped mesh serving **one user**. The
fix is to **right-size the architecture to actual scale** — reserve the mesh for
when concurrency demands it, and until then collapse boundaries so calls are
in-process and boot is deterministic.

## First default step — frontend boot timing (do this BEFORE anything else)

**Measure, don't guess.** The wall-clock the operator feels lives in the
browser, and the shell isn't timing itself. Add a dozen `performance.now()`
stamps at each boot milestone and dump elapsed ms to the console:

1. WS connect **start**
2. WS **open**
3. **auth verified** (session frame accepted)
4. `workspace.list` **sent** → **returned**
5. `workspace.active` **sent** → **returned**
6. each **remote connected**

No library, no platform. This turns "it's slow" into "`workspace.active` took
58s and everything else was 300ms" — and decides whether this is a one-day
readiness fix or a real refactor. It is the **default first move**; every lever
below is gated on what it shows. Pair it with the browser Network waterfall
(free) and, if cross-service correlation is needed, a request_id threaded
shell → workspace-service → resolver (deferred until tier-1 proves insufficient).

For the **server side** of the same picture, view the service logs with
[**gonzo**](https://github.com/control-theory/gonzo) — a k9s-style real-time
log-analysis TUI (`brew install gonzo`, or `nix run github:control-theory/gonzo`
from the monorepo dev shell). Pipe the cross-service handshake into one pane
while the browser prints its boot timings:

```bash
docker compose logs -f | gonzo                       # local backend stack
railway logs --service workspace-service | gonzo     # a deployed service
```

Gonzo's OTLP receiver (`--otlp-enabled`, gRPC 4317 / HTTP 4318) is the bridge if
tier-1 timings + logs prove insufficient and we add real tracing. A full
observability stack (OTel pipelines/Prometheus/dashboards) is **explicitly not
needed** at one user — same right-sizing thesis. Boot instrumentation lives near
[[No-User-Visibility-Into-State-Needs-A-State-Inspector]] / the live-not-live
indicator work.

## Design space (gated on what Step 0 shows), by leverage:

- **Kill retry-as-readiness.** Make services signal ready and the shell's first
  call succeed deterministically (or a fast, bounded wait) — turns 60s into ms.
- **Keep the request-path services warm** (no scale-to-zero; a warm SurrealDB
  connection pool). Cheap, ops-level, big.
- **One bootstrap call.** A single `workspace.bootstrap` capability returning
  memberships + workspaces + active + initial state, instead of N sequential
  DB/NATS round trips.
- **Embed memberships/claims in the JWT** so auth needs zero cross-service
  `/api/me` fetch.
- **Share one transport across remotes** (single WS, single auth verification)
  instead of per-remote handshakes.
- **Collapse services.** For single-user / small-team scale, fold
  resolver + content-ingest + prompt-runner (and possibly the WS gateway) into
  fewer processes so NATS request/reply becomes function calls. Reserve split
  services for a real concurrency/scale trigger.
- **Optimistic boot.** Render cached workspaces from localStorage instantly,
  revalidate in the background — perceived ms regardless of revalidation cost.

## Explicitly NOT this issue

- Not a call to abandon the distributed design permanently — it's a call to
  match it to current scale and make the boundaries cheap or absent until scale
  arrives.
- Not the auth-persistence / cookie-partitioning bug
  ([[Workspace-And-Corpora-Connection-Slow-To-Hanging-And-Auth-Wont-Persist]]) —
  related surface, different root cause; cross-linked, not merged.

## See also

- [[Workspace-And-Corpora-Connection-Slow-To-Hanging-And-Auth-Wont-Persist]] — the production connection/auth issue on the same surface.
- [[Live-Not-Live-Indicator-Tooling-And-Cross-Service-Error-Surfacing]] · [[No-User-Visibility-Into-State-Needs-A-State-Inspector]] — where boot instrumentation would live.
