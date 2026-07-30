---
title: "Test coverage begins — and catches a real reconnect bug on day one"
lede: "augment-it gets its first automated tests: Vitest wired, nine tests green across the transport, the workspace registry, and didi's corpora slab. The headline property test — 'no invoke silently vanishes' — failed first exactly as the registry predicted, and the failure was real: the client reconnect chain died on any refused connection, a live mechanism behind the zombie-session and lost-corpus symptoms. Found by the test, fixed in the transport, now guarded forever."
date_created: 2026-07-30
date_modified: 2026-07-30
publish: true
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
  - Claude Code on Claude Opus 4.8
files_changed:
  - packages/workspace/src/transport.ts
  - packages/workspace/test/transport.test.ts
  - packages/workspace/test/workspace-socket-test-server.ts
  - packages/workspace/vitest.config.ts
  - services/workspace/test/workspaces.test.ts
  - services/workspace/test/chat-corpora-slab.test.ts
  - services/workspace/src/chat.ts
  - context-v/specs/Corpora-Builder-Harmony-Test-Registry.md
---

# Test coverage begins — and catches a real reconnect bug on day one

## Why Care?

For the entire life of augment-it, agents have written and rewritten this
codebase with **zero automated tests** guarding it — verification was
typechecks, builds, hand-run prove-scripts, and the operator walking the
surface. That debt came due this month: humain-vc's corpora failing to
load, corpus creations that never landed, a rail that renders "empty"
indistinguishably from "broken." We couldn't tell a bug from an empty
workspace because nothing asserted the difference.

This is the first automated test coverage in the repo. And it earned its
keep immediately: the very first property test we wrote failed on its
first run — as the registry spec explicitly predicted it would — and the
failure was not a test artifact. It was a **real reconnect bug in the
client transport** that plausibly underlies the zombie-session and
"invokes never reach the workspace" symptoms the operator has been
hitting. The test found it; the fix closes it; the test now guards it.

## The bug the test caught

The client transport (`packages/workspace/src/transport.ts`) reconnects
to the workspace-service after a dropped socket. But it only scheduled
that reconnect from the WebSocket **`close`** handler. It turns out that
when a connection is *refused* — the exact situation during a
workspace-service restart or redeploy, when the browser's reconnect
attempt hits a port with nothing listening — Node's native WebSocket
(and, per spec, browsers too) fires **only `error`, never `close`**.

So the reconnect chain died on the first failed attempt. A surface that
lost its socket during a backend restart would never reconnect on its
own; it stayed wedged until a full page reload. Invokes fired into that
window hung to their 120-second deadline and then blamed the server —
precisely the "the workspace did not reply" mystery. This is a strong
candidate for one of the mechanisms behind
[[Search-And-Add-Invokes-Never-Reach-The-Workspace]] and the
zombie-session class.

The fix: an `error` on a socket that never opened now runs the same
reconnect tail the `close` handler does, guarded by a per-attempt flag so
a browser that fires *both* `error` and `close` still schedules exactly
one reconnect. Established-socket drops, auth-death (4401/4403), and
deliberate `close()` all keep their existing behavior untouched.

Visible proof it works: the property test's whole suite dropped from
2.1s to 0.9s after the fix, because the invoke now reconnects promptly
instead of hanging to its deadline.

## What landed

### The harness

Vitest is wired as the repo's test runner (unit + service tiers;
Playwright for the future E2E tier per the plan). `pnpm test` runs the
repo's turbo `test` task; each package runs `vitest run`. No new runtime
dependencies — the only additions are the test library itself. In
particular, the transport tests needed a WebSocket server to connect to,
and rather than pull the `ws` package back in (deliberately removed from
this repo), the harness includes a small hand-rolled RFC-6455 endpoint
over `node:http` — zero dependencies, mirroring the real
workspace-service invoke/claim contract.

### Group C — transport resilience (4 tests, `packages/workspace`)

The registry's ✓-phrases, now green: no invoke silently vanishes across
every socket-churn scenario (the one that caught the bug); a pre-open
invoke is delivered exactly once after open; close 4401 fails all pending
work immediately with "session expired"; and after auth-death the
transport tries one silent refresh-reconnect, then waits — no storm. A
timing seam was added to `transport.ts` so minutes-scale deadlines and
backoff are assertable in milliseconds (production defaults unchanged).

### Group D — workspace registry (3 tests, `services/workspace`)

The `default_domain_type` resolution that suspect 1 hangs on —
humain-vc's `thesis` vs the `strategy` fallback — plus `workspace.json`
org_id winning over the `WORKSPACE_ORG_MAP` env fallback, and a
.env-less workspace still listing with `has_env: false`. Each test builds
a throwaway `clients/` root on disk and loads the module fresh, because
the env map parses once at import.

### Group H — didi's corpora slab (2 tests, `services/workspace`)

The "Existing corpora" slab didi reads before resolving a corpus name:
it lists every domain in the workspace regardless of type (the
load-bearing difference from the curator rail's typed query), and it
degrades to an empty slab — never a failed turn — when the resolver
hiccups. Capability dispatch and NATS are mocked, so the contract is
pinned without a live bus.

## Where this sits

Nine tests, three of the registry's ten MECE groups. Groups A (identity
contract, ExUnit in id-didi-sh), B (session tenancy), E (canonical CRUD),
F (corpus files), G (curator state), I (end-to-end), and J (the
DB↔disk↔UI alignment audit) remain proposed in the registry, written as
the ✓-phrases we want to see turn green next. The registry spec
([[Corpora-Builder-Harmony-Test-Registry]]) tracks every one, Proposed or
Implemented, with its purpose and location.

## See also

- [[Corpora-Builder-Harmony-Test-Registry]] — the living test registry
- [[Test-Coverage-Harness-And-Regression-Floor]] — the harness plan
- [[Troubleshooting-Workspace-DB-State-Alignment]] — the live bug hunt this serves
- [[Search-And-Add-Invokes-Never-Reach-The-Workspace]] — the open issue this fix likely closes
- [[Session-Expiry-Turns-The-App-Into-A-Zombie]] — the zombie class the reconnect bug feeds
