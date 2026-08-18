---
title: "Open augment.didi.sh to reach-edu — a second tenant instance, and Stephenie Tesoro as the first client user"
lede: >-
  The data is already deployed; only the door is single-tenant. Open it with a per-client instance, not a relaxed org check.
date_created: 2026-07-28
date_modified: 2026-07-28
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
semantic_version: 0.0.1.1
revisions:
  - "2026-07-28 — v0.0.1.1 — status → Implementing; loop run opened on branch feature/workspace-auth. Phase-0 code read surfaced a fourth gap: row-store is global-active-scoped by design (loads one clients/<active>/rows.json, swaps on workspace.active.changed) — see the new caveat; step 1's enforcement gates the row-store family rather than remapping it."
  - "2026-07-28 — v0.0.1.0 — REWRITTEN after rechecking the id-didi-sh spec of record (operator: 'the idea was it create an auth token that carried the workspace'). The spec confirms the intent: the token stays minimal (didi_id + sid) but /api/me supplies org memberships and augment-it is designed to map org ↔ workspace per session. The per-client-instance recommendation (v0.0.0.1's Option A) demoted to fallback; the designed org↔workspace session binding is now the plan."
tags:
  - Plan
  - Augment-It
  - Deployment
  - Multi-Tenancy
  - Reach-Edu
status: Implementing
site_uuid: feab1d70-5163-4653-a8ad-d486c967d95d
hex_code: m5xf0c
date_authored_initial_draft: 2026-07-28
date_authored_current_draft: 2026-07-28
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

## What the identity spec actually designed (recheck, 2026-07-28)

The id-didi-sh spec of record
(`ai-labs/context-v/specs/Id-Didi-Sh-Identity-Service.md`) is explicit:

- The **token stays minimal** — `didi_id` + `session_id` only
  ("Deliberately not in the token: orgs, roles, email").
- **`GET /api/me`** supplies org memberships + roles; and the augment-it
  integration is specified as: *"per-capability authorization consults
  cached `/api/me` org-roles **mapped onto workspaces**"* — with
  per-service authorization state named directly: *"for augment-it:
  **org ↔ workspace** per Workspaces-as-Tenant-Primitive."*

So the session is DESIGNED to carry its workspace(s), resolved through
org membership. What's running today implemented only the binary gate
(`REQUIRED_ORG_ID` membership yes/no) and papered over the mapping with
the `ACTIVE_CLIENT_ID` instance pin. Two gaps make the current state
single-tenant:

1. **No org↔workspace map** — nothing says org `reach.edu` ⇒ workspace
   `reach-edu`.
2. **Active client is INSTANCE-GLOBAL** — `workspaces.ts` holds one
   module-level `activeClientId`; `workspace.activate` switches it for
   every connected session. Safe solo, catastrophic multi-user.
3. (Corollary) capability args carry `client` from the UI **untrusted** —
   with multiple orgs on one instance, the server must derive/validate
   the client from the session, not accept it from the frame.

## Recommended shape: build the designed mapping (the spec's path)

One domain, `augment.didi.sh`, serving both tenants:

1. **Workspace → org binding**: each workspace under `CLIENTS_ROOT`
   declares its org (`clients/<id>/workspace.json` gains
   `org_id: "reach.edu"` / `"humain.vc"`). The map lives with the
   workspace, not in env.
2. **Session-scoped tenancy** in workspace-service: at WS establishment,
   `/api/me` memberships → allowed workspaces (superuser → all; this is
   the operating-team fast path that keeps US cross-client). The session
   record carries `allowed_clients` + its own `active_client`;
   `workspace.activate` becomes per-session and validates against the
   allowed set. `ACTIVE_CLIENT_ID` env survives only as a dev-mode
   default.
3. **Server-side client enforcement**: dispatch overrides/validates the
   `client` arg in every capability frame against the session's allowed
   set — the tenant-aware envelope the Workspaces spec already names.
   This is the security-critical line of the build.
4. `REQUIRED_ORG_ID` relaxes to "member of ANY org that maps to a
   workspace on this instance."

**Fallback (formerly Option A, demoted):** a per-client instance
(`reach.augment.didi.sh` with its own pin) remains viable as a stopgap if
Stephenie's onboarding must precede the session-tenancy build — but it
contradicts the identity spec's architecture and doubles frontend
plumbing (baked WS URLs). Prefer the designed path.

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
  shell + chat + corpora-curator. The Org Workbench / search-rail
  remotes are NOT yet deployed anywhere — if her job is the org/pipeline
  view, deploying those remotes to the reach instance is part of this
  plan's scope (three more static-asset services + registry entries).
- **prompt-runner is shared** — one Anthropic key, one spend pool across
  tenants. Acceptable now; per-client keys are an Option-B-era concern.
- **row-store is global-active-scoped by design** (found in the Phase-0 code
  read): it loads exactly one `clients/<active>/rows.json` and swaps the
  whole store on `workspace.active.changed` — there is no per-frame client
  arg to enforce. Per-session tenancy therefore lands in two registers:
  SurrealDB-backed capabilities (the workbench family, Stephenie's surface)
  are fully session-scoped, while the row-store family (`row.*`,
  `record_set.*`, `prompt.*`, `response.*`) is **gated** — served only to
  sessions allowed on the instance's operator-parked active workspace, and
  the global switch stays a superuser move. Contamination becomes a refusal,
  not a remap; true per-session row-store scoping is a logged follow-up.

## Build order (when signed off)

1. **workspace-service session tenancy** (the core): workspace org_id
   config, `/api/me`-derived `allowed_clients` per session, per-session
   `active_client`, `workspace.activate` validation, and server-side
   `client` enforcement on every dispatched frame. Proof script: two
   fake sessions with different orgs cannot see or write each other's
   client — the multi-tenant twin of prove-org-relations' contamination
   check.
2. **Frontends follow the session**: the shell/remotes read
   `workspace.active` per session (already do) — verify no surface
   caches a global client across a session switch.
3. id-didi-sh: create org `reach.edu`, invite **stesoro@reach.edu**
   (invite-only by design — invites carry org_id + role; there is no
   open signup). Verify the redeem→cookie→WS flow end-to-end.
4. Deploy the Augment-from-DB remotes (org-workbench, search-results,
   search-and-add, person-*) as static-asset services on the existing
   instance; register in the shell's remote registry — this is the
   surface Stephenie actually needs.
5. Relax the deployed env: drop `ACTIVE_CLIENT_ID` pin +
   `REQUIRED_ORG_ID` single-value in favor of the mapping; redeploy.
6. Browser drive on augment.didi.sh: a reach.edu-org session sees ONLY
   reach-edu (org list, roster, corpora), a humain.vc session sees only
   humain-vc, a superuser sees both. Then the human walk-through:
   Stephenie's first login as the acceptance test.
7. DEPLOYMENT.md multi-tenant section; changelog entry.

## Open decisions

1. Sign off the session-tenancy build (the spec's designed path) — or
   invoke the per-client-instance fallback if her onboarding can't wait
   for it.
2. Whether the Augment-from-DB remotes ship in this pass (recommended —
   they're the surface Stephenie actually needs) or the chat-first
   surface suffices for v1.
3. Stephenie's role in org reach.edu (`editor` seems right — writes with
   attribution, no org admin), and who sends the invite + onboarding
   note.

## See also

- `DEPLOYMENT.md` — the humain-vc instance this clones from, including
  the CLI gotchas.
- [[../specs/Workspaces-as-Tenant-Primitive]] — the tenancy model;
  `client_access` scoping is why the shared backends are safe.
- `custom-domain-cutover` skill — the DNS/cert recipe for `*.didi.sh`.
- [[CRM-Starter-Export-Orgs-Then-People]] — the reach-edu Twenty that
  pairs with this instance for Stephenie's workflow.
