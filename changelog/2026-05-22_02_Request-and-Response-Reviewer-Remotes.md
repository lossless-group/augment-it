---
title: "Request Reviewer and Response Reviewer — two new remotes mount in the Deck"
lede: "The shell's tiling Deck now shows the whole enrichment pipeline. request-reviewer and response-reviewer join record-collector and prompt-template-manager as federated remotes — scaffolded, wired into the shell, connecting to the workspace, and tiling in pipeline order. The panels are deliberately placeholders: this entry is the federation wiring, not the review UIs. But for the first time the Deck reads end to end — collect, author, pre-flight, post-flight — in one window."
publish: true
date_created: 2026-05-22
date_modified: 2026-05-22
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
tags:
  - Augment-It
  - Request-Reviewer
  - Response-Reviewer
  - Module-Federation
  - Shell
  - Peek-Deck
files_changed:
  - apps/request-reviewer/
  - apps/response-reviewer/
  - shell/rsbuild.config.ts
  - shell/src/remotes.ts
---

## Why Care?

The augment-it shell tiles its pipeline as a row of apps in the peek-deck —
the [[2026-05-21_07_Shell-Tiling-and-Peek-Deck|window-manager Deck]]. Until
now that row had two apps: Record Collector and Prompt Templates. But the
enrichment pipeline has **four** stages, and the last two had no presence in
the window at all — you could not see where the loop went after you authored
a prompt.

Now all four mount. The Deck tiles the pipeline in order:

```
Record Collector  ▸  Prompt Templates  ▸  Request Reviewer  ▸  Response Reviewer
   collect              author              pre-flight           post-flight
```

The two new panels are **placeholders** — they connect to the workspace and
announce themselves, but the review UIs are the next entry. That is
deliberate. Federation wiring is exactly the kind of thing worth verifying
*before* pouring UI on top: a remote that fails to mount is a wiring bug; a
remote that mounts cleanly but is empty is a known, intentional state. This
entry locks the wiring, so Phase 3's UI work starts from solid ground.

## What's New?

- **`apps/request-reviewer/`** — a new federated remote, port 3004. The
  pre-flight surface.
- **`apps/response-reviewer/`** — a new federated remote, port 3005. The
  post-flight surface.
- **The shell tiles both.** Each is registered in the shell's federation
  config and its remote registry; the Deck picks them up as tiles in
  pipeline order.
- **The `pnpm stack` orchestrator covers them automatically** — its frontend
  command globs `./apps/*`, so the two new dev servers start with the rest.

## How it works

Each remote is built to the established augment-it federation pattern — the
same shape as record-collector and prompt-template-manager
([[2026-05-21_03_Shell-Federation-Three-Lessons]]):

- An `rsbuild.config.ts` that exposes a single `./mount` function, with no
  `shared` block — each remote owns its own Svelte 5 runtime and its own
  `@augment-it/workspace` singleton.
- A `mount.ts` exporting `mountRequestReviewer` / `mountResponseReviewer` —
  the function the shell's `MountHost` calls against a host-provided div.
- CSS shipped as a side-effect import (`theme.css` first for its `:root`
  tokens, then the remote's namespaced `app.css`), because Svelte's
  `append_styles` does not fire reliably across the federation chunk
  boundary.
- An `App.svelte` that connects to the workspace WebSocket and renders a
  Phase-2 placeholder describing the UI to come.

Wiring a remote into the Deck is two edits in the shell, exactly as the
remote registry's own comment promises:

- **`shell/rsbuild.config.ts`** — a line in the `remotes` map
  (`requestReviewer@http://localhost:3004/remoteEntry.js`, and 3005 for
  response-reviewer).
- **`shell/src/remotes.ts`** — a `REMOTES` entry. *This* is what makes a
  remote appear as a tile; the entry carries the id, the label, and the
  federation `import()`. The two new entries were appended after
  `promptTemplateManager` so the peek-deck's ordered sequence reads in
  pipeline order.

Co-existence `PAIRINGS` were intentionally left alone — pairing the reviewers
into side-by-side splits is Phase 4 work.

## Verified

Both new remotes pass `svelte-check` clean. They mount in the Deck and show a
green `open` workspace status, proving the federation boundary and the
workspace WebSocket both work end to end.

One pre-existing nit surfaced, untouched: the shell's `App.svelte` has a
type-only `svelte-check` error (`stageEl` typed `HTMLDivElement` but bound to
a `<main>`) from the earlier tiling work. Harmless at runtime, not introduced
here, and left for a separate fix.

## What's Next

- **Phase 3 — the review UIs.** request-reviewer: the resolved request, the
  model toggle, the `max_tokens` field, the JSON-request view, the
  token-binding panel, the fire actions. response-reviewer: the response
  stepper, the triage flags, the whole-response accept, the re-run handoff.
- **Phase 4** — the co-existence `PAIRINGS` and a theme-token audit.

## See also

- [[2026-05-22_01_Pre-Flight-Post-Flight-Service-Layer]] — the service layer
  these remotes render; shipped just before this.
- [[Request-Reviewer-Pre-Flight-Surface]] — the pre-flight spec.
- [[Response-Reviewer-and-Response-Store]] — the post-flight spec.
- [[2026-05-21_07_Shell-Tiling-and-Peek-Deck]] — the Deck these tiles mount into.
