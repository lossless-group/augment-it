---
title: "Open augment.didi.sh to reach-edu — a second tenant instance, and Stephenie Tesoro as the first client user"
lede: "The deployed stack already reads the shared SurrealDB Cloud — everything reach-edu's canonical layer holds is one auth gate away. This plan opens that gate the safe way: a per-client instance (the house pattern), not a relaxed org check that would drop reach.edu users into humain-vc's workspace."
date_created: 2026-07-28
date_modified: 2026-07-28
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
semantic_version: 0.0.0.1
tags:
  - Plan
  - Augment-It
  - Deployment
  - Multi-Tenancy
  - Reach-Edu
status: Draft
---

# Open augment.didi.sh to reach-edu

## Why care?

reach-edu's canonical layer is now substantial — 400+ organizations with
relations and strategy tags, 500+ people, registered corpora, a CRM
already seeded from it — and the humans who work the pipeline (first:
**Stephenie Tesoro <stesoro@reach.edu>**, a tracker row owner) have no
way to see it except over Michael's shoulder. The production stack at
augment.didi.sh already talks to the same SurrealDB Cloud instance
(`rustic-forest-….surreal.cloud`), so the DATA is deployed; what's
single-tenant is the **door**: `DIDI_AUTH=required`,
`REQUIRED_ORG_ID=humain.vc`, `ACTIVE_CLIENT_ID=humain-vc` on
workspace-service.

## The load-bearing constraint

`ACTIVE_CLIENT_ID` pins the tenant PER-INSTANCE, not per-user-org.
Relaxing `REQUIRED_ORG_ID` alone would authenticate reach.edu users into
the humain-vc workspace. Safe multi-client therefore means either
per-client instances (each with its own pin) or real org→client session
binding (a feature in workspace-service). The house has a strong
precedent for the former: every client already gets its own Twenty, its
own hub, its own stack folder (`self-host-stack/client-stacks/<client>`).

## Recommended shape: a per-client instance (Option A)

`reach.augment.didi.sh` — a sibling instance in the same Railway project,
sharing the client-agnostic backends, pinning its own tenant:

| Piece | Action |
|---|---|
| `nats`, `record-surrealdb-resolver`, `content-ingest`, `prompt-runner` | SHARED — already client-agnostic (client rides every request; canonical writes carry `client_access`) |
| `workspace-service-reach` | NEW service from the same Dockerfile. Env: `DIDI_AUTH=required`, `REQUIRED_ORG_ID=reach.edu`, `ACTIVE_CLIENT_ID=reach-edu`, own tiny `/data` volume (sessions + clients root), `PORT=3001` |
| `shell-reach` | NEW build of the shell with its WS URL baked to `wss://ws.reach.augment.didi.sh/ws` (the WS URL is a build-time constant — see DEPLOYMENT.md gotchas) |
| `chat` / `strategy-curator` remotes | SHARED if the shell's remote registry allows cross-origin asset URLs per instance (they're static assets); else thin per-instance builds |
| DNS | `reach.augment` + `ws.reach.augment` CNAMEs per the custom-domain-cutover skill; both must stay on `*.didi.sh` for the shared `didi_session` cookie |

Why A over org-mapping: zero new auth code in the hot path, blast-radius
isolation (a reach-edu session cannot even express a humain-vc
workspace), per-client kill switch, and it matches the per-client stack
doctrine everywhere else.

**Option B (logged, not chosen): org→client binding in workspace-service**
— map didi org → allowed client(s) at session establishment, one domain
serves all tenants. Less infra, more auth surface; becomes worth it
around client #4 or when cross-client operators (us) want one login.
Revisit then.

## Stephenie's onboarding (the identity half)

1. **didi.sh account** under org `reach.edu` in id-didi-sh — the same
   unlock/invite flow humain's client user (Aniel) went through; the org
   must exist in the identity service before her invite.
2. `checkMembership` then passes against `REQUIRED_ORG_ID=reach.edu` on
   the new instance; every write she makes carries her `didi_id` as actor
   (attribution rides the envelope — see Workspaces-as-Tenant-Primitive).
3. Her didi_session cookie works across `*.didi.sh`, so the shared-domain
   requirement stands.

## Caveats to carry into the build

- **Corpus FILES are not on the deployed volume.** DB-backed surfaces
  (workbench, relations, tags, people) work fully; disk-half surfaces
  (corpus file browsing, triage's file moves) don't exist server-side.
  Fine for v1 — Stephenie's use is the workbench/pipeline view — but say
  so in her onboarding note rather than letting her find it.
- **Anthropic credits** gate didi's crawls/chat for everyone, including
  her (currently exhausted; billing top-up pending).
- **Which frontends she gets**: the deployed instance today is
  shell + chat + strategy-curator. The Org Workbench / search-rail
  remotes are NOT yet deployed anywhere — if her job is the org/pipeline
  view, deploying those remotes to the reach instance is part of this
  plan's scope (three more static-asset services + registry entries).
- **prompt-runner is shared** — one Anthropic key, one spend pool across
  tenants. Acceptable now; per-client keys are an Option-B-era concern.

## Build order (when signed off)

1. Railway: mint `workspace-service-reach` (+ volume) and `shell-reach`
   with baked WS URL; wire env; deploy from `rebuild/turbo-rsbuild`.
2. DNS: `reach.augment` / `ws.reach.augment` CNAMEs; wait out cert
   issuance per the cutover skill (including its stale-cache theater).
3. Deploy the Augment-from-DB remotes (org-workbench, search-results,
   search-and-add, person-* ) as static-asset services; register them in
   shell-reach's remote registry.
4. id-didi-sh: create org `reach.edu`, invite stesoro@reach.edu; verify
   the unlock flow end-to-end (the OAuth pilot discipline from the
   Twenty stacks applies: designed-but-unproven until she logs in).
5. Browser drive against reach.augment.didi.sh (workbench loads, client
   pin is reach-edu, a humain-vc org is NOT visible), then the human
   walk-through: Stephenie's first login as the acceptance test.
6. DEPLOYMENT.md gains the second-instance section; changelog entry.

## Open decisions

1. Sign off Option A (per-client instance) vs holding for Option B.
2. Whether the Augment-from-DB remotes ship in this pass (recommended —
   they're the surface Stephenie actually needs) or the chat-first
   surface suffices for v1.
3. Who sends Stephenie the invite + onboarding note (content drafted as
   part of step 4).

## See also

- `DEPLOYMENT.md` — the humain-vc instance this clones from, including
  the CLI gotchas.
- [[../specs/Workspaces-as-Tenant-Primitive]] — the tenancy model;
  `client_access` scoping is why the shared backends are safe.
- `custom-domain-cutover` skill — the DNS/cert recipe for `*.didi.sh`.
- [[CRM-Starter-Export-Orgs-Then-People]] — the reach-edu Twenty that
  pairs with this instance for Stephenie's workflow.
