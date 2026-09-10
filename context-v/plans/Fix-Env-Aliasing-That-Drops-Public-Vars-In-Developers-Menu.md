---
title: "Fix Env Aliasing That Drops PUBLIC_ Vars in the Developers Menu"
lede: >-
  Assigning import.meta.env to a variable defeats rsbuild's static replacement, so two production URLs quietly resolve to localhost.
date_created: 2026-09-10
date_modified: 2026-09-10
date_authored_initial_draft: 2026-09-10
date_authored_current_draft: 2026-09-10
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5 (1M context)
at_semantic_version: 0.0.0.1
status: Open
tags:
  - Plan
  - Augment-It
  - Rsbuild
  - Build-Time-Env
  - Shell
  - Bug
site_uuid: e0cb5822-1e89-4f27-9e85-3eff23392682
hex_code: 79kfrh
publish: true
---

# Fix Env Aliasing That Drops PUBLIC_ Vars in the Developers Menu

## Why care?

`PUBLIC_ID_BASE=https://id.didi.sh` is set on the `shell` Railway service and correctly baked
into the production bundle everywhere else. In one component it silently resolves to
`http://localhost:4000` anyway.

Small blast radius — the Developers menu only — but the *shape* of the bug is the dangerous
part: setting the Railway variable does nothing, and nothing warns you. Anyone debugging this
by checking the service variables will conclude it's configured correctly, because it is.

## Evidence

`shell/src/DevelopersMenu.svelte:32-34`:

```ts
const env = (import.meta as { env?: Record<string, string> }).env ?? {};
const DESIGN_PORTAL = env.PUBLIC_DESIGN_PORTAL_URL || 'http://localhost:3020';
const ID_BASE = env.PUBLIC_ID_BASE || 'http://localhost:4000';
```

What rsbuild emitted into the deployed bundle:

```js
r = { MODE:"production", DEV:!1, PROD:!0, SSR:!1, BASE_URL:"/", ASSET_PREFIX:"" }
o = r.PUBLIC_DESIGN_PORTAL_URL || "http://localhost:3020"
n = r.PUBLIC_ID_BASE           || "http://localhost:4000"
```

**No `PUBLIC_*` keys survive.** Assigning `import.meta.env` to a variable makes rsbuild
substitute the base env object wholesale, and the per-variable static replacement never
happens — so every `PUBLIC_*` read off that alias falls through to its default.

Contrast `packages/workspace/src/ws-url.ts:29`, which reads the member directly in a single
expression and inlined correctly:

```js
function ee(){ let e = "wss://ws.augment.didi.sh/ws"; return typeof e=="string" && e.length>0 ? e : Q }
```

Same repo, same build, opposite outcomes — the only difference is the alias.

There is an irony worth preserving: the comment directly above the broken lines warns about a
*related* env-var footgun (empty string vs undefined, and why `??` alone is insufficient).
The author was thinking about exactly this class of bug and was bitten by an adjacent one.

## The plan

1. **Read each member directly** in `DevelopersMenu.svelte` — no intermediate `env` object:

   ```ts
   const DESIGN_PORTAL =
     (import.meta as { env?: Record<string, string> }).env?.PUBLIC_DESIGN_PORTAL_URL
     || 'http://localhost:3020';
   const ID_BASE =
     (import.meta as { env?: Record<string, string> }).env?.PUBLIC_ID_BASE
     || 'http://localhost:4000';
   ```

2. **Sweep for the same shape repo-wide.** Any `= import.meta.env` assignment, destructure,
   or spread is suspect:

   ```bash
   grep -rnE '(const|let|var)\s+\w+\s*=\s*\(?import\.meta' --include='*.ts' --include='*.svelte' apps shell packages
   grep -rnE 'import\.meta[^.]*\.env\s*[;,)}]' --include='*.ts' --include='*.svelte' apps shell packages
   ```

3. **Decide `PUBLIC_DESIGN_PORTAL_URL`.** It is read but set nowhere, and no design-system
   service is deployed. Either deploy the `docs-portal` app and set the variable, or drop the
   read and let the menu omit the entry in production. Do not leave a live link to
   `localhost:3020` in a production menu.

4. **Add a reminder.** This is exactly the shape `context-v/reminders/` exists for — a short,
   sharp correction born from a mistake the toolchain invites. One paragraph: *read
   `import.meta.env.PUBLIC_X` directly; never alias the env object.*

5. **Rebuild and redeploy `shell`.** `PUBLIC_*` is baked at build time.

## Verification

- [ ] After redeploy, `grep -c 'localhost:4000' index.*.js` on the served bundle is 0 for the
      Developers-menu path
- [ ] The menu's id-service link points at `https://id.didi.sh`
- [ ] The repo-wide sweep returns no remaining aliased reads
- [ ] A reminder exists in `context-v/reminders/`

## Risks and notes

- **Low urgency, low risk** — this is polish, not a broken surface. Sequence it behind the
  watchdog and the stale-sources correctness bug.
- **Verify against the emitted bundle, not the source.** The whole defect is that correct-
  looking source compiles wrong; only the built output proves the fix.
- **Check whether remotes share the pattern** before assuming shell-only. Each remote is
  built independently, so the same alias in a remote would fail the same way.

## References

- `shell/src/DevelopersMenu.svelte` — lines 32-34
- `packages/workspace/src/ws-url.ts` — the correct pattern, same repo
- `shell/rsbuild.config.ts` — the remotes block, and its comment on the adjacent footgun
- Commit `61c0e2c` — the prior fix that centralised WS endpoint resolution
