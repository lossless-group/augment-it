---
title: "Webhook as Wake-Up, Not as Truth — relaying platform events into CI without trusting them"
lede: >-
  Polling gets throttled and push payloads are unsigned. Forward the interrupt, not the claim, and both problems stop mattering at once.
date_created: 2026-09-10
date_modified: 2026-09-10
date_authored_initial_draft: 2026-09-10
date_authored_current_draft: 2026-09-10
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5 (1M context)
at_semantic_version: 0.0.0.1
status: Draft
tags:
  - Blueprint
  - Observability
  - Webhooks
  - CI
  - Railway
  - Vercel
  - GitHub-Actions
  - Trust-Boundaries
site_uuid: 0a8ae457-b869-4eea-a4a4-4fa6b221e1a5
hex_code: jps7ns
publish: true
---

# Webhook as Wake-Up, Not as Truth

## Why care?

You want to know when something breaks. There are two ways to find out, and both
are defective on their own:

- **Poll on a schedule.** Reliable in principle, but the scheduler is not yours.
  GitHub Actions delivered **8%** of the runs we asked for — 38 out of 496 — with
  a median gap of 185 minutes against a requested 15.
- **Receive a push.** Fast, but the payload is unsigned, delivery is best-effort,
  and the sender's own documentation tells you not to believe it.

The instinct is to pick one and paper over its weakness. The better move is to
let each do only the thing it is good at: **push carries the interrupt; poll
carries the truth.** The webhook says *something may have happened*. The job
that wakes up goes and finds out for itself.

Once you split those roles, both defects evaporate. The unsigned payload stops
mattering because nothing reads it. The throttled schedule stops mattering
because it is no longer the thing that notices.

## The shape

```
Platform ──webhook──▶ relay ──dispatch──▶ CI job ──authoritative query──▶ Platform API
         (unsigned,          (adds auth,    (wakes,     (this is the only
          best-effort)        filters)       decides)    thing believed)

                    plus: a slow cron firing the SAME job, as reconciler
```

Four properties make it work:

1. **The relay adds what the platform cannot send.** Most webhook senders let
   you configure a URL and nothing else — no custom headers. Most dispatch
   endpoints require an `Authorization` header. That gap is the relay's entire
   reason to exist. It is not business logic and should never acquire any.
2. **The payload is context, never a branch condition.** The woken job runs the
   identical code path it runs on a cron tick. If you find yourself reading
   `payload.status` to decide something, you have reintroduced the trust you
   just designed away.
3. **The relay lives off the platform it watches.** A monitor sharing a failure
   domain with the monitored system is not a monitor. Ours watches Railway and
   runs on Vercel — deliberately a vendor that can stay up while the other is
   down.
4. **The cron stays, demoted.** It is no longer the detector. It is the
   reconciler that catches whatever best-effort delivery dropped, and it can run
   hourly or daily without anyone caring.

## Why this makes unsigned payloads a non-issue

Platforms often do not sign webhook payloads. Railway does not, and says so:

> Treat a webhook as a prompt to act, not a source of truth. When you need
> certainty, reconcile against the public API.

Under the usual design — parse the payload, decide from it — an unsigned webhook
is a forgery surface: anyone who learns the URL can manufacture an incident or,
worse, a false all-clear.

Under this design the worst a forged request achieves is **one extra
authoritative sweep**. It cannot invent a failure and it cannot mask one,
because the conclusion is drawn from an authenticated API query the forger has
no influence over. The shared secret in the URL is then a rate-limiting
courtesy, not a security boundary — which is why it is safe to carry in a query
string.

This was verified rather than assumed. A payload claiming `Deployment.crashed`
produced a green run that opened nothing, because the sweep found all eleven
services healthy. The lie had no effect.

## The details that bite

**Filter to failures at the relay.** One push redeploys every service, and each
emits several status transitions. Forwarding all of them queues dozens of runs
behind a concurrency group that does not cancel. Forward only the terminal-bad
states; leave recovery to the cron, which is the right tool for a transition
nobody is waiting on.

**Answer 2xx even when you ignore the event.** Senders retry non-2xx and
eventually disable an endpoint that keeps failing — Railway disables after 100
failures in 6 hours. "Received and deliberately ignored" is a success, not an
error. Log it anyway: without a log line, *the hookup is broken* and *the hookup
works and this event was boring* look identical, which is exactly the question
you ask while wiring it up.

**`repository_dispatch` only fires workflows on the default branch.** So does
`schedule`. A workflow that is perfect on a feature branch will never run. Check
the default branch before debugging anything else.

**Fixing one thing exposes the next.** Our watchdog failed on a bad token for
weeks. With the token fixed it failed one step later on `fatal: not a git
repository` — the job never checks out, so `gh` had no remote to infer. That
defect was unreachable while the token was broken. Expect a queue of latent
bugs behind any long-broken component, and do not declare victory on the first
green step.

**Verify the payload is genuinely not load-bearing.** Send a lie. If a forged
failure produces a green run, the property holds. If it produces an alert, you
are trusting the payload somewhere and did not notice.

## Anti-patterns

- **Reading the payload to decide.** The moment a branch depends on it, the
  unsigned-payload problem is back and the design is decorative.
- **Hosting the relay on the monitored platform.** Convenient, and wrong for the
  one scenario the whole system exists for.
- **Tightening the cron to compensate for throttling.** Asking for four times as
  many runs does not get you more runs; it gets you the same runs and a cron
  expression that lies about its guarantee. Measure delivery before tuning
  cadence.
- **Putting the privileged token in the webhook URL.** The relay holds the
  credential server-side. A URL secret proves the caller knows the URL; that is
  all it should ever be asked to prove.
- **Letting the relay grow logic.** Auth header, filter, forward. Anything more
  belongs in the job that already has authenticated access to the truth.

## Where this is implemented

- `services/deploy-relay/` — the relay (Vercel function, no dependencies)
- `.github/workflows/deploy-watch.yml` — the woken job; `repository_dispatch`
  for the fast path, `schedule` at `:23` as reconciler
- [[Re-Mint-The-Deploy-Watch-Railway-Token]] — the plan whose fix uncovered the
  second bug and prompted this pattern

## References

- Railway — Webhooks: <https://docs.railway.com/observability/webhooks>
- GitHub — `repository_dispatch`: fires only on the default branch
- [[A-Failed-Deploy-Is-Silent-Nothing-Watches-Production-After-Merge]]
