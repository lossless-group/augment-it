---
date_created: 2026-07-07
date_modified: 2026-07-07
title: "Thesis vocabulary lands: per-workspace default type, plus a domain.retype migration"
lede: "Build-Order step 5, finished: humain-vc now defaults to 'thesis' on its own (no more typing it every session), and a new domain.retype capability moved the one pre-existing domain — consumer-immunology — from strategy to thesis, DB and filesystem both. Riding along: a real back button in Corpora Curator's header, and a directory-existence bug caught mid-migration and fixed before it shipped broken."
publish: true
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Sonnet 5
files_changed:
  - services/workspace/src/workspaces.ts
  - packages/workspace/src/types.ts
  - clients/humain-vc/.env
  - apps/strategy-curator/src/curation.svelte.ts
  - apps/strategy-curator/src/App.svelte
  - apps/strategy-curator/src/app.css
  - services/record-surrealdb-resolver/src/domains.ts
  - services/content-ingest/src/corpus.ts
  - services/content-ingest/src/handlers.ts
  - services/workspace/src/capabilities.ts
  - scripts/prove-didi-auth.mjs
tags:
  - Progress-Update
  - Strategy-Curator
  - Corpora-Curator
  - Thesis-Curator
  - Domain-Catalog
  - Workspaces
  - Migration
  - Bug-Fix
---

## Why Care?

Last session's "operator-defined type" fix let you type a corpus's type at
create time, but every fresh session still opened on "strategy" — the
operator caught this immediately live: "'strategy' is still hard coded."
It also surfaced the actual pre-existing domain (`consumer-immunology`)
that's been sitting in the DB and on disk as `type: strategy` since before
any of this work started, needing a real move, not just a relabel.

## What's New?

- **Per-workspace default type.** `WorkspaceSummary` gained
  `default_domain_type`, read server-side from each client's
  `DEFAULT_DOMAIN_TYPE` .env var (`services/workspace/src/workspaces.ts`).
  `clients/humain-vc/.env` now has `DEFAULT_DOMAIN_TYPE=thesis`. The
  curator resolves this on bootstrap *and* on every workspace switch — no
  more global localStorage override masking the per-client difference
  (that was the actual bug: yesterday's fix persisted the type per-browser,
  which meant whichever type you saw first just... stuck, regardless of
  workspace).
- **`domain.retype`, a real capability now.** Moves a domain from one type
  to another — DB (`domains.type` + every `source_usages.domain_type` for
  the slug) and filesystem (`<old-type-plural>/<slug>/` →
  `<new-type-plural>/<slug>/`, `index.md`'s `type:` line patched, every
  source file's `domains:` list entry patched) — for every `client_slug`
  on the domain's row at once, since a domain's identity is one row
  regardless of how many clients reference it. Idempotent: re-running after
  a partial failure (DB moved, files didn't, or vice versa) picks up where
  it left off rather than erroring.
- **`consumer-immunology`: retyped.** Ran the new capability once via a
  `RETYPE=1` mode added to `scripts/prove-didi-auth.mjs`. It's
  `thesis:consumer-immunology` now — DB rows and on-disk frontmatter both
  verified directly.
- **A real back button.** "‹ All corpora" now sits in the header itself
  whenever a corpus is open, not tucked into the source list's filter row —
  more prominent, harder to miss than the fix in this repo's very last
  changelog entry evidently was.
- **A bug, caught before it shipped broken.** The first draft of
  `retypeDomainFiles` reused content-ingest's existing `exists()` helper to
  check whether the domain's old folder was still there — but that helper
  is `readFile`-based (built for checking a *file*), and throws `EISDIR` on
  a directory, which the catch block silently reads as "doesn't exist."
  Every retype would have failed with "neither old nor new directory
  exists" even when the old directory was sitting right there — caught by
  actually running the migration against `consumer-immunology` rather than
  trusting the typecheck, and fixed with a proper `stat().isDirectory()`
  check.

## What's Next

Only the cosmetic piece of Step 5 remains: singular/plural noun rendering
through the rest of the UI copy (right now it generically says
"corpus"/"corpora" everywhere rather than "Thesis"/"Theses" when that
type's active). Next up in the Build-Order sequence: Step 6, curator
liveness (NATS broadcast on domain/source mutations, live refetch across
open browser windows).
