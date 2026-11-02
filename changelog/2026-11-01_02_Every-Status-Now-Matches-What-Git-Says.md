---
title: "Every Status Now Matches What Git Says"
lede: "217 context docs checked against the commits: 52 plans and specs were already shipped, and 28 issues were already fixed."
publish: true
date_authored_initial_draft: 2026-11-01
date_authored_current_draft: 2026-11-01
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5.5 (1M context)
summary: >-
  Phase 2 of the Open Knowledge Format retrofit for augment-it, on its
  rebuild branch. Every status in context-v/ now sits on the shared
  vocabulary, decided from git history and the code rather than renamed
  blindly. Compound statuses ("Open · Diagnosed · …") keep their full text
  in a new status_note key. Shipped and Partially-Shipped docs gained a
  date_first_published from the commit that shipped them; repo-name tags
  came out where the body already names the repo. Frontmatter only: no body
  line, date_modified, or publish value changed.
site_uuid: 31e65486-ffba-42c6-8b90-e75ad76b4687
hex_code: 4ablp9
files_changed:
  - context-v/
---

# Every Status Now Matches What Git Says

## Why Care?

A status field is only useful if it's true. augment-it's context docs had drifted the way living docs do: plans still marked `Draft` months after their work merged, issues still `Open` after the fix shipped, and dozens of statuses written as sentences (`Open · Real Root Cause Identified · Fix In Progress`) that no dashboard could group.

Every one of the 217 docs now carries a status from one shared vocabulary, and each was decided by reading the doc and checking the commits, not by find-and-replace. A workflow dashboard can now ask "what's ready to assign?" and get a straight answer.

## What's New?

- **Statuses decided from evidence.** 52 docs are `Shipped` and 23 `Partially-Shipped`, each with a `date_first_published` from the commit that shipped it. 28 issues are `Resolved`, 24 still `Open`. The rest are `Active`, `Reference`, `Draft`, `Archived`, `Ready`, `Stub`, `Deferred`, `Superseded` or `Stale`.
- **Nothing lost from compound statuses.** Where a status carried a whole sentence of context, `status:` got the single value and the sentence moved, verbatim, into `status_note:`.
- **Tags tidied.** Repo-name tags came out where the body already names the repo, and lowercase tags became Train-Case (`reach-edu` → `Reach-Edu`).

## Under the Hood

The same discipline as Phase 1: hand edits, frontmatter only, no script writing any doc, and no date bumped, since a compliance change isn't a content change. Every frontmatter block was re-parsed afterwards, every diff hunk checked to sit above its file's closing `---`, and the splash rebuilt.

Known gaps left on purpose: `Partially-Shipped` docs don't yet have a `## Remaining work` section (that would be a body edit), and one exploration has no `authors` because its committer isn't the usual author.
