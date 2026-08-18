---
title: "Sweep — Local & Federated Design System for Fidelity"
lede: "The repeatable procedure for checking a member's CSS against the federal contract. The one sanctioned exception to the two-file rule."
date_created: 2026-08-01
date_modified: 2026-08-01
semantic_version: 0.0.1.0
status: Active
tags:
  - Loop
  - Design-System
  - Fidelity
  - Enforcement
site_uuid: ec8c9855-23f0-4c4e-8a5d-66c34bc6ea3e
hex_code: 1eqo6x
date_authored_initial_draft: 2026-08-01
date_authored_current_draft: 2026-08-01
---

# Sweep — Local & Federated Design System for Fidelity

## Purpose

This loop checks a single member's CSS surface against the federal token
contract. It catches what the drift script cannot: visual fidelity, token
appropriateness (right token for the right job), and undocumented deviations.

## When to run

**By a developer:** after finishing a feature that touches CSS or adds a
component. After changing a token's value in `packages/theme`. Before a release.

**By an AI coding agent, self-directed:** when the diff touches CSS, Svelte
style blocks, or token references. When the task description mentions colour,
spacing, or typography. When the agent changes a member's `DESIGN.md`. The agent
runs this loop as a *task*, not as a preamble before every edit.

## Procedure

### 1. Read the federal contract

Read `packages/theme/theme.css` — the Tier 1 and Tier 2 blocks only. Note the
tokens available. Read `DESIGN.md` §The federation contract — F1 through F11.

### 2. Read the member's design surface

Read every `.css` and `.svelte` file in the member's `src/` directory. Also
read the member's `DESIGN.md`, including *Deviations* — deviations are declared
exceptions, not bugs to "fix."

### 3. Check each rule

For each federal rule F1–F11, answer: does this member violate it?

Key checks:
- **F1 + F1a:** Grep for `--color__`, `--font__`, `--color-` (member declaring
  federal tokens or consuming Tier 1 directly).
- **F3:** Does every selector descend from the member's root class?
- **F4:** Any raw `z-index` number? Should be `var(--z-*)`.
- **F8:** Any `#hex` or raw `box-shadow`? Should be a token.
- **F10:** Does `mount.ts` import `theme.css`? It should not.

### 4. Check token appropriateness

For each token reference, ask: is this the right token for the job?

- `--color-text` for body text, `--color-text-muted` for secondary.
- `--color-accent` for the brand accent, `--color-accent-warm` for emphasis.
- `--color-border` for decorative dividers, `--color-border-strong` for control
  boundaries.
- `--color-error-text` for error states, `--color-warn-text` for warnings.

### 5. Record findings

Record every violation with file, line, and rule reference. A deviation already
declared in the member's `DESIGN.md` is not a finding — it is a known exception.

## Hard rules for agents

1. **This loop is a task, not a preamble.** An agent that sweeps before every
   small edit has spent its context window on ceremony.

2. **Never self-authorise implement mode.** An agent that finds a violation
   *reports* it. Fixing it is a separate task with its own scope.

3. **Diff-scoped, not member-scoped.** When running on a code change, sweep
   only the files the change touches plus any files that reference the changed
   tokens.

4. **Read the member's Deviations before reporting.** A declared deviation is
   not a finding.
