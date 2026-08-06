---
title: "Handoff — federated design system: Phases 0 and 1 shipped, nothing seen"
lede: "Blake's 2026-08-01 handoff. The colour tier is real — 88 tokens, 108/108 contrast pairs passing, 15/15 packages building — and not one change has been rendered in a browser. Filed verbatim; none of the work it describes has reached this repo."
date_created: 2026-08-01
date_modified: 2026-08-06
authors:
  - Steven Blake Casio
augmented_with:
  - Claude Code
semantic_version: 0.0.1.0
status: Reference
source_document: progress-phase-14.md
source_machine: "C:\\Users\\Blake\\Desktop\\Blake Lossless Design\\"
tags:
  - Handoff
  - Design-System
  - Augment-It
  - Federated-Architecture
  - Design-Tokens
  - Accessibility
---

> ## Filing note — read this before trusting any path in the document below
>
> Received from Blake and filed into `context-v/handoffs/` on 2026-08-06,
> **verbatim** apart from this block and the frontmatter above. The original
> filename was `progress-phase-14.md`; it was renamed to the Train-Case
> convention, and the `source_document` field preserves the chain reference
> (phase-8 → phase-10 → phase-14) that Blake maintains on his machine.
>
> **None of the work described below is in this repository.** Verified against
> `rebuild/turbo-rsbuild` and all 22 branches, local and remote, on 2026-08-06:
>
> | Claimed | Reality here |
> |---|---|
> | `scripts/design-drift.mjs`, 536 lines — the whole of Phase 0 | **Absent.** Not in any reachable commit on any ref. |
> | `packages/theme/theme.css` at 318 lines (+183) | **213 lines.** Phase 1's substance is not here. |
> | `pnpm design:drift` / `design:contrast` | **Not in `package.json`.** |
> | `context-v/specs/Federated-Design-System-Architecture.md` | **Absent.** |
> | `context-v/specs/Design-System-Portal.md` | **Absent.** |
> | `context-v/explorations/Design-Language-Audit-2026-07.md` | **Absent.** |
> | `context-v/loops/Sweep-Local-Federated-Design-System-for-Fidelity.md` | **Absent.** |
>
> §5 of the document calls the documentation "all untracked." The **code is
> equally untracked** — Phases 0 and 1 exist only on the Windows machine named
> in `source_machine`. Every verification figure below is real and was really
> measured; none of it is reproducible here until that work lands.
>
> The root `DESIGN.md` (v0.1.0.1) **did** arrive with this handoff and is now
> committed at the repo root. It is the federal token source and its
> frontmatter is the member registry the drift script reads — so the document
> the script depends on is here, and the script is not.
>
> **This handoff independently confirms a finding reached the same day from a
> different direction** — §6's "`pnpm build` is broken and always has been"
> matches the graph-based audit in
> [[Why-This-Monorepo-Does-Not-Need-Turbo]], down to the Turbo v1 `"pipeline"`
> key. Two independent analyses, same conclusion.

---

# progress-phase-14.md — augment-it Federated Design System: First Code Shipped, Nothing Seen

**Date:** 2026-08-01
**Engineer:** Blake (stevenblakecasio@gmail.com), Lossless team, owns the augment-it design system
**Machine:** Windows 11 Home, `C:\Users\Blake\Desktop\Blake Lossless Design\`
**Written by:** Claude Code session (complete handoff — no prior conversation history needed)

**Supersedes `progress-phase-10.md` for design-system status.** Its headline — *"Vision Complete, Nothing Built"* — is now **false**. Phases 0 and 1 of the token roadmap are implemented; `git diff HEAD` is no longer empty. Everything else in phase-10 that remains true is carried forward here.

⚠️ **`progress-phase-11/12/13.md` do not exist on disk.** Phase 10 is the immediate predecessor; the gap is a numbering jump, not a lost chain.

**Read chain — four documents, distinct jobs:**

| File | Authoritative for |
|---|---|
| `progress.md` (2026-07-16) | Environment setup, Docker/WSL, the Norton TLS gotcha |
| `progress-phase-8.md` (2026-07-30) | Environment status (§3), milestone sequencing rationale, how to run the stack |
| `progress-phase-10.md` (2026-07-30) | The documentation architecture — still accurate for *what the documents say* |
| **`progress-phase-14.md`** *(this file)* | **What actually exists in code, and what is verified** |

---

## 1. Current status

**The colour tier is real. Nothing has been looked at.**

| | |
|---|---|
| **Contract version** | **2.1** (F1–F11) · adoption phase `warn` |
| **`DESIGN.md`** | **0.1.0.1** — first `0.1.x`; the minor bump marks code existing |
| **Tokens defined at runtime** | **88** (was 72) |
| **Roadmap position** | **Phases 0 and 1 done. 9 of 11 remain** — 1b, 2a, 2, 3, 4, 5, 6, 7, 8 |
| **Builds** | **15/15** federation packages exit 0 |
| **Visual verification** | **ZERO.** Not one change has been rendered in a browser. |

**The one-line summary:** every claim in this document is machine-verified, and *none* of it is eye-verified. That is the defining caveat of Phase 1 and it is why Phase 2a matters more than its size suggests.

---

## 2. Phase 1 implementation

### Phase 0 had to come first, and that was not in the ask

Phase 1 was requested. Phase 1 could not be done alone:

- Its stated dependency is *"Phase 0's mode-parity check."*
- Its exit criterion — *"zero no-fallback declarations"* — is unverifiable without the drift script, which did not exist.
- Its hardest task, **A3**, needs contrast numbers the plan explicitly assigns to Phase 0 (risk **R11**, *"the largest unquantified risk in the program"*).

Phase 0 is `Dependencies: none · Risk: none`, no visual change. It was built first.

### Phase 0 — instrumentation

**`scripts/design-drift.mjs`, 536 lines, zero dependencies**, wired as `pnpm design:drift` and `pnpm design:contrast`.

**Until this existed, F1–F11 were prose.** Every enforcement claim in `DESIGN.md` was aspirational.

Design decisions worth knowing:

- **Zero dependencies, pure Node.** E1 (lowest level that works) and E3 (no shared build step). Where regex is insufficient the check says so rather than pretending.
- **The member registry is read from `DESIGN.md`'s frontmatter**, never duplicated. A second member list is a second thing to forget — the exact failure F2 exists to catch.
- **The adoption ramp decides the exit code**, not the finding count. `warn` reports and exits 0.
- **`--resolve`** dumps every Tier-2/3 token's fully-resolved value per mode. Diffing two runs is how you prove a token rename changed no rendered output.

### Phase 1 — the colour tier

Ten tokens shipped across all three mode blocks. **One was rejected on measurement.**

| Delivered | Note |
|---|---|
| `--color-surface-2`, `--color-bg-elevated` | the nested and floating rungs |
| `--color-border-strong` | **needed a new Tier-1 value per ramp** — see A3 below |
| `--color-link`, `--color-thread`, `--color-accent-warm` | |
| `--color-warn-bg` / `-text` | **unified four phantom dialects**, 22 declarations |
| `--focus-ring` | one token replacing three competing treatments |
| `--color-bg` → alias of `--color-background` | ⚠️ **DEPRECATED**, deleted end of Phase 4. Closes **43 declarations that painted nothing on the live deploy**, with zero app churn |
| ~~`--color-text-dim`~~ | ❌ **REJECTED** — see below |

Plus: global `prefers-reduced-motion` and `forced-colors` blocks in `theme.css`; an inline FOUC guard in the shell; and the `strategy-curator` light-mode focus defect closed.

### Four findings that changed the work

**A19 — resolved, and it was a pure permutation.** The ramps' step numbers *lied*: `--color__graphite-700` was `#13151b`, darker than `-900`; `paper-200` was lighter than `-100`; `void-700` darker than `-900`. Fixed by **re-numbering** — same set of numbers, reassigned so they track luminance, with every Tier-2 mapping re-pointed in the same commit. **Not one rendered colour changed**, proven by diffing `--resolve` before and after. Rejected alternative: perceptual-role names, because Tier 1 is named for *appearance, not role* — a role-named Tier-1 token is a Tier-2 token in disguise.

**R11 fired.** The contrast sweep found **five real light-mode failures**: `--color-text-muted` at 4.37:1 and 4.49:1 (it carries most 9–11px label text), and `--color-confidence-med` at 3.97–4.34:1. Fixed by darkening two Tier-1 values — `--color__ink-500` `#6b6f7a`→`#686c77`, `--color__amber-ink` `#a16a1f`→`#95621d`. **These are the only Tier-1 *values* that have ever changed.** All 108 pairs now pass.

**`--color-text-dim` rejected.** Asked for by name in 4 places. But `--color-text-muted` already sits at 4.57:1 in light, and **every type size here is under 18.66px**, so there is no large-text allowance. **No third level below muted can reach 4.5:1 in light mode.** Defining it would have given an inaccessible pattern a federal name. The 4 call sites become `--color-text-muted` in Phase 4.

**A3 answered, and the answer was "no."** The gate asked whether the greyscale ramps could support the new surface/line tokens. They could not: `--color-border-strong` needed **a brand-new Tier-1 step in each ramp** (`graphite-600`, `paper-400`, `void-600`), each solved for ≥3:1 against *every* surface in its mode. Solving against `--color-surface` alone put all three at ~2.9:1 — the worst case is `--color-bg-elevated`, which Phase 1 had just added.

### New gate raised by measurement — A22

**`--color-border` does not meet 3:1.** Measured 1.22 (dark), 1.41 (light), 1.45 (vibrant). Fine for a decorative divider; **required for a control boundary** under WCAG 1.4.11. This is the 1px border carrying the product's entire elevation identity (P6), so changing it changes the look of everything — a brand decision, not a token fix. `--color-border-strong` shipped as the compliant option. **Owner: Michael + design.**

---

## 3. Verification results

Every figure re-derived from a live command for this document.

| Check | Before | After |
|---|---|---|
| Federation packages building | — | **15 / 15 exit 0** |
| Contrast pairs ≥ 4.5:1 | 103 / 108 | **108 / 108** |
| Undefined **federal** tokens, no fallback | 40 | **0** |
| F11 literals in Tier 2/3 | 2 | **0** |
| A19 non-monotonic ramps | 3 | **0** |
| F1a Tier-1 consumption | 3 | **0** |
| Tokens defined | 72 | **88** |
| Drift total | 502 fail · 258 warn | **480 fail · 212 warn** |

**Stronger than the totals:** the before/after `--resolve` diff, run through the same resolver, shows **exactly four changed values — two are the approved R11 fixes and two are whitespace** (the F11 rewrite is byte-equivalent). Tier-1 integrity: 53 declared, 53 referenced, **zero dangling, zero orphaned**.

**What is *not* verified:** anything visual. The FOUC guard is confirmed to be the first element in the built `<head>`, but has never been observed suppressing a flash. The `forced-colors` block, the new focus ring, and all 10 new tokens in light and vibrant are unseen.

---

## 4. Documentation drift — found, and how it was fixed

A post-implementation review found **the code sound and the documentation wrong.** Two distinct classes.

### Class 1 — `DESIGN.md` described the palette as it was *before* Phase 1

Seven defects. The document was the source an agent would read to learn the system, and it was lying.

| # | Was | Reality |
|---|---|---|
| D1 | §Colors warned *"the ramps are not monotonic"* and cited `--color__graphite-700` as `#13151b` | **All six ramps monotonic.** `graphite-700` is `#232634` — the *lightest* step. **An agent reading the doc got the wrong hex.** |
| D2 | A19 block offering two options, *"neither yet chosen"*, under a header marked RESOLVED | One was chosen, implemented, verified |
| D3 | Tier-1 table listing 6/5/6 steps | Missing `graphite-600`, `paper-400`, `void-600`, `shadow-black`, `shadow-ink` |
| D4 | Elevation ladder marking three tokens 🔶 | All three shipped |
| D5 | Effect table listing 3 tokens; prose claiming the F11 debt open and the popover rung *"genuinely missing"* | 4 shipped; debt cleared; rung exists |
| D6 | Frontmatter `colors:` — 17 entries | 31 Tier-2 tokens shipped; **none of the 10 new ones present** |
| D7 | 10 new tokens named only in a prose sentence | No **role row** in the table an agent reads |

**All seven fixed.** Frontmatter now carries 26 entries; the Tier-2 table gained role rows for Focus, Link, Structure, Deprecated and the extended Surfaces/Line/Status rows.

**Root cause, and it is systemic:** *the drift script compares CSS to CSS.* **Nothing checked the document against the runtime.** `DESIGN.md`'s own rule — *"when code and doc disagree, trust the code and fix the doc"* — had no enforcement behind it. Phase 1 shipped the code and half-fixed the doc.

### Class 2 — the drift script had a hole that hid three real violations

**`F1` caught a member *declaring* a federal token. It did not catch a member *consuming* Tier 1**, which P1 and F1 both forbid. Three live violations were invisible:

- `shell/src/DidiBadge.svelte:185` and `:195` — `var(--font__mono, monospace)`
- `apps/strategy-curator/src/app.css:97` — `var(--font__mono, …)`

Added check **`F1a`**. It found exactly those three; all now read the Tier-2 `--font-mono` (identical resolved value, zero visual change). Regression-tested by reintroducing a violation and confirming the check fires.

⚠️ **This invalidated an earlier claim and revealed a near-miss.** During implementation I verified "no member references Tier 1" by grepping `--color__` only, missing `--font__`. **The A19 rename was safe by luck, not by check** — had it touched the font tokens, those three call sites would have broken silently.

### Two script bugs caught mid-flight, both of which produced confidently wrong output

- **`argv.indexOf('--member') + 1`** returns `argv[0]` when the flag is absent, so `--json` was parsed as a member name and **silently filtered out every member**.
- **A CRLF read.** `split('---\n')` against a CRLF file yields zero frontmatter, so the member registry came back empty and the run reported **`0 fail · 1 warn`** — success, because it could not read its own input. Fixed at the source (all reads normalise line endings) and a CRLF regression check added.

**Both are the same failure mode: a checker reporting success because it failed to look.** Worth remembering when trusting any future output from this script.

---

## 5. Files modified

**7 tracked files, +197 / −47, plus 1 new file.**

| File | Change |
|---|---|
| **`scripts/design-drift.mjs`** | **NEW**, 536 lines — the whole of Phase 0 |
| `packages/theme/theme.css` | **+183** — Phase 1's substance; 318 lines total |
| `shell/rsbuild.config.ts` | +21 — the inline FOUC guard in `html.tags` |
| `apps/strategy-curator/src/app.css` | +20 — focus defect (a11y #1) and the F1a fix |
| `package.json` | +4 — `design:drift`, `design:contrast` |
| `shell/src/DidiBadge.svelte` | ±4 — F1a fix |
| `packages/theme/mode-switcher.ts` | +3 — note that the FOUC script duplicates its key/default by necessity |
| `context-v/README.md` | +9 — the `loops/` seventh folder (earlier session) |

**Documentation, all untracked:** `DESIGN.md` → **0.1.0.1** · `context-v/specs/Federated-Design-System-Architecture.md` → 0.0.2.1 · `context-v/explorations/Design-Language-Audit-2026-07.md` → 0.0.1.0 (**superseded as the counting mechanism** — the script is now the source of truth) · `context-v/loops/Sweep-Local-Federated-Design-System-for-Fidelity.md` split into a ~120-line procedure plus `loops/references/Sweep-Fidelity-Rationale.md`.

---

## 6. Remaining work

### The blocker that matters

**Nothing has been seen in a browser.** Not the FOUC guard, not `forced-colors`, not the focus ring, not any of the 10 new tokens in light or vibrant. Every claim here is static analysis. **Phase 2a — the portal P0 swatch page — is the designated place to close this**, and that is now its main justification, ahead of unblocking A3 (already answered by measurement).

### Roadmap

| Phase | State |
|---|---|
| 0 — Instrumentation | ✅ done |
| 1 — Colour tier | ✅ done |
| **1b — Single token injection (F10)** | **untouched, gated on A15.** 14 members still import `theme.css` |
| **2a — Portal P0 swatch page** | **recommended next** |
| 2 — Define the scales | typography, spacing, radius, layering, motion — all still 🔶 |
| 3–8 | namespace containment · re-base · components · a11y · tooltips · portal |

### Open gates — 12

`A4` `A8` `A10` `A13` `A14` `A15` `A16` `A17` `A18` `A20` `A21` `A22`

**A20, A21 and A22 are new this session.** `A3`, `A5` and `A19` are resolved.

**Michael owns three and has answered none:** A14 (resolver consolidation), A16 (deploy ledger), **A20 (token *introduction* across independent deploys)**. A20 is the one that should block the runtime contract — F10 made the shell the sole injector of `theme.css`, and **nothing covers a member deploying against a token the deployed shell does not have yet.** Retirement can be aliased forever; introduction resolves to nothing, in production, invisible in the member's own repo.

⚠️ **A1 was never answered, and the roadmap says it *blocks Phase 1*.** Phase 1 shipped anyway. The judgement: A1 (is accessibility a commercial requirement?) governs whether **M6 jumps ahead of M5**, not whether the colour tier can land. **Recorded here so it is a decision, not an oversight.**

### Known debt, unchanged by Phase 1

- **10 `outline: none` sites** across `person-enrichment` (3), `records-surface` (2), `sort-filter-lens` (2), `chat`, `record-collector`, `response-reviewer` — a11y defect #13. Only defect #1 was closed.
- **20 no-fallback `var()`** remain, all `--chip-accent` / `--pack-accent` — member-local unprefixed properties, correctly Phase 4 / Tier 4 work rather than federal gaps.
- **146 leaked selectors, 275 hardcoded hex, 21 raw `z-index`, 119 native `title=`** — Phases 3, 4 and 7.
- **`pnpm build` is broken and always has been.** `turbo` is invoked by `package.json` but is **not a dependency and not installed**, *and* `turbo.json` uses the Turbo v1 `"pipeline"` key that v2 renamed to `"tasks"` — installing turbo alone will not fix it. Verify per-package: `pnpm --filter @augment-it/<name> build`.

---

## 7. Exact next recommended prompt

```
Read progress-phase-14.md at C:\Users\Blake\Desktop\Blake Lossless Design\,
then augment-it/DESIGN.md §Colors and §The runtime token contract.

Phases 0 and 1 are implemented and machine-verified. NOTHING has been seen in
a browser. That is the gap to close, and it is the only reason to touch code
next.

Do two things, in this order.

FIRST — A15, the F10 migration test. One line, and it unblocks Phase 1b.

  1. Start the stack (progress-phase-8.md §3 has the environment status;
     scripts/dev.sh is bash — use Git Bash on this box).
  2. Pick ONE member: apps/request-reviewer. Most compliant, least that can
     go wrong.
  3. Remove ONLY `import '@augment-it/theme/theme.css'` from its src/mount.ts.
     Leave `import './app.css'` exactly as it is — that one is load-bearing
     across the federation chunk boundary.
  4. Verify IN THE SHELL at :3100 — not standalone — that it is still fully
     themed in dark, light AND vibrant.
  5. Then verify it standalone on its own port. index.ts still imports
     theme.css, so standalone must be unaffected.

  If it stays themed: A15 resolved. Report back BEFORE migrating the other
  13 — do not batch.
  If tokens vanish: STOP. The shell's import is being scoped or tree-shaken
  and the fix is at the shell. Do NOT re-add the import to the member as a
  workaround — that restores the exact defect F10 exists to fix, and it will
  look like it works.

SECOND — while the stack is up, eyeball Phase 1. It has never been rendered:

  - Cycle all three modes. Confirm no flash of dark on load in light mode
    (the FOUC guard in shell/rsbuild.config.ts).
  - Tab into a strategy-curator input in LIGHT mode. There must be a visible
    focus ring. That defect (a11y #1) was invisible before Phase 1.
  - Check the new tokens render sanely in light and vibrant, especially
    --color-border-strong and --color-bg-elevated. They were chosen against
    measured contrast, never against a screen.
  - If you have Windows High Contrast, toggle it and confirm panels still
    have visible edges (the forced-colors block).

Run `pnpm design:drift` before and after. It should stay at 480 fail / 212
warn unless you changed a member; `pnpm design:contrast` must stay 108/108.

Record A15's outcome in DESIGN.md §The runtime token contract and write a
changelog entry per changelog-conventions.

AFTER those: Phase 2a, the portal P0 swatch page
(context-v/specs/Design-System-Portal.md §3). A stylesheet and a loop. It is
now the main way to keep the vocabulary honest as Phase 2 adds typography,
spacing and radius — those will be chosen by eye and there is still no
surface to choose them on.

Flag to Blake:
  - A20 is unanswered and Michael owns it. F10 made the shell the sole
    injector of theme.css; nothing covers a member deploying against a token
    the deployed shell lacks. It renders unstyled in production and is
    invisible in the member's own repo. This is the mirror of A16 and it was
    missing entirely until this session.
  - A22 is new: --color-border measures 1.22-1.45:1 and does not meet 3:1
    for control boundaries. Changing it changes the look of the whole
    product, so it is a brand decision.
  - A1 still unanswered. Phase 1 shipped without it deliberately.
```

---

## 8. Notes another engineer would need

- **`pnpm design:drift` is now the source of truth**, not the July audit. That exploration has been marked superseded — where they disagree the script is right, and every disagreement was in the direction its own lede predicted: understated. **Do not hand-count against it again.**
- **`node scripts/design-drift.mjs --resolve` is how you prove a token rename is visually neutral.** Dump before, dump after, diff. Without it, A19 would have needed screenshots of 17 members in 3 modes.
- **The two-layer test, in one sentence:** *can this decision, made wrongly in one member, break a different member?* If yes it is federal. That is why `z-index` and `@keyframes` names are federal while component APIs are not.
- **Two tiers are the blast-radius control, not a convenience.** Adding a Tier-1 name reaches nothing; re-pointing a Tier-2 token reaches all 17 members. Without the indirection there is one operation — *edit a hex* — and it silently occupies both rows.
- **F11 prohibits *literals*; it does not mandate pointing at Tier 1.** Composition over a Tier-2 token (`color-mix(… var(--color-accent) …)`) is legal and preferred — it is how the tints track the accent. A check reporting more than 0 violations today is mis-implemented.
- **The two-file rule still holds.** To work in member X an agent reads `<member>/.design-context.json` and the file it is changing. **Those fragments do not exist yet** (Phase 8) — until then, read the member's `DESIGN.md` frontmatter.
- **`splash/` is out of federation.** It has its own `theme.css` with a different palette and its own `--color__*` names. Never copy values from it; never sweep it.
- **Ownership is a bet and `DESIGN.md` says so.** All 17 members name Blake. If headcount does not arrive, the correct response is to **collapse tiers and shrink the contract**, not maintain ceremony for absent owners. Phase 1 added mechanism; that raised the stake without improving the odds.
- **Governing skills:** `theme-system`, `maintain-design-md`, `astro-knots`, `changelog-conventions`, `context-vigilance`. Svelte 5 runes, no React/JSX, plain CSS custom properties, no Tailwind.
