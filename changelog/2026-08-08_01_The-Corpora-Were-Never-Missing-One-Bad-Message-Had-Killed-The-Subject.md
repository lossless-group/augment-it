---
date_created: 2026-08-08
date_modified: 2026-08-08
title: "The corpora were never missing — one bad message had killed the subject"
lede: "A client's research corpora vanished from the workspace. The data was fine, the database was fine, the service was healthy and logging nothing. Two counters found it: a single unanswerable message had taken the whole request channel down until restart."
publish: true
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5
files_changed:
  - services/record-surrealdb-resolver/src/nats-loop.ts
  - services/record-surrealdb-resolver/test/nats-loop.test.ts
  - services/record-surrealdb-resolver/src/surreal.ts
  - services/record-surrealdb-resolver/src/domains.ts
  - context-v/issues/One-Stuck-Message-Kills-A-NATS-Subject-Until-Restart.md
tags:
  - Augment-It
  - NATS
  - Resilience
  - Debugging
  - Error-Handling
  - Microservices
---

# The corpora were never missing

## Why Care?

A workspace opened and its research corpora weren't there. Nine of them — months of collected reading on adult literacy, workforce development, rural income — gone from the surface. The console said:

```
❯ domain.list: timeout
```

The obvious readings are all wrong. The data hadn't been lost. The database was reachable in about a second. The service was running, healthy, `RestartCount=0`, and writing **nothing at all** to its logs.

This is the failure mode that should scare you most in a message-driven system: **silent, total for one channel, and invisible everywhere you'd normally look.** Every dashboard is green. Only the replies stop.

It's fixed, it has regression tests, and the diagnosis is written down so the next person doesn't re-walk it.

## What's New?

- **`domain.list` answers again** — reach-edu's 9 corpora, humain-vc's 7, 16 unfiltered
- **A hardened consumer** (`nats-loop.ts`) that can't be killed by one bad message
- **A bounded database handshake** — the unbounded one is what parked the whole channel
- **9 regression tests** for failure modes the old suite structurally could not reach
- **A written diagnosis** listing the seven causes we ruled out, so nobody re-walks them

## The seven things it wasn't

Most of debugging is elimination, and the eliminations are the useful part:

| Suspected | Verdict |
|---|---|
| The client's data was lost | **No.** All 9 in the database |
| Something client-specific | **No.** Every client timed out, including no filter |
| A rename we'd shipped that week | **No.** Different file, untouched |
| Service crashed | **No.** Up, zero restarts, clean boot |
| Database unreachable | **No.** Connect → sign in → query in **1,107ms** |
| A full-table migration on cold start | **No.** Measured **538ms** |
| Nothing subscribed to the channel | **No** — and this one was *our* mistake |

That last row is worth owning. We read the message broker's monitoring output, saw an empty `subs_detail` array, and concluded nothing was listening. Wrong key. The real one is `subscriptions_list_detail`, and the subscription was there all along. A misread instrument sent us down a blind alley for a while.

## The two numbers that found it

The broker tracks messages in and out per connection. Take a reading, send one request, take another:

```
BEFORE: in_msgs=4 out_msgs=15
PROBE:  timeout
AFTER:  in_msgs=4 out_msgs=16
```

`out_msgs` went up — the broker **delivered** the message. `in_msgs` didn't — the service **replied with nothing**.

So the message arrived, was consumed, and vanished. That single observation collapses the search space: it isn't networking, it isn't the database, it isn't the data. It's the code between receiving a message and answering it.

## What was actually wrong

Every handler in the service was registered like this:

```ts
void (async () => {
  const sub = nc.subscribe(subject);
  for await (const msg of sub) {
    const args = msg.json();          // ← outside the try
    try {
      const db = await getDb();       // ← no timeout
      ...
    } catch { respond({ ok: false }) }
  }
})();
```

Three defects that individually look survivable and together are fatal:

**`for await` is strictly sequential.** It processes one message completely before pulling the next. So one call that never settles doesn't slow the channel — it *stops* it. Forever. Later messages get delivered and dropped.

**The database handshake had no deadline.** `connect()` over a WebSocket can stall indefinitely. When it did, the connection was never cached, and the loop parked on it with nothing to retry.

**The JSON parse sat outside the `try`.** One malformed payload throws out of the loop entirely — and because the loop is a bare `void (async () => {})()` with no `.catch()`, that death is an unhandled rejection nobody sees. The subscription stays registered, so monitoring keeps reporting the channel as healthy while nothing consumes it.

## The fix, and one deliberate non-fix

`nats-loop.ts` now owns the parse, a per-message deadline, the always-answer guarantee, and the loop's own death.

It takes any `AsyncIterable` of reply-shaped messages — which is the whole trick. **The original bug was unreachable from our existing test suite** because every test went through a real database and none exercised the loop. Making the loop take a plain async iterable made all three failure modes testable with no broker and no database.

We **kept it sequential on purpose.** Processing messages concurrently would also fix head-of-line blocking, but it would reorder writes on channels like `domain.create` — a real semantic change this bug doesn't require. Bounded-sequential turns "dead forever" into "one slow message," which is the actual defect.

## Under the hood: proof it's fixed

Container rebuilt, then probed live:

```
domain.list reach-edu        1857ms  ok=true  domains=9
   upward-mobility, grant-prospecting-tools, future-of-work,
   workforce-development, frontier-job-demand, agent-workflow-maxxing,
   adult-literacy-numeracy, ncad-forge, rural-income-boosts
domain.list humain-vc         111ms  ok=true  domains=7
domain.list (no filter)       161ms  ok=true  domains=16

malformed payload               3ms  ok=false  "not json{{" is not valid JSON
domain.list reach-edu (after) 112ms  ok=true  domains=9   ← SUBJECT SURVIVED
```

The last two lines are the regression. Under the old code that malformed payload would have ended the channel for the rest of the process's life. It now answers in 3ms and the channel keeps serving.

**87 tests across 7 suites**, all passing.

## What's Next?

We fixed one file. The same idiom appears **112 times** across ten services — including three more files in the very service we just fixed, which serve the organization, affiliation and person channels.

One thing does protect them today: the bounded database handshake sits in front of every one of those loops, so the *hang* is closed service-wide. What's still exposed is the malformed-payload path.

The rollout is tracked, and it has a prerequisite worth naming: our services build from their own directory with plain `npm install` and **cannot see the shared packages directory at all.** So "put the helper in a shared package" isn't free — it's a Dockerfile change first. That's the same seam we hit earlier this week when consolidating duplicated utilities, which is a good sign it's the real constraint and not a one-off.
