---
title: "Build order: the humain-vc unlock flow, step by step"
lede: "The execution sequence for Flow 1 (Michael + Aniel, side-by-side thesis corpus building on a hosted augment-it) — each step names its repo, files, and verification so any fresh session can pick up mid-sequence. The strategy and scope cuts live in the ai-labs plan; this is the how."
date_created: 2026-07-06
date_modified: 2026-07-09
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
  - Claude Code on Claude Sonnet 5
semantic_version: 0.0.4.0
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

## State as of writing (2026-07-08 — verify, don't assume)

- **Live URLs:** `https://id.didi.sh` (identity service on Fly — full
  magic-link loop operator-clicked in production; Resend domain-verified,
  sender `no-reply@didi.sh`), `https://didi.sh` + `www` (the `site/`
  conversion surface on Vercel), the GitHub splash.
- **Steps 1–8 DONE** (see their sections): real email, orgs + memberships
  seeded local AND prod (Michael = superuser, 3 addresses; Aniel pends his
  address), the membership gate proven (4401 / admitted / 4403), the
  actor attribution envelope proven live (created_by/updated_by on
  domains/sources/source_usages + corpus frontmatter), thesis
  vocabulary (Corpora Curator rename, operator-defined + per-workspace-
  default domain type, `domain.retype` migration — `consumer-immunology`
  is now `thesis:consumer-immunology`), curator liveness (domain/source
  mutations broadcast over NATS; the curator surface refetches on events
  from a second session — proven via `LIVENESS=1` on the prove script),
  the pre-auth sign-in wall (a real anonymous-visitor gap found and closed
  via a new `GET /config`, not just the session frame), and didi chat v0
  (persona rename, curator verbs as chat-invokable verbs with a live
  domain-name resolver, the `inbox-curation` agent-skill, and a face —
  the character headshot composited with the shell's brand gradient).
- **id.didi.sh went down and came back**: the Fly.io trial ended mid-week,
  suspending the app; billing fixed, machine restarted, verified live
  again (JWKS serving, aliases + orgs + memberships all intact in prod).
  A reminder that this dependency needs a real payment method on file
  before the DO deploy, not a trial.
- **Interleaved but separate:** `feature/augment-affiliations` (the
  Augment-From-Affiliations MVP, `context-v/specs/Augment-From-Affiliations.md`)
  shipped and merged into `rebuild/turbo-rsbuild` on 2026-07-08, between
  steps 5 and 6 of this sequence — a different flow, same repo, not part of
  this build order.
- augment-it workspace-service verifies `didi_session` on WS upgrade
  (`services/workspace/src/didi.ts`); shell has the DidiBadge sign-in AND
  a "Flows" jumbo popdown ("Build Corpora" → corporaCurator, full-screen);
  corpora-curator (now "Corpora Curator") promoted to the head of
  ROTATION; the active-workspace split-brain fixed at the shell level
  AND, separately, inside the curator itself (each federation remote's own
  `@augment-it/workspace` singleton needed its own reconciliation listener
  — see Step 5 / the 2026-07-07 changelog entry).
- Local compose currently running `DIDI_AUTH=required REQUIRED_ORG_ID=humain.vc`
  (flipped from the `optional` dev default for live testing this session —
  flip back in `.env` when done); the prove script's GATE mode is the
  repeatable check either way.
- **The DO droplet plan was abandoned** (167.172.42.247 — still prepped,
  still paid-for, just not used). Steps 9–10 shipped on **Railway**
  instead, plus a real custom domain — see their sections for why and
  the full list of Railway-specific gotchas hit along the way.
- **Live URLs, deployed:** `https://augment.didi.sh` (shell, single-tenant
  humain-vc), `wss://ws.augment.didi.sh/ws` (workspace-service). Both
  verified live via headless-browser checks against the real deployed
  URLs, not just localhost.
- **NEXT: step 12** — the dress rehearsal. Aniel's membership still isn't
  seeded on prod (carried over from Step 2 — his address was never
  confirmed), and nobody has completed an actual human sign-in against
  `augment.didi.sh` yet (dev-token echo is off in prod by design, so this
  genuinely needs a person clicking a real email). Step 11 (corpus sync)
  needs a Railway-native redesign before it's real, but doesn't block 12.

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

## Step 4 — Actor attribution envelope (augment-it) ✅ DONE 2026-07-06

Done and proven live against local dev: `dispatch()`'s NATS envelope
carries `{ didi_id, via? }`, the resolver stamps `created_by`/`updated_by`
(+`_via`) on domains/sources/source_usages without clobbering unattributed
writes, and content-ingest writes `created_by` into both the domain
index.md and the source file's frontmatter. Chat-replayed invokes carry
`via: 'didi-agent'` through `workspace.invoke(capability, args, via)`.
Changelog: `2026-07-06_03_Actor-Attribution-Envelope-Every-Mutation-Knows-Who-Did-It.md`.
Original scope follows.

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
  confirm frontmatter + DB row carry the didi_id. Extended
  `scripts/prove-didi-auth.mjs` with an `ATTRIBUTION=1` mode
  (`domain.create` + `source.add` over an authenticated WS session,
  asserts the response's `created_by` matches the signed-in `didi_id`);
  ran it against local docker compose + `id-didi-sh` on :4000 — passed,
  and the on-disk frontmatter for both the domain and source file carried
  the didi_id. Test rows/files cleaned up after (shared SurrealDB Cloud +
  local corpus filesystem).

## Step 5 — Thesis vocabulary, minimal (augment-it) ✅ DONE 2026-07-07 (shipped differently than sketched)

> Proceeded independently of [[../explorations/Augment-It-Has-Outgrown-One-Flow-The-Choose-A-Flow-Front-Door]] —
> that exploration questions whether `corporaCurator`'s place at the head
> of shell `ROTATION` is the right long-term shape (it argues for a
> "choose a flow" front door instead), but this step's per-workspace
> `domain_type` swap was correct either way and didn't wait on that
> question resolving.

Done across two sessions (2026-07-06 UI rename + operator-defined type;
2026-07-07 the per-workspace default + the retype migration), ending up
more general than the original sketch:

- `apps/corpora-curator` UI now reads **"Corpora Curator"** everywhere
  (display copy only — package/folder/remote id unchanged). `DOMAIN_TYPE`
  the hardcoded constant is gone; `curation.svelte.ts` carries a reactive
  `domainType` field, operator-editable via a **Type** field on the "New
  corpus" form (free text — any value, not a fixed enum).
- **Per-workspace default, done**: `WorkspaceSummary` gained
  `default_domain_type` (`services/workspace/src/workspaces.ts`, read from
  each client's `DEFAULT_DOMAIN_TYPE` .env var — `clients/humain-vc/.env`
  now has `DEFAULT_DOMAIN_TYPE=thesis`; reach-edu has none, falls back to
  `'strategy'`). The curator resolves this on bootstrap AND on every
  workspace switch, so a fresh humain-vc session (or switching into it
  mid-session) starts on "thesis" without the operator typing it.
- **`domain.retype` handler, done**: `services/record-surrealdb-resolver/src/domains.ts`'s
  `retypeDomain()` (DB: `domains.type` + every `source_usages.domain_type`
  for the slug, idempotent — safe to re-run after a partial failure) +
  `services/content-ingest/src/corpus.ts`'s `retypeDomainFiles()`
  (moves `<old-type-plural>/<slug>/` → `<new-type-plural>/<slug>/`, patches
  `index.md`'s `type:` line and every source file's `domains:` list entry).
  Wired as the `domain.retype` capability. Ran it once via
  `scripts/prove-didi-auth.mjs`'s new `RETYPE=1` mode: `consumer-immunology`
  is now `thesis:consumer-immunology`, DB + filesystem both confirmed.
  Along the way, found and fixed a real bug in `retypeDomainFiles`'s first
  draft — it reused content-ingest's file-only `exists()` helper (which is
  `readFile`-based and throws `EISDIR` on a directory, silently reading as
  "not found") to check directory existence; replaced with a proper
  `stat().isDirectory()` check.
- **Still open, genuinely deferred**: singular/plural noun rendering
  through the rest of the UI copy (it says "corpus"/"corpora" generically
  rather than "Thesis"/"Theses" when that type is active) — cosmetic, no
  functional gap.
- **Verify:** confirmed live — humain-vc now resolves `domainType: 'thesis'`
  on load; `consumer-immunology` is retyped end-to-end (DB rows + on-disk
  frontmatter, verified by direct SurrealDB query and `cat`); reach-edu
  untouched, still resolves `'strategy'`.

## Step 6 — Curator liveness (augment-it) ✅ DONE 2026-07-08

Done as sketched, with the broadcast owned by the resolver alone (the single
service that already runs each mutation's full DB + content-ingest
lifecycle end to end, so it's the one place that knows a mutation actually
succeeded) rather than split across resolver and content-ingest:

- `services/record-surrealdb-resolver/src/domains.ts`'s
  `registerDomainHandlers` gained a `broadcast(subject, payload)` helper
  (fire-and-forget `nc.publish`, same pattern as `workspaces.ts`'s
  `workspace.active.changed`) called after each of the six mutations
  commits: `domain.created`, `domain.retyped`, `source.added`,
  `source.updated`, `source.removed`, `extract.added` — payload carries
  the domain/source slugs, `client_slug` (or `client_slugs` for retype,
  which can span clients), and `actor`.
- Those six subjects added to `BROADCAST_SUBJECTS` in
  `services/workspace/src/ws.ts`.
- `apps/corpora-curator/src/App.svelte` (not `curation.svelte.ts` — an
  `$effect` needs a component, and `record-collector`'s App.svelte already
  set the precedent) watches `workspace.events`, dedups by `seq` the same
  way `record-collector` does, and calls the state singleton's
  `loadStrategies()` (domain events, type-and-client-scoped) or new
  `refreshSources()` (source/extract events, domain-and-client-scoped —
  refetches without resetting focus/tags, unlike the user-driven `select()`).
- **Verify:** ran the protocol-level equivalent of "two browser windows" —
  a new `LIVENESS=1` mode in `scripts/prove-didi-auth.mjs` opens two
  independently-authenticated WS sessions against the live local stack;
  session A invokes `domain.create` then `source.add`; session B (idle,
  never invokes) asserted receipt of `domain.created` then `source.added`
  with matching payloads, no polling. Passed both. `apps/corpora-curator`
  (`svelte-check`) and the two touched services (`tsc --noEmit`) all clean.
  Test domain + source cleaned up from SurrealDB and the humain-vc
  filesystem after the run, same discipline as step 4's ATTRIBUTION mode.

## Step 7 — Instance posture + sign-in wall (augment-it, shell) ✅ DONE 2026-07-08

> No dependency on
> [[../explorations/Augment-It-Has-Outgrown-One-Flow-The-Choose-A-Flow-Front-Door]]'s
> proposed header-level "Build Corpora" jumbo popdown — that's a plain
> navigate action with no auth interaction, unlike the front-door shape
> originally sketched there. Independent work either order.

Done as sketched, with a real gap found and closed along the way: an
anonymous WS upgrade against `DIDI_AUTH=required` is rejected (4401) BEFORE
any session frame ships, so the session frame alone can never tell an
anonymous visitor's shell "this instance requires sign-in." Added a plain
`GET /config` (CORS-open, `services/workspace/src/server.ts`) the shell
fetches alongside — not instead of — `connect()`, so the wall renders
correctly for the actual anonymous-visitor case, not just the
already-connected-but-rejected one.

- `services/workspace/src/server.ts`: new `GET /config` → `{
  didi_auth_mode }`. `services/workspace/src/ws.ts`: session frame also
  carries `didi_auth_mode` (belt-and-suspenders for the already-connected
  case). `services/workspace/src/workspaces.ts` + `capabilities.ts`:
  `workspace.list` gained `pinned` (true when `ACTIVE_CLIENT_ID` was set at
  boot). `packages/workspace/src/state.svelte.ts` + `types.ts`: new
  `didi_auth_mode` / `pinned` reactive fields, `fetchDidiAuthMode()`.
- `shell/src/SignInWall.svelte` (new): full-screen pre-auth wall, same
  headless sign-in mechanics as `DidiBadge.svelte`. `shell/src/App.svelte`:
  `showWall` derived gates the entire header+stage behind `{#if showWall}
  <SignInWall />{:else}…{/if}`; `WorkspaceSwitcher` hidden when
  `workspace.pinned`.
- **Verify:** confirmed live in a real browser (headless Chromium,
  `playwright`) — anonymous visitor → full wall, no header/remotes/switcher;
  signed in → wall gone, header + switcher + remotes all render, real data
  loads. `pinned: true`/`false` verified via a temporary `ACTIVE_CLIENT_ID`
  override (no rebuild needed) then reverted. `svelte-check` clean on
  `shell` (2 pre-existing, unrelated errors confirmed via `git stash`).

## Step 8 — didi chat v0 (augment-it) ✅ DONE 2026-07-08

Scoped deliberately to augment-it only — see
[[../../../context-v/explorations/Didi-sh-One-Login-One-Agent-Three-Services|Didi-sh-One-Login-One-Agent-Three-Services]]
for the full cross-service vision (one persona, shared skill-library
package, per-app capability registries) this is the local first slice of.
The shared `@lossless/in-app-agent` package extraction is explicitly
deferred to its own initiative, not bundled into this flow.

- **Persona rename** (`services/workspace/src/chat.ts`'s `STATIC_SPINE`):
  didi introduces itself by name, names both jobs (enrichment + corpus
  curation), and states plainly it's scoped to augment-it only — no
  cross-service claims.
- **Curator capabilities wired as chat verbs**: new `CURATOR_CHAT_VERBS`
  slab (`source.add`, `domain.create`, `extract.add`, `tag.apply`) plus a
  live, volatile `existingCorporaSlab()` — a `domain.list` read injected
  into every turn as `Title → type:slug`, so didi resolves a name like
  "consumer-immunology" against the workspace's REAL corpora instead of
  guessing. `assembleSystemSlabs` is now async to support the live read.
  Writes ride the existing actor envelope unchanged — `via: 'didi-agent'`
  was already threaded from `apps/chat`'s invoke path since step 4.
- **Agent-skill authored**: `context-v/agent-skills/inbox-curation/SKILL.md`
  (decile-hub-interface's format) — the full decision tree (named +
  existing corpus → invoke directly; new corpus → propose first; unclear →
  propose-or-inbox), the never-fabricate-an-identifier discipline, and the
  boundary with `corpus.inbox.add` (untriaged parking, not filing).
- **Didi also got a face**: a character headshot (user-provided,
  transparent PNG) composited with the shell's actual brand-duotone
  gradient tokens, wired into `DidiBadge.svelte`, `SignInWall.svelte`, and
  the chat rail's header (`apps/chat/src/App.svelte` — "didi · augment-it ·
  \<status\>").
- **Verify:** the literal acceptance line — "didi, file this link under
  consumer-immunology" — run live against the local stack (a real chat_turn
  → chat_invoke source.add → source filed under `thesis:consumer-immunology`,
  `created_by` matching the signed-in didi_id). Also verified in the actual
  browser UI: didi's first greeting lists the workspace's three real
  corpora by name, pulled live from the same context slab. Test source
  cleaned up after (DB + filesystem), same discipline as prior steps.
  `svelte-check` clean on `apps/chat` and `shell`; `tsc --noEmit` clean on
  `services/workspace`.

## Step 9 — Deploy augment-it, single-tenant ✅ DONE 2026-07-09 (Railway, not DigitalOcean)

**Platform changed after re-checking the DO droplet's live numbers**: the
`167.172.42.247` box (prepped 2026-07-06) turned out to have only ~112MB
free / 537MB available RAM before running a single one of our own
services — the "escape hatch: resize to 2GB if it strains" language in
the original plan undersold how tight it already was. A leftover
`coolify-proxy` container was also still holding ports 80/443, meaning
"ports freed" was stale too. Given very few users and no prior DO ops
investment (vs. real Fly.io experience from id-didi-sh this same week),
the operator chose **Railway** over both DO and Fly — Railway's
multi-service-project model is the closest 1:1 match to this repo's
actual docker-compose shape. The DO droplet is abandoned for this flow
(still paid-for and untouched otherwise).

**8 Railway services**, one project (`augment-it`, workspace "The
Lossless Group"): `nats` (official image, custom start command — see
gotcha below), `workspace-service`, `record-surrealdb-resolver`,
`content-ingest`, `prompt-runner` (all four Dockerfile builds,
`rootDirectory` = `/services/<name>`), and three frontends —
`shell`, `corpora-curator`, `chat` — each **also** Dockerfile-built
(not Railway's Railpack auto-builder; see gotcha below), full-repo
build context (they need the pnpm workspace), each producing its own
static `dist/` served via `serve`.

**Two Railway Volumes**, deliberately NOT shared (confirmed via Railway
docs + support: a volume is strictly single-service): `content-ingest`
owns `/clients` (the real corpus filesystem, read-write); `workspace-service`
gets its own tiny `/data` volume, self-seeded on every boot via its
`deploy.startCommand` (`mkdir -p /data/clients/humain-vc && echo
DEFAULT_DOMAIN_TYPE=thesis > .../​.env && npm start`) rather than
uploading the real `clients/humain-vc/.env` (which also holds unrelated
Decile Hub credentials workspace-service has no business touching).

**Real gotchas hit and fixed, worth knowing before touching this again:**
- Railway's CLI (`environment edit --service-config`, dot-path form)
  silently no-ops in the version used this session — `{"committed":false,
  "message":"No changes to apply"}` regardless of value. The **JSON patch
  form** (`environment edit --json`) works reliably; used for everything.
- `railway volume add` panics (Rust `unwrap()` on `None`) in this CLI
  version — created volumes via direct GraphQL (`volumeCreate` mutation)
  instead.
- `nats-server` does **not** accept `-max_payload` as a CLI flag (matches
  this repo's own `nats.conf` comment from months ago) — needed an inline
  generated config file. First attempt (`printf '...\n...\n'`) corrupted
  across the Railway CLI → GraphQL → container `sh -c` chain; the
  **multi-`echo`, no-embedded-newlines** form is what actually survives:
  `echo port: 4222 > /tmp/nats.conf && echo http_port: 8222 >> ... &&
  nats-server -c /tmp/nats.conf`.
- Railway's **Railpack builder auto-detected this repo as a turborepo**
  (`turbo.json` exists at root) and unconditionally ran the root
  package.json's `build` script (`turbo run build`) for the three
  frontends, ignoring any custom `buildCommand` override — and `turbo`
  was never actually an installed binary here. Fixed by giving `shell`,
  `corpora-curator`, and `chat` their own Dockerfiles (direct `pnpm
  --filter <pkg> build`), same pattern as the four backend services.
- A Docker `ARG` that's declared but never passed resolves to an **empty
  string**, not `undefined` — `?? default` doesn't catch it. Two real
  bugs from this: (1) `shell/rsbuild.config.ts`'s remote-URL fallbacks
  had to change from `??` to `||`; (2) module-federation `assetPrefix`
  was only set for `dev`, not `output` (the field that also covers
  production builds) — missing it meant `chat`'s and `corpora-curator`'s
  async sub-chunks resolved as relative paths against the **shell's**
  origin instead of their own, 404ing into the shell's SPA-fallback HTML
  ("SyntaxError: Unexpected token '<'"). Only reproduces cross-origin —
  local federation dev never surfaces it. Both fixed with
  `output.assetPrefix` env-configured per remote.
- Railway auto-injects its own `PORT` (8080) for any service — this
  silently mismatched the public domain's configured target port (3001)
  for `workspace-service` until `PORT=3001` was set explicitly as a
  service variable.

**Verify, as done:** headless-Chromium checks against the live deployed
URLs (not just localhost) — anonymous visitor → full wall, zero
unexpected console errors (only the 12 out-of-scope remotes' harmless
`localhost` failures, unchanged from local); `workspace-service`'s
`/config` endpoint live; `scripts/prove-didi-auth.mjs`'s `GATE=1` mode
run against the real deployed `wss://ws.augment.didi.sh/ws` — anonymous
correctly rejected 4401. Member-admitted couldn't be scripted against
prod `id.didi.sh` (dev-token echo is deliberately disabled there) — that
leg needs a real human sign-in (Step 12).

## Step 10 — DNS + cookie day ✅ DONE 2026-07-09 (Railway custom domains, not DO/Caddy)

Two Railway custom domains, both required under `*.didi.sh` for the
`didi_session` cookie (`Domain=.didi.sh`) to actually reach them — the
shell's own page origin AND workspace-service's WS endpoint (every
federated remote connects to workspace-service directly, so it's the one
that must share the cookie domain; the remotes' own static-asset
origins don't need to):

- `augment.didi.sh` → `shell` (CNAME + TXT ownership-verification record,
  added at Vercel DNS by the operator; validated + cert issued within
  minutes).
- `ws.augment.didi.sh` → `workspace-service` (same pattern).
- `id-didi-sh`'s prod `cors_origins` — **was empty** (`config/runtime.exs`
  never set it; only `dev.exs` had `localhost:3100`), meaning every
  cross-origin browser call to `id.didi.sh` in production had been
  silently CORS-rejected since it went live, just never surfaced because
  augment-it wasn't deployed yet. Added `["https://augment.didi.sh"]`,
  deployed to Fly.
- `PUBLIC_WS_URL` rebuilt into `shell`/`corpora-curator`/`chat` as
  `wss://ws.augment.didi.sh/ws`.
- **Verify:** `curl -H "Origin: https://augment.didi.sh" -X OPTIONS
  https://id.didi.sh/api/magic-links` returns
  `access-control-allow-origin: https://augment.didi.sh` +
  `access-control-allow-credentials: true`. Live browser check against
  `https://augment.didi.sh` clean (see Step 9). Real sign-in + cookie
  attachment still needs a human (Step 12) — dev-token echo being off in
  prod is a feature, not a gap to route around.

## Step 11 — Corpus sync ⚑ NEEDS REVISITING (Railway volumes replace the DO-box assumption)

Written when Step 9 targeted a DO droplet with a filesystem an rclone
timer could reach directly. On Railway, `content-ingest`'s corpus lives
on a **Railway Volume** — reachable via `railway volume files` (CLI, hit
its own bugs this session — see Step 9) or `railway ssh`, not a plain
box path a cron job can rclone from directly. The single-writer
discipline (team writes hosted; Michael's local edits sync deliberately,
never concurrently) still holds as a policy — the *mechanism* needs a
Railway-native answer (a periodic job inside `content-ingest` itself
pushing to R2, most likely) before this step is actually done. Not
blocking Step 12 — humain-vc's corpus is empty-ish today either way.

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
