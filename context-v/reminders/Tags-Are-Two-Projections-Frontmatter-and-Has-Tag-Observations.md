---
title: "Tags Are Two Projections — Frontmatter `tags:` on Files, `has_tag` Observations in SurrealDB"
lede: "Files say `tags:` because Obsidian reads files; the DB says `has_tag` because its predicates are verb-shaped. Same fact, two projections."
date_created: 2026-07-25
date_modified: 2026-07-25
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
status: Active
tags:
  - Augment-It
  - Reminder
  - Tags
  - Observations
  - Obsidian
  - SurrealDB
site_uuid: 31878be1-fc8b-43cc-9ebb-ebeed5727ede
hex_code: o1l54a
date_authored_initial_draft: 2026-07-25
date_authored_current_draft: 2026-07-25
---

# Tags are two projections of one fact

Ruled 2026-07-25 during the first triage co-pilot run, after the operator asked
"why has_tag? we use Obsidian — that's just tags."

- **File layer (Obsidian-facing): `tags:`** — YAML inline arrays of quoted
  Train-Case strings (`tags: ["Workforce-Development", "HNWI"]`), on corpus
  markdown, pointer files, and domain records. Obsidian only ever sees files,
  and files always say `tags`.
- **DB layer (triple store): `has_tag`** — one observation row per tag:
  `subject (record id) · predicate 'has_tag' · object 'Train-Case-Value'`,
  plus `source`, `observed_at`, `client`. The predicate is verb-shaped to
  match the rest of the vocabulary (`has_email`, `has_name`, `located_in`,
  `attended`); a predicate literally named `tags` would break the sentence
  grammar ("org *tags* Association"). 238 rows and at least two scripts
  (`build-aspen-tags-relevance-report.mjs`, `surreal-add-person-tags.mjs`)
  already depend on the name.

**The contract:** frontmatter `tags: []` and `has_tag` observations are the
same fact in two projections. Anything syncing between layers maps
`tags[i]` ⇄ one `has_tag` row. Never write a `has_tag:` key into frontmatter;
never mint a `tags` predicate in the DB. Tag values are Train-Case in both
projections (connector words lowercase, acronyms uppercase).

Subject typing gotcha for direct DB writes: org/person record ids are
uuid-typed (`organizations:u"…"`) — a string-typed subject silently fails to
join. Prefer the capability wire; see
[[../issues/Capability-Gaps-Surfaced-by-First-Triage-Run|Capability-Gaps-Surfaced-by-First-Triage-Run]].
