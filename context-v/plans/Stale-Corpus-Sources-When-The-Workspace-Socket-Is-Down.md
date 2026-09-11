---
title: "Stale Corpus Sources When the Workspace Socket Is Down — the header moves, the list doesn't"
lede: >-
  Switching corpora on a dead socket silently shows another corpus's sources under the new name — a wrong answer wearing a confident label.
date_created: 2026-09-10
date_modified: 2026-09-11
date_authored_initial_draft: 2026-09-10
date_authored_current_draft: 2026-09-11
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5 (1M context)
at_semantic_version: 0.0.1.0
status: Partially-Shipped
date_first_published: 2026-09-11
tags:
  - Plan
  - Augment-It
  - Corpora-Curator
  - WebSocket
  - Module-Federation
  - Correctness
  - Reconnect
site_uuid: cd2df196-2588-4693-886d-1bd7bea53a36
hex_code: hb4dwr
publish: true
---

# Stale Corpus Sources When the Workspace Socket Is Down

## Why care?

The Corpora Curator can display one corpus's sources under a different corpus's name, with a
confident source count, and no indication anything is wrong. That is worse than an error
screen: an operator curating Consumer Immunology can see, edit, tag, and reason about
sources that belong to AI Infrastructure for Bioscience.

The data is not corrupt and the filter is not broken. Both were suspected and both were
cleared. The defect is a UI that updates its label before it has the content to match.

## Evidence

Three screenshots taken 2026-09-08 at 20:57:20 / 20:57:26 / 20:57:33 UTC showed **Consumer
Immunology**, **Reinvented Fertility & Maternity**, and **AI Infrastructure for Bioscience**
each displaying the identical three sources and an identical "3 sources" badge.

SurrealDB, queried directly, is clean and correctly scoped:

| domain_slug | rows |
|---|---|
| ai-infrastructure-for-bioscience | 3 |
| consumer-immunology | 2 |
| quantum-innovation-computational-biology | 4 |
| reinvented-fertility-maternity | 1 |
| specialized-foundation-models | 5 |
| wearables-and-somatic-markers | 1 |
| wellness-experiences | 1 |

Distinct `source_uuid`s per domain, no duplication. The three titles on screen resolve
exactly to `ai-infrastructure-for-bioscience`. Every read and write path in
`services/record-surrealdb-resolver/src/domains.ts` is correctly scoped on
`(client_slug, domain_type, domain_slug)`.

The workspace-service log explains it:

```
20:28:35  ws connect ×3       ← session opens
20:28:37  invoke ×4 answered  ← ai-infrastructure-for-bioscience loads
20:30:39  ws close ×3         ← all sockets drop
          ───── 28-minute dead window ─────
20:57:20/26/33                ← the three screenshots. No socket. No invokes.
20:58:43  ws connect          ← reconnects
```

All three clicks landed inside a window with no WebSocket. The 28-minute gap reads like a
laptop sleep or a long-backgrounded tab — browsers throttle timers in hidden tabs, so the
transport's reconnect backoff never fired until the operator returned.

## Root cause

`apps/corpora-curator/src/curation.svelte.ts`, `select()`:

```ts
this.activeSlug = slug;                              // header updates immediately
this.activeType = type ?? …;
this.focusIdx = 0;
const r = await this.call('domain.assemble', { … }); // queued: socket not OPEN
this.sources = (r?.sources ?? []).map(withSlug);     // never reached
```

The transport queues the frame when the socket isn't `OPEN` (`sendQueue.push(frame)`), so the
`await` simply doesn't resolve. Everything before it has already run — hence a new header
over old rows. There is no guard bug and no caching bug; the assignment is just downstream of
a promise that never settles.

## The plan

### Phase 1 — Make the wrong answer impossible (contained, no redeploy of other remotes)

1. **Clear before the await** in `select()`. Introduce `sourcesStatus: 'idle' | 'loading' |
   'ready' | 'error'` and set `this.sources = []; this.sourcesStatus = 'loading'` immediately
   after `activeSlug`, before the `domain.assemble` call. Stale rows can then never be
   attributed to a newly-selected corpus.
2. **Render the loading and error states** in `apps/corpora-curator/src/App.svelte`. The
   "N sources" pill currently binds straight to `curation.sources.length`; it must not render
   a count while `sourcesStatus === 'loading'`.
3. **Surface `lastError`.** `call()` already captures it and nothing displays it.

### Phase 2 — Make the dead socket visible

4. **Add a connection indicator to the curator.** The shell's `WorkspaceSwitcher` already
   distinguishes `connecting…` / `loading…` / `error · hover`; the curator pane — where it
   matters most — has no equivalent. Reuse the same vocabulary rather than inventing one.

### Phase 3 — Shorten the dead window (wider blast radius)

5. **Reconnect on `visibilitychange` and `online`** in `packages/workspace/src/transport.ts`,
   rather than relying solely on backoff timers that browsers throttle in hidden tabs.
6. **Rebuild and redeploy all five deployed remotes.** There is no `shared` block in the
   federation config — each remote bundles its own copy of `@augment-it/workspace` — so a
   `transport.ts` change reaches production only when `chat`, `corpora-curator`,
   `org-workbench`, `search-and-add`, and `search-results` are all rebuilt.

Phase 3 is deliberately its own commit: phases 1–2 touch one app, phase 3 touches every
remote.

## Verification

- [ ] With devtools offline-throttling the socket, switching corpora shows an empty/loading
      state — never another corpus's rows
- [ ] The source count pill does not render a stale number during load
- [ ] `lastError` is visible when `domain.assemble` fails
- [ ] Backgrounding the tab for >5 minutes then returning reconnects within seconds
- [ ] `ws connect` appears in workspace-service logs on tab refocus

## Risks and notes

- **Don't "fix" this in the resolver.** The server query is correct; changing it would break
  correct behavior to paper over a client bug.
- **`domain.assemble` has a 30s timeout**, so a queued invoke eventually rejects and clears
  the list — the stale window is bounded but long enough to mislead, and the screenshots were
  taken well inside it.
- **Phase 3 interacts with the localhost-remotes design.** Twelve remotes stay hardcoded to
  `localhost` by deliberate decision (see `DEPLOYMENT.md`); only the five deployed ones need
  rebuilding.

## References

- `apps/corpora-curator/src/curation.svelte.ts` — `select()`, `refreshSources()`, `call()`
- `packages/workspace/src/transport.ts` — queueing, reconnect backoff, `onStatus`
- `shell/src/WorkspaceSwitcher.svelte` — the status vocabulary to reuse
- [[Corpora-Curator-Entry-Point-for-Augment-It]]
- [[Session-Expiry-Turns-The-App-Into-A-Zombie]]

## Remaining work (as of 2026-09-11)

**Shipped — the structural fix.** `domain.assemble` echoes the `(type, slug)` it
answered for; the curator clears `sources` before the await and refuses replies
that do not match the current selection. This closes the class, not just the
symptom: an out-of-order reply can no longer win, because "latest reply" is no
longer what decides what renders.

Chosen over the plan's original Phase 1 (clear-before-await alone), which stops
the reported symptom but leaves the race. The information needed already existed
on the `source_usages` row and was being dropped on the way out.

Landed:

- `services/record-surrealdb-resolver/src/domains.ts` — reply carries `type` + `slug`
- `apps/corpora-curator/src/curation.svelte.ts` — `sourcesStatus`, clear-before-await,
  supersede guard, `replyMatches()`
- `apps/corpora-curator/test/curation.test.ts` — four regression tests, plus a repair
  to the `@augment-it/workspace` mock that had left the whole suite dead since gh #93
  (missing `resolveWsUrl` export made the import throw, which vitest reports as
  "no tests" rather than a failure)

Verified: resolver typecheck clean, curator builds, 12 curator + 21 resolver tests green.

**Still open:**

1. **Phase 2 — render the states.** `sourcesStatus` now distinguishes `loading`,
   `ready`, and `error`, but nothing in `App.svelte` displays them, and the pane
   still has no connection indicator while the shell's `WorkspaceSwitcher` has
   had one all along. The data to fix this exists; the UI does not use it yet.
2. **Phase 3 — reconnect on `visibilitychange` / `online`.** The change that
   shortens the 28-minute dead window rather than surviving it. Lives in
   `packages/workspace/src/transport.ts`, which all five deployed remotes bundle
   separately, so it needs all five rebuilt and redeployed.

**Deployment note.** The echo is enforced only when present, because the resolver
and the curator deploy independently — a resolver on the old build sends no echo,
and rejecting that would blank the surface rather than merely misfill it. Tighten
to a required echo once both sides are deployed everywhere.
