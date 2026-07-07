---
title: "Build order: the humain-vc unlock flow, step by step"
lede: "The execution sequence for Flow 1 (Michael + Aniel, side-by-side thesis corpus building on a hosted augment-it) — each step names its repo, files, and verification so any fresh session can pick up mid-sequence. The strategy and scope cuts live in the ai-labs plan; this is the how."
date_created: 2026-07-06
date_modified: 2026-07-06
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
semantic_version: 0.0.1.0
status: Ready
tags:
  - Plan
  - Build-Order
  - humain-vc
  - Didi-Platform
  - Auth
  - Deployment
  - Curator
---

# Build order: the humain-vc unlock flow

> **Scope of record:** [[../../../context-v/plans/Unlock-Humain-VC-Team-Access-To-Augment-It|Unlock-Humain-VC-Team-Access-To-Augment-It]]
> (ai-labs level) — Flow 1, the single-tenant scope cut, and the
> deliberately-NOT-built list. Read it first; this doc only sequences.
> Identity spec of record: `ai-labs/context-v/specs/Id-Didi-Sh-Identity-Service.md`.

## State as of writing (2026-07-06, end of day — verify, don't assume)

- **Live URLs:** `https://id.didi.sh` (identity service on Fly — full
  magic-link loop operator-clicked in production; Resend domain-verified,
  sender `no-reply@didi.sh`), `https://didi.sh` + `www` (the `site/`
  conversion surface on Vercel), the GitHub splash.
- **Steps 1–3 DONE** (see their sections): real email, orgs + memberships
  seeded local AND prod (Michael = superuser, 3 addresses; Aniel pends his
  address), and the membership gate proven (4401 / admitted / 4403).
- augment-it workspace-service verifies `didi_session` on WS upgrade
  (`services/workspace/src/didi.ts`); shell has the DidiBadge sign-in;
  strategy-curator promoted to the head of ROTATION; the
  active-workspace split-brain fixed (browser pick authoritative).
- Local compose runs `DIDI_AUTH=optional` (nothing gated in dev);
  `required` + `REQUIRED_ORG_ID` is the deploy posture, proven via the
  prove script's GATE mode.
- The DO droplet (167.172.42.247) is prepped: Coolify removed, 2GB swap,
  Docker 28, ports 80/443 free, SSH via the id_rsa_nopass key.
- **NEXT: step 4** (attribution envelope), then 5–8, then the deploy tail.

Steps 1–8 are local, each verifiable on the laptop; 9–12 are the deploy
tail. Steps marked ⚑ need an operator decision or action first.

---

## Step 1 — Real email for magic links (id-didi-sh) ✅ DONE 2026-07-06

**Decided: Resend.** Hand-rolled Swoosh adapter over Req (the hex package
fights the lockfile); proven end to end — production magic links land in
a real inbox. Remaining rider (⚑ operator): verify the didi.sh domain in
Resend + its DNS records in Vercel, which lifts the
only-send-to-account-owner restriction and flips the sender to
no-reply@didi.sh. Original scope follows.

- Add the Swoosh adapter dep (`gen_smtp`/`resend` per pick) to `mix.exs`;
  configure in `config/runtime.exs` (prod) with the API key from env —
  dev keeps `Swoosh.Adapters.Local` and token echo.
- ⚑ Sending-domain DNS in **Vercel DNS** (didi.sh registrar): the
  provider's SPF/DKIM/return-path records.
- `fly secrets set EMAIL_API_KEY=… -a id-didi-sh`, deploy.
- **Verify:** `mix id.seed` a throwaway with a real inbox; request a magic
  link against the deployed service; click it; land signed in on the
  `/access` fallback page. Per the open-graph discipline, check spam
  placement once.

## Step 2 — Org + membership seeding (id-didi-sh) ✅ DONE 2026-07-06

Done on local AND production (mix id.org / id.member; prod via release
eval — note the ~s() sigil gotcha and the 512MB requirement, both in the
id repo changelog 2026-07-06_06). Aniel's membership pends his address.
Original scope follows.

- New mix task `id.org` (create org by domain-as-id + name) and
  `id.member <email-or-didi_id> <org_id> <role>`; validate role against
  `Membership.roles/0`.
- Seed locally: org `humain.vc`; Michael → `superuser`; Aniel (⚑ confirm
  address) → `org_owner`.
- On prod later: `fly ssh console -a id-didi-sh` →
  `/app/bin/id_didi_sh rpc` with the same context functions.
- **Verify:** `/api/me` (signed in as Michael) returns the membership;
  tests for duplicate-membership upsert semantics.

## Step 3 — Membership gate (augment-it, workspace-service) ✅ DONE 2026-07-06

Proven via the prove script's GATE mode against a required-mode
container: anonymous 4401, superuser admitted, signed-in non-member
4403. Fails closed on id-service outage; 60s per-session cache; local
compose stays optional. Original scope follows.

- Extend `services/workspace/src/didi.ts`: after cookie verify, when
  `DIDI_AUTH=required`, GET `${ID_BASE}/api/me` with the cookie forwarded;
  admit only if memberships include `REQUIRED_ORG_ID` (new env) or role
  `superuser`. Cache the verdict on the session; re-check on reconnect,
  not per-frame.
- Reject → `socket.close(4403, 'membership required')`; the shell surfaces
  a "no access" state (DidiBadge already knows anonymous-vs-signed-in;
  add rejected).
- Keep `DIDI_AUTH=optional` in local compose; `required` is the deployed
  instance's posture.
- **Verify:** extend `scripts/prove-didi-auth.mjs`: member admitted,
  non-member (seed a stranger) rejected with 4403, superuser admitted.

## Step 4 — Actor attribution envelope (augment-it)

- `services/workspace/src/ws.ts`: the invoke path passes
  `actor: { didi_id }` (from the session) into `dispatch()`;
  `capabilities.ts` adds it to the NATS envelope beside the tenant
  context (see [[../specs/Workspaces-as-Tenant-Primitive|Workspaces-as-Tenant-Primitive]]
  § tenant-aware envelope).
- Handlers stamp `created_by`/`updated_by`: resolver
  (`services/record-surrealdb-resolver/src/domains.ts` — domains, sources,
  source_usages rows) and content-ingest (`corpus.ts` — frontmatter
  fields). Chat turns stamp acting user + `via: didi-agent`.
- **No consumers** — no filtering, no views (the flow plan's rule).
- **Verify:** run a `source.add` through the prove script with a cookie;
  confirm frontmatter + DB row carry the didi_id.

## Step 5 — Thesis vocabulary, minimal (augment-it)

- `clients/humain-vc/.env` gains `DEFAULT_DOMAIN_TYPE=thesis` (the
  per-workspace env map already loads it); expose via a small
  `workspace.config` capability (or extend `workspace.list`'s payload).
- `apps/strategy-curator`: replace the `DOMAIN_TYPE = 'strategy'` constant
  (`curation.svelte.ts:19`) with the workspace default (fallback
  'strategy'); render the noun through headers/copy (singular + plural —
  mirror content-ingest's `DOMAIN_FOLDERS`).
- Add `domain.retype` handler (resolver + content-ingest file move) and
  retype `consumer-immunology` strategy→thesis.
- **Verify:** with humain-vc active, the curator reads "Thesis"; creating
  one writes `corpus/theses/<slug>/index.md`; reach-edu still reads
  "Strategy".

## Step 6 — Curator liveness (augment-it)

- Resolver + content-ingest handlers publish NATS events after mutations:
  `domain.created`, `domain.retyped`, `source.added`, `source.updated`,
  `source.removed`, `extract.added` (payload: slugs + client_id + actor).
- Add those subjects to `BROADCAST_SUBJECTS` in
  `services/workspace/src/ws.ts`.
- `apps/strategy-curator/src/curation.svelte.ts`: subscribe via the
  workspace singleton's event stream; refetch the affected list on events
  for the active domain/client (skip events from own invokes if double-
  render annoys; correctness first).
- **Verify:** two browser windows, both on humain-vc; add a source in one;
  the other's list updates without refresh. This is the Flow-1 step-4
  acceptance, locally.

## Step 7 — Instance posture + sign-in wall (augment-it, shell)

- Shell: when the workspace-service reports `DIDI_AUTH=required` (expose
  the mode via the session frame or `workspace.config`) and the session
  has no `didi_id`, render the sign-in panel as a full pre-auth wall
  instead of mounting remotes; hide the WorkspaceSwitcher when the
  instance reports a pinned tenant (`ACTIVE_CLIENT_ID` set → include
  `pinned: true` in `workspace.list`).
- **Verify:** flip `DIDI_AUTH=required` locally → wall appears; sign in →
  shell mounts; sign out → wall returns.

## Step 8 — didi chat v0 (augment-it)

The largest step; keep it to the flow's two jobs (inbox triage into
theses; glitch assistance):

- Rename/persona: the chat rail presents as **didi**; system prompt names
  the flow context (workspace, active thesis, the curator's verbs).
- Wire curator capabilities as chat-invokable verbs through the existing
  `dispatchChatTurn` path (`services/workspace/src/chat.ts`) — didi's
  writes ride the same envelope, stamped `via: didi-agent` (step 4).
- Author the first agent-skill: `context-v/agent-skills/inbox-curation/`
  (the decile-hub-interface precedent is the format) — triage rules,
  thesis-assignment discipline, the curator capability catalog.
- **Verify:** "didi, file this link under consumer-immunology" ends with a
  source in the right thesis, attributed correctly.

## Step 9 — Deploy augment-it, single-tenant on DigitalOcean

**Decided 2026-07-06: the repurposed DigitalOcean droplet**
`ubuntu-s-1vcpu-1gb-amd-ams3-01` at **167.172.42.247** (already paid
for; whatever's on it is disposable — code lives on GitHub). Caddy for
TLS at `augment.didi.sh`.

**Box prepped 2026-07-06:** Coolify (the prior tenant) removed, ports
80/443 freed, 2 GB swapfile active + persisted, Docker 28 present,
~556 MB RAM available, 18 GB disk free. SSH: root@ with the
`id_rsa_nopass` key.

**The 1 GB constraint:** the full 11-service compose won't fit. Flow 1
needs only the curator path — run a **flow-minimal compose profile**:
`nats + workspace-service + record-surrealdb-resolver + content-ingest`
(+ Caddy, + the shell as static files). ~400–500 MB resident; add a
**2 GB swapfile** for fetch/compression spikes and build churn (pnpm
install on 1 GB wants swap; bring services up sequentially on first
build). Other microfrontends stay mounted in the shell and error if
poked — consistent with the "no extra work, no isolation" rule.
Escape hatch: DO resize to 2 GB ($12/mo) is two clicks if it strains.

- Box provisioning; clone; `.env` with: `ACTIVE_CLIENT_ID=humain-vc`,
  `DIDI_AUTH=required`, `REQUIRED_ORG_ID=humain.vc`,
  `ID_JWKS_URL=https://id.didi.sh/.well-known/jwks.json`,
  `ID_ISSUER=https://id.didi.sh`, real API keys (Jina etc.).
- Only humain-vc under `clients/` on the box (isolation by absence).
- Caddy: `augment.didi.sh` → shell static build + `/ws` → workspace :3001;
  the shell's `PUBLIC_ID_BASE=https://id.didi.sh` at build.
- **Verify:** `scripts/prove-didi-auth.mjs` with `ID_BASE=https://id.didi.sh
  WS_URL=wss://augment.didi.sh/ws` — member in, stranger out.

## Step 10 ⚑ — DNS + cookie day (Vercel DNS)

- ⚑ The **pending id records** land first (name `id`: A + AAAA above) —
  `fly certs check id.didi.sh` goes green.
- `augment` record → the step-9 box. Both apps now under `.didi.sh`; the
  cookie is shared for real (sign in once, both surfaces).
- id-didi-sh CORS config for prod: add `https://augment.didi.sh` to
  `cors_origins` (runtime env), redeploy id.
- **Verify:** sign in on augment.didi.sh; didi_session Domain=.didi.sh in
  devtools; badge lights on reload.

## Step 11 — Corpus sync, option A (box ↔ R2 ↔ laptop)

- rclone remote for the existing R2 account on the box + laptop; bucket
  prefix `corpus/humain-vc/`.
- Box: cron/systemd timer `rclone sync /srv/augment-it/clients/humain-vc
  r2:…` (push, scheduled + post-session manual); laptop pulls on demand.
- **Single-writer discipline documented in the repo README**: while the
  team works hosted, the box is authoritative; Michael's local edits go
  through R2 deliberately, never concurrently.
- **Verify:** add a source hosted → appears on laptop after pull;
  checksums match.

## Step 12 — Dress rehearsal (the acceptance run)

- Seed Aniel's membership on prod (step 2's task via fly ssh).
- Two laptops (or two browsers), both on `augment.didi.sh`: run Flow 1
  end to end — sign-ins via real email, thesis creation, link + file
  adds, cross-screen liveness, didi triage, attribution spot-check
  (frontmatter shows who did what).
- Changelog entries per shipped chunk along the way (the splash
  self-updates from them); update this plan's checkboxes as steps land.

## What happens to the existing curator data (nothing bad)

The source curator working locally against SurrealDB today is not
disturbed by any step above:

- **SurrealDB is already shared.** It's the Cloud instance; the deployed
  box points at the SAME connection string. Every canonical row —
  `sources` registry, `domains`, `source_usages`, organizations, persons —
  carries over with zero migration, because it never lived on the laptop.
  Reads stay workspace-filtered per the client-tagging convention, and the
  shared registry is a feature here: a URL reach-edu already identified
  keeps its `source_uuid` when humain-vc cites it.
- **The local corpus filesystem stays local.** `clients/reach-edu/` never
  goes near the box (isolation by absence); local dev keeps working as the
  reach-edu workbench exactly as today. `clients/humain-vc/` is nearly
  empty (one mis-filed domain) — since the flow's work is from scratch,
  either start the box's volume fresh and let `domain.retype` +
  re-creation rebuild it, or push the existing files up via step 11's
  rclone path. Both are fine; fresh is simpler.
- **Local dev and the hosted instance coexist** against the shared
  canonical layer — domains created hosted appear in local queries and
  vice versa (client-tagged). The only discipline is step 11's
  single-writer rule for the corpus FILES, which the DB doesn't need
  (it's one database either way).

## Sequencing notes

- 1–2 (id) and 3–8 (augment-it) interleave freely; nothing in 3–8 waits
  on email. 9 waits on 3+7 minimum; 10 waits on 9 plus the id DNS; 12
  waits on everything.
- Each step is one commit-or-few on `rebuild/turbo-rsbuild` (augment-it)
  / `main` (id-didi-sh), pushed per the trunk cadence, changelog on
  coherent chunks.
- If a fresh session picks this up: read the ai-labs flow plan first,
  then `git log --oneline -15` in both repos to locate the frontier.
