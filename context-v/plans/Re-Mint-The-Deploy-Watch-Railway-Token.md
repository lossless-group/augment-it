---
title: "Re-Mint the Deploy-Watch Railway Token — the watchdog has been blind for days"
lede: >-
  The watchdog built so a failed deploy would not go unnoticed for twelve days has never once run green itself.
date_created: 2026-09-10
date_modified: 2026-09-10
date_authored_initial_draft: 2026-09-10
date_authored_current_draft: 2026-09-10
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5 (1M context)
at_semantic_version: 0.0.0.2
status: Open
tags:
  - Plan
  - Augment-It
  - Railway
  - Observability
  - CI
  - Deploy-Watch
  - Secrets
site_uuid: 057d663d-13d0-4b4d-ab4a-1b9d8061645b
hex_code: f78jq7
publish: true
---

# Re-Mint the Deploy-Watch Railway Token

## Why care?

`deploy-watch.yml` exists because a failed Railway deploy is invisible from outside: the
previously-built container keeps serving, the health check keeps passing, and the domain
keeps answering 200. It was written after a broken deploy went unnoticed for twelve days.

It has never succeeded. Every one of the 200 retained runs failed, back to
2026-08-23 — and the secret was last set 2026-08-15, so the watchdog has been blind
since roughly the day it was wired. The watchdog is reproducing the exact failure mode it was
built to end, in a different costume: not silence from a healthy system, but silence from a
sensor nobody is reading.

This is the cheapest item on the board and the one that unblocks confidence in every other
deploy.

## Evidence

Observed on run `34517900649` (2026-09-10 19:01 UTC), byte-identical to runs on 2026-09-08
and to every earlier run in the retained history:

```
Token shape: raw=70 trimmed=63 chars
Token shape: NOT a bare UUID — check for a copied prefix or a truncated paste.
::error::Could not resolve environmentId from the token.
  "message": "Project Token not found"
```

Two facts the workflow's own diagnostics establish:

1. **The value is not a Railway project token.** A project token is a 36-character UUID.
   This is 63 characters after whitespace stripping.
2. **It is not an account token either.** The workflow's fallback retries the same value as
   `Authorization: Bearer` against `query { me { email } }`, and that errors too. So this is
   not a wrong-*kind*-of-token problem — the value itself is invalid.

The 7 stripped whitespace characters (`raw=70` → `trimmed=63`) suggest embedded spaces or
newlines, not a single trailing newline — consistent with a paste that captured surrounding
text.

## The plan

### 1. Mint a fresh project token

Railway dashboard → project `augment-it` → **Settings → Tokens** → create a token scoped to
the **production** environment. Project tokens are dashboard-only; there is no `railway` CLI
or MCP call that mints one.

Least-privilege matters here: an account token would hand this workflow every project in the
workspace. The workflow authenticates with the `Project-Access-Token` header precisely
because it expects a project token.

### 2. Validate before storing

Do not paste blind. Confirm the token resolves an environment first:

```bash
curl -sS -X POST https://backboard.railway.com/graphql/v2 \
  -H "Project-Access-Token: <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"query":"query { projectToken { environmentId } }"}'
```

Expect `{"data":{"projectToken":{"environmentId":"df7aac8d-543e-47e3-a9e4-482989bbb82f"}}}`.
That UUID is augment-it production — if a different one comes back, the token is scoped to
the wrong environment.

### 3. Store it without trailing whitespace

```bash
printf '%s' '<TOKEN>' | gh secret set RAILWAY_TOKEN --repo lossless-group/augment-it
```

`printf '%s'` rather than `echo` — `echo` appends a newline, and Railway reports a token with
one stray byte as flatly "not found," which is what sent the first diagnosis astray.

### 4. Verify end-to-end

```bash
gh workflow run deploy-watch.yml --repo lossless-group/augment-it
gh run watch --repo lossless-group/augment-it
```

A green run should print `Token shape: matches the UUID form Railway project tokens take.`
followed by a per-service table of latest deployment statuses in the step summary.

## Verification

- [ ] `projectToken { environmentId }` returns `df7aac8d-543e-47e3-a9e4-482989bbb82f`
- [ ] A manually dispatched run completes green
- [ ] The step summary lists all 11 services with `SUCCESS`
- [ ] The next scheduled run is also green (may be hours away — see cron note below)

## Risks and notes

- **The empty-read guard is load-bearing.** The workflow refuses to report healthy on a
  zero-service read, so a token scoped to the wrong project fails loudly rather than
  silently reporting all-clear. Don't remove that guard.
- **Rotation has no reminder.** Nothing currently notices a revoked or expired token except
  this same red run. Worth considering whether the failure should page rather than just
  redden — but that is out of scope here.
- **The cron is not firing at the requested cadence.** The workflow asks for `*/15 * * * *`,
  but observed runs land roughly every 5 hours (01:28, 06:35, 11:50, 15:56, 19:01 UTC on
  2026-09-10). GitHub throttles scheduled workflows heavily, so real detection latency is
  hours, not minutes, even once the token works. Worth a follow-up decision: accept it, or
  move the watchdog to a trigger that actually fires.
- **Do not read the secret back** for verification. Confirm via a green run, not by echoing
  the value.

## References

- `.github/workflows/deploy-watch.yml` — the workflow itself
- [[A-Failed-Deploy-Is-Silent-Nothing-Watches-Production-After-Merge]] — why the watchdog exists
- `DEPLOYMENT.md` — Railway service topology and the secrets-handling note
