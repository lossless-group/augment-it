---
title: "A failed deploy is silent, so nothing watches production after merge"
lede: "Every frontend Docker build failed for twelve days unnoticed: the old container keeps serving and the health check keeps passing."
date_created: 2026-08-15
date_modified: 2026-08-15
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5
semantic_version: 0.0.1.0
tags:
  - Issue
  - Augment-It
  - Deployment
  - Railway
  - CI-CD
  - Observability
status: Open
site_uuid: e5e99013-fe48-440f-bbe7-47d51917b0b2
hex_code: sndhkh
date_authored_initial_draft: 2026-08-15
date_authored_current_draft: 2026-08-15
publish: true
---

# A failed deploy is silent, so nothing watches production after merge

## Why Care?

On 2026-08-15 we found that every frontend Docker build had been failing since
2026-08-03 — twelve days — on a single missing `COPY tsconfig.base.json`. The
same investigation found five of ten services deploying from an abandoned
branch (`feature/workspace-auth`, tipped 2026-07-28), which meant production had
been running three-week-old code for a month.

Neither was noticed, and neither was *noticeable*. That is the actual defect.

A failed Railway deploy does not take the site down. The previously-built
container keeps serving, the health check keeps passing, the domain keeps
answering 200. **A broken deploy and a healthy one are externally
indistinguishable.** The only difference is a red row in a dashboard, and
dashboards are pull-based — somebody has to decide to look.

`.github/workflows/ci.yml` (shipped 2026-08-15) closes the *pre-merge* half:
sixteen images build on every pull request, so the class of bug that caused the
outage now fails loudly and early. It structurally cannot close the other half.
A PR workflow runs before the merge; the deploy happens after it, on Railway's
infrastructure, and nothing reports back.

## The gap, precisely

| Moment | Watched by | Fails loudly? |
|---|---|---|
| Code authored | nothing | — |
| Pull request opened | `ci.yml` — 16 image builds + unit groups | ✅ since 2026-08-15 |
| Merged to trunk | `ci.yml` on push | ✅ |
| **Railway builds the image** | **nothing** | ❌ |
| **Railway starts the container** | **nothing** | ❌ |
| Container serving stale code | nothing | ❌ |

Rows 4 and 5 are this issue. Row 6 is harder and deliberately out of scope
(see *Not in scope*).

## Why the obvious answers do not work

**"Add a health check."** Railway already has one and it passed throughout the
twelve days. It was checking the *old, healthy* container. A health check
answers "is something serving?", never "is it serving what we merged?"

**"Watch the site."** Same failure. `augment.didi.sh` returned 200 the entire
time. Uptime monitoring cannot see staleness.

**"Look at the dashboard."** This is the current design, and it is what failed.
Any fix that still requires someone to remember to look has not fixed anything.

**"CI can check it."** A pull-request workflow finishes before Railway starts
building. It has nothing to report on yet.

The property we need is **push, not pull**: something must interrupt us when a
deploy ends badly.

## Decision — poll the Railway API from a scheduled workflow

Three options were considered.

| Option | Mechanism | Verdict |
|---|---|---|
| **A. Railway native notifications** | Project settings → Slack/Discord/webhook | Rejected for now — no Slack/Discord surface is wired for this tree, and the config lives in a dashboard, so it is invisible to the repo and un-reviewable |
| **B. Railway webhook → `repository_dispatch`** | Railway POSTs on deploy status change | Best latency, but needs a public receiver to translate Railway's payload into a GitHub event. Real infrastructure to host and maintain |
| **C. Scheduled GitHub Actions poll** ✅ | Cron workflow queries the Railway GraphQL API | Chosen |

**C wins on this tree's constraints.** It is self-contained in the repo, so the
config is versioned and reviewable rather than buried in a dashboard. It needs
no hosted receiver. And it can open a GitHub issue on failure, which is already
the house convention for a visible work trail.

Its weakness is latency — up to the poll interval. That is acceptable: the
failure mode being fixed lasted twelve days, so detecting within fifteen minutes
is not the constraint that matters.

### Shape

- `.github/workflows/deploy-watch.yml`, `schedule` every 15 minutes plus
  `workflow_dispatch` for manual runs.
- One GraphQL call for every service's latest deployment status:
  `environment(id:) { serviceInstances { … latestDeployment { status } } }`.
- `FAILED` or `CRASHED` on any service → the run fails **and** a GitHub issue is
  opened (or an existing one updated). Recovery closes it.
- Auth by **project token**, scoped to a single environment of a single project.
  It uses the `Project-Access-Token` header rather than `Authorization: Bearer`,
  and it is the least-privilege choice — an account token would grant the
  workflow every project in the workspace.
- The workflow derives `projectId` / `environmentId` from the token itself via
  `query { projectToken { projectId environmentId } }`, so **no Railway IDs are
  committed to the repo** and the file is portable to another environment by
  swapping the secret alone.

### Rate limits

Railway allows 100 requests/hour on Free, 1000 on Hobby, 10000 on Pro. At two
calls per run, every 15 minutes, this costs **192 requests/day** — comfortable
on Hobby and above, and it should not be tightened below ~10 minutes without
checking the plan.

## Not in scope

**Detecting a *stale but green* deploy** — a service whose last deployment
succeeded but which is not running trunk. That is the `feature/workspace-auth`
failure, and it is a different check: compare each service's deployed commit
against the trunk's `HEAD`. Worth doing, deliberately separated so this issue
ships. Both trigger branches and the deployed SHA are readable from the same
API.

**Group I (e2e) in CI** — needs NATS + SurrealDB service containers. Tracked
separately.

## Done when

1. `deploy-watch.yml` exists and runs green against a healthy environment.
2. A deliberately failed deploy produces a GitHub issue within one poll interval.
3. Recovery closes the issue automatically.
4. `DEPLOYMENT.md` documents the token, its scope, and how to rotate it.

## Related

- `changelog/2026-08-15_01_Every-Frontend-Deploy-Had-Been-Failing-For-Twelve-Days-On-One-Missing-COPY.md` — the outage that surfaced this
- [[Rename-Strategy-Curator-To-Corpora-Curator]] — the work in progress when it was found
- [[Move-Remaining-Remotes-To-Remote-Hosting-Prod-Falls-Back-To-Localhost]] — the earlier "prod silently falls back" issue, same family
