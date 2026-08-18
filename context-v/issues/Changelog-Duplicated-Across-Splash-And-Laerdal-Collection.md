---
title: "Changelog entries duplicated across augment-it/changelog/ and content/changelog--laerdal/"
lede: "Eleven backfilled augment-it changelog entries currently live in two places. Either location can be the source of truth — but right now both are, and updates have to be made twice."
date_created: 2026-05-12
date_modified: 2026-05-12
status: Open
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
tags:
  - Tech-Debt
  - Changelog
  - Content-Duplication
  - Laerdal
  - Splash
site_uuid: 585d28c8-8b05-43ab-81f1-49caa1c10529
hex_code: xapyf0
date_authored_initial_draft: 2026-05-12
date_authored_current_draft: 2026-05-12
---

## What's Duplicated

On 2026-05-12, eleven backfilled augment-it changelog entries were copied
(not moved) from the augment-it submodule into the lossless-content
submodule so they'd appear in the "Laerdal Changelog" toggle on the
consulting site (`/workflow/laerdal` and `/log/laerdal-*`).

| File (11×) | Source of truth | Copy |
|---|---|---|
| `2025-01-18_01.md` | `ai-labs/augment-it/changelog/` | `content/changelog--laerdal/` |
| `2025-01-27.md` | same | same |
| `2025-03-03_01.md` | same | same |
| `2025-07-25_01.md` | same | same |
| `2025-07-25_02.md` | same | same |
| `2025-07-25_03.md` | same | same |
| `2025-07-26_01.md` | same | same |
| `2025-08-01_01.md` | same | same |
| `2025-08-06_01.md` | same | same |
| `2025-08-10_01.md` | same | same |
| `2025-08-11_01.md` | same | same |

The copies in `content/changelog--laerdal/` have two extra frontmatter
fields injected at the top — `project: "Augment-It"` and
`category: "Archive-Backfill"` (or `"Technical-Changes"`) — so they fit
the visual style of the five pre-existing Laerdal entries. Body content
and the rest of the frontmatter are byte-identical to the originals.

## Why It Matters

- **Edit drift.** A correction to any of the eleven entries has to be
  applied in both places, or the splash and the consulting site will
  start telling slightly different stories about the same week of work.
- **Tanuj's commits show up twice on the consulting site already.** The
  Laerdal collection had 5 pre-existing entries about Tanuj's Phase-1
  Next.js work; my backfilled copies add another 3 about his
  module-federation work. That's fine — they're complementary, not
  duplicative. The duplication concern is only between the splash's
  source and the Laerdal copy of the same set.

## Cleanup Options

Two reversible paths to a single source of truth:

1. **Splash reads from `content/changelog--laerdal/`.** Modify
   `ai-labs/augment-it/splash/src/content.config.ts` so the changelog
   loader points at the Laerdal collection's path (filtering on
   `project: "Augment-It"` if the Laerdal collection ever broadens
   beyond augment-it). Delete the originals in
   `ai-labs/augment-it/changelog/`. Tradeoff: splash now depends on the
   `content` submodule being checked out.

2. **Laerdal collection reads from `ai-labs/augment-it/changelog/`.**
   Modify `site/src/content.config.ts` so the Laerdal collection's
   `glob()` loader pulls from both `content/changelog--laerdal/` AND
   `ai-labs/augment-it/changelog/`. Delete the copies in
   `content/changelog--laerdal/`. Tradeoff: consulting-site build now
   depends on `ai-labs/augment-it/` being present, which is true today
   but may not always be.

Option 2 is the more aligned choice — augment-it should own its own
changelog, the consulting site should aggregate. Same pattern would
benefit any future client project that ships its own splash.

## How To Recognize It Was Done

- `ls content/changelog--laerdal/` shows only the 5 original entries
  (or only entries that don't have a sibling in
  `ai-labs/augment-it/changelog/`).
- `pnpm build` succeeds in both `site/` and `ai-labs/augment-it/splash/`.
- `/workflow/laerdal` on the consulting site still renders all 16
  entries.
- The splash's `/changelog/` page still renders all 12 entries.

## Related

- Original backfill work: `ai-labs/augment-it/changelog/2025-07-25_01.md`
  through `2025-08-11_01.md`.
- Toggle wiring: `site/src/pages/log/[slug].astro` (lines 14–51).
- Laerdal layout: `site/src/layouts/LaerdalChangelogLayout.astro`.
