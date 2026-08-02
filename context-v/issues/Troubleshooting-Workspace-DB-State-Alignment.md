---
title: "Troubleshooting workspace ↔ DB state alignment — humain-vc's corpora don't load, and the canonical layer holds fewer than the operator created"
lede: "The humain-vc workspace renders empty-or-wrong corpora while the canonical layer itself holds fewer humain-vc domains than the operator remembers creating — four suspects, each with a discriminating signature."
date_created: 2026-07-30
date_modified: 2026-08-02
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
semantic_version: 0.0.0.2
tags:
  - Issue
  - Augment-It
  - Workspace-Auth
  - Strategy-Curator
  - Canonical-Layer
  - Debugging-Journey
status: Resolved
date_first_published: 2026-08-02
post_ship_note: "The DB-state question is answered and tooled: the alignment invariant became Group J (a pure diff + the read-only `scripts/audit-corpora-alignment.mjs`), which caught two real drifts — both reconciled 2026-08-02 (rural-income-boosts de-scoped from humain-vc; upward-mobility's missing DB row backfilled). Audit now reports ALIGNED for both clients. The residual 'corpora slow to load' symptom traced to production/Zen, tracked separately in [[Workspace-And-Corpora-Connection-Slow-To-Hanging-And-Auth-Wont-Persist]]."
---

# Troubleshooting workspace ↔ DB state alignment

## Symptom (operator report, 2026-07-30)

The humain-vc workspace is NOT loading its corpora (plural — multiple
corpuses exist, or should). Candidate layers named at report time:
workspace→state sync, state→microfrontend/service, or the fact that
humain-vc uses `domain:thesis` where reach-edu uses `domain:strategy`.

A second finding emerged during triage: **the canonical layer holds fewer
humain-vc corpora than the operator created.** Whatever the load-path bug
is, there is also a write-path (or write-durability) question.

## What is PROVEN (verified live, 2026-07-30, direct SurrealDB queries)

Queried the SurrealDB Cloud instance from `.env` creds (the same instance
every environment uses — see below):

- **One namespace, one database.** `INFO FOR KV` / `INFO FOR NS`: the
  instance has exactly `main`/`main`. There is **no hidden production
  namespace** — local dev and production read/write the same rows.
- **The full domains table (10 rows).** humain-vc appears on exactly three:
  - `thesis:specialized-foundation-models` — clients `[humain-vc]`, 5 sources
  - `thesis:consumer-immunology` — clients `[humain-vc]`, 2 sources
  - `strategy:rural-income-boosts` — clients `[humain-vc, reach-edu]` —
    **known mis-scope**: the operator created this FOR reach-edu while the
    humain-vc workspace was active, so it landed tagged humain-vc too.
    User error in one sense; also evidence that corpus creation
    silently inherits the active workspace with no confirmation surface.
- **No orphaned rows.** Zero domains with empty/missing `client_slugs`;
  `source_usages` contains only `humain-vc` (7) and `reach-edu` (242).
- **Local disk matches the DB.** `clients/humain-vc/corpus/theses/` has
  exactly the two thesis folders; `strategies/` is empty. The submodule
  is clean at `51f3654`.

**Conclusion:** corpora the operator created beyond these never landed
in the canonical layer at all — they were lost at write time, not
filtered at read time. Both halves need chasing.

## The suspects, ranked, with a discriminating signature for each

### 0. (NEW) Corpus creations silently lost at write time

The canonical layer + local disk agree with each other and disagree with
the operator's memory. Creations made through the UI while the transport
was wedged (see suspects 2a/2b) would spin or silently no-op — the
`domain.create` invoke dies in the client transport queue and nothing
retries it. **Signature:** the operator can name corpora that appear in
NO environment's rail and NO DB row. **Probe:** enumerate from memory the
corpora that should exist; grep production workspace-service /
record-surrealdb-resolver logs for `domain.create` around when they were
made; check the production volume's `clients/humain-vc/corpus/` for
folders without DB rows (content-ingest writes folders in the same flow).

### 1. Domain-type default resolving to 'strategy'

If the curator's `defaultDomainTypeFor()` doesn't find
`default_domain_type: 'thesis'` on the workspace summary, it falls back
to the flat `'strategy'` constant
(`apps/strategy-curator/src/curation.svelte.ts:33`), and `domain.list
{type:'strategy', client_slug:'humain-vc'}` returns exactly one row.
**Signature:** the rail shows **exactly one corpus — rural-income-boosts
— not zero.** In production this depends on the volume stub:
`DEPLOYMENT.md` seeds `/data/clients/humain-vc/.env` with
`DEFAULT_DOMAIN_TYPE=thesis` via `deploy.startCommand` on every boot —
if that seeding regressed when the startCommand was extended for
reach-edu, the summary silently falls back to `strategy`. **Probe:**
inspect `workspace.list`'s `default_domain_type` for humain-vc in the
failing environment.

### 2. The session/transport layer

Two documented, overlapping problems from the 2026-07-28 cycle:

- **2a. The zombie session** ([[Session-Expiry-Turns-The-App-Into-A-Zombie]],
  fixed in `9fc2543`): the ~12h id-didi-sh JWT dies inside the 30-day
  cookie, the UI stays rendered from localStorage, the transport
  reconnect-storms on 4401, and invokes blame the server at their
  deadline. Symptom was literally "empty roster, workspace did not
  reply." The fix lives in `packages/workspace` — **every deployed
  surface needs a rebuild to carry it.** The production flip (`4298be0`)
  predates the fix; verify the shell + remotes were rebaked after
  `9fc2543`. **Signature:** everything empty/unresponsive at once, 4401s
  in the browser console, healthy again after sign-out/sign-in.

- **2b. Mount-time invokes silently lost**
  ([[Search-And-Add-Invokes-Never-Reach-The-Workspace]], still open):
  frames queued pre-OPEN die in the client transport's queue/claim
  machinery under socket churn while later same-socket traffic works.
  The curator's `domain.list` fires at bootstrap — the same mount-time
  window — and `domain.create` rides the same transport (this is also
  the leading mechanism for suspect 0). **Signature:** zero corpora, no
  error, possibly forever-loading, while other panes work.

### 3. Workspace→state sync across remotes

Each federation remote holds its own workspace singleton (no `shared`
block in shell/rsbuild.config.ts, deliberate); the curator compensates
with the `WORKSPACE_CHANGED_EVENT` listener + `applyWorkspaceChange`.
The 07-28 tenancy work moved the active workspace to per-session
(sid-keyed), and the frontend audit concluded no changes were needed —
but that audit was contract-level, not a browser drive of the curator
specifically. **Signature:** corpora load correctly after a hard reload
in the humain-vc workspace but not after switching into it live.
Lowest probability, newest code.

## Next probes (for the fix session)

1. Operator enumerates the corpora that SHOULD exist for humain-vc, by
   name — turns suspect 0 from vibe into a checklist.
2. In the failing environment: browser console (4401s? hanging
   `domain.list`?) + `workspace.list` response (`default_domain_type`
   for humain-vc) — separates suspects 1 and 2 in one look.
3. Ask didi chat anything — its "Existing corpora" slab queries
   `domain.list` server-side WITHOUT a type filter
   (`services/workspace/src/chat.ts:347`). Chat sees them + rail doesn't
   → suspect 1. Chat blind too → suspect 2 (or the session's tenancy).
4. Confirm production deploy provenance: were shell + remotes rebuilt
   after `9fc2543` (the packages/workspace zombie fix)?
5. Production volume audit: `ls /data/clients/humain-vc/corpus/` on the
   deployed instance vs the DB's domains rows — folder-without-row =
   partial write; nothing at all = invoke never left the browser.

## Guardrail candidates (out of scope here, worth their own tickets)

- `domain.create` (and all mutating invokes) need a client-side deadline
  + visible failure — today a lost create looks identical to a slow one.
- Corpus creation should confirm the target workspace explicitly — the
  rural-income-boosts mis-scope shows the active workspace is too
  implicit at the moment of creation.

## See also

- [[Session-Expiry-Turns-The-App-Into-A-Zombie]] — the auth-death storm
- [[Search-And-Add-Invokes-Never-Reach-The-Workspace]] — the transport
  queue/claim suspect, same mechanism as suspect 2b/0
- `changelog/2026-07-28_01_The-Session-Carries-The-Workspace-Augment-Didi-Sh-Opens-To-Its-Second-Tenant.md`
  — the tenancy rework that reshaped every layer named above
- `context-v/plans/Open-Augment-Didi-Sh-To-Reach-Edu.md` — the plan the
  rework implemented
