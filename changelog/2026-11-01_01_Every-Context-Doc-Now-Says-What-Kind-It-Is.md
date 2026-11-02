---
title: "Every Context Doc Now Says What Kind It Is"
lede: "All 216 docs in augment-it's context-v/ declare a type, and every folder has an index an agent can scan without opening a file."
publish: true
date_authored_initial_draft: 2026-11-01
date_authored_current_draft: 2026-11-01
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5.5 (1M context)
summary: >-
  Phase 1 of the tree-wide Open Knowledge Format (OKF) v0.2 retrofit, applied
  to augment-it on its rebuild branch. Adds `type:` (the folder name in
  Train-Case) to 216 docs across 14 folders, writes a root index.md with
  okf_version "0.2" plus one index.md per folder, and makes the splash's
  local loader skip index.md so indexes stay agent navigation and never
  become pages. Frontmatter-only: no body line, date, or publish flag moved.
  Phase 2 (baseline keys and statuses) follows in a separate entry.
site_uuid: 4d69a59e-ba46-4ae4-9fa9-26bde2e45926
hex_code: 1mi7ja
files_changed:
  - context-v/
  - splash/src/content.config.ts
---

# Every Context Doc Now Says What Kind It Is

## Why Care?

augment-it keeps more living documentation than any other repo in the Lossless tree: 216 specs, plans, issues, explorations, loops and reminders. Until today, an agent or a dashboard could only tell a spec from an issue by the folder it sat in. Now each doc says so itself, in a field a machine can read, and each folder carries an index that lists what's inside with a one-line hook.

That's the first half of what a workflow dashboard across every Lossless repo needs. The second half, honest statuses from one shared vocabulary, comes next.

## What's New?

- **216 docs typed.** Each got one line, `type: Issues`, `type: Specs`, and so on: the folder's name in Train-Case. Nothing else in any doc changed.
- **15 indexes.** A root `context-v/index.md` declaring `okf_version: "0.2"`, and one `index.md` per folder listing every doc with its lede.
- **The splash skips them.** The splash's local loader now passes over `index.md`, so the indexes guide agents without turning into pages. The build still loads 204 published docs.

## Under the Hood

The sweep follows the Context Vigilance Kit's `compliance-sweep.md`: every edit made by hand, one file at a time, frontmatter only. No script wrote a Markdown file. The repo lives on `rebuild/turbo-rsbuild` after its rebuild, so the sweep landed there and nowhere else.

The loose `context-v/README.md` stays untyped, as it does in every other repo: it sits in the bundle root rather than a folder.
