# Deployment

augment-it's single-tenant humain-vc instance runs on **Railway**, not the
DigitalOcean droplet originally prepped for it (see [Why Railway, not
DO](#why-railway-not-do)). This doc is the standing reference for how it's
deployed; the narrative of *how it got this way* — including every bug hit
along the way — lives in
[`context-v/plans/Build-Order-Humain-VC-Unlock-Flow.md`](context-v/plans/Build-Order-Humain-VC-Unlock-Flow.md)
(Steps 9–10) and the [changelog](changelog/2026-07-09_01_Augment-It-Deployed-Railway-Not-DigitalOcean-Custom-Domain-Live.md).

## Live URLs

| URL | Service | Purpose |
|---|---|---|
| `https://augment.didi.sh` | `shell` | The app itself — what users visit |
| `wss://ws.augment.didi.sh/ws` | `workspace-service` | WebSocket endpoint every remote connects to directly |
| `https://strategy-curator-production.up.railway.app/remoteEntry.js` | `strategy-curator` | Federated remote (static JS asset, not user-facing) |
| `https://chat-production-3378.up.railway.app/remoteEntry.js` | `chat` | Federated remote (static JS asset, not user-facing) |

Both `shell` and `workspace-service` **must** stay on `*.didi.sh` — the
`didi_session` cookie `id.didi.sh` issues is scoped to `Domain=.didi.sh`,
and every federated remote's WS connections go to `workspace-service`
directly. `strategy-curator` and `chat` are just static JS hosts loaded
cross-origin into the shell's page; they don't need to share the cookie
domain themselves.

## Why Railway, not DO

A DigitalOcean droplet (`167.172.42.247`) was prepped on 2026-07-06 as the
original target. Re-checked its live numbers three days later, right before
deploying, and found ~112MB free RAM (before running any of our own
services) and a leftover `coolify-proxy` container still squatting on ports
80/443 — "prepped and ready" had drifted. Given very few users and no prior
DO ops investment (vs. real Fly.io experience from `id-didi-sh` deployed the
same week), switched to Railway instead. Railway's multi-service-project
model is also the closest 1:1 match to this repo's actual docker-compose
shape. The droplet is still paid-for and untouched — a decision on whether
to decommission it is still open.

## The 8 services

One Railway project (`augment-it`), workspace **The Lossless Group**, one
environment (`production`).

| Service | Source | Build | Port | Public domain |
|---|---|---|---|---|
| `nats` | Docker image `nats:2.10-alpine` | image (custom start command) | 4222 / 8222 | none (private only) |
| `workspace-service` | `services/workspace/Dockerfile` | Dockerfile | 3001 | `ws.augment.didi.sh` |
| `record-surrealdb-resolver` | `services/record-surrealdb-resolver/Dockerfile` | Dockerfile | — | none |
| `content-ingest` | `services/content-ingest/Dockerfile` | Dockerfile | — | none |
| `prompt-runner` | `services/prompt-runner/Dockerfile` | Dockerfile | — | none |
| `shell` | `shell/Dockerfile` | Dockerfile | 3100 | `augment.didi.sh` |
| `strategy-curator` | `apps/strategy-curator/Dockerfile` | Dockerfile | 3017 | Railway-generated |
| `chat` | `apps/chat/Dockerfile` | Dockerfile | 3006 | Railway-generated |

**Every service is Dockerfile-built, including the three frontends** —
Railway's Railpack auto-builder is not used, deliberately (see
[Gotchas](#gotchas-hit-worth-knowing-before-touching-this-again)). The four
backend services each have `source.rootDirectory` set to their own
`/services/<name>`; the three frontends do **not** have a `rootDirectory`
set (they need the full pnpm workspace context — `shared monorepo`
pattern), and their Dockerfiles `COPY` the whole repo before running
`pnpm --filter <pkg> build`.

**Only two remotes are actually wired for this deploy**: `strategyCurator`
and `chat`. The other twelve remotes `shell/rsbuild.config.ts` knows about
(`recordCollector`, `promptTemplateManager`, …) stay hardcoded to
`localhost` — they belong to flows this single-tenant instance doesn't use.
Module Federation remotes are lazy-loaded in the sense that matters here:
nobody on this instance ever navigates to them, so their broken state is
harmless (though the browser DOES eagerly probe every declared remote's
`remoteEntry.js` on shell load, so their failures show up as console noise
— cosmetic, not functional).

## Volumes

Two Railway Volumes, deliberately **not shared** — confirmed via Railway's
own docs and support that a volume is strictly single-service:

- **`content-ingest`** owns `/clients` — the real corpus filesystem,
  read-write. This is the humain-vc corpus's actual home.
- **`workspace-service`** owns its own tiny `/data` volume, containing
  `sessions.json` (WS session tokens) and a **self-seeded**
  `clients/humain-vc/.env` stub (`DEFAULT_DOMAIN_TYPE=thesis`, nothing
  else). Written fresh on every container boot via `deploy.startCommand`
  (see below) rather than uploading the real `clients/humain-vc/.env` —
  that file also holds unrelated Decile Hub credentials workspace-service
  has no business touching.

`workspace-service`'s custom start command:

```sh
sh -c 'mkdir -p /data/clients/humain-vc && echo DEFAULT_DOMAIN_TYPE=thesis > /data/clients/humain-vc/.env && npm start'
```

`nats`'s custom start command (see [Gotchas](#gotchas-hit-worth-knowing-before-touching-this-again) for why it's shaped this way):

```sh
sh -c "echo port: 4222 > /tmp/nats.conf && echo http_port: 8222 >> /tmp/nats.conf && echo max_payload: 48MB >> /tmp/nats.conf && nats-server -c /tmp/nats.conf"
```

## Environment variables

Names only — see Railway's dashboard or `railway variable list --service
<name> --json` for values (never printed to a transcript; see the
[Gotchas](#gotchas-hit-worth-knowing-before-touching-this-again) note on
credential handling).

| Service | Variables |
|---|---|
| `workspace-service` | `NATS_URL` (`nats://${{nats.RAILWAY_PRIVATE_DOMAIN}}:4222`), `CLIENTS_ROOT=/data/clients`, `SESSION_STORE_PATH=/data/sessions.json`, `ID_JWKS_URL`, `ID_ISSUER`, `DIDI_AUTH=required`, `REQUIRED_ORG_ID=humain.vc`, `ACTIVE_CLIENT_ID=humain-vc`, `PORT=3001` (see gotcha below) |
| `record-surrealdb-resolver` | `NATS_URL`, `SURREAL_URL`, `SURREAL_NS`, `SURREAL_DB`, `SURREAL_USER`, `SURREAL_PASS` |
| `content-ingest` | `NATS_URL`, `CLIENTS_ROOT=/clients`, `JINA_API_KEY` (paid-tier extraction) |
| `prompt-runner` | `NATS_URL`, `ANTHROPIC_API_KEY` |
| `shell` | `PUBLIC_WS_URL=wss://ws.augment.didi.sh/ws`, `PUBLIC_ID_BASE=https://id.didi.sh`, `PUBLIC_STRATEGY_CURATOR_REMOTE`, `PUBLIC_CHAT_REMOTE` (all build-time — baked in via Docker `ARG`/`ENV`, not read at runtime) |
| `strategy-curator` | `PUBLIC_WS_URL`, `PUBLIC_STRATEGY_CURATOR_ASSET_PREFIX` (build-time) |
| `chat` | `PUBLIC_WS_URL`, `PUBLIC_CHAT_ASSET_PREFIX` (build-time) |

`PUBLIC_*` vars on the three frontends only take effect on the **next
build** — changing one requires `railway redeploy --service <name>
--from-source`, not just a restart.

## DNS

Two custom domains at Vercel DNS (where `didi.sh` is registered), each
needing a CNAME + a one-time TXT ownership-verification record:

| Host | Type | Points to |
|---|---|---|
| `augment` | CNAME | Railway-issued target (see `railway domain status augment.didi.sh`) |
| `ws.augment` | CNAME | Railway-issued target (see `railway domain status ws.augment.didi.sh`) |

`id-didi-sh`'s production CORS allowlist (`config/runtime.exs`,
`:identity, cors_origins:`) includes `https://augment.didi.sh` — it was
**empty** in prod before this, meaning every cross-origin browser call to
`id.didi.sh` had been silently failing since it first deployed. Add each
new `*.didi.sh` consumer (decks, memos, …) to that list as it goes live.

## Deploying / redeploying

```bash
# One-time context setup (per shell session)
export RAILWAY_CALLER="skill:use-railway@1.3.4"
export RAILWAY_AGENT_SESSION="<stable-id-for-this-session>"

# Redeploy one service from its latest pushed commit
railway redeploy --service <name> --from-source --yes

# Check status — NEVER trust "queued", poll until terminal
railway deployment list --service <name> --environment production --json

# Tail logs
railway logs --service <name> --lines 100 --json

# Change config (dot-path form is unreliable in the CLI version used to
# set this up — see Gotchas. Use the JSON-patch form:)
railway environment edit --json <<'JSON'
{"services":{"<service-id>":{"variables":{"KEY":{"value":"..."}}}}}
JSON
```

Service IDs, not names, are required for the JSON-patch form — resolve via
`railway environment config --json` (dumps every service's current config,
keyed by ID).

## Gotchas hit, worth knowing before touching this again

- **Railway CLI's `environment edit --service-config` (dot-path form)
  silently no-ops** in the version used to set this up (5.25.1) —
  `{"committed":false,"message":"No changes to apply"}` regardless of the
  value. The **JSON-patch form** works reliably; used for everything.
- **`railway volume add` panics** (Rust `unwrap()` on `None`) in the same
  CLI version. Volumes were created via a direct GraphQL `volumeCreate`
  mutation instead (`scripts/railway-api.sh` from the `use-railway` skill,
  or any GraphQL client against `https://backboard.railway.com/graphql/v2`).
- **`nats-server` does not accept `-max_payload` as a CLI flag** — this
  repo's own `nats.conf` already knew that from months back (a bind-mount
  in local docker-compose exists for exactly this reason). Needed an
  inline-generated config file on Railway; the first attempt
  (`printf '...\n...\n'` with embedded newline escapes) got corrupted
  somewhere across the Railway CLI → GraphQL → container `sh -c` chain.
  The form that survives: one `echo` per line, no embedded `\n` at all.
- **Railway's Railpack builder auto-detects a turborepo** (`turbo.json`
  exists at this repo's root) and unconditionally runs the root
  `package.json`'s `build` script (`turbo run build`) for any
  Railpack-built service, **ignoring any custom `buildCommand`
  override**. `turbo` was never an actually-installed binary in this
  repo. Fixed by giving all three frontends their own Dockerfiles instead
  of relying on Railpack at all.
- **A Docker `ARG` that's declared but never passed resolves to an empty
  string, not `undefined`** — `?? default` in TypeScript doesn't catch
  it. Two real bugs from this: `shell/rsbuild.config.ts`'s remote-URL
  fallbacks had to change from `??` to `||`, and the same for the
  `PUBLIC_WS_URL` fallback in `shell`/`strategy-curator`/`chat`.
- **Federated remotes need `output.assetPrefix`, not just
  `dev.assetPrefix`.** Missing it in production meant `chat`'s and
  `strategy-curator`'s async sub-chunks resolved as relative paths
  against the **shell's** origin instead of their own, 404ing into the
  shell's SPA-fallback HTML (`SyntaxError: Unexpected token '<'` — that
  HTML being `eval`'d as JS). Only reproduces cross-origin; local
  federation dev never surfaces it.
- **Railway auto-injects its own `PORT`** (8080) for any service with a
  public domain. This silently mismatched `workspace-service`'s domain
  target port (3001, set explicitly when the domain was created) until
  `PORT=3001` was set as an explicit service variable.
- **The shell defaulted to the wrong flow on first sign-in.**
  `FLOWS[0]` (`csvAugmentation` — Record Collector's flow, whose remotes
  are the twelve deliberately-unreachable ones) was the module-init-time
  default, resolved before `workspace.pinned` was known. A fresh sign-in
  on the pinned humain-vc instance landed there first, showing "remote
  exposes no mount function" as the very first thing a new user saw.
  Fixed with `activeFlow.applyPinnedDefault()`, applied once
  `workspace.pinned` resolves true, only when the user has never made an
  explicit flow choice.
- **Don't print secret variable values into a transcript**, even when
  trying to redact — a `isSealed`-flag check isn't the same as actually
  not fetching the value. `railway variable set --stdin` (piped from a
  local `.env`, never echoed) is safe; reading values back for
  verification isn't — check `{"set": true}`-style confirmations only.

## Known gaps

- **Corpus sync / backup.** The corpus lives on a single Railway Volume
  with no automated backup or sync-to-laptop story yet — the original plan
  assumed a DO box's filesystem an rclone cron job could reach directly,
  which doesn't translate to Railway's volume model. Needs a Railway-native
  redesign (most likely a periodic job inside `content-ingest` itself
  pushing to R2) before this is a durable setup.
- **The DO droplet** (`167.172.42.247`) is unused but still provisioned and
  billed. Decommission-or-keep-as-spare is an open decision.
- **No human sign-in has been load-tested** beyond the operator's own
  verification — Aneil and Linea have `org_owner` accounts seeded
  (production + local) but haven't yet completed a live dress-rehearsal
  session together.

## Related

- [`context-v/plans/Build-Order-Humain-VC-Unlock-Flow.md`](context-v/plans/Build-Order-Humain-VC-Unlock-Flow.md) — Steps 9–10, the full narrative
- [`changelog/2026-07-09_01_Augment-It-Deployed-Railway-Not-DigitalOcean-Custom-Domain-Live.md`](changelog/2026-07-09_01_Augment-It-Deployed-Railway-Not-DigitalOcean-Custom-Domain-Live.md)
- [`context-v/specs/Id-Didi-Sh-Identity-Service.md`](../context-v/specs/Id-Didi-Sh-Identity-Service.md) (ai-labs level) — the identity/cookie contract this deploy depends on
