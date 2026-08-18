---
title: context-v for augment-it
lede: Living documentation for augment-it — specs, habits, prompts, reminders, explorations, issues.
date_created: 2026-05-12
date_modified: 2026-05-25
status: Active
tags:
  - Context-Vigilance
  - Convention
site_uuid: 60a76104-2421-4263-ad44-405d9dfabfaa
hex_code: bxhzq2
date_authored_initial_draft: 2026-05-12
date_authored_current_draft: 2026-05-12
---

This directory follows the Lossless Group **context-vigilance** convention.
See the parent monorepo's `context-v/skills/context-vigilance/SKILL.md` for
directory roles, frontmatter schema, and the four-part `epoch.major.minor.patch`
versioning scheme.

Subdirectories appear as content arrives:

- `specs/` — design specifications
- `habits/` — recurring practices, agent and human
- `prompts/` — saved prompts that earn a name
- `reminders/` — short notes future-you will be glad past-you wrote
- `explorations/` — open questions, partially-answered
- `issues/` — known problems, not yet fixed
- `loops/` — repeatable fidelity sweep procedures. See `loops/references/` for supporting rationale.

The splash at `splash/` renders every `.md` in this tree (and `changelog/`)
on push to `main`.
