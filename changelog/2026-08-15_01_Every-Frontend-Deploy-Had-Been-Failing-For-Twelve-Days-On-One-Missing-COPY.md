---
date_created: 2026-08-15
date_modified: 2026-08-15
title: "Every frontend deploy had been failing for twelve days on one missing COPY"
lede: "Production was serving a build from August 3rd. Every deploy since had failed at the same line, in all six frontend Dockerfiles, for the same reason — and nothing was watching."
publish: true
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5
files_changed:
  - shell/Dockerfile
  - apps/chat/Dockerfile
  - apps/corpora-curator/Dockerfile
  - apps/org-workbench/Dockerfile
  - apps/search-and-add/Dockerfile
  - apps/search-results/Dockerfile
tags:
  - Augment-It
  - Deployment
  - Docker
  - Debugging
  - Build-Pipeline
---

# Every frontend deploy had been failing for twelve days

## Why Care?

We went looking for something else entirely — confirming which environment
variable names a service still supplied, during a rename — and found that the
service had not deployed successfully since **2026-08-03**. Four consecutive
failures. The most recent one was the release commit.

Nothing was broken on the site, which is exactly why nobody noticed: the last
good container kept serving. A failed deploy on this setup is silent. The old
build just keeps running, the URL keeps answering, and the only evidence is a
red entry in a dashboard nobody had open.

The cause was one missing line, in six files, and it had been wrong the whole
time.

## What's New?

Every frontend Dockerfile now copies `tsconfig.base.json` into the build image.
That's the entire fix:

```dockerfile
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./          # ← this
COPY packages ./packages
COPY apps ./apps
COPY shell ./shell
```

All six frontends — `shell`, `chat`, `corpora-curator`, `org-workbench`,
`search-and-add`, `search-results` — now build clean, verified with a real
`docker build` of each rather than by reading the diff.

## How we found it

The build log ends like this:

```
[build 9/9] RUN pnpm --filter @augment-it/strategy-curator build
> rsbuild build

error   Build errors:
  × Tsconfig not found /monorepo/tsconfig.base.json

File: @module-federation/runtime/rspack.js:1:1-236
  × Tsconfig not found /monorepo/tsconfig.base.json
```

Every app's `tsconfig.json` is three lines:

```json
{ "extends": "../../tsconfig.base.json", "include": [...], "exclude": [...] }
```

The Dockerfiles copy `package.json`, the lockfile, the workspace manifest,
`packages/`, `apps/` and `shell/`. They never copied the file every one of those
tsconfigs extends. `pnpm install` succeeds — it doesn't care. The failure lands
one layer later, at `rsbuild build`, and reads as a TypeScript problem rather
than a missing-file problem.

## Under the Hood: the split that hid it

The interesting part is that **the ten service Dockerfiles were fine**. Only the
six frontends were broken, and the reason is structural rather than careless.

| | tsconfig shape | Build context |
|---|---|---|
| `services/*` | own self-contained `tsconfig.json`, extends nothing | its own directory |
| `shell`, `apps/*` | three-line stub extending `../../tsconfig.base.json` | the repo root |

Services copy `tsconfig.json` and are done — that file is complete on its own.
The frontends inherit from a root file that lives outside anything they copy. So
"does this Dockerfile copy a tsconfig?" returns **yes** for all sixteen, and the
six that are broken are broken by what they *don't* reach for.

A per-file audit finds nothing. Only building one finds it.

## What this says about the setup

Two things worth fixing beyond the one line:

**A failed deploy is invisible.** The previous container keeps serving, the
health check keeps passing, and the dashboard is the only place the failure is
recorded. Twelve days is how long that stayed unnoticed while active work
shipped daily.

**Nothing builds the containers in CI.** `pnpm build` on a developer machine
works, because `tsconfig.base.json` is right there on disk. The Docker build is
the only place the missing COPY exists, and it only ran in production. A build
of each image on PR would have caught this the day it was introduced.

Neither is fixed here. Both are logged.

## What's Next

The immediate consequence: the deployed frontends are twelve days stale. Once
this merges, the next deploy will be the first successful one since August 3rd —
so it will ship twelve days of accumulated change at once. Worth watching rather
than assuming.
