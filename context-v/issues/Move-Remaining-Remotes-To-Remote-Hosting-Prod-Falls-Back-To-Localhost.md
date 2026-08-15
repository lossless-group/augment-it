---
title: "Move the rest of the app to remote hosting — prod still falls back to localhost for every undeployed remote"
lede: "Only the client-facing surfaces (Corpus Builder + Augment-from-DB) were deployed as hosted remotes; the other 12 micro-frontends are hardcoded to http://localhost:3XXX in the production shell build, so augment.didi.sh tries to fetch them from the visitor's own machine at boot — they fail, and on some networks hang on a TCP timeout. This was a deliberate shortcut to get client collaboration live and defer the big refactor. Now the rest of the app needs to graduate to remote hosting."
date_created: 2026-08-03
date_modified: 2026-08-03
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.8
semantic_version: 0.0.0.1
tags:
  - Issue
  - Augment-It
  - Module-Federation
  - Deployment
  - Shell
  - Remote-Hosting
status: Open · Diagnosed
---

# Move the rest of the app to remote hosting

## Why Care?

On augment.didi.sh, the production shell tries to load a dozen micro-frontends
from **`http://localhost:3002…3015/remoteEntry.js`** — the *visitor's* own
machine, not a hosted server. They fail every boot (visible in the console as
`Loading failed for the <script> …`), and on some network configs those fetches
**hang on a TCP connect timeout** — the residual boot noise the operator felt as
part of the "minute" (see [[Refactoring-for-API-Speed]]'s measured finding). If a
collaborator happens to have local dev servers on those ports, it's worse: the
prod shell silently mounts *their laptop's* dev code.

## How we got here (the deliberate shortcut)

The priority was getting **client collaboration** live: the **Corpus Builder**
(corpora-curator) and the **Augment-from-DB** flow (org-workbench +
search-and-add + search-results), plus **chat**. Those surfaces were deployed as
hosted Railway services with real `PUBLIC_*_REMOTE` URLs. Everything else — the
original CSV-first pipeline and the resolver micro-frontends — was left pointing
at its dev `localhost` port, on the theory that a humain-vc/client deploy never
opens those Flows so it wouldn't matter. It was a knowing shortcut to avoid the
big "deploy the whole federation" refactor. This issue is the debt coming due.

## The exact mechanism

In `shell/rsbuild.config.ts` the `remotes` map has **two tiers**:

- **Environment-aware (5, deployed):** `process.env.PUBLIC_*_REMOTE || 'http://localhost:…'`
  — a prod build injects the hosted URL via the shell Dockerfile's `ARG`/`ENV`.
- **Hardcoded localhost (12, undeployed):** e.g.
  `recordCollector: 'recordCollector@http://localhost:3002/remoteEntry.js'` —
  **no env branch at all**, so the value ships verbatim in the production bundle.

And they load **at boot, not lazily**, because the shell's **default Flow is
Record Collector** (`recordCollector`, undeployed) and its peek-deck rotations
reference other undeployed remotes (`recordDbResolver`, `personDbResolver`,
`affiliationRatingResolver`) — so mounting the default surface fetches their
`localhost` entries immediately.

## Inventory — every remote, hosting status

| Remote | Port | Deployed as a Railway service? | Config tier |
|---|---|---|---|
| chat | 3006 | ✅ yes | env-aware |
| org-workbench | 3014 | ✅ yes | env-aware |
| search-and-add | 3016 | ✅ yes | env-aware |
| corpora-curator (Corpus Builder) | 3017 | ✅ yes | env-aware |
| search-results | 3018 | ✅ yes | env-aware |
| **record-collector** | 3002 | ❌ no | **hardcoded localhost** |
| **prompt-template-manager** | 3003 | ❌ no | **hardcoded localhost** |
| **request-reviewer** | 3004 | ❌ no | **hardcoded localhost** |
| **response-reviewer** | 3005 | ❌ no | **hardcoded localhost** |
| **enhanced-records-list** | 3007 | ❌ no | **hardcoded localhost** |
| **record-db-resolver** | 3008 | ❌ no | **hardcoded localhost** |
| **pack-runner** | 3009 | ❌ no | **hardcoded localhost** |
| **person-db-resolver** | 3010 | ❌ no | **hardcoded localhost** |
| **records-surface** | 3011 | ❌ no | **hardcoded localhost** |
| **affiliation-rating-resolver** | 3012 | ❌ no | **hardcoded localhost** |
| **sort-filter-lens** | 3013 | ❌ no | **hardcoded localhost** |
| **person-enrichment** | 3015 | ❌ no | **hardcoded localhost** |

Twelve undeployed remotes, all shipping `localhost` in prod.

## What "move to remote hosting" means — two tracks

### Track A — the real goal: host the rest of the app
Graduate each remaining micro-frontend to a hosted remote, the same way the five
client-facing ones already are:
1. Add a Railway service per remote (its `Dockerfile`, a Railway-generated or
   `*.didi.sh` domain).
2. Add a `PUBLIC_<REMOTE>_REMOTE` build ARG to `shell/Dockerfile` + set it as a
   shell service variable, and switch the `rsbuild.config.ts` line to
   `process.env.PUBLIC_<REMOTE>_REMOTE || 'http://localhost:<port>'`.
3. Sequence by what a client/collaborator actually needs next (the CSV pipeline —
   record-collector, response-reviewer, enhanced-records-list — is the obvious
   first cluster; the resolvers next).

Note: this is exactly the "deploy the whole federation" refactor the shortcut
deferred — so it wants its own **plan** with a sequencing decision, not a
one-shot.

### Track B — the interim safety net (cheap, do regardless)
Even before all twelve are hosted, prod should **never fetch `localhost`**:
1. Make the remotes map **environment-aware** — in a production build, **omit**
   any remote without a real hosted URL, so Module Federation never tries it.
2. **Guard the mount path** and pick a **deployed default Flow** in prod
   (corpora-curator / Corpus Builder, what humain-vc actually uses) so boot
   never mounts an undeployed remote.

Track B stops the boot noise and the hang-on-a-collaborator's-network failure
mode immediately; Track A is the durable "the whole app is hosted" end state.

## Acceptance

- Loading augment.didi.sh (or any client deploy) produces **zero**
  `localhost:3XXX` fetch attempts in the console.
- No boot mounts an undeployed remote; the default Flow is a deployed one.
- Each remote intended for a client deploy resolves to a hosted `remoteEntry.js`.

## See also

- [[Refactoring-for-API-Speed]] — the measurement that surfaced this (backend
  was ~543ms; these localhost loads were the residual).
- `DEPLOYMENT.md` — the shell build-args + per-service deploy pattern the five
  hosted remotes already follow.
- [[Augment-From-DB-Flow]] · [[Corpora-Curator-Entry-Point-for-Augment-It]] —
  the two surfaces that WERE prioritized and hosted.
- Boot instrumentation (gh #80) — how the localhost loads became visible.
