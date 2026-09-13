---
title: "A silently ignored alias pointed a verification probe at production"
lede: "rsbuild accepts source.alias and ignores it. Three agents rendered live data believing it was a fixture; one wrote a file into client corpus."
date_created: 2026-09-13
date_modified: 2026-09-13
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5 (1M context)
semantic_version: 0.0.1.0
status: Resolved
tags:
  - Issue
  - Augment-It
  - Agent-Safety
  - Browser-Drive
  - Design-System
  - Incident
site_uuid: b5931ba3-b087-4c4e-9b4d-2b20402ead61
hex_code: 85rphi
date_authored_initial_draft: 2026-09-13
date_authored_current_draft: 2026-09-13
publish: true
---

# A silently ignored alias pointed a probe at production

## Why Care?

The house rule for browser-drive verification is explicit and has been in
`CLAUDE.md` at three levels of the tree since it was written:

> Browser-driven **reads are unrestricted; writes only against the repo's
> designated safe target** — never mint test entities in shared/canonical data.

On 2026-09-13 a verification probe wrote a real file into a live client's corpus:
`clients/reach-edu/corpus/row-rs-mr2pjx7n-4bdmkr-0/2026-09-13_example-domain.md`.

**The engineer did not ignore the rule.** It had aliased `@augment-it/workspace`
to a fixture stub precisely so that no write could reach anything real. The alias
silently did nothing.

## What actually happened

`rsbuild` 2.x accepts `source.alias` in its config, ignores it, and reports a
successful build. The correct key is `resolve.alias`.

So the probe bundled the **real** workspace client. `resolveWsUrl()` returned its
default, a workspace-service happened to be running on the machine, and the
driven click-path — written to exercise buttons — fired
`content_ingest.preview_url` followed by `corpus.add` against a real record.

`corpus.add` is filesystem-only (verified: `services/content-ingest/src/corpus.ts`
makes no database calls), so the blast radius was exactly one file and one NATS
event. The file has been removed and the submodule is clean.

## Why this got past three engineers

**The failure mode is a full, plausible page.** Every other probe trap in the
playbook produces an empty surface or an error. This one produces production.

- One probe reported 866 buttons and record sets named
  `investors-2026-07-01.csv 378 rows · 104 cols` — from a four-row fixture.
- Another rendered **1,982 real responses** and caught it only because the numbers
  were too round to have come from an eleven-record stub.
- The third did not catch it at all, and wrote the file.

Two of the three noticed only through *numerical intuition about their own
fixture*. That is not a control. The third's click-path was correct, its variant
mapping was correct, its measurements were correct — and it was measuring
production the whole time.

**None of the gates could see it.** `design:drift`, `svelte-check` and the
contrast gate all pass identically whether the probe talks to a stub or to a live
backend. There was no signal anywhere except the data itself.

## The fix

Three defences in [[../loops/Adopt-The-Shared-Button-In-One-Member]], all
mandatory, because any one can be got wrong:

1. **`resolve.alias`, never `source.alias`.**
2. **Assert the stub is in the bundle before trusting a number.** Put a sentinel
   string in the stub and `grep -c '<sentinel>' dist-probe/static/js/*.js`. Zero
   hits means you are looking at production.
3. **Kill the network in `addInitScript`.** Replace `window.WebSocket` with a
   throwing constructor and `window.fetch` with a rejecting stub.

Defence 2 is the load-bearing one. It is the only check that fails *loudly* and
the only one that does not depend on getting a config key right.

## The general lesson, which is bigger than this probe

**A sandbox that is not asserted is not a sandbox.** The instruction "alias the
workspace to a fixture" describes an intent; it does not verify an outcome. Every
future agent-safety boundary in this codebase should be written as *"do X, then
prove X took effect"* — because a config key that is accepted and ignored is
indistinguishable from one that worked, right up until it writes to a client.

Worth pairing with the existing rule rather than replacing it: the `CLAUDE.md`
sentence tells an agent where it may write. This issue is about an agent that
believed it could not write anywhere at all.

## Related

- [[../loops/Adopt-The-Shared-Button-In-One-Member]] — where the three defences now live
- [[Structural-Invariants-Live-In-Prose-So-Sweeps-Stop-Halfway]] — prose rules with no mechanical check, same shape
- `context-v/blueprints/Browser-Drive-Verification-For-Agent-Sessions.md` (anchor monorepo) — the house pattern this amends
