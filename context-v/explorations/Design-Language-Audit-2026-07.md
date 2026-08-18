---
title: "Design Language Audit — July 2026"
lede: "The hand-counted baseline audit that measured the state of augment-it's CSS before the design system shipped. Superseded as the counting mechanism by design-drift.mjs."
date_created: 2026-07-16
date_modified: 2026-08-01
semantic_version: 0.0.1.0
status: Superseded
superseded_by: "scripts/design-drift.mjs"
tags:
  - Audit
  - Design-System
  - Historical
site_uuid: 8467231d-ddd1-412e-95e2-0574d9f54eb3
hex_code: b7qnin
date_authored_initial_draft: 2026-07-16
date_authored_current_draft: 2026-07-16
---

# Design Language Audit — July 2026

## Status: Superseded

**This document is superseded as the counting mechanism.** The drift script
(`scripts/design-drift.mjs`) is now the source of truth. Where the script and
this document disagree, the script is right. Every disagreement was in the
direction this document's own lede predicted: understated.

This document remains in the record as the baseline measurement — the state
of the product before Phases 0 and 1 landed. It is the "before" column in the
verification table in the Phase 1 handoff.

## The July 2026 baseline

Measured by hand against the full codebase on 2026-07-16, before any token
work began.

### What was measured

- 74 stylesheets across 16 remotes plus the shell
- 432 font-size declarations (35 distinct sizes)
- 158 button rule-sets across 13 recipes
- 34 badge treatments
- 6 spinner implementations with 4 different @keyframes names
- 30 box-shadow declarations (47% hardcoded, none mode-reactive)
- 25 z-index values spanning 0→200 with no scheme
- 99 unnamespaced selectors leaking across remote boundaries
- 33 dead fallback colours (fallbacks for tokens defined since May)
- 43 `--color-bg` declarations painting nothing on the live deploy
- 10 `outline: none` sites
- 123 native `title=` attributes (7 accessible)
- 11 product-wide accessibility defects

### Key findings that shaped Phases 0 and 1

1. **The ramps lied.** `--color__graphite-700` was darker than `-900` on three
   of six greyscale ramps. Step numbers did not track luminance. This became
   gate A19, resolved in Phase 1.

2. **Five light-mode contrast failures.** `--color-text-muted` at 4.37–4.49:1
   fell below 4.5:1 against two surfaces. This was gate R11, resolved in Phase 1.

3. **Four phantom warn dialects.** 22 declarations had independently invented
   `--color-warning-*`, `--color-warn`, and other variants for one concept.

4. **Three competing focus treatments.** Zero custom `:focus-visible` rings
   across the product.

5. **Federation was a documentation convention.** F1 forbade members from
   declaring tokens, but every member imported `theme.css` independently —
   the same race condition at runtime.

### What the audit missed

- The Tier 1 consumption violations (F1a) — three files reading `var(--font__mono)`
  directly. The audit grepped `--color__` only.
- The two script bugs (CRLF and argv indexing) that would later produce
  confidently wrong output.
- The CRLF frontmatter parse failure that silently emptied the member registry.

These are recorded in the Phase 1 handoff (§4) — they were found by the drift
script that this audit's findings made necessary.
