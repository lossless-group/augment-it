---
title: "Connecting To And Using SurrealDB"
lede: "The one place that codifies how augment-it talks to SurrealDB Cloud — the five env vars, the connect → signin → use dance, the client-tagging write contract, and the dev-only-credentials posture that a proxy service eventually replaces."
date_created: 2026-06-21
date_modified: 2026-06-21
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.8 (1M context)
semantic_version: 0.0.0.1
tags:
  - Blueprint
  - SurrealDB
  - Canonical-Layer
  - Connection-Pattern
  - Client-Tagging
  - Multi-Client
  - Module-Federation
  - Person-Enrichment
status: Draft
---

# Connecting To And Using SurrealDB

## Why this blueprint exists

For nine months augment-it lived entirely on the filesystem — markdown frontmatter
for structured data, JSON for machine output, git for the audit log. That posture
broke the moment we needed to blend a **canonical** fact (refreshable from LinkedIn,
shareable across clients) with **proprietary** per-engagement commentary (which must
never cross a client boundary). The answer was a SurrealDB Cloud canonical layer
([[Canonical-Entity-Registry-on-SurrealDB-Cloud]], shipped 2026-06-15).

Since then, every script and the `person-enrichment` micro-frontend touches SurrealDB
the same way — but that "same way" lived only in the code. This blueprint extracts it
so the next person (or agent) wiring a new writer, a new surface, or a new client
doesn't have to reverse-engineer it from `scripts/surreal-*.mjs`. **If you are about
to read from or write to SurrealDB anywhere in augment-it, read this first.**

The connection mechanics, the env contract, and the write discipline are the load-bearing
parts. Get those right and Surreal behaves; get the client tag wrong and you leak one
client's data into another's view.

## The data model in one paragraph

SurrealDB Cloud holds the **canonical layer** on `main/main` (namespace/database).
Five tables: `persons`, `organizations`, `locations`, `events`, and `observations`
(the provenance-carrying fact log — subject / predicate / object / observed_at /
source / client). One row per real-world entity, shared across clients; isolation
comes from a materialized `client_access: string[]` array on every entity plus a
`client` field on every observation. Proprietary commentary stays on the filesystem
under `clients/<slug>/` and joins to canonical by slug. See
[[Client-Tagging-on-Canonical-Writes]] for the full write contract.

## The connection: five env vars, one handshake

Every consumer — Node script or browser SDK — reads the **same five required env vars**:

| Var | Role |
|---|---|
| `SURREAL_URL` | WebSocket endpoint of the Cloud instance |
| `SURREAL_NS` | namespace (`main`) |
| `SURREAL_DB` | database (`main`) |
| `SURREAL_USER` | root/db user |
| `SURREAL_PASS` | password |

A sixth, **`SURREAL_CLIENT`**, is the workspace slug (`reach-edu`, `humain-vc`, …)
that tags writes. It is required by every *writer*, optional for read-only probes.

> **Drift note (surface, don't auto-fix):** the repo-root `.env` currently carries
> `SURREAL_ENDPOINT` and `SURREAL_URL` but **no `SURREAL_CLIENT`** key, and
> `.env.example` documents none of the `SURREAL_*` vars. The browser build defaults
> `SURREAL_CLIENT` to `reach-edu` (see below); scripts hard-fail without it. Worth
> reconciling `.env.example` against the six vars when someone does a deliberate
> cleanup pass.

### The handshake — always `connect → signin → use`

SurrealDB's v2 SDK requires three calls in order. This is the canonical shape, lifted
from `scripts/surreal-smoke-test.mjs`:

```js
import { Surreal } from 'surrealdb';

const db = new Surreal();
await db.connect(process.env.SURREAL_URL);
await db.signin({
  username: process.env.SURREAL_USER,
  password: process.env.SURREAL_PASS,
});
await db.use({
  namespace: process.env.SURREAL_NS,
  database:  process.env.SURREAL_DB,
});
// … queries …
await db.close();
```

Miss `signin` and every query returns **"Anonymous access not allowed."** Miss `use`
and you'll query the wrong (or no) database. The order is not negotiable.

### Verifying a connection — the smoke test

Before debugging a writer, prove the connection works in isolation:

```bash
set -a; . ./.env; set +a        # source the repo-root .env into the shell
node scripts/surreal-smoke-test.mjs
```

It runs three checks — `connect+signin+use`, `RETURN 42` (round-trip), and
`INFO FOR DB` (schema visibility) — and exits non-zero on any failure. It's the
fastest way to tell "my creds/env are wrong" apart from "my query is wrong."

## Two consumers, two ways the env arrives

The handshake is identical; only **how the env reaches the code** differs.

### 1. Node scripts (`scripts/surreal-*.mjs`)

Read straight from `process.env`. Every script begins by asserting the five vars are
present and aborting loudly if not:

```js
for (const k of ['SURREAL_URL', 'SURREAL_NS', 'SURREAL_DB', 'SURREAL_USER', 'SURREAL_PASS']) {
  if (!process.env[k]) { console.error(`missing env: ${k}`); process.exit(1); }
}
```

Source the env before running, or inline it per-run to switch workspaces:

```bash
set -a; . ./.env; set +a
node scripts/surreal-write-persons.mjs --client humain-vc --csv <path>

# or override the client for one run:
SURREAL_CLIENT=reach-edu node scripts/surreal-write-event-attendees.mjs …
```

### 2. The browser SDK (`apps/person-enrichment/`)

The same `surrealdb` package runs in the browser. Credentials are **embedded at build
time** via rsbuild's `source.define`, which rewrites `import.meta.env.SURREAL_*` into
string literals in the bundle (`apps/person-enrichment/rsbuild.config.ts`):

- `rsbuild.config.ts` hand-parses the repo-root `.env` so the operator doesn't have to
  `set -a; . ./.env; set +a` before every `pnpm dev`. `process.env` still wins when set,
  so `SURREAL_CLIENT=humain-vc pnpm dev` switches workspaces ad-hoc.
- `SURREAL_CLIENT` **defaults to `reach-edu`** if unset (the only var with a default).
- `src/env.d.ts` types all six on `ImportMetaEnv`.
- `src/lib/surreal.ts` wraps the handshake with a **lazy singleton** (`getDb()` caches
  the instance) and throws a help-text error naming exactly which vars are missing.

> **⚠️ This is dev-only, single-operator.** Build-time credential embedding means the
> Surreal root password ships inside the browser bundle. The code says so explicitly
> (`surreal.ts:3`, `rsbuild.config.ts`): *"a proxy service replaces this when a second
> operator joins."* Do **not** deploy `person-enrichment` to a shared/public origin as-is.
> The graduation path is a server-side proxy that holds the creds and exposes scoped,
> authenticated queries — see [[Per-Client-Privacy-and-the-Path-Off-Local]].

### The WebSocket re-auth gotcha (browser)

The browser WebSocket can drop on idle timeout or a network blip, and the SDK
**auto-reconnects without re-signing-in** — so the next query fails with "Anonymous
access not allowed." `surreal.ts` wraps `.query` to catch that one specific failure,
re-run `signin + use` once, and retry. Real credential errors still bubble up after the
single retry. If you write a long-lived browser surface, reuse `getDb()` rather than
hand-rolling the handshake, or you'll reintroduce this bug.

## The write contract — never write without a client tag

This is the rule that keeps two clients' data in one table without leakage. Every
writer follows it; a writer that doesn't is **broken**, not merely incomplete.

**1. Require the client slug, abort if absent.** From `--client <slug>` CLI arg or
`SURREAL_CLIENT` env — no implicit writes:

```js
const client = args.client || process.env.SURREAL_CLIENT;
if (!client) {
  console.error('missing --client <slug> (or SURREAL_CLIENT env). Required so writes are tagged with the originating workspace.');
  process.exit(1);
}
```

**2. Upsert on a durable join key, never blind-create.** SELECT by the key; MERGE on
hit, CREATE on miss. Join keys in use: `persons.linkedin_profile_url` (UNIQUE index),
`persons.email`, `organizations.slug`. IDs are server-generated time-ordered UUIDs via
`rand::uuid::v7()`.

```js
// CREATE branch — note the client-tagging quartet on every new entity
await db.query(
  `CREATE persons SET
      id = rand::uuid::v7(),
      linkedin_profile_url = $url,
      name = $name,
      source = $source,
      client_access    = [$client],
      first_touched_by = $client,
      last_touched_by  = $client,
      last_touched_at  = time::now(),
      first_seen_at    = time::now(),
      last_seen_at     = time::now()`,
  { url, name, source, client },
);

// MERGE branch — union the client in so cross-client touches accumulate
await db.query(
  `UPDATE $id MERGE $fields SET
      last_seen_at    = time::now(),
      client_access   = array::union(client_access ?? [], [$client]),
      last_touched_by = $client,
      last_touched_at = time::now()`,
  { id, fields, client },
);
```

`array::union(client_access ?? [], [$client])` is the load-bearing idiom: when a second
client surfaces the same real-world entity, its slug appends — `["reach-edu"]` becomes
`["reach-edu", "humain-vc"]` — and **both** workspaces see the one row. No second row,
no leakage.

**3. Every observation carries `client`.** The fact log records who claimed what, on
whose behalf:

```js
await db.query(
  `CREATE observations SET
      id          = rand::uuid::v7(),
      subject     = $subject,
      predicate   = "invited_to",
      object      = $object,
      observed_at = $observed_at,
      source      = $source,
      client      = $client;`,
  { subject, object, observed_at, source, client },
);
```

**4. Reads filter by client.** A workspace sees only what it has touched:

```sql
SELECT * FROM persons WHERE client_access CONTAINS $workspace_slug;
```

## Idempotency conventions

Everything is **safe to re-run** — scripts are written to be replayed without
duplicating data or corrupting state:

- **Indexes:** `DEFINE INDEX IF NOT EXISTS …` (re-defining is a no-op; it throws only if
  existing data already violates a new UNIQUE constraint).
- **Upserts:** SELECT-then-MERGE/CREATE means a second run updates rather than duplicates.
- **Backfills:** guarded by `WHERE <field> IS NONE` so a re-run touches only still-unstamped
  rows (`surreal-backfill-client-tagging.mjs` is the reference — it brought the pre-tagging
  humain-vc cohort up to the client-tagging spec in ~1s).

When you add a writer, preserve this property. A script that doubles its rows on a second
run is a latent data-corruption bug.

## Script catalogue (current writers)

All under `scripts/`, all following the contract above:

| Script | Role |
|---|---|
| `surreal-smoke-test.mjs` | connectivity probe (connect / RETURN 42 / INFO FOR DB) |
| `surreal-write-persons.mjs` | bulk persons loader from CSV, keyed on `linkedin_profile_url` |
| `surreal-write-locations.mjs` | bulk locations loader |
| `surreal-write-event.mjs` | single-event writer |
| `surreal-write-event-attendees.mjs` | per-attendee loader (person + email + funnel observations + org) |
| `surreal-backfill-located-in.mjs` | `located_in` observation backfill |
| `surreal-backfill-client-tagging.mjs` | one-shot `client_access` + `client` backfill |
| `surreal-materialize-persons-locations.mjs` | denormalizes `persons.location` |
| `surreal-verify-corpus-ids.mjs` | maintenance / verification |
| `surreal-merge-ihs-duplicate.mjs` | one-off duplicate merge |

The browser consumer: `apps/person-enrichment/src/lib/surreal.ts` (`getDb()` singleton +
re-auth wrapper), typed by `src/env.d.ts`, fed by `rsbuild.config.ts`.

## Anti-patterns (don't)

- **Don't write without a client tag.** No `--client`, no write. This is the whole
  isolation guarantee.
- **Don't blind-`CREATE`.** Always SELECT-by-join-key first, or you'll duplicate entities
  on re-run.
- **Don't hand-roll the handshake in a long-lived browser surface.** Reuse `getDb()` so you
  inherit the idle-reconnect re-auth retry.
- **Don't ship the browser app to a shared origin.** Build-time creds = password in the
  bundle. Wait for the proxy service.
- **Don't overwrite operator commentary with canonical refreshes.** Canonical (Surreal) and
  proprietary (filesystem `clients/<slug>/`) are deliberately separate layers joined by slug.

## See also

- [[Canonical-Entity-Registry-on-SurrealDB-Cloud]] — the plan that introduced the SurrealDB layer
- [[Client-Tagging-on-Canonical-Writes]] — the cross-cutting write spec this blueprint operationalizes
- [[Sparse-Person-Enrichment-Surface]] — the `person-enrichment` micro-frontend's spec
- [[Per-Client-Privacy-and-the-Path-Off-Local]] — the privacy axis + the proxy-service graduation path
- [[Module-Federation-Rsbuild-Dev-Loop-Gotchas]] — the bundler substrate the browser consumer runs on
- `changelog/2026-06-15_02_SurrealDB-Canonical-Layer-Lands-With-Cross-Client-Visibility.md` — the ship note
