---
title: "Libraries We Do Not Use — Ever"
lede: "A hard denylist of packages this codebase has removed on purpose. Do not import them, do not assume they are installed, do not re-add them."
date_created: 2026-08-02
date_modified: 2026-08-02
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.8
semantic_version: 0.0.0.1
status: Active
tags:
  - Reminder
  - Dependencies
  - Augment-It
site_uuid: 7535af76-e73d-4ae2-a19b-f648698c0ea1
hex_code: bepljk
date_authored_initial_draft: 2026-08-02
date_authored_current_draft: 2026-08-02
---

# Libraries We Do Not Use — Ever

## Why Care?

Packages on this list were **removed deliberately** — they caused real
errors and were replaced with hand-rolled code or a platform built-in.
Re-importing one, or *assuming* it's installed, silently reintroduces the
exact problem it was removed to fix. On 2026-08-02 a one-property backend
change was blocked for three rounds because a helper script still had a
stale `require('ws')` in it — the library had already been ripped out, so
the script crashed with `Cannot find module 'ws'` the moment it ran.

## The rules

1. **Never assume a library is installed.** Check `package.json` (and that
   it actually resolves) before importing anything.
2. **Never install a library** to make a script work. If a dependency is
   missing, that is usually a signal it was removed on purpose — ask, or
   hand-roll it. See [[feedback_minimal_dependencies_hand_roll]].
3. **Prefer platform built-ins.** Node ≥ 22 has a global `WebSocket` and
   global `fetch` — use those, not packages.

## The denylist

| Package | Why it's banned | Use instead |
|---|---|---|
| `ws` | Removed for causing errors. Any script still importing it is stale and will crash with `Cannot find module 'ws'`. | Node's built-in global `WebSocket` (Node ≥ 18/22), or hand-rolled WebSocket handling. |

<!-- When another library gets removed, add a row here AND update the
     memory pointer in ~/.claude/.../memory/MEMORY.md. Keep this list the
     single source of truth. -->

## Known offenders to fix when next touched

- `scripts/prove-didi-auth.mjs` — still does `require('ws')` at the top.
  It needs rewriting onto the native global `WebSocket` (which does not
  take a `ws`-style `headers` option, so the `didi_session` cookie has to
  be carried a different way) before it can run again.

## See also

- [[feedback_minimal_dependencies_hand_roll]] — the standing rule this
  reminder makes concrete.
