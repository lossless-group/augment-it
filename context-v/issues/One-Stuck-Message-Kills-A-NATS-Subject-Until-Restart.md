---
title: "One stuck message kills a NATS subject until restart — `domain.list: timeout` and the sequential handler loop"
lede: "reach-edu's corpora stopped loading, and the cause wasn't the data or the database: every handler in domains.ts consumes its subject with a `for await` loop, so a single request that never settles blocks that subject forever. Silent, total, invisible in the logs, and only a container restart clears it."
date_created: 2026-08-08
date_modified: 2026-08-08
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5
semantic_version: 0.0.0.1
tags:
  - Issue
  - Augment-It
  - NATS
  - Record-SurrealDB-Resolver
  - Resilience
  - Error-Handling
status: Open · Diagnosed
---

# One stuck message kills a NATS subject until restart

## Why Care?

The operator saw `domain.list: timeout` and reasonably concluded that reach-edu's
corpora had failed to load. They had not. All nine were in SurrealDB the whole
time, reachable in about a second. What had failed was the *service's ability to
answer any question on that subject at all* — for every client, including an
empty filter.

This is the worst shape a failure can take in this stack: **silent, total for the
affected subject, and invisible in the logs.** The container reports healthy, the
NATS subscription stays registered, the process never crashes, and nothing is
written to stdout. The only signal is that replies stop coming, and the only
recovery is a restart.

It will recur. The conditions that cause it are ordinary.

## Symptom

```
❯ domain.list: timeout
```

Corpora absent from the reach-edu workspace. Every other surface behaving
normally.

## What it was not

Ruled out by measurement, in this order:

| Suspected | Verdict |
|---|---|
| reach-edu's data missing | **No.** All 9 domains present in SurrealDB |
| Client-specific | **No.** `{}`, `reach-edu` and `humain-vc` all timed out |
| The `registerHandlers` rename shipped the same week | **No.** `domain.list.requested` is registered by `registerDomainHandlers` in `domains.ts`, untouched by that commit |
| Service not running / crashed | **No.** Container up, `RestartCount=0`, booted clean |
| SurrealDB unreachable from the container | **No.** DNS + TLS OK; full connect → signin → use → query in **1,107ms** |
| The full-table `UPDATE` in `ensureDomainSchema` | **No.** Measured **538ms** across 210 `sources` and 254 `source_usages` |
| Nothing subscribed to the subject | **No.** A misread of the NATS monitoring payload — `subs_detail` is empty, the real key is `subscriptions_list_detail`, and the subject *was* registered |

## The evidence that located it

NATS monitoring, before and after a single probe request:

```
BEFORE: in_msgs=4 out_msgs=15
PROBE:  timeout
AFTER:  in_msgs=4 out_msgs=16
```

`out_msgs` incremented — the server **delivered** the message to the resolver
connection. `in_msgs` did not — the service **replied with nothing**. The message
arrived, was consumed, and produced no response and no log line.

A `docker restart` of the service restored it immediately: first call 1,952ms
cold, second 118ms, all 9 domains returned.

## Root cause

Every handler in `services/record-surrealdb-resolver/src/domains.ts` is
registered through this shape:

```ts
void (async () => {
  const sub = nc.subscribe(subject);
  for await (const msg of sub) {
    const args = msg.json() as T;        // ← OUTSIDE the try
    try {
      const db = await getDb();          // ← no timeout
      await ensureDomainSchema(db);
      const result = await fn(db, args);
      if (msg.reply) msg.respond(JSON.stringify({ ok: true, ...(result as object) }));
    } catch (err: unknown) {
      if (msg.reply) msg.respond(JSON.stringify({ ok: false, error: String(err) }));
    }
  }
})();
```

Three defects compound into the observed behaviour.

### 1. `for await` is strictly sequential — one stuck message blocks the subject

The loop awaits each message's full processing before pulling the next. A single
request that never settles halts the queue **permanently**. Later requests are
delivered by NATS and then dropped on the floor. Nothing times the loop out,
nothing retries it, nothing reports it.

### 2. `getDb()` has no timeout and caches only on success

```ts
export async function getDb(): Promise<Surreal> {
  if (db) return db;
  const instance = new Surreal();
  await instance.connect(URL);       // ← can hang indefinitely
  await signinAndUse(instance);
  db = instance;                     // ← only reached on success
  return db;
}
```

`connect()` against a WSS endpoint (Surreal Cloud) has no deadline. If the
handshake stalls — a transient network blip at container start is enough — the
promise never settles, `db` is never assigned, and combined with defect 1 the
subject is dead for the lifetime of the process.

### 3. `msg.json()` sits outside the try block

A malformed payload throws out of the `for await` loop entirely. Because the
loop lives in a bare `void (async () => {})()` with no `.catch()`, that becomes
an unhandled rejection and the subscription's consumer is gone — silently. The
NATS subscription stays registered server-side, so the subject *looks* healthy
from monitoring while nothing consumes it.

## Blast radius

`domains.ts`'s `handle()` covers `domain.list.requested`,
`domain.assemble.requested` and `tag.suggest.requested`, plus the hand-written
loops for `domain.create.requested` and `domain.retype.requested`. The same
`void (async () => { for await ... })()` idiom appears across the other NATS
services, so this is a **pattern-level** defect rather than a single-file one —
`domains.ts` is simply where it fired first, being the busiest cold-start path.

## Fix

1. **Bound `getDb()`.** A connect/signin deadline that rejects rather than hangs,
   so the `catch` can answer `{ok:false}` and the loop moves on.
2. **Move `msg.json()` inside the try**, so a malformed payload answers with an
   error instead of destroying the subscription.
3. **Stop one message blocking the queue.** Process each message without awaiting
   it in the loop body, so a slow or stuck request cannot starve the others.
4. **Never let the consumer die silently.** Attach a `.catch()` to the loop that
   logs, so if it ever does exit there is a line in the logs instead of silence.

## Verification

- Unit coverage for the three defects: a payload that is not valid JSON, a
  `getDb()` that never settles, and a slow request that must not block a fast one
  behind it.
- `domain.list` answers for `reach-edu` (9 domains), `humain-vc`, and an empty
  filter.
- Full suite green.

## Related

- [[Structural-Refactors-Surfaced-by-the-Codebase-Graph]] — the same service's
  `registerHandlers` rename, ruled out here
- `services/record-surrealdb-resolver/src/domains.ts`
- `services/record-surrealdb-resolver/src/surreal.ts`
