---
title: "Setting up a micro-frontend with the monorepo configurations it actually needs"
lede: "Three live remotes shipped without a registry row and were invisible to every check for months. This is the list that prevents the next one."
date_created: 2026-09-13
date_modified: 2026-09-13
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5 (1M context)
semantic_version: 0.0.1.0
status: Active
tags:
  - Pattern
  - Augment-It
  - Microfrontends
  - Design-System
  - Module-Federation
  - Onboarding
site_uuid: 58306890-4fe2-4ded-ab9b-e82ad7508a1c
hex_code: 27be7e
date_authored_initial_draft: 2026-09-13
date_authored_current_draft: 2026-09-13
publish: true
---

# Setting up a micro-frontend

> **Invoke this whenever a new front-end is created.** Not afterwards, not "once
> it works" — the wiring below is what makes a member *visible*, and a member
> nothing can see is a member nothing can check.

## Why this exists

On 2026-09-13 we found that **`org-workbench`, `search-and-add` and
`search-results` were absent from `DESIGN.md`'s member registry.** All three were
live federated remotes. All three shipped their own stylesheet. None had ever
been checked by `pnpm design:drift`, because the checker reads its member list
from that registry and checks only what the list names.

They weren't failing. **They were invisible** — and the federation count read
green for a fifth of the product. `org-workbench` had 61 buttons and zero `aria-*`
attributes the whole time. Registering them added 13 findings that had existed for
months.

Nobody was careless. There was simply no list of what a new member needs, so each
one got whatever the person setting it up remembered. **This is that list.**

`S5` in `scripts/design-drift.mjs` now fails when a member ships source and isn't
registered, so the specific failure can't recur silently. Everything else below
is still on you.

## The checklist

### 1 — Pick a port, and set it in two places

Ports are allocated sequentially from 3002; the shell is 3100. Check what's taken
before choosing:

```bash
grep -rhoE 'port: [0-9]+' apps/*/rsbuild.config.* | sort -u
```

Set it in `server.port` **and** `dev.assetPrefix` in the member's
`rsbuild.config.ts`.

> ⚠️ **These must match, and nothing checks that they do.** If the port is taken,
> rsbuild silently moves the dev server — but the HTML it serves still points
> every `<script>` at the *original* `assetPrefix`, i.e. **a different server's
> bundle.** No error, no warning; the page renders nothing, or worse, renders
> someone else's code and you audit it as yours. This cost real time on
> 2026-09-13.

### 2 — Register the member in `DESIGN.md`

One row in the `federation.members:` frontmatter list:

```yaml
- { name: my-member, path: apps/my-member, prefix: mm, root_class: ".mm-app",
    tier: C, debt: none, status: registered, doc: apps/my-member/DESIGN.md }
```

- **`prefix` and `root_class` are READ FROM CODE**, not proposed. Write the CSS
  first, then record what it says.
- **The prefix must be unique.** Two members claiming `.row-name` is resolved by
  chunk load order, which is to say: not resolved.
- `tier` is documentation depth (design surface owned), `debt` is remediation
  weight. They are independent — a member can own little design and carry a lot
  of debt.

**Without this row the member is invisible to every `F` check.** `S5` will fail
until you add it.

### 3 — `tsconfig.json` — four lines, and both halves of the CSS shim

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*.ts", "src/**/*.svelte", "src/**/*.svelte.ts", "src/**/*.d.ts"],
  "exclude": ["node_modules", "dist"]
}
```

`tsconfig.base.json` is the browser/Svelte profile. Services use
`tsconfig.services.json`; never hand-roll a standalone config.

> ⚠️ **`src/css.d.ts` and the `src/**/*.d.ts` include are one fix, not two.**
> A side-effect CSS import carries no type declarations, so `svelte-check` needs
> `declare module '*.css';` — and the shim is **inert** unless the include picks
> it up. `shell` shipped with one half and the typecheck failed for as long as the
> check script existed; `packages/federation` shipped with *neither* and was red
> on TS2882 for months. Both halves, always.

### 4 — `package.json`

```jsonc
{
  "scripts": {
    "dev": "rsbuild dev",
    "build": "rsbuild build",
    "check": "svelte-check --tsconfig ./tsconfig.json"   // ← the aggregate finds this
  },
  "dependencies": {
    "@augment-it/federation": "workspace:*",
    "@augment-it/theme": "workspace:*",
    "@augment-it/workspace": "workspace:*",
    "@augment-it/shared-ui": "workspace:*"
  }
}
```

Then **`pnpm install`** — the workspace symlink doesn't exist until you do, and
`svelte-check` can't resolve the imports without it.

`check` is not optional. `pnpm typecheck` at the root sweeps `check` for apps and
`typecheck` for services; **a per-unit script no aggregate invokes is a check that
does not exist**, which is how `packages/federation` stayed red unnoticed.

### 5 — `mount.ts` — three lines, and the import order is load-bearing

```ts
import { makeMount } from '@augment-it/federation';
import './app.css';
import type { Component } from 'svelte';
import App from './App.svelte';

export type { MountResult } from '@augment-it/federation';
export const mountMyMember = makeMount(App as Component);
```

- The **export name is unique per member** and load-bearing — Module Federation
  exposes it by name.
- **`@augment-it/federation` before `./app.css`.** The federation package carries
  the token baseline; reversing the order renders unstyled.
- **Never import `theme.css` here (F10)** — the shell injects the token layer
  once. The standalone `index.ts` still does.
- **Never import `mode-switcher` (F5)** — the shell owns `<html data-mode>`. Two
  mode-switchers race and the loser silently wins.

### 6 — Register the remote in `shell/src/remotes.ts`

`id`, `name`, origin, and `importMount: () => import('myMember/mount')`. A member
not listed here builds fine and never appears.

### 7 — Obey the contract from the first commit

Retrofitting F1–F11 is far more expensive than starting compliant:

- **Every selector descends from the root class** (F3). `sort-filter-lens` didn't,
  and leaks 61 unnamespaced classes into every other remote — `.error`, `.row` and
  `.muted` collide with 16, 19 and 14 other surfaces.
- **No Tier-1 tokens** (`--color__*`) in member CSS (F1). Consume Tier 2.
- **No hardcoded hex, `box-shadow`, or `@keyframes` name** (F8).
- **No raw `z-index`** (F4) — use the four remote-local `--z-*` tokens.
- **No literal dimensions.** `--space-*`, `--radius-*`, `--control-h-*` all ship.
  Reaching for a token that doesn't exist and letting the fallback carry the value
  is how 170 phantom declarations happened across ten members.

> **Pick tokens by their documented role, not by appearance.** `chat` has eleven
> radius declarations one scale step below their role because someone picked by
> eye — invisible until the token shipped, then visibly wrong everywhere.

### 8 — Use the shared primitives

`@augment-it/shared-ui` ships `Button` — six variants, four sizes, accessible by
construction. **Do not hand-roll a button.** The federation has 158 button
rule-sets and 34 badge treatments because eighteen members each did.

See [[../loops/Adopt-The-Shared-Button-In-One-Member]] for the API and the
override ladder.

### 9 — Publish a gallery catalog

*Adopt when the scaffold lands — see "Not yet automated" below.*

`src/gallery/{catalog.ts,mount.ts}`, a `'./gallery'` expose, a
`galleryRequested()` branch in `index.ts`, and a row in
`apps/docs-portal/src/members.ts`. This is what makes the member's design surface
legible to the platform — and it's what the member takes with it if it ever
becomes its own repo.

> ⚠️ `@augment-it/gallery` must be imported **before** `../app.css`, same trap as
> §5. Documented defensively in four places because it fails silently.

### 10 — Write a `DESIGN.md` at the member root

F6 requires one. **17 of 19 members don't have it**, so the bar here is low — but
the registry row above points at the path, and a dangling `doc:` is worse than an
honest omission.

## Verify

```bash
pnpm --filter @augment-it/my-member check     # svelte-check clean
pnpm --filter @augment-it/my-member build     # a typecheck is not a build
pnpm design:structure                         # S1-S5 — S5 catches an unregistered member
pnpm design:drift --member mm                 # your member's contract findings
pnpm design:drift                             # federation; know the number before and after
```

The federation count **will rise** when you register a member that was previously
invisible. That is the number getting more honest, not the member getting worse —
say so rather than letting it look like a regression.

## Not yet automated — and honestly flagged

Roughly **116 of the ~490 lines** a new member needs are pure boilerplate, and it
is precisely the part that fails silently. A `pnpm gallery:scaffold <member>`
codemod is specified but not built; its requirements are in
[[../plans/Prove-The-Component-API-On-Request-Reviewer]] and the Phase 5 report.

Until it exists, copy from `apps/request-reviewer/` — the first member migrated to
the shared Button and the first with a catalog, so it is the most current worked
example.

**When the gallery is stable and the component API docs settle, this pattern
should point at them instead of restating.** Right now §8 and §9 duplicate detail
that belongs in the spec; that duplication is deliberate and temporary, because
the spec has twice been the stale artifact and a setup checklist that sends you to
a wrong document is worse than one that repeats itself.

## Related

- [[../specs/Component-API-Contract-And-The-Control-Scale]] — the token and component contract
- [[../loops/Adopt-The-Shared-Button-In-One-Member]] — the Button API and override ladder
- [[../loops/Converge-The-Federated-Design-System]] — promote/converge/sanction governance
- [[../issues/Structural-Invariants-Live-In-Prose-So-Sweeps-Stop-Halfway]] — why these are checks and not prose
- `DESIGN.md` — the federal contract, F1–F11, the member registry
