---
version: "alpha"
name: "augment-it"
description: "A federated design system. One token vocabulary, sixteen sovereign micro-frontends. A dense monospace instrument panel for operating a multi-tenant record corpus — dark-native, three modes, 1px borders over elevation, one electric-magenta accent."
semantic_version: 0.1.0.1
date_created: 2026-07-30
date_modified: 2026-08-01
revisions:
  - 2026-07-30 — 0.0.1.0. Restructured from one central design system into a federal layer plus seventeen local ones. Two-layer model, F1–F9 contract, member index, tiering, promotion path. P9 inverted; P13 added.
  - 2026-07-30 — 0.0.2.0. **Architecture review remediation.** Added **F10** (the token layer is injected once, by the shell) after finding sixteen remotes each import `theme.css` into one document — F1 was a documentation convention, not a runtime property. Added **Tier 4 member-local custom properties**, closing the gap that forced members to hardcode genuinely-local values. Replaced the single whole-federation manifest with a **tiered context contract** under a stated small-context-window requirement. Re-based tiering on design surface area rather than CSS volume, with a promotion trigger. Made P9's test structural rather than byte-identical. Added the adoption ramp, the frontmatter schema, per-member a11y accountability, provisional tokens, and the token deprecation protocol.
  - 2026-08-01 — 0.0.3.0. **Two-tier token architecture, from Michael's feedback.** The two tiers already shipped for colour; this makes them a *rule* rather than a habit. Added **F11 — every Tier-2 token resolves to a Tier-1 named token**, which two `--fx-card-shadow` declarations violate today. Rewrote *Token architecture* to state the two-tier spine, the maintainability and AI-collaboration arguments, and **where Tier 1 is required versus where it is noise** (brand choices yes; dimensional scales no). Promoted the non-monotonic greyscale ramps from a footnote to a **named defect (A19)** — under a human-readable-names contract, a name that lies is worse for agents than a number. Added the **fidelity sweep loop** and the conditions for running it. Contract goes to **2.1** — additive for members, so no member re-validation is required.
  - 2026-08-01 — 0.0.3.1. **The fidelity sweep, fully documented.** Expanded *Enforcement — The fidelity sweep* into four parts: why the loop exists (three gaps the drift script cannot close), when **developers** run it, when **AI coding agents** run it — a distinct set of triggers, self-directed and diff-scoped, with four hard rules including *never self-authorise implement mode* — and how it preserves fidelity across the local and federal layers. Added the sweep as the one sanctioned exception to the two-file rule, and a review-checklist item for changes touching CSS or tokens. Documentation only; no contract change.
  - 2026-08-01 — 0.0.3.2. **Architecture review remediation (Michael).** Five contradictions, four of them introduced by 2.0/2.1. **F11 restated as a prohibition on literals** — the old wording ("resolves to a Tier-1 name") flags 13 declarations against the runtime, 11 of which are the `color-mix()` idiom *Derived tokens* recommends; composition over Tier 1 **or Tier 2** is now explicitly legal. **Effect tokens settled as Tier 3** and given their own table; the Tier-2 count corrects 24 → 21, and F11 binds Tiers 2 and 3. **P1 corrected** — it said components consume Tier 2 only, which forbade the effect tokens every card uses. **Staleness compares majors**, so "2.1 is additive" is now true rather than contradicted by the schema. **Tier 4 rule 4 made checkable** — it forbade "a colour" while rule 3 mandated composing from colour tokens. Gates raised but not decided — **A20** token introduction across independent deploys (the mirror of A16 — F10 made the shell the sole injector and nothing covers a member outrunning the deployed theme), **A21** logical vs physical properties, plus owners and dates on A19 and the `warn` exit, and the eleven `product-wide` a11y defects read as federal until the audit assigns them.
  - 2026-08-01 — **0.1.0.0 — Phases 0 and 1 IMPLEMENTED.** First version where the runtime moved rather than the prose. **Phase 0:** `scripts/design-drift.mjs` exists (`pnpm design:drift`) — the F1–F11 checks and the contrast measurement, zero dependencies, reading the member registry from this document's frontmatter. **Until now F1–F11 were prose; they are now checks.** **Phase 1:** ten missing colour tokens shipped in all three mode blocks; `--color-bg` aliased (closing 43 declarations that painted nothing in production); the four phantom warn dialects unified; `--focus-ring` added and the `strategy-curator` light-mode focus defect closed; global `prefers-reduced-motion` and `forced-colors` blocks; the shell's inline FOUC guard. **A19 resolved** — the three ramps renumbered so step numbers track lightness, verified a pure permutation by `--resolve` diff. **F11 debt cleared.** **R11 fired and was fixed:** contrast measurement found five real light-mode failures; `--color__ink-500` and `--color__amber-ink` darkened, and **all 108 text-on-surface pairs now pass 4.5:1**. **`--color-text-dim` rejected** — no legal value exists below muted in light. New gate **A22** — `--color-border` measures 1.2–1.5:1 and does not meet 3:1 for control boundaries.
  - 2026-08-01 — 0.1.0.1. **Post-implementation review remediation.** The Phase 1 review found the code sound and **the document wrong in seven places** — it still described the palette as it was before Phase 1 changed it. Worst case — §Colors warned the ramps were non-monotonic and cited `--color__graphite-700` as `#13151b`, when it is now `#232634`, **so an agent reading the document got the wrong hex**. Also corrected — the A19 block still offering two options "neither yet chosen"; the Tier-1 table missing the five tokens Phase 1 added; the Elevation ladder marking three shipped tokens 🔶; the effect-token table listing 3 of 4 and still claiming the F11 debt was open; the frontmatter `colors:` block missing all 10 new tokens; and the Tier-2 table having no role rows for them. **Root cause — nothing checks the document against the runtime** — the drift script compares CSS to CSS. Added **F1a** to the drift script, which catches a member *consuming* a Tier-1 name (F1 only caught *declaring* one); it found three real violations, all reading `var(--font__mono)` instead of `--font-mono`, now fixed. **That check would have caught a near-miss — A19 was safe only because it happened not to touch the font tokens.**
token_status:
  colors: shipped
  typography: "family shipped; scale proposed"
  rounded: proposed
  spacing: proposed
  sizing: proposed
  layering: proposed
  motion: "one value shipped; scale proposed"
federation:
  layer: federal
  contract_version: "2.1"
  contract_version_note: "2.1 adds F11 (Tier 2 resolves to Tier 1). Additive — it binds packages/theme, not members, so no member re-validation. 2.0 broke 1.0: F10 added, F1 amended for Tier 4."
  adoption_phase: warn          # warn | fail — see §Enforcement, The adoption ramp
  local_doc_path: "<member>/DESIGN.md"
  portal: "apps/docs-portal"
  fidelity_loop: "context-v/loops/Sweep-Local-Federated-Design-System-for-Fidelity.md"
  context:                      # agent entry points — see §Reading this system
    index: "design-index.json"        # ~2 KB, always safe to load
    member_fragment: "<member>/.design-context.json"
    full_manifest: "design-manifest.json"
  out_of_federation:
    - { path: splash, reason: "Separate design system — marketing site, light-default, different accent. Not a member; never a token source." }
  # status: registered = prefix and root_class READ FROM CODE. proposed = this document's proposal; no code exists.
  # tier   = documentation depth, from design surface area (components + owned patterns). NOT CSS volume — see §Local design systems.
  # debt   = remediation weight. Independent of tier: a member can own little design and carry large debt.
  members:
    - { name: shell,                       path: shell,                          prefix: shell, root_class: ".app-shell",       tier: A, debt: med,  status: registered, doc: shell/DESIGN.md }
    - { name: records-surface,             path: apps/records-surface,           prefix: rs,    root_class: ".records-surface", tier: A, debt: low,  status: registered, doc: apps/records-surface/DESIGN.md }
    - { name: person-enrichment,           path: apps/person-enrichment,         prefix: pe,    root_class: ".pe-app",          tier: A, debt: high, status: registered, doc: apps/person-enrichment/DESIGN.md }
    - { name: response-reviewer,           path: apps/response-reviewer,         prefix: resp,  root_class: ".resp-app",        tier: A, debt: med,  status: registered, doc: apps/response-reviewer/DESIGN.md }
    - { name: chat,                        path: apps/chat,                      prefix: chat,  root_class: ".chat-app",        tier: A, debt: med,  status: registered, doc: apps/chat/DESIGN.md }
    - { name: strategy-curator,            path: apps/strategy-curator,          prefix: sc,    root_class: ".sc-app",          tier: B, debt: high, status: registered, doc: apps/strategy-curator/DESIGN.md }
    - { name: record-collector,            path: apps/record-collector,          prefix: rc,    root_class: ".rc-app",          tier: B, debt: low,  status: registered, doc: apps/record-collector/DESIGN.md }
    - { name: pack-runner,                 path: apps/pack-runner,               prefix: pr,    root_class: ".pr-app",          tier: B, debt: high, status: registered, doc: apps/pack-runner/DESIGN.md }
    - { name: enhanced-records-list,       path: apps/enhanced-records-list,     prefix: erl,   root_class: ".erl-app",         tier: B, debt: low,  status: registered, doc: apps/enhanced-records-list/DESIGN.md }
    - { name: sort-filter-lens,            path: apps/sort-filter-lens,          prefix: sfl,   root_class: ".sort-filter-lens", tier: B, debt: critical, status: registered, doc: apps/sort-filter-lens/DESIGN.md }
    - { name: request-reviewer,            path: apps/request-reviewer,          prefix: req,   root_class: ".req-app",         tier: C, debt: none, status: registered, doc: apps/request-reviewer/DESIGN.md }
    - { name: prompt-template-manager,     path: apps/prompt-template-manager,   prefix: ptm,   root_class: ".ptm-app",         tier: C, debt: low,  status: registered, doc: apps/prompt-template-manager/DESIGN.md }
    - { name: person-db-resolver,          path: apps/person-db-resolver,        prefix: pdr,   root_class: ".pdr-app",         tier: C, debt: med,  status: registered, doc: apps/person-db-resolver/DESIGN.md, family: resolver, family_role: document }
    - { name: record-db-resolver,          path: apps/record-db-resolver,        prefix: rdr,   root_class: ".rdr-app",         tier: C, debt: med,  status: registered, doc: apps/record-db-resolver/DESIGN.md, family: resolver }
    - { name: affiliation-rating-resolver, path: apps/affiliation-rating-resolver, prefix: arr, root_class: ".arr-app",         tier: C, debt: med,  status: registered, doc: apps/affiliation-rating-resolver/DESIGN.md, family: resolver }
    - { name: highlight-collector,         path: apps/highlight-collector,       prefix: hc,    root_class: ".hc-app",          tier: C, debt: none, status: proposed, built: false, doc: apps/highlight-collector/DESIGN.md }
    - { name: insight-manager,             path: apps/insight-manager,           prefix: im,    root_class: ".im-app",          tier: C, debt: none, status: proposed, built: false, doc: apps/insight-manager/DESIGN.md }
  libraries:
    - { name: theme,      path: packages/theme,      role: "federal token source of truth", doc: packages/theme/DESIGN.md }
    - { name: shared-ui,  path: packages/shared-ui,  role: "opt-in primitives",             doc: packages/shared-ui/DESIGN.md }
# Resolved DARK values (the :root default). Light and vibrant re-point the same
# semantic names — see `modes:` and §Colors. Regenerate with `node scripts/design-drift.mjs --resolve`.
colors:
  background: "#0f1115"
  surface: "#13151b"
  surface2: "#16181f"
  surfaceRaised: "#0c0d12"
  bgElevated: "#1a1d27"
  field: "#16181f"
  border: "#232634"
  borderStrong: "#646785"
  text: "#e8eaf0"
  textMuted: "#8a8f9b"
  primary: "#c75bfb"
  secondary: "#5bbcfb"
  accentWarm: "#f5c971"
  onPrimary: "#0f1115"
  focusRing: "#c75bfb"
  link: "#5bbcfb"
  thread: "#232634"
  okBg: "#1b3d2f"
  okText: "#a4e3b5"
  errorBg: "#3d1b1b"
  errorText: "#f29a9a"
  warnBg: "#3d2c0c"
  warnText: "#f5c971"
  confidenceLow: "#f29a9a"
  confidenceMed: "#f5c971"
  confidenceHigh: "#a4e3b5"
modes:
  dark:
    label: "The native look. Code-editor feel, moderate intensity. The :root default."
    ramp: "graphite / mist"
    accent: "#c75bfb"
  light:
    label: "Warm paper, dark ink. High readability."
    ramp: "paper / ink"
    accent: "#9a3fd4"
  vibrant:
    label: "Dark-based, louder accent, real glows. NOT light-based."
    ramp: "void / halo"
    accent: "#d96bff"
typography:
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace"
  baseSize: "13px"
  baseLineHeight: 1.45
  micro: "10px"
  label: "11px"
  body: "13px"
  emphasis: "15px"
  heading: "18px"
  display: "28px"
rounded:
  sm: "2px"
  md: "4px"
  lg: "8px"
  full: "999px"
spacing:
  hairline: "1px"
  "3xs": "2px"
  "2xs": "4px"
  xs: "6px"
  sm: "8px"
  md: "10px"
  lg: "12px"
  xl: "16px"
  "2xl": "24px"
  "3xl": "32px"
components:
  - ConfidencePill
  - ToggleHeader__PromptOrPackage--Icons
---

# augment-it — Federal Design System

> The runtime source of truth is `packages/theme/theme.css`.
> This document is the human- and agent-readable contract that explains intent.
> Keep the two in sync when either changes.

**Version** 0.0.3.0 · **Contract** 2.1 · **Owner** Blake · **Last verified against runtime** 2026-08-01

**Status markers used throughout:**
✅ in `packages/theme/theme.css` today · 🔶 proposed, not yet in runtime · ⚠️ known defect · 🚪 decision gate, resolved at a named milestone.

**There must be no permanent 🔶.** Every proposed token either ships and becomes ✅, or is deleted. The roadmap that lands them is [[context-v/plans/Impose-the-Full-Token-Vocabulary-on-augment-it]].

**On method.** This document was written before the tokens it describes were implemented, which inverts the usual discipline. Three things keep it honest: every proposed value is **derived by clustering the measured distributions** in the existing 74 stylesheets (see [[context-v/explorations/Design-Language-Audit-2026-07]]), never invented; every token carries a status marker; and anything that cannot be settled from a distribution is marked 🚪 and decided by inspection at the portal, not asserted here.

---

## Overview — Brand & Style

augment-it is a **dense monospace instrument panel**. Not a consumer application that happens to be dark — a control surface for an operator working a multi-tenant record corpus. Every visual decision follows from that.

- **Monospace only.** `--font-mono` is the sole typeface token. Body is `13px/1.45`. There is no sans, no display face.
- **Small type.** The bulk of the interface runs 9–12px; `11px` alone accounts for 89 declarations. Deliberate density, and it drives every requirement in *Accessibility*.
- **Elevation is drawn, not cast.** A 1px border plus a surface-colour step does the work shadows do elsewhere. Of ~64 bounded surfaces in the product, 51 carry no shadow at all.
- **Dark-native.** Dark is the `:root` default. Light and vibrant are re-pointings, not inversions of a light-first design.
- **One magenta.** `#c75bfb` electric magenta, with cyan secondary. Uppercase tracked micro-labels carry the accent in text form.
- **Small radii.** Everything lives between 2px and 8px, plus pills for chips and 50% for avatars.
- **Desktop-only, fixed layout.** Header 56px, flow rail 64px, chat rail 360px, all hardcoded. See *Layout & Spacing*.

### Dual identity

augment-it is simultaneously a **working application** and a **demonstration of microservice + micro-frontend + API-first architecture**. Every affordance should work for an outside operator *and* make the underlying architecture legible to a demo visitor. When the two pull apart, name the tension in the spec rather than silently picking one. This applies to visual decisions as much as interaction ones.

### The two-layer model

**This is the organising idea of the entire system.** augment-it is not one design system. It is **one federal layer plus seventeen local ones**.

| | **Federal layer** | **Local layer** |
|---|---|---|
| **Owns** | Tokens, namespace contract, layering, a11y floor, motion vocabulary, content voice, the documentation contract, enforcement | Component library, composition patterns, layout, interaction idioms |
| **Lives in** | `packages/theme` + **this document** | `<member>/src` + `<member>/DESIGN.md` |
| **Why it is global** | 16 remotes mount into **one** `<html>`. Selector names, `@keyframes` names, `z-index` values and `data-mode` are a **public API** (E2). | Nothing outside a remote depends on how it builds its own surfaces. |
| **Who changes it** | Architecture approval; drift script enforces | The remote's author, unilaterally |

**Tokens federate. Components localise.** The unit of ownership is the remote; the unit of consistency is the token vocabulary. This is what keeps three modes costing one attribute instead of seventeen stylesheets.

**Why federation and not one central library.** Sixteen remotes are built and deployed independently by different people at different times. A central component library makes every one of them wait on a single queue, and — measurably — they did not wait: 158 button rule-sets, 13 card recipes, 34 badge treatments and 6 spinners were built anyway. Federation accepts that reality and makes it safe, rather than pretending a queue that nobody used is a governance model.

**What federation is not.** It is not permission to fork the token vocabulary, leak selectors, or invent a fourth mode. Those are the things that make sixteen independent systems *unsafe* in a shared document, and they are exactly what the federal layer holds.

### The three-mode contract ✅

Three modes, always — not two. Switched by `data-mode` on `<html>`, persisted at `localStorage['augment-it:mode']`, default `dark`. **Federal — a remote never implements modes.**

| Mode | Character | Ramp |
|---|---|---|
| `dark` | The native look. Code-editor feel. `:root` default. | `--color__graphite-*`, `--color__mist-*` |
| `light` | Warm paper, dark ink. | `--color__paper-*`, `--color__ink-*` |
| `vibrant` | **Dark-based**, louder accent, real glows. | `--color__void-*`, `--color__halo-*` |

**Critical:** vibrant is dark-based. The common industry failure is vibrant inheriting light's white background; augment-it gets this right, which is why the `--color__void-*` ramp exists at all.

### Token architecture ✅

**Two tiers are the spine of this system.** Everything else in this section is an extension of them.

```
Tier 1 — named tokens     --color__magenta-electric   THE THINGS WE HAVE — raw values, `__`, FEDERAL
Tier 2 — semantic tokens  --color-accent              THE JOBS THEY DO   — var() → Tier 1,  FEDERAL
─────────────────────────────────────────────────────────────────────────────────────────────────
Tier 3 — effect tokens    --fx-card-shadow            composite, per-mode intensity,  F11 too, FEDERAL
Tier 4 — member-local     --resp-col-request          one member's own values, prefixed,      LOCAL
```

**Tier 3 is not a third naming layer** — it is Tier 2 for values that are *composite* rather than single (a shadow, a glow). It carries the same rules: consumed by components, declared in all three modes, no literal colour (**F11**).

**Tier 1 names a value. Tier 2 assigns it a job.** The whole architecture is that one indirection:

```css
/* Tier 1 — the palette. Written once. Never read by a component. */
--color__magenta-electric: #c75bfb;
--color__amber-bright:     #f5c971;

/* Tier 2 — the vocabulary. Points at Tier 1. This is what components read. */
--color-accent:            var(--color__magenta-electric);
--color-confidence-med:    var(--color__amber-bright);
```

Components reference **only** Tier 2 and Tier 3 for anything shared. **Tiers 1–3 are federal.** A member that declares its own Tier-1/2/3 token has forked the vocabulary — drift check **F1** fails.

**No literal colour in Tier 2 or Tier 3.** A semantic or effect token resolves to a Tier-1 name, or **composes** — `color-mix()`, shadow syntax — over a Tier-1 **or Tier-2** token. Drift check **F11**. A literal in Tier 2 or 3 is a colour that exists in the product and has no name, which is the state this architecture exists to prevent.

⚠️ **Two declarations violate this today** — `--fx-card-shadow` carries `rgba(0, 0, 0, 0.35)` in dark and `rgba(27, 29, 34, 0.08)` in light. Vibrant already does it correctly, over `--color__magenta-loud`.

**Composition over Tier 2 is legal and preferred.** An earlier draft of F11 required every Tier-2 token to resolve to a *Tier-1* name. Counted against the runtime, that wording flags **13 declarations — and 11 of them are correct.** `--color-selected-tint`, `--color-danger-tint`, `--fx-accent-glow` and `--fx-flash` compose over `--color-accent` and `--color-error-text` across the three mode blocks, exactly as *Derived tokens* below instructs. Only `--fx-card-shadow` in vibrant composes over a Tier-1 name; the other twelve `color-mix()` declarations reach Tier 1 *through* Tier 2, which is the point of having tiers.

**A rule that fails the idiom the same document recommends is a wrong rule, not a strict one.** F11 prohibits literals; it does not mandate a tier to point at.

#### Why two tiers — maintainability

**1. Re-skinning becomes a re-pointing.** Change the accent and you edit one line per mode:

```css
--color-accent: var(--color__amber-bright);   /* was --color__magenta-electric */
```

**Three lines, one file, and no component changes** — because no component ever knew the hex. Without the indirection the same change is a find-and-replace across 74 stylesheets in sixteen independently-deployed units, matching a string that is invisible to review and easy to write four different ways.

**2. Three modes cost one indirection instead of three palettes.** `--color-accent` resolves to `magenta-electric` in dark, `magenta-deep` in light and `magenta-loud` in vibrant. Tier 1 is what lets us *say* that those three are one brand colour at three intensities. Strip Tier 1 and that fact is unrepresentable — you have three unrelated hex values in three blocks, and nothing records that they move together. **The first thing that breaks is not the code; it is the ability to describe the design.**

**3. Duplication becomes visible.** Two roles pointing at one Tier-1 name is a fact you can see in the source. Two roles holding the same hex is a coincidence nobody notices until one of them is updated and the other is not. The audit's 158 button rule-sets and 34 badge treatments have a governance cause (§*Why federation and not one central library*), but they were **findable** only because someone went looking — sameness that shares a name is visible without an audit.

**4. The blast radius splits into three — and this is the federated argument.** In a system with seventeen independently-deployed members, the most important property of a token change is **how far it reaches**:

| Change | Reach | Review |
|---|---|---|
| **Add a Tier-1 name** | Zero until something points at it | Additive. Safe. |
| **Re-point a Tier-2 token** | **All 17 members, in one mode** | Federal approval + Gate A17 |
| **Change a Tier-1 value in place** | Every Tier-2 token pointing at it, all modes | Federal approval. Rare, and it should be. |

Without two tiers there is one operation — *edit a hex* — and it silently occupies all three rows. **The architecture is what makes the cheap change cheap and the expensive change visible.** Against a 17-member blast radius with no per-member visual regression (🚪 A17), that distinction is the main control we have.

**5. Diffs stay readable.** A palette change reads as a palette diff, in one file, at the top of the theme. The same change without Tier 1 is scattered hex edits across sixteen deploy units — which is not reviewable, and therefore is not reviewed.

#### Why two tiers — AI collaboration

This is a first-class requirement here, not a bonus. Most CSS in this product will be written by agents, and every failure mode below has already been measured in it.

**1. Names carry intent; hex carries nothing.** An agent told *"make the error state read louder in vibrant"* can act on `--color-error-text`. Given `#f29a9a` it has to work out which of the codebase's several pinks is the error one — and when that is unclear the cheapest move is to invent a new one. That is the mechanism behind 47% of shadows being hardcoded and 33 fallbacks pointing at tokens that do not exist.

**2. Tier 1 is a closed vocabulary of legal moves.** It answers *"what colours does this product have?"* in one list. The correct agent action for a new colour need becomes: **point an existing Tier-2 role at an existing Tier-1 name, or raise a federal gap** — never emit a hex. A closed list also makes the wrong action *checkable*: "did the agent invent a colour?" is `rg '#[0-9a-f]{6}'` outside `packages/theme` (F8). **Without two tiers there is no line to check against, so there is no check.**

**3. Names survive context compression; values do not.** Member context fragments carry token *names*, not values, under a ≤4 KB budget (see *Reading this system*). `--color-accent → --color__magenta-electric` is meaningful in isolation. `#c75bfb` is not, and embedding values would fork the theme the moment one changed. **Human-readable Tier-1 names are what make the small-context contract work at all** — they are the compression.

**4. Two tiers give an agent somewhere correct to put a new value.** The most common agent failure in a token system is *"the value I need has no token, so I'll hardcode it."* With two tiers there is always a legal move: add a Tier-1 name, point a Tier-2 role at it, or — when it is genuinely nobody else's business — declare it Tier 4. Contract 1.0 forbade all three of those and got hardcoding instead, which is the lesson recorded under *Tier 4* below.

**5. Review gets cheaper.** A reviewer reading agent-written CSS checks one thing: *does every value come from a token?* That is a mechanical read, and it scales. Judging whether a screenful of hex values are the *right* hex values does not.

⚠️ **The corollary, and it cuts the other way.** Agents extrapolate from naming conventions far more confidently than humans do. **A Tier-1 name that lies is worse than no name at all** — an agent that sees `--color__graphite-900` and `--color__graphite-700` will assume the first is darker, reason from it, and be wrong. See *Colors* and 🚪 **A19**.

#### Where Tier 1 is required, and where it is noise

**Required — the value is a brand choice:**

| Family | Tier 1 | Status |
|---|---|---|
| Colour | `--color__magenta-electric`, `--color__amber-bright` | ✅ shipped |
| Typeface | `--font__mono` | ✅ shipped |
| Effect colour | the `rgba()` inside `--fx-*` | ⚠️ **missing — F11 violation, see above** |
| Motion easing | `--ease__standard` and friends | 🔶 |

**Not required — the token is already dimensional:** `--space-*`, `--text-*` (sizes), `--radius-*`, `--control-h-*`, `--z-*`, durations.

`--space-md: 10px` gains nothing from `--space__10: 10px; --space-md: var(--space__10)`. The indirection exists so a *role* can be re-pointed at a *different named thing*; a dimensional scale has no second thing to point at, and the name would just restate the number. **Adding Tier 1 here would be ceremony, and ceremony is what makes people stop following a convention.**

**The test:** *could this value plausibly be swapped for a different one that already has a name?* Colours yes — that is re-skinning. `10px` no.

⚠️ **This rule is why F11 binds `packages/theme` and not members.** It constrains how the federal theme is authored. No member action is required, which is why contract 2.1 is additive.

### Tier 4 — member-local custom properties

*Added at contract 2.0. Contract 1.0 forbade all local properties, which left members with genuinely-local repeated values only two options: hardcode them, or raise a federal gap for a value nobody else will ever use. **Hardcoding is how the 33 dead fallbacks and the 21 `grid-template-columns` variants happened.** Forbidding the honest option does not prevent the value; it prevents the value from having a name.*

A member **may** declare custom properties for values that are genuinely its own:

```css
.resp-app {
  --resp-col-request: 42%;      /* this member's two-column split */
  --resp-measure-max: 68ch;     /* its reading measure — see its Deviations */
}
```

**Rules:**

1. **Prefixed with the member's registered prefix.** `--resp-*`, `--pe-*`. The prefix is what keeps sixteen local vocabularies from colliding in one document — same reasoning as F3 for selectors.
2. **Declared on the member's root class**, never on `:root`. A Tier 4 property on `:root` is a federal token wearing a disguise.
3. **Composed from Tier 2/3 where a federal token exists.** `--pe-row-gap: var(--space-2xs)` is right; `--pe-row-gap: 4px` re-forks the spacing scale.
4. **Never a *literal* colour, type size, radius or shadow.** Those categories are federal. Tier 4 is for *geometry that is nobody else's business* — column splits, local grid templates, measure limits.

   ⚠️ **Stated as "never a colour", this rule was unenforceable and contradicted rule 3.** Rule 3 tells a member to compose from federal tokens, so `--pe-panel-tint: color-mix(in srgb, var(--color-accent) 6%, transparent)` obeys rule 3 and — under the old wording — violated rule 4. A script classifies by value shape, and `var()` defeats that. **The line is the literal, exactly as in F11:** composing over a federal token is always legal; writing `#3a2f1b` or `13px` is not, whatever the property is named.
5. **Listed in the member's `tokens_member:` frontmatter**, so the portal can show them and the drift script can check rule 4.

**The test:** *would another member ever want this value?* If yes it is a federal gap — raise it. If genuinely not, it is Tier 4.

⚠️ **Tier 4 is not an escape hatch from F1.** A member declaring `--pe-accent` has forked the palette regardless of the prefix, and drift check `F1` fails on the *category*, not the name.

#### Naming rules

**Tier 1 is named for what the thing *is*, in words a person would use.** `magenta-electric`, `amber-bright`, `green-neon`. Never `--color__brand-1`, never `--color__c75bfb`, never a name encoding where it is used — a Tier-1 name that says *where* it is used has silently become a Tier-2 token and will be wrong the first time it is used somewhere else.

Three rules, in priority order:

1. **Legible without the value.** If you cannot picture it from the name, rename it. `burnt-orange` passes; `--color__o3` does not.
2. **True.** A name implying an ordering must honour it — `-900` darker than `-700` on the dark ramps, lighter on the light ones, consistently. ⚠️ **Three of our ramps break this today** (🚪 A19). For agents this is the most damaging kind of name, because it is confidently wrong rather than merely uninformative.
3. **Appearance, not role.** Tier 1 says `red-bright`; Tier 2 says `--color-error-text`. Inverting these is how you end up with `--color__error` pointed at green for a "success-danger" state nobody can name.

**Tier 2 is named for the job.** Colour, typography and layering are **role-named**; spacing, radius and sizing are **dimensional**. This is deliberate: `--text-sm` invites the question "which small?" — the exact question that produced 35 font sizes — whereas `--text-label` forces the author to state intent. A padding genuinely has no single job, so a dimensional name is honest there.

**Deliberately not tokens: breakpoints.** CSS custom properties do not work inside `@media` conditions. `@media (max-width: var(--bp-md))` is invalid and silently never matches. Tokenising them would produce a scale that looks authoritative and does nothing.

---

## The federation contract

*Off-spec extension. This section is the constitution: the rules a local design system may not break, each mapped to an enforcement check. Everything else in this document is vocabulary; this is law.*

| # | Rule | Why it is federal | Check |
|---|---|---|---|
| **F1** | **The shared token vocabulary is federal.** No member declares a Tier-1, Tier-2 or Tier-3 custom property. Members *consume* Tier 2 and Tier 3, and may declare **Tier 4 member-local properties** under their own prefix (see *Token architecture*). | A forked shared token is invisible until a mode switch, then it is wrong in two of three modes. | `F1` |
| **F2** | **Every member has a unique prefix and root class**, registered in `federation.members` above. | Two remotes claiming `.row-name` is decided by chunk load order. | `F2` |
| **F3** | **Every selector descends from the member's root class.** No bare element selectors, no unprefixed top-level classes. (P7) | 99 unnamespaced selectors in one remote currently restyle every other remote on screen. | `F3` |
| **F4** | **`z-index` comes only from the federal `--z-*` tokens**, and remotes use only the four remote-local ones. No raw integers. (P8) | Remotes are deployed independently; a raw number cannot be coordinated after the fact. | `F4` |
| **F5** | **`mount.ts` never imports `mode-switcher`.** The shell owns the single `<html>` and its `data-mode`. (E2) | Two mode-switchers race and the loser's mode silently wins. | `F5` |
| **F6** | **Every member publishes a `DESIGN.md`** at its deterministic path. A member without one **fails CI**. | The portal aggregates by glob; an undocumented remote is invisible to humans and agents alike. | `F6` |
| **F7** | **The a11y floor is federal**: text ≥4.5:1, UI boundaries ≥3:1, targets ≥`--control-h-sm` or a documented spacing exception, `:focus-visible` only, every interactive element has an accessible name. | A remote below the floor makes the *product* non-conformant, not just itself. | `F7` |
| **F8** | **No hardcoded hex, `box-shadow`, or `@keyframes` name outside `packages/theme`.** Keyframe names are global. | 47% of shadows are hardcoded and none react to mode. | `F8` |
| **F9** | **A local deviation from any federal rule is declared** in the member's `DESIGN.md` under *Deviations*, with a justification and a 🚪 gate. | An undeclared deviation is indistinguishable from a bug. | `F9` |
| **F10** | **The token layer is injected once, by the shell.** A member's `mount.ts` never imports `theme.css`. Its standalone `index.ts` still does. | ⚠️ **Sixteen members currently import `theme.css` into one document.** Under independent deploys that is sixteen possibly-different copies of the federal vocabulary racing on chunk load order. See *The runtime token contract*. | `F10` |
| **F11** | **No literal colour in a Tier-2 or Tier-3 declaration.** It resolves to a Tier-1 name, or composes — `color-mix()`, shadow syntax — over a Tier-1 **or Tier-2** token. **Binds `packages/theme` only; members take no action.** | A literal in Tier 2 or 3 is a value that exists in the product and has no name — invisible to re-skinning, to the portal, and to every agent reading names rather than values. ⚠️ **Two `--fx-card-shadow` declarations violate this today.** | `F11` |

**The contract is versioned.** `federation.contract_version` is `2.1`. A **breaking** change to F1–F11 bumps the **major** version and requires every member's `DESIGN.md` to be re-validated. **F11 is additive** — it constrains how the federal theme is authored, not what members may do — so 2.1 requires no re-validation.

⚠️ **Staleness compares majors only.** A member declaring `2.0` against a federal `2.1` is **current**, not stale — otherwise "additive" would be false the moment it was written, since all seventeen members declare the contract version they were validated against. A member is stale when its **major** trails the federal major.

### What a local system may do without asking

Everything else. Specifically: build any component it needs, choose its own composition and layout idioms, define its own interaction patterns, declare Tier 4 properties under its own prefix, write its own copy within the federal voice, and decline to use anything in `shared-ui`.

---

## The runtime token contract

*Off-spec extension. Added at contract 2.0 after an architecture review found that F1 described a documentation convention rather than a runtime property.*

### The defect

**Every member imports the federal token layer into its own bundle.** Verified 2026-07-30:

```
apps/chat/src/mount.ts:11            import '@augment-it/theme/theme.css';
apps/pack-runner/src/mount.ts:7      import '@augment-it/theme/theme.css';
apps/record-collector/src/mount.ts:17 import '@augment-it/theme/theme.css';
shell/src/index.ts:4                 import '@augment-it/theme/theme.css';   ← the shell already loads it
```

Sixteen members plus the shell inject `theme.css` into **one** `document.head`. Today they agree, because they are built from one working tree. **Independent deployment is precisely the condition under which they stop agreeing** — and when two copies disagree, the last chunk to evaluate wins every token whose value changed. Load order is navigation-dependent, so the winner can differ between two sessions of the same build.

**This is the failure mode federation introduces and centralisation did not have.** It is why F10 exists.

### The rule (F10)

| Entry point | Imports `theme.css`? | Why |
|---|---|---|
| `index.ts` — standalone dev on `:300x` | **Yes** | There is no shell. The member must bring its own tokens. |
| `mount.ts` — federated into the shell | **No** | The shell owns the single `<html>` and loads the token layer once. |

This is **exactly parallel to F5**, which already forbids `mount.ts` from importing `mode-switcher` for the same reason: the shell owns the document.

**Why this is safe.** The existing comment in `mount.ts` justifies the side-effect imports because *"Svelte's `append_styles` doesn't fire reliably across the federation chunk boundary."* That reasoning is correct **for `./app.css`** — a member's own styles must ship with the member. It does not extend to `theme.css`, which the shell has already loaded. `import './app.css'` stays; only the theme import goes.

🚪 **Gate (A15), resolved at M2.** Verify in the mounted context that removing the theme import from one member leaves it fully themed in all three modes. **Do one member first, not sixteen.** If tokens vanish, the shell's import is being tree-shaken or scoped and the fix is at the shell, not in the members.

⚠️ **Consequence to accept deliberately:** a member mounted into *any host other than the shell* will have no tokens. E6 names exactly two mount contexts — standalone and in-shell — so this is in scope today. A third host would have to load the token layer itself.

### Token deprecation across independent deploys

E8 says *"delete on migration, never leave the old path."* **Under independent deploys that instruction is unexecutable as written** — you cannot delete a token when you do not know that every consumer has redeployed. The planned `--color-bg` alias-then-retire is the live case.

Three phases, and **the gate between 2 and 3 is a deploy fact, not a code fact**:

| Phase | Action | Exit condition |
|---|---|---|
| **1 — Add** | New token ships alongside the old. Both defined in all three modes. | Both present in `theme.css` |
| **2 — Alias** | Old token becomes `var(--new)`. Members migrate at their own pace. Drift **warns** on the old name. | Zero references to the old name across all members **in `main`** |
| **3 — Retire** | Old token deleted. | **Every member has redeployed since phase 2 completed.** Until then, deleting it breaks any member still serving an older chunk. |

**Phase 3 requires a deployment ledger the project does not have.** Until it does, a retired token stays aliased — an accepted cost of independent deployment, and cheaper than a member painting nothing in production.

🚪 **Gate (A16):** who tracks per-member deploy state? Without an answer, phase 3 never fires and the alias is permanent. **Owner: Michael (architecture).**

### Token introduction across independent deploys ⚠️

*Added at 0.0.3.2. **This section was missing, and it is the mirror of the one above.** Contract 2.0 reasoned carefully about a member serving an **old** chunk after a token is retired. It never considered a member serving a **new** chunk before a token is introduced.*

**F10 made the shell the sole injector of the token layer. That solved the race and created a dependency.** The shell ships `theme.css`; members deploy independently and on their own schedule. So:

> A member deployed on Tuesday against `--color-warn-bg` renders **unstyled on that surface** until the shell redeploys with a theme that defines it.

**Retirement is survivable; introduction is not.** A retired token can stay aliased forever at the cost of one dead line — that is the accepted trade above. A token that does not yet exist has no fallback, resolves to nothing, and produces exactly the P3 failure the drift script's first check exists to catch — except in production, and not visible in any member's own repository.

**Why this has not bitten yet:** everything is built from one working tree, which is the same reason F10's defect was invisible until someone looked. **The condition that exposes it is independent deployment — the premise of the whole architecture.**

Three candidate mechanisms, none chosen:

| | Mechanism | Cost |
|---|---|---|
| **(a)** | **Member declares a minimum `theme_version`**; the shell refuses to mount a member whose minimum exceeds the theme it loaded, and says so. | Needs a version on the theme package and a mount-time check. Fails loudly, which is right. |
| **(b)** | **Provisional-until-confirmed.** A member may not reference a federal token until the drift script confirms it is present in the *deployed* shell, not just in `main`. | No runtime cost; needs the same deploy ledger as A16. |
| **(c)** | **Accept it** — token introduction always precedes member adoption by a full shell deploy, enforced socially. | Free, and it is what we do today by accident rather than by decision. |

🚪 **Gate (A20) — how does a member depend on a token the deployed shell may not have?** **Owner: Michael (architecture).** Pairs with A16: **A16 is retirement, A20 is introduction, and they need the same deploy-state answer.** Until A20 is closed, a member adopting a newly-shipped federal token should treat it as a **provisional Tier 4 property** until the shell carrying it is known to be live.

⚠️ **Related and also unnamed: there is no rollback path for a federal token change.** Blast radius is all 17 members (A17), there is no per-member visual regression, and the theme is coupled to the shell's deploy — so the remedy for a bad token value is a shell redeploy affecting everything. **Fold this into A17 rather than treating "we can revert the commit" as a control.**

---

## Reading this system

*Off-spec extension. The contract for the second audience — coding agents working under a small context window.*

**The constraint that shapes this section:** this document is over a thousand lines. The federation totals ~180 KB of prose. **An agent that must read the federal document to change a button has already lost**, and one that loads the whole federation has spent its window before it starts.

**So the prose is for humans. Agents read JSON fragments.** Documentation depth and context cost are decoupled on purpose — a Tier A member can carry a long document without making it expensive to work in.

### The three artifacts

| Artifact | Size | Who loads it | Contains |
|---|---|---|---|
| **`design-index.json`** | ~2 KB | Any agent, always safe | The map only: every member's name, path, prefix, root class, tier, doc path. Nothing else. |
| **`<member>/.design-context.json`** | ~1–3 KB | An agent working *in that member* | Everything needed to write correct code there: prefix, root class, z-tokens, Tier 4 properties, local components, open deviations, **and the resolved federal token names** |
| **`design-manifest.json`** | ~40 KB | The portal build; agents only on explicit request | The full federation — every member, every token with values in all three modes, every deviation |

**All three are generated.** The source of truth is the frontmatter of the 20 documents; nothing is hand-maintained twice.

### The two-file rule

> **To work in member X, an agent reads exactly two files:**
> **1.** `<member>/.design-context.json` — what it may do
> **2.** the file it is changing
>
> **It should not need `DESIGN.md`, the member's own `DESIGN.md`, or the manifest.**

If a routine change cannot be made correctly from those two, the member's context fragment is missing a field — **that is a defect in this contract, not a reason to read more.**

The acceptance test in [[context-v/specs/Federated-Design-System-Architecture]] §8 exercises exactly this: *add a button to `pack-runner`* must reach the right prefix, root class, z-token and token names from the fragment alone.

**The one sanctioned exception is a fidelity sweep.** [[context-v/loops/Sweep-Local-Federated-Design-System-for-Fidelity]] deliberately reads the member's whole CSS surface, its `DESIGN.md` — including *Deviations*, which it must not "correct" — and the federal theme. **That is a task, not a preamble.** An agent that sweeps before every small edit has spent its context window on ceremony and defeated the budget this section exists to protect. See *Enforcement — The fidelity sweep* for the agent triggers.

### What a fragment carries

```jsonc
{
  "member": "pack-runner",
  "prefix": "pr",
  "root_class": ".pr-app",
  "contract_version": "2.0",
  "rules": {                        // the F-checks, as machine-checkable claims
    "selectors_must_descend_from": ".pr-app",
    "z_index": ["--z-raised", "--z-remote-overlay"],
    "no_raw_z_integers": true,
    "tokens_forbidden": "tier1|tier2|tier3",
    "tokens_member_prefix": "--pr-",
    "mount_ts_imports_theme": false
  },
  "tokens_available": ["--color-accent", "--space-md", "..."],  // NAMES only, not values
  "tokens_member": [],
  "components_local": ["ConnectorChip", "ConnectorPalette"],
  "shared_ui_available": ["ConfidencePill"],
  "open_deviations": ["D1 leaked .row-* globals", "D2 raw z-index 50"],
  "docs": { "local": "apps/pack-runner/DESIGN.md", "federal": "DESIGN.md" }
}
```

**Token *names*, not values.** An agent writing CSS needs to know `--space-md` exists and is legal; it does not need `10px`. Names cost a fraction of values × three modes, and values in a fragment would fork the theme the moment one changed. Values live in the manifest, for the portal.

**Rules as data, not prose.** `"no_raw_z_integers": true` is checkable. *"Layering is a contract between remotes, not a number in a file"* is not — that sentence is for the human reading P8.

### Budgets

| Load | Budget | Note |
|---|---|---|
| Index | ≤ 3 KB | Hard. It exists to be loaded unconditionally. |
| Member fragment | ≤ 4 KB | A member exceeding this has a design problem, not a documentation problem |
| Index + fragment | ≤ 6 KB | **The routine working set.** |
| Full manifest | ~40 KB | Explicit request only |

**These budgets are enforced at portal build.** A fragment over budget fails the build, which keeps the fragment honest as members grow — the failure mode otherwise is that fragments quietly become documents.

### For humans

Read this document once, then your member's document. Everything above is machine plumbing; you are not expected to read JSON.

---

## Design principles

**Earned, not invented.** Per the house rule in [[context-v/specs/Shell-and-Micro-Frontend-UX-Coherence]]: *"If a principle is missing for the affordance you're designing, add it here when you ship — principles are earned, not invented."* Every principle below carries an ***Earned by*** clause. Two are held as **candidates** because their evidence has not been measured yet.

These are **visual-system** principles. They sit alongside — they do not replace — the 12 interaction principles in the UX-coherence spec. A new affordance walks both lists.

Each principle is tagged **[federal]** (binding on every member) or **[local]** (a remote may reason about it independently).

**P1 — Two tiers, always. Components consume Tier 2 and Tier 3 — never Tier 1. [federal]**
*Earned by the shipped three-mode system — the reason three modes cost one attribute.*

**P2 — A token that exists in one mode exists in all three. [federal]** A token declared in the dark block but not in light and vibrant does not error; it silently leaks its dark value everywhere.
*Earned by the runtime specificity trap: `:root`, `[data-mode='dark']` and `[data-mode='light']` are all specificity (0,1,0), so light and vibrant win on source order alone. No completeness check exists.*

**P3 — Never ship a `var()` whose token isn't defined. A fallback is a safety net, not a value. [federal]**
*Earned the hard way: 43 `--color-bg` declarations with no fallback paint nothing on the live deploy. And where fallbacks do exist they have already forked — `--radius-md` falls back to `6px` in 11 places and `8px` in 4.*

**P4 — One vocabulary per concept. [federal]** Two names for one idea is a fork; both halves drift and neither is authoritative.
*Earned by three live forks: `--color-background` vs `--color-bg`; the error/warn dialect split (four phantom names for two concepts); and three different surface tokens in play for "field background".*

**P5 — Density is the identity. Scales are tight, not generous. [federal]**
*Earned by the runtime: `13px/1.45` mono body, most type 9–12px. Reinforced negatively by `splash/`, whose 12-step spacing scale is right for a marketing page and wrong here.*
*Federal because density is brand-level. A remote that decides to be roomy is a remote that looks like a different product.*

**P6 — Elevation is drawn with borders. Shadow is a mode-scaled effect token. [federal]**
*Earned by the `--fx-*` tier, which scales glow from `none` in light to loud in vibrant — something a hardcoded `box-shadow` cannot express. And negatively: 14 of 30 shadows are hardcoded and none react to mode, so every popover keeps a heavy black shadow on warm paper in light mode.*

**P7 — Every remote's CSS stays inside its own namespace. [federal]**
*Earned by a live collision: 99 unnamespaced rules in `sort-filter-lens`, 4 leaked globals in `pack-runner`, both defining `.row-name`, winner determined by chunk load order. `records-surface` ships a bare `body {}` from inside a remote.*
**Under federation this principle carries more weight, not less** — more independent authorship means more chances to collide. It is contract **F3**.

**P8 — Layering is a contract between remotes, not a number in a file. [federal]**
*Earned by 25 z-index declarations spanning 0→200 with no scheme, and by an architectural bug: the shell gives each slot `z-index: 1–3`, creating a stacking context, so a remote's dropdown can never escape its slot.*

**P9 — A repeated pattern is a signal to evaluate, not an automatic failure. [local]**
**This principle inverted when the system federated.** It previously read *"a pattern's second implementation is a system failure."* Under central ownership that was right. Under federation it is not: two remotes solving a chip differently, for different jobs, is legitimate sovereignty.

What remains a failure is **unexamined duplication**. The test is now:

| Observation | Verdict |
|---|---|
| Two members ship **structurally equivalent** components (below) | **Failure.** Promote to `shared-ui`, or have one consume the other's. |
| Two members solve the same problem **differently, with a stated reason** | Legitimate. Record the reason in each local *Deviations*. |
| Three or more members need the same primitive | **Promotion candidate** — see *Components*. |

**Structural equivalence, not byte equality.** An earlier draft of this principle tested for byte-identical files. That test is defeated by one whitespace character, *accidentally* — a formatter run would have silently cleared four real duplications. Two components are structurally equivalent when **all** of:

1. Same exported prop names and types
2. Same rendered element structure, ignoring whitespace, comments and class-name prefix
3. Same CSS declarations after normalising the prefix

This is checkable — normalise, hash, compare — and it does not evaporate when someone reformats. Drift reports it as a **warn** with the pair named, because the verdict needs a human: *is this one component in two places, or two components that happen to look alike today?*

*Earned by: `ConnectorChip.svelte` and `ConnectorPalette.svelte` existing as byte-identical files in `pack-runner` and `response-reviewer`; `ColumnMapper.svelte` in both `affiliation-rating-resolver` and `person-db-resolver`; `RecordCard.svelte` in both `person-db-resolver` and `record-db-resolver`; three resolver stylesheets ~80% identical; the `.result` recipe copy-pasted into four apps; and `ConfidencePill` living in `shared-ui` while `record-collector` reimplements it inline.*

**P10 — Every interactive control has a minimum size, and density yields to it. [federal]** Density is the identity, but it is not a justification for a 15px target.
*Earned by 10+ sites where `1px 7px` padding at 11px type produces ~15px-tall controls, against WCAG 2.2's 24×24 requirement.*

**P11 — Small type demands high contrast. (candidate) [federal]** At 9–12px all text needs 4.5:1; none qualifies for the 3:1 large-text allowance. Dimming already-muted text with `opacity` compounds multiplicatively.
*Candidate: the failure mode is structurally certain, but no ratio has been measured. Promote when the audit lands.*

**P12 — Interactive state must be perceivable without colour and without a pointer. (candidate) [federal]**
*Candidate: partial evidence — `aria-pressed` appears once, `aria-controls` zero times, `class:active` is the de-facto state channel.*

**P13 — A local system documents itself or it does not exist. [federal]**
*Earned by this restructure: 10 of 16 remotes had no README at all, and the 5 that did averaged 3 lines. Sixteen sovereign design systems with no published contract is not federation, it is fragmentation with better branding.*
This is contract **F6**.

---

## Engineering principles

Design principles govern what the product looks like. These govern how UI code is written, and they are specific to augment-it being a **federated micro-frontend system** — the source of most of its structural problems, and now the organising principle of its design system.

**E1 — Reach for the lowest level that works.** HTML+CSS, then vanilla JS on web standards, then a small focused package, then a framework. Approved: Astro, Svelte, GSAP, Reveal.js. **Hard prohibitions: React, JSX in any form, Angular, MDX.** Firm-wide. *Consequence: no CSS-in-JS, no utility framework, no component-library dependency.*

**E2 — The shared document is a shared resource.** 16 remotes mount into one `<html>` with no Module Federation `shared` block. Anything global is a public API: selector names, `@keyframes` names, z-index values, `body` styles, `data-mode`. *Consequence: P7 and P8 are integration contracts, not style preferences — and under federation they are the load-bearing ones.*

**E3 — No shared build step for shared code.** `packages/theme` ships raw CSS; `packages/shared-ui` ships raw `.svelte` compiled by each consumer. Correct — E1 applied to tooling. **Keep it.** What must change is ergonomics: `shared-ui` hand-registers every component in its `exports` map with no barrel, which is why it has two components.

**E4 — Prefer the platform primitive.** `<button>` before `<div onclick>`. `<details>` before a hand-rolled disclosure. `<dialog>` before a custom overlay. `:focus-visible` before a manual focus flag.
*Earned negatively: 211 `onclick` vs 37 `onkeydown`; a `<span role="button">` nested inside a `<button>` (invalid HTML); and 8 hand-rolled overlays where zero use `<dialog>`, which gives focus trapping, Escape and a backdrop for free.*

**E5 — State the user can see must be state the machine can read.**
*Earned negatively: `aria-controls` appears zero times; `aria-pressed` once; 2 of 5 `role="tablist"` containers have no `role="tab"` children and 3 of 4 `role="menu"` have no `menuitem` children — both ARIA-invalid.*

**E6 — Verify in three modes and two mount contexts.** Light, dark, vibrant × standalone and mounted-in-shell. **The mounted case is the only one that exercises leakage**, and light mode is where the theme's assumptions break first.

**E7 — Enforce with a script, not a review comment.** The 2026-07-16 audit was wrong in six load-bearing ways by 2026-07-29 — not carelessness, but a hand-counted number is stale the moment it is written.
*Under federation this is not optional. Sixteen sovereign systems cannot be held to a contract by anyone reading sixteen diffs.*

**E8 — Delete on migration. Never leave the old path.** 33 hardcoded accent fallbacks (`#9ab8ff` ×26, `#4ecf95` ×4, `#5b7cfa` ×3) **never paint** — they are fallbacks for a token defined since May. They look like brand drift and are worse: drift a reviewer will "fix" and change nothing.

**E9 — A new remote must be correct by construction.** If getting a new remote right requires reading this document, it will be got wrong. See *Starting a new remote*.
*This is the principle federation leans on hardest: the scaffold, not the documentation, is what makes sixteen sovereign systems comply.*

---

## Colors

*Federal. `packages/theme/theme.css` is the runtime source of truth; [[packages/theme/DESIGN.md]] is the full token reference.*

### Tier 1 — the palette ✅

*"The things we have." Raw values, `__` separator, **never read by a component**. The user iterates here — add a colour, re-point a semantic token, done. See *Token architecture* for why the indirection earns its keep.*

| Group | Tokens |
|---|---|
| Greyscale (dark) | `--color__graphite-1000/-950/-900/-850/-800/-700/-600`, `--color__mist-100/-400` |
| Greyscale (light) | `--color__paper-0/-50/-100/-200/-300/-400`, `--color__ink-900/-500` |
| Greyscale (vibrant) | `--color__void-1000/-950/-900/-850/-800/-700/-600`, `--color__halo-100/-400` |
| Magenta | `--color__magenta-electric` `#c75bfb` · `-deep` `#9a3fd4` · `-loud` `#d96bff` |
| Cyan | `--color__cyan-bright` `#5bbcfb` · `-deep` `#2563a8` · `-loud` `#54c8ff` |
| Status | green / red / amber ramps, each with `-deep -bright -wash -ink -neon -void` |
| Shadow ink ✅ | `--color__shadow-black` `#000000` · `--color__shadow-ink` `#1b1d22` — **added in Phase 1 so the `--fx-*` tokens carry no literal (F11)** |

**The lightest step on each greyscale ramp is new in Phase 1** — `--color__graphite-600`, `--color__paper-400`, `--color__void-600`. They exist because `--color-border-strong` needed a value clearing **3:1 against every surface in its mode**, and the ramps as they stood could not reach it. That is gate A3 answering *"are the ramps deep enough?"* with **no**, on measurement rather than by eye.

⚠️ **`--color__ink-500` and `--color__amber-ink` were darkened in Phase 1** (`#6b6f7a` → `#686c77`, `#a16a1f` → `#95621d`) after the Phase 0 contrast sweep found five real light-mode failures. These are the only Tier-1 *values* that have ever changed. See *Accessibility* defect #14.

✅ **Step numbers track lightness. Higher number = darker, on every ramp.** Verified mechanically by `pnpm design:drift`, which fails on a ramp whose numbering and luminance disagree. **You can take the next step up the ramp** — that is the contract this naming buys, and it is what makes `--color__graphite-850` legible to a person and to an agent without opening the file.

✅ **Gate (A19) — RESOLVED 2026-08-01, Phase 1.** *For the record, because the fix looks like a no-op in the diff.* Until Phase 1 the numbers **lied**: `--color__graphite-700` was `#13151b` (darker than `-900`), `--color__paper-200` was lighter than `-100`, and `--color__void-700` was darker than `-900`. Under the Tier-1 naming rules that is not a curiosity but a defect in the contract's own premise — the point of Tier 1 is that the name tells you what the value is, and on three of six ramps it told you the opposite. **It damages agents more than humans:** a person checks the hex, an agent extrapolates from the convention and writes something confidently wrong.

**Resolved by re-numbering, not renaming** — the same set of step numbers, reassigned so they track luminance. Every Tier-2 mapping was re-pointed in the same commit, so **the fix is a pure permutation: not one rendered colour changed.** Proven by diffing `design-drift --resolve` before and after, which is the only way to land a change like this without screenshots.

*The rejected alternative was perceptual-role names (`-base` / `-panel` / `-line`). It was rejected because Tier-1 names are for **appearance, not role** — a role-named Tier-1 token is a Tier-2 token wearing a disguise, and it would be wrong the first time the value was used somewhere else.*

### Tier 2 — 31 semantic tokens ✅

*Phase 1 landed 10 of these: `--color-surface-2`, `--color-bg-elevated`, `--color-border-strong`, `--color-link`, `--color-thread`, `--color-accent-warm`, `--color-warn-bg`, `--color-warn-text`, `--focus-ring`, and the deprecated `--color-bg` alias.*

*"The jobs they do." Single values. Every one carries no literal colour (**F11**) and is declared in all three mode blocks (**P2**).*

| Role | Tokens | Rule |
|---|---|---|
| Surfaces | `--color-background`, `--color-surface`, `--color-surface-2` ✅, `--color-surface-raised`, `--color-bg-elevated` ✅ | Page → panel → nested panel → raised → floating. Depth is a step in this ladder **plus** a border (P6). `--color-bg-elevated` is the popover rung; it is not a lighter `-raised`. |
| Inputs | `--color-field`, `--color-field-focus` | Any editable region. Never `--color-surface` for a field. |
| Line | `--color-border`, `--color-border-strong` ✅ | `--color-border` is the 1px that does elevation's job — **decorative, and it does not meet 3:1 (🚪 A22)**. `--color-border-strong` is the compliant one: use it on control boundaries and floating surfaces. |
| Text | `--color-text`, `--color-text-muted` | **Two levels, and two is the maximum.** A third is not a token *or* an `opacity` — there is no legal value below muted in light. See *Missing colour tokens*. |
| Accent | `--color-accent`, `--color-accent-2`, `--color-accent-warm` ✅, `--color-on-accent` | `--color-on-accent` is **mandatory** on any accent fill — never assume white. `--color-accent-warm` is the amber, for emphasis that is not an error. |
| Focus | `--focus-ring` ✅ | **One** ring token, replacing three competing treatments. `:focus-visible` only. Clears 3:1 on every surface in all three modes. |
| Link | `--color-link` ✅ | Navigation only. If it acts rather than navigates it is a button, not a link. |
| Structure | `--color-thread` ✅ | Connector lines — the chat thread rail. A line, so it tracks `--color-border`. |
| Status | `--color-ok-bg/-text`, `--color-error-bg/-text`, `--color-warn-bg/-text` ✅ | The warn pair **unified four phantom dialects** (`--color-warning-*`, `--color-warn`, …) that 22 declarations had invented independently. |
| Deprecated | `--color-bg` ⚠️ | Alias of `--color-background`. **Do not add uses.** Deleted at the end of Phase 4. |
| Data | `--color-confidence-low/-med/-high` | One token per band; the pill derives a translucent background via `color-mix()` at the call site. |
| Tints | `--color-selected-tint`, `--color-danger-tint` | Derived over `--color-accent` / `--color-error-text` — legal under F11, and better than a literal. Do not hand-roll. |
| Type | `--font-mono` | The only token declared once and never overridden per mode. |

### Tier 3 — 4 effect tokens ✅

*Composite values — a shadow, a glow. Same rules as Tier 2 (component-readable, all three modes, **F11**); they sit in their own tier only because their value is a composition rather than a single colour. Full per-mode table under* Elevation & Depth.

| Token | Job |
|---|---|
| `--fx-accent-glow` | Focus and selection emphasis. `none` in light, a real bloom in vibrant. |
| `--fx-card-shadow` | The one card elevation. ⚠️ **Holds a literal in dark and light — the F11 debt.** |
| `--fx-flash` | Transient highlight. ⚠️ Defined in all three modes and **consumed zero times**. Adopt it or delete it. |

### Derived tokens ✅

Prefer this pattern for any tint — it cannot drift from its source.

```css
--color-selected-tint: color-mix(in srgb, var(--color-accent) 9%, transparent);     /* 8% light, 16% vibrant */
--color-danger-tint:   color-mix(in srgb, var(--color-error-text) 7%, transparent); /* 8% light, 14% vibrant */
```

### Missing colour tokens — shipped in Phase 1 ✅

Eleven undefined tokens were *asked for by name* across the codebase — that demand was the evidence they were semantic. **Ten shipped 2026-08-01; one was rejected on measurement.**

| Token | Replaced | Demand | Value chosen |
|---|---|---|---|
| `--color-bg` → alias of `--color-background` | ⚠️ **62 uses, 43 with no fallback** | — | `var(--color-background)`. **DEPRECATED — deleted at the end of Phase 4.** |
| `--color-surface-2` ✅ | `--color-surface-2` | 3 | one step up the ladder from `--color-surface` |
| `--color-bg-elevated` ✅ | `--color-bg-elevated` | 1 | the floating rung above raised |
| `--color-border-strong` ✅ | two conflicting fallbacks | 6 | **new Tier-1 value per ramp**, solved for ≥3:1 against *every* surface |
| `--color-link` ✅ | `--color-link` | 5 | `--color-accent-2` — measured 8.72 / 6.12 / 9.82 |
| `--color-accent-warm` ✅ | `--color-accent-warm` | 2 | the amber ramp |
| `--color-thread` ✅ | `--color-thread` | 3 | the border value — a thread *is* a line |
| `--color-warn-bg` / `-text` ✅ | **unified 4 phantom dialects** | 22 | amber, beside the existing error pair |
| `--focus-ring` ✅ | 3 competing focus treatments | — | `var(--color-accent)`; clears 3:1 on every surface, all modes |
| ~~`--color-text-dim`~~ ❌ | — | 4 | **REJECTED — see below** |

❌ **`--color-text-dim` was not shipped, and should not be.** `--color-text-muted` already sits at **4.57:1** in light against the darkest surface, and every type size in this product is under 18.66px — so there is no large-text allowance. **A third text level dimmer than muted cannot reach 4.5:1 in light mode at all.** Defining it would have given an inaccessible pattern a federal name. The 4 call sites become `--color-text-muted` in Phase 4. *This is what measuring before defining is for: A3 assumed the problem was choosing four values, and one of the four turned out not to have a legal value.*

✅ **Gate (A3) resolved.** The ramps were indeed too coarse — `--color-border-strong` needed **a new Tier-1 value in each ramp** (`--color__graphite-600`, `--color__paper-400`, `--color__void-600`), each solved against *every* surface in its mode rather than against `--color-surface` alone. Solving against one surface put all three at ~2.9:1; the lightest surface is `--color-bg-elevated`, which Phase 1 had just added. `--color-surface-2` and `--color-bg-elevated` were satisfiable from existing steps.

⚠️ **`--color-border` itself does not meet 3:1** — measured 1.22 (dark), 1.41 (light), 1.45 (vibrant) against `--color-surface`. For a decorative panel divider that is permitted; for a **control boundary** WCAG 1.4.11 requires 3:1, and this is the 1px border that carries the product's whole elevation identity (P6). 🚪 **Gate (A22): does `--color-border` need to meet 3:1 on inputs and controls?** Changing it changes the look of the entire product, so it is a brand decision, not a token fix. **Owner: Michael + design.** `--color-border-strong` exists as the compliant option in the meantime.

### Colour usage rules

1. **Semantic role, never appearance.** `--color-error-text`, never `--color-red`.
2. **`--color-on-accent` is mandatory on accent fills.**
3. **Never use `opacity` to make a third text level.** It multiplies against the backdrop and breaks contrast unpredictably.
4. **Tints come from `color-mix()` against a token.** `rgba(120,160,255,0.12)` appears 9 times as a fallback for a token defined since May.
5. **No hardcoded hex outside `packages/theme`** (F8).
6. **Mode parity is not optional** (P2).
7. **A remote never declares a colour token** (F1).

---

## Typography

*Federal.*

### The rule

**Six role-named sizes. One family. Font size is always a token.**

| Token 🔶 | Value | Job |
|---|---|---|
| `--text-micro` | `10px` | Uppercase micro-labels, table metadata, badge text |
| `--text-label` | `11px` | **The dominant UI label** — field labels, chips, column heads |
| `--text-body` | `13px` | Body, row content, input text. **The runtime base.** |
| `--text-emphasis` | `15px` | Emphasised values, card titles |
| `--text-heading` | `18px` | Panel and section headings |
| `--text-display` | `28px` | The one display size in the product |

**Line height** 🔶 — `--leading-tight: 1.2` · `--leading-base: 1.45` (**already the runtime value**) · `--leading-loose: 1.7`.

**Tracking** 🔶 — 11 values collapse to 4. The 0.04–0.08em cluster is 39 declarations doing one job at five values nobody can distinguish.
`--tracking-none: 0` · `--tracking-num: 0.02em` · `--tracking-label: 0.06em` (**the uppercase micro-label idiom**) · `--tracking-wide: 0.12em`.

### Rules

1. **Monospace only.** A second family is a spec-level decision, not an inline `font-family`.
2. **Never below `--text-micro`.**
3. **Uppercase micro-labels always carry `--tracking-label`.** Uppercase monospace without tracking is unreadable at 10–11px.
4. **No `em` for font-size.** It compounds through nesting — two `0.85em` labels nest to 0.72em and nobody predicted it.
5. **Monospace gives tabular figures for free.** Never override `font-variant-numeric` in a data column.
6. **Do not define `--font-sans`.** Six apps reference it with three different fallbacks. The product is monospace by identity; delete the references rather than legitimising a second family by accident.

### Why six steps, and what it costs

The measured reality is **35 distinct sizes across 432 declarations in three parallel unit systems** that overlap almost exactly — `0.7rem` computes to 11.2px against a 16px root, and `11px` is used 89 times. Two authors, two units, one intended size.

An earlier draft of this scale proposed nine steps chosen to minimise displacement of existing values. That put **six steps inside a 5px range**, and it was rejected in review: a scale whose adjacent steps are perceptually indistinguishable does not force a choice. An author facing `--text-sm` (11px) and `--text-md` (12px) picks arbitrarily — which is precisely how 35 sizes happened.

**The honest cost:** collapsing `12px` (57 declarations) into `--text-body` (13px) is a **1px increase across dense table content**, which can reflow fixed-width columns. That is the price of a scale that actually functions.

🚪 **Gate:** final step values are confirmed by inspection at the portal against real screens. Specifically — does `--text-body` at 13px hold the densest table without reflow, and is `--text-emphasis` at 15px distinguishable from body at a glance?

---

## Layout & Spacing

*Federal vocabulary. **Composition is local** — how a remote arranges its own surfaces is its own business, provided the values come from these scales.*

### Spacing 🔶

**Ten steps on a 2px base.** Spacing is a token; a raw padding value does not pass review.

| Token | Value | | Token | Value |
|---|---|---|---|---|
| `--space-hairline` | `1px` | | `--space-md` | `10px` |
| `--space-3xs` | `2px` | | `--space-lg` | `12px` |
| `--space-2xs` | `4px` | | `--space-xl` | `16px` |
| `--space-xs` | `6px` | | `--space-2xl` | `24px` |
| `--space-sm` | `8px` | | `--space-3xl` | `32px` |

**Maximum displacement is 4px**, at the single `20px` value. Excluding that outlier, maximum displacement is **1.6px** and the median is under 1px. The most common non-zero padding in the product, `0.4rem 0.6rem` (6.4/9.6px), becomes `--space-xs --space-md` (6/10px).

**Physical properties, deliberately — for now.** 🚪 *Added at 0.0.3.2 because the choice was being made by omission.* The scale is applied through `padding-left` / `margin-right`, not `padding-inline-start` / `margin-inline-end`. augment-it is English-only with no stated internationalisation plan, and logical properties buy nothing until that changes.

**State it now because the cost is asymmetric.** Choosing logical properties today is nearly free — same values, different property names in a scaffold nobody has filled in yet. Retrofitting them after seventeen members have written CSS against a physical vocabulary is a sweep across every member, and the fidelity loop cannot do it (it changes rendered output in exactly one direction and only for RTL, which no one can verify without an RTL locale).

🚪 **Gate (A21): confirm English-only, or switch to logical properties before Phase 2 lands the spacing scale.** **Owner: CEO (scope).** This is a product question wearing a CSS costume — the engineering cost is near zero today and material later, so the only wrong answer is not answering.

**Why 2px and not 8px.** An 8px grid is the industry convention and would roughly double this product's whitespace, destroying the instrument-panel density that is its identity (P5). The measured distribution is dense; the scale must be too. `--space-hairline` is a named exception rather than a rounding error, because `1px 7px` appears 10 times deliberately.

⚠️ `--space-hairline` may **never** be a control's vertical padding — see P10 and *Accessibility*.

### Sizing 🔶

Control heights, container widths and column vocabularies are tokens. A raw `max-height: 320px` does not pass review.

| Group | Tokens |
|---|---|
| **Control height** | `--control-h-sm: 24px` (**the floor** — the WCAG 2.2 target minimum) · `--control-h-md: 28px` · `--control-h-lg: 32px` |
| **Icon size** | `--icon-sm: 12px` · `--icon-md: 16px` · `--icon-lg: 20px` |
| **Panel scroll** | `--panel-h-sm: 240px` · `--panel-h-md: 320px` · `--panel-h-lg: 480px` |
| **Label column** | `--col-label-sm: 88px` · `--col-label-md: 160px` · `--col-label-lg: 224px` |
| **Shell chrome** | `--shell-header-h: 56px` · `--shell-rail-w: 64px` · `--shell-chat-w: 360px` |

**Scroll containers use `flex: 1; overflow: auto; min-height: 0`** — the correct idiom, currently used in only 3 places. A `--panel-h-*` token is for when a panel genuinely must be bounded, not a substitute for flex layout.

*This replaces 21 distinct `grid-template-columns` values, 15 `max-height` magic numbers in three units, and a `56px` header height duplicated as a literal inside `calc(100vh - 56px)`.*

### Responsive

augment-it is a **desktop-only, fixed-layout application** — apparently by omission rather than decision. Measured: 5 `@media` blocks in product code, 3 width breakpoints using 2 uncoordinated values, **zero** container queries, **zero** `clamp()`, **zero** `ResizeObserver` / `matchMedia` / resize listeners. Below roughly 900px the three-rail tiling stage has no defined behaviour at all.

**Breakpoints are documented, not tokenised.**

| Name | Width | Status |
|---|---|---|
| `compact` | `820px` | The house breakpoint |
| ~~`narrow`~~ | ~~`700px`~~ | ⚠️ Conflicting one-off. Migrate to `compact`. |

1. **One breakpoint value until a second is earned** by a documented layout need.
2. **Prefer intrinsic layout to breakpoints.** `minmax()`, `flex-wrap`, `auto-fit` handle most of what this product needs without any query.
3. **Container queries over media queries for remotes — the highest-value responsive change available.** A federated remote does not know how wide its slot is, and **slot width changes at runtime as the user drags**. A remote responding to *viewport* width is answering the wrong question. **Under federation this is close to mandatory:** a sovereign remote cannot be responsive to a layout it does not own.
4. **`clamp()` for anything genuinely fluid.**
5. **No JS-driven layout.** Zero today; keep it.

🚪 **Gate (A2):** a full responsive strategy is out of scope for the current program. Confirm desktop-only is intentional.

---

## Elevation & Depth

*Federal.*

### The ladder

**Four steps. Only the top two use a shadow, and shadows come from `--fx-*` tokens.**

| Level | Treatment |
|---|---|
| Flat | `--color-surface`, no border |
| Bordered | `--color-surface` + `--border-width` `--color-border` |
| Raised | `--color-surface-raised` + border + `--fx-card-shadow` |
| Floating ✅ | `--color-bg-elevated` + `--color-border-strong` + `--fx-popover-shadow` — **all three shipped in Phase 1**; the rung is now expressible |

Border widths 🔶: `--border-width: 1px` (the identity) · `--border-width-strong: 2px` (focus rings, active rails).

### Effect tokens ✅

Intensity scales with the mode. This is why P6 works — a hardcoded `box-shadow` cannot be `none` in one mode and a neon bloom in another.

| Token | light | dark | vibrant |
|---|---|---|---|
| `--fx-accent-glow` | `none` | `0 0 0 1px` accent @30% | `0 0 20px` accent @45% |
| `--fx-card-shadow` | `0 1px 3px` @8% | `0 1px 3px` @35% | `0 0 24px` magenta-loud @12% |
| `--fx-popover-shadow` ✅ | `0 4px 16px` ink @14% | `0 4px 16px` black @45% | `0 4px 24px` magenta-loud @20% |
| `--fx-flash` | accent-2 @18% | accent-2 @30% | accent-2 @45% |

✅ **F11 debt cleared in Phase 1.** `--fx-card-shadow` previously carried `rgba(0, 0, 0, 0.35)` in dark and `rgba(27, 29, 34, 0.08)` in light — literals, not Tier-1 names. Both now compose over `--color__shadow-black` / `--color__shadow-ink`, producing byte-identical output. **Every `--fx-*` token in all three modes is now literal-free.**

✅ **`--fx-popover-shadow` shipped in Phase 1.** It was the genuinely missing rung — the popover set has a real job the card token does not cover, which is why fourteen people reinvented it. **The rung existing is not the same as it being adopted:** the hardcoded popover shadows are still in the members and get swept in Phase 4.

⚠️ **47% of the product's shadows are hardcoded and none react to mode.** Three competing elevation scales exist: the token (1px blur 3), a popover set (4–6px offset, 12–20px blur, black at 18–35%), and one outlier at `0 18px 40px -18px`. None of the hardcoded values match the token in any mode, so every popover keeps a heavy black shadow on warm paper in light mode. **Unchanged by Phase 1 — this is member CSS, and Phase 1 touched only the theme.**

### Layering 🔶

Because remotes are developed and deployed independently, ranges are **reserved in advance** (P8, E2, contract F4).

| Range | Owner | Tokens |
|---|---|---|
| **0–899** | **Remote-local** | `--z-base: 0` · `--z-raised: 10` · `--z-sticky: 30` · `--z-remote-overlay: 60` |
| **900–999** | **Slot geometry** — shell-assigned, not authorable | `--z-slot-peek: 900` · `--z-slot-hover: 910` · `--z-slot-focus: 920` |
| **1000+** | **Shell chrome** — remotes never write these | `--z-shell-chrome: 1000` · `--z-flow-widget: 1100` · `--z-overlay: 1200` · `--z-modal: 1300` · `--z-tooltip: 1400` · `--z-toast: 1500` |

**Remotes use the four remote-local tokens and nothing else.** They are not assigned private numeric bands — a shared four-token vocabulary is coordinable across independent deploys in a way sixteen private ranges are not.

**`z_tokens` is a checked declaration, not documentation.** Each member declares which of the four it uses in frontmatter; drift check `F4b` compares the declaration against the member's actual CSS and **fails on either direction** — a token used but undeclared, or declared but unused. A declared field nobody verifies drifts from reality within weeks and then actively misleads, which is worse than not declaring it at all.

*Measured today, against this scheme:* `sort-filter-lens` uses `15` and `20`; `chat`, `pack-runner` and `response-reviewer` all independently chose `50`; the shell uses `5, 50, 90, 100, 200`. **Three remotes and the shell currently collide at `50`.**

⚠️ **The contract alone does not fix the real bug.** Slot `z-index` creates a **stacking context**, so a dropdown inside a remote is trapped in its slot and cannot render over a neighbour — no matter what value it claims.

🚪 **Gate (A4), resolved at M3.** Options: (a) remove the stacking context from slots, (b) have the shell expose a portal target for remote overlays, (c) accept that overlays are slot-bounded and design within it. **This gates every local `Dialog`.**

---

## Shapes

*Federal.*

**Five values. `--radius-md` (4px) is the house default.**

| Token 🔶 | Value | Absorbs | Role |
|---|---|---|---|
| `--radius-sm` | `2px` | 2 | Tight inline elements, tag stamps |
| `--radius-md` | `4px` | **3, 4, 5** | **House default.** Buttons, inputs, chips, small cards |
| `--radius-lg` | `8px` | 6, 8, 10, 0.5rem | Cards, panels, dialogs |
| `--radius-pill` | `999px` | 999px (32 uses) | Pills, confidence badges, corpus chips |
| `--radius-round` | `50%` | 50% (14 uses) | Avatars, dots, icon circles |

**Why 4px.** The measured split is a dead heat — `3px` 86 times, `4px` 80 times. At 52/48 there is no house style to preserve; this is a coin flip that was flipped independently 166 times. `4px` wins because it is the only value aligned with the 2px spacing grid; `3px` is off every other scale in the system.

⚠️ Fixes a live defect: the undefined `--radius-md` currently resolves to `6px` in 11 uses and `8px` in 4 — one name, two radii, depending which app you are looking at.

---

## Components

*Federal layer holds the **contract**. The components themselves are local.*

Under federation this document does not specify a component catalogue. Each member documents its own library in its own `DESIGN.md`; `packages/shared-ui` documents the opt-in primitives at [[packages/shared-ui/DESIGN.md]].

### The authoring contract

Binding on **every** component in **every** member, wherever it lives.

1. Svelte 5 runes, no JSX (E1).
2. **Tier-2/Tier-3 tokens only** (P1, F1). A component with a hardcoded `999px` is a component with a bug — and both current `shared-ui` components have this.
3. Variant prop, not boolean soup.
4. **No bare element selectors; every rule descends from the member root class** (P7, F3).
5. Stateless by default.
6. Prefer the platform primitive (E4).
7. **Every component documents its a11y contract** in a header comment: required ARIA, keyboard behaviour, focus handling.
8. **Filenames never encode an app-specific concern.**
9. **Every component appears in its member's `DESIGN.md`** with a stable anchor id (F6).

### The primitive floor

A remote may build any component it likes, but where a component is one of these, it inherits a non-negotiable a11y contract from the federal layer. These are the contracts, not the implementations:

| Primitive | Federal contract |
|---|---|
| **Button** | Explicit class, never a bare `button` selector. Hover guarded with `:hover:not(:disabled)`. Height ≥`--control-h-sm`. Disabled shifts a colour token, not only opacity. |
| **Field** | Real `<label for>` bound to a generated id — **a field without an accessible name does not ship**. `aria-invalid` when errored, `aria-describedby` linking hint and error, error element `role="alert"`, `:focus-visible`. |
| **Checkbox / radio / switch** | `appearance: none` and themed. ⚠️ There are **zero** custom-styled controls today, so checkboxes render platform-blue in all three modes. |
| **Dialog / Popover** | Native `<dialog>` (E4). Focus trap, focus restoration, Escape, backdrop. 🚪 Blocked on the layering gate (A4). |
| **Progress** | `indeterminate` → `role="status"` + accessible label. `determinate` → `role="progressbar"` + `aria-valuenow/min/max`. |
| **Table / Row** | Real `<th scope="col">`, `aria-sort` on sortable headers, sticky header via `--z-sticky`. |
| **Tabs** | Correct `tablist`/`tab`/`tabpanel` wiring, `aria-controls`, arrow-key roving focus. |
| **Link** | If it navigates it is an `<a>`; if it acts it is a button. External indicator never colour-only, plus `rel="noopener"`. URLs truncate at the **middle**. |
| **Icon** | Unicode glyphs, not an icon font (E1). Icon-only control **must** carry `aria-label`; decorative icon beside text is `aria-hidden="true"`. Emoji **cannot be themed** and must never carry state. |
| **Tooltip** | ⚠️ **`title=` is never the only way to access information.** 123 native `title=` attributes exist against 7 accessible ones. Replacement spec: [[context-v/specs/Tooltip-System]]. |
| **Feedback** | Errors and successes announce via a live region. `ToastRegion` is **shell-owned, one instance** — remotes never mount their own. |

**Error placement hierarchy** — federal, because it determines which member owns the surface:

| Scope | Treatment | Owner |
|---|---|---|
| One field | Inline, below the field, `role="alert"` | Local `Field` |
| One action | Inline, adjacent to the trigger | Local `Alert` |
| One surface | Banner at the top of the panel | Local `Alert` |
| Cross-surface / transient | Toast | **Shell** |
| Surface cannot render | Full-panel state | Local `EmptyState` |

*Measured: **zero** `aria-invalid`, **zero** `aria-describedby`, **zero** `role="alert"` in the product today; all ~17 error treatments are block-level siblings untethered from the field they describe.*

### The promotion path

`shared-ui` is **opt-in**. Nothing is obligated to graduate into it, and no remote is obligated to consume it.

```
local component  →  promotion candidate  →  shared-ui primitive
                    (3+ members need it,
                     stable, token-pure)
```

**Promotion requires:** three or more members with a demonstrated need · a stable API that has not changed in two of those members' last release · zero hardcoded values · a documented a11y contract · agreement from the consuming members.

**Promotion is a choice, not a mandate.** A member may decline a promoted primitive and keep its local implementation, provided it records the reason under *Deviations*.

**Demotion exists too.** A `shared-ui` primitive consumed by fewer than two members is a maintenance liability; retire it back into its last consumer.

⚠️ **Standing promotion candidates**, measured 2026-07-30 — byte-identical files, which P9 still classes as failure:

| Component | Duplicated in |
|---|---|
| `ConnectorChip.svelte`, `ConnectorPalette.svelte` | `pack-runner`, `response-reviewer` |
| `ColumnMapper.svelte` | `affiliation-rating-resolver`, `person-db-resolver` |
| `RecordCard.svelte` | `person-db-resolver`, `record-db-resolver` |
| `ConfidencePill` | in `shared-ui`, **reimplemented inline** in `record-collector` |

---

## Local design systems

*Off-spec extension. The index. Generated into `design-manifest.json`; the portal renders it.*

### Tier is design surface, not CSS volume

*Re-based at contract 2.0. Tier was previously assigned from stylesheet size, which produced a perverse result: `sort-filter-lens` — 511 lines, zero components, 99 leaked selectors, the worst-behaved member in the product — earned **more** documentation than `records-surface`, which has 10 lines of CSS, six components, and is the best-structured member here. **The metric was measuring mess and calling it richness.***

**Tier = how much design this member owns**, scored on:

1. **Components** it defines
2. **Patterns** it owns that others might copy
3. **Novel idioms** — does it do something no other member does?

**Debt is tracked separately.** A member can own very little design and carry a great deal of remediation — that is exactly `sort-filter-lens`. Conflating the two buys mess a documentation budget.

| Member | Prefix | Root class | Components | Owned patterns | Tier | Debt | Doc |
|---|---|---|---|---|---|---|---|
| `shell` | `shell` | `.app-shell` | 8 | Slot strip, mount host, mode cycle | **A** | med | [[shell/DESIGN.md]] |
| `records-surface` | `rs` | `.records-surface` | 6 | Component-scoped styles, click-to-edit, `EditableField` | **A** | low | [[apps/records-surface/DESIGN.md]] |
| `person-enrichment` | `pe` | `.pe-app` | 6 | The repeater, save flash, form vocabulary | **A** | high | [[apps/person-enrichment/DESIGN.md]] |
| `response-reviewer` | `resp` | `.resp-app` | 2 | Review pane, highlight spans, reading measure | **A** | med | [[apps/response-reviewer/DESIGN.md]] |
| `chat` | `chat` | `.chat-app` | 4 | Mode variants, constrained-width column | **A** | med | [[apps/chat/DESIGN.md]] |
| `strategy-curator` | `sc` | `.sc-app` | 4 | Hairline source rows, tag bar | **B** | high | [[apps/strategy-curator/DESIGN.md]] |
| `record-collector` | `rc` | `.rc-app` | 2 | `auto-fit` card grid, family grouping | **B** | low | [[apps/record-collector/DESIGN.md]] |
| `pack-runner` | `pr` | `.pr-app` | 2 | The run row | **B** | high | [[apps/pack-runner/DESIGN.md]] |
| `enhanced-records-list` | `erl` | `.erl-app` | 0 | **The only real `<table>`** | **B** | low | [[apps/enhanced-records-list/DESIGN.md]] |
| `sort-filter-lens` | `sfl` | `.sort-filter-lens` | 0 | Chip row, status chips | **B** | **critical** | [[apps/sort-filter-lens/DESIGN.md]] |
| `request-reviewer` | `req` | `.req-app` | 0 | Inspection stack | **C** | none | [[apps/request-reviewer/DESIGN.md]] |
| `prompt-template-manager` | `ptm` | `.ptm-app` | 0 | Template editor | **C** | low | [[apps/prompt-template-manager/DESIGN.md]] |
| `person-db-resolver` | `pdr` | `.pdr-app` | 4 | Resolve row *(family document)* | **C** | med | [[apps/person-db-resolver/DESIGN.md]] |
| `record-db-resolver` | `rdr` | `.rdr-app` | 2 | — *(family member)* | **C** | med | [[apps/record-db-resolver/DESIGN.md]] |
| `affiliation-rating-resolver` | `arr` | `.arr-app` | 1 | Graded rating *(family member)* | **C** | med | [[apps/affiliation-rating-resolver/DESIGN.md]] |
| `highlight-collector` | `hc` | `.hc-app` 🔶 | 0 | — | **C** | none | [[apps/highlight-collector/DESIGN.md]] |
| `insight-manager` | `im` | `.im-app` 🔶 | 0 | — | **C** | none | [[apps/insight-manager/DESIGN.md]] |

**Tier A** — full local system: per-component documentation, local patterns, local do's and don'ts.
**Tier B** — light: overview, component list, deviations.
**Tier C** — stub: frontmatter plus what is unique to the member.

**Debt** is remediation weight, not documentation depth. `critical` means the member blocks verification elsewhere; `high` means a federal contract violation with a named gate.

### Re-tiering

*Added at contract 2.0. Tiers were previously a snapshot with no mechanism to change them — "expected to change as remotes grow" and nothing else.*

| Trigger | Action |
|---|---|
| A member gains a **third** component, or a second owned pattern | Re-tier C → B |
| A member gains a **fifth** component, or a pattern another member copies | Re-tier B → A |
| A member's owned patterns all promote to `shared-ui` | Re-tier **down** — it now owns less design |
| Debt closes at a milestone | Update `debt:`, **not** `tier:` — they are independent |

**Owner: the federal layer owner**, at each phase boundary, with the drift report as input. Re-tiering is a frontmatter change plus filling in the sections the new tier requires — it is not a rewrite.

### The resolver family 🚪

`person-db-resolver`, `record-db-resolver` and `affiliation-rating-resolver` share **~80% identical stylesheets** and duplicate two components between them. Three sovereign design systems over one shared design would make that triplication permanent and architectural.

**They are documented as one family.** [[apps/person-db-resolver/DESIGN.md]] is the family document; the other two declare `family: resolver` and reference it rather than restating it.

🚪 **Gate (A14):** whether to consolidate the three into one remote is a product decision, not a design-system one. Until it is answered, the family document prevents the divergence from getting worse. **Owner: Michael (architecture).**

### Unbuilt members ⚠️

`highlight-collector` and `insight-manager` have **zero CSS and zero Svelte files**. Their root classes are 🔶 — proposed by this document, not read from code, because there is no code. Their `DESIGN.md` files are placeholders that claim a prefix and nothing else. **When either grows a UI, its document is written before its first component ships** (F6).

---

## Content & Voice

*Off-spec extension. Federal floor; a member may extend it, never contradict it. A design system for an operator tool that specifies pixels but not words is half a system — and the measured copy inconsistency is as large as the visual inconsistency.*

| Rule | |
|---|---|
| **Voice** | Terse, lowercase, instrument-panel. The product reports state; it does not converse. |
| **Capitalisation** | Sentence case for prose, lowercase for chrome and labels. Matches the measured plurality and the mono aesthetic. |
| **Terminal punctuation** | None on labels, empty states or button text. Full stops only in multi-sentence prose. |
| **Empty states** | Name what is empty and the next action: `no rows — upload a CSV to begin`. Only 2 of 13 current empty states name an action. |
| **Errors** | State what failed, then what to do. Never expose a raw exception to an operator. |
| **Numbers** | Tabular figures. Right-align numeric columns. Thousands separators above 9,999. |
| **Dates** | ISO `YYYY-MM-DD` in data, relative ("3m ago") in activity feeds. Never locale-dependent formats in a corpus tool. |
| **Truncation** | End-ellipsis for names, middle-ellipsis for URLs and paths. `title` is **never** the only way to see the full value. |

🚪 **Gate (A13):** the product uses *record set*, *corpus* and *rows* for overlapping concepts, and *Flow* was itself renamed from *Deck* under earned principle §10. A glossary belongs in this document; its content is a product decision. **Under federation a shared glossary matters more** — sixteen authors naming the same concept independently is how *record set* / *corpus* / *rows* happened.

---

## Motion

*Off-spec extension. Federal.*

**Motion has four jobs. Anything that is not one of them does not animate.**

| Job | Token 🔶 | Value |
|---|---|---|
| Token transition — mode switching | `--duration-instant` | `75ms` (the existing runtime value) |
| State feedback — hover, press, focus | `--duration-fast` | `160ms` |
| Disclosure — panels, popovers | `--duration-mid` | `320ms` |
| Spatial reorientation — the stage moving | `--duration-stage` | 🚪 see below |

Plus `--duration-spin: 800ms` (unifying four spinner durations), `--ease-standard: ease`, `--ease-out: cubic-bezier(0.2, 0, 0, 1)`, `--ease-stage: cubic-bezier(0.45, 0.05, 0.55, 0.95)`.

**Never animate:** content reflow, table row insertion, anything triggered by data arriving rather than by the user, or anything on a surface the user is reading.

**`@keyframes` names are global** (E2, F8). A remote that needs a keyframe animation namespaces its name with its prefix — `resp-pulse`, not `pulse`. *Measured: 6 spinner implementations across the product use 4 different `@keyframes` names, all unnamespaced.*

🚪 **Gate (A8): the shell's slot transition is `1.9s` and this document challenges it.** That is roughly six times a conventional "slow" transition, and it fires on *every* navigation between remotes — the most-repeated action in the product. In an operator tool, a signature motion the operator waits through dozens of times a day stops being signature and becomes latency. **Recommendation: reduce to ~600ms and evaluate.** If the slow reveal is doing deliberate pedagogical work for the demo-visitor half of the dual identity, that is a legitimate answer — but it should be a stated choice, not an inherited default.

⚠️ **Reduced motion is honoured in 2 of 74 files** against 10 `@keyframes` — and not on the 1.9s slot transition or the FlowWidget bubbles, the largest movements in the product. A global block in `theme.css` closes an entire success criterion in about five lines.

### State 🔶

| Token | Value | Rule |
|---|---|---|
| `--opacity-disabled` | `0.5` | **Never sufficient alone** — a disabled control also shifts a colour token and sets `cursor: not-allowed` |
| `--opacity-loading` | `0.7` | In-flight, still legible |

*Measured: five disabled values across 34 declarations, including `0.9` — which is not a perceptible affordance at all.*

---

## Accessibility

*Off-spec extension. **Target: WCAG 2.2 Level AA.** Federal floor — contract F7. No accessibility audit has ever been run on augment-it; this is a gap analysis from measurement, plus the standards the system commits to.*

**Why this is federal and not local.** A member below the floor makes the *product* non-conformant, not just itself. Conformance is a property of the rendered page, and sixteen remotes render one page.

### The density problem is an accessibility problem

> **Every text size in augment-it falls under WCAG's normal-text threshold.** The 3:1 large-text allowance applies at ≥18.66px bold or ≥24px regular. The display size is 28px and is used once. Everything else requires **4.5:1**.

There is no size at which the requirement relaxes. This makes the colour decisions above load-bearing rather than aesthetic.

### Resolving density vs. target size

WCAG 2.2 SC 2.5.8 requires a 24×24 CSS px target, **with an explicit spacing exception**: a smaller target passes if a 24px-diameter circle centred on it does not intersect another target's circle. That exception is the correct tool for a dense instrument panel, and using it is a deliberate design decision, not a loophole.

| Control class | Rule |
|---|---|
| Primary actions, form controls, anything destructive | `--control-h-md` (28px). No exception. |
| Dense chrome — row actions, chips, toolbar icon buttons | `--control-h-sm` (24px) floor |
| Inline affordances inside text or a table cell | May go below 24px **only** where the spacing exception is met, and the exception is documented at the call site **and in the member's *Deviations*** |

**`--space-hairline` may never be a control's vertical padding.** That rule alone fixes the 10+ sites currently producing ~15px-tall buttons.

### Who is accountable

*Added at contract 2.0. The floor was federal and every defect instance sat in a local document pointing at a shared milestone — which is diffusion of responsibility, not ownership. Conformance is a property of the rendered page, and seventeen members render one page, so "we all own it" resolves to nobody.*

| Layer | Owns |
|---|---|
| **Federal** | The *standard* — which SC apply, the contrast ratios, the target-size rule, the focus-ring token. And any defect whose fix is in `packages/theme` or the shell. |
| **Member** | Every *instance* inside its own boundary, listed in its own *Deviations* with a named gate. |

**Every defect below names an owning member.** A defect with no owner is a federal defect by default — and if it cannot be assigned, that is the finding: it means nobody can fix it without a contract change.

⚠️ **`product-wide` in the table below is not an owner.** It means the defect recurs in most members and the *pattern* fix is federal (a primitive, a token, a lint rule), while each member still closes its own instances. Where a single member carries an outsized share, it is named.

⚠️ **And yet 11 of the 15 defects below say `product-wide`.** *Named at 0.0.3.2: this section states the rule and then breaks it eleven times, which is the diffusion of responsibility it was written to prevent.* **Read it this way until the audit assigns instances:** the *pattern* fix on every `product-wide` row is **federal, and therefore Blake's**, because a defect nobody is named for is a defect nobody closes. Per-member instance lists are produced by the first real accessibility audit (*Not yet assessed*), and **that audit is the event that converts these from federal debt into per-member work.** Until it runs, `product-wide` means Blake, and the count of eleven is the honest measure of how much of the a11y floor is currently one person's backlog.

### Confirmed defects

*These are federal because each recurs across members or lives in the shared document.*

| # | Defect | SC | Member |
|---|---|---|---|
| 1 | ✅ **CLOSED (Phase 1).** ~~Focus indicator vanishes in light mode~~ — `strategy-curator/app.css:114`: `outline: none` + `border-color: var(--color-field-focus)` (`#ffffff` in light) on a `#f4f2ec` field + a glow light defines as `none`. All 16 controls. | 2.4.7 | `strategy-curator` |
| 2 | **No accessible dialogs** — 8 overlays, 0 focus traps, 0 restoration, 0 `role="dialog"`, 0 backdrops; 5 cannot be closed with Escape | 2.1.2, 2.4.3 | product-wide |
| 3 | **Errors and successes are silent** — 2 live regions; 0 `role="alert"`, `aria-describedby`, `aria-invalid` | 4.1.3 | product-wide |
| 4 | **Panel resizing is pointer-only** — 3 `role="separator"` with `tabindex="-1"` and no key handler | 2.1.1 | `shell` |
| 5 | **Unlabeled inputs** — ~10 span-as-label; 14 placeholder-only, including both shell auth fields | 1.3.1, 4.1.2 | product-wide |
| 6 | **ARIA-invalid widgets** — 2 of 5 tablists have no tabs; 3 of 4 menus have no menuitems; 0 `aria-controls` | 4.1.2 | product-wide |
| 7 | **No progress primitives**, against an earned principle requiring progress reporting | 4.1.3 | product-wide |
| 8 | **Tooltips inaccessible** — 123 native `title=` vs 7 focus-visible | 1.4.13 | product-wide |
| 9 | ✅ **CLOSED (Phase 1).** Global `prefers-reduced-motion` block now in `theme.css`, covering the 1.9s slot transition and the FlowWidget bubbles. | 2.3.3 | `theme` |
| 10 | **Invalid nested interactive content** — `<span role="button">` inside `<button>` | 4.1.2 | product-wide |
| 11 | **Target size** — `1px 7px` at 11px type → ~15px tall, 10+ sites | 2.5.8 | product-wide |
| 12 | **Compound dimming** — `opacity: 0.4`–`0.5` on already-muted text; a token at 4.5:1 dimmed to 0.4 lands near 1.9:1 | 1.4.3 | product-wide |
| 13 | **11 × `outline: none`** — 4 replaced only by a 1px border swap between adjacent palette values; one is a **no-op** | 2.4.11 | product-wide |
| 14 | ✅ **MEASURED AND FIXED (Phase 0/1).** It failed: 4.37:1 on raised, 4.49:1 on field. `--color__ink-500` and `--color__amber-ink` darkened; **all 108 text-on-surface pairs now pass 4.5:1** (`pnpm design:contrast`). | 1.4.3 | `theme` |
| 15 | **Native checkboxes unthemed** — zero `appearance: none`; platform-blue in all three modes | — | product-wide |

### Commitments

1. **Contrast** — all text ≥4.5:1, all UI boundaries and state indicators ≥3:1, **verified in all three modes**. Vibrant is most at risk.
2. **Focus** — one `--focus-ring` token, `:focus-visible` only. The codebase has the primitive (5 uses) and applies it to **zero** form controls, which is likely why three focus camps emerged. A two-layer ring (background-coloured inner + accent outer) survives on both surface and accent-filled backgrounds.
3. **Targets** per the table above.
4. **Dialogs use native `<dialog>`.**
5. **Every state change that matters announces** — `role="alert"` for errors, `role="status"` for successes, one shell-owned `ToastRegion`.
6. **Never encode meaning in colour alone.** `.cold { border-style: dashed }` on the corpus chip is the existing example of doing this right.
7. **Keyboard parity** — every pointer interaction has a keyboard path, including panel resizing, which has none today.
8. **Reduced motion honoured globally**, in `theme.css`.
9. **Disabled shifts a colour token, not only opacity.**
10. **`forced-colors` support.** This is a Windows-heavy operator tool and Windows High Contrast Mode overrides the palette aggressively — it will strip a border-only elevation system to nothing. A `@media (forced-colors: active)` block is required, alongside `prefers-contrast`.

### Not yet assessed

Screen-reader traversal of the shell plus 16 independently-mounted remotes in one document, focus management when remotes mount and unmount, and the `augment-it:navigate` event bus's effect on AT focus. These need a real audit with real assistive technology.

**Tooling note:** the Svelte 5 a11y lint is largely passing — only 4 `svelte-ignore` suppressions across 3 sites. **Every gap above is something the compiler does not check.**

---

## Enforcement

*Off-spec extension. A design system that depends on discipline decays (E7) — and a **federated** one decays faster, because there is no single reviewer who sees every change.*

`scripts/design-drift.mjs`, run in CI and as `pnpm design:drift`. **It runs per member and reports per member.** A federal system needs per-member attribution or nobody owns the failure.

**Hard fail — non-zero exit:**

| # | Check | Contract | Catches today |
|---|---|---|---|
| 1 | `var()` with no fallback to an undefined token | P3 | 45 declarations painting nothing |
| 2 | Tier-2 token not declared in all three mode blocks | P2 | the specificity trap, before it ships |
| 3 | Top-level rule not descending from the member's root class | **F3** | 103 leaked globals |
| 4 | Hardcoded hex outside `packages/theme` | **F8** | 33 dead fallbacks + live drift |
| 5 | Bare `button` / `input` / `body` element selector in a member | **F3** | element-level leakage, the stray `body {}` |
| 6 | `outline: none` without a documented replacement | 2.4.11 | 11 sites |
| 7 | Interactive element with no accessible name | **F7** | 14 placeholder-only inputs |
| 8 | Control height below `--control-h-sm` without a documented exception | **F7**, P10 | 10+ sites |
| **F1** | **Member declares a Tier-1 or Tier-2 custom property** | **F1** | — (new) |
| **F2** | **Member's prefix or root class missing from, or conflicting with, `federation.members`** | **F2** | `person-enrichment` mounts `.pe-app` but styles `.pd-*` |
| **F4** | **Raw `z-index` integer in a member** | **F4** | 25 declarations; 3 members + shell collide at `50` |
| **F5** | **`mount.ts` imports `mode-switcher`** | **F5** | — |
| **F6** | **Member has no `DESIGN.md`, or its frontmatter fails schema** | **F6** | 11 of 17 members (before this change) |
| **F9** | **Member violates a federal rule without a declared *Deviation*** | **F9** | — (new) |
| **F11** | **Tier-2 or Tier-3 declaration in `packages/theme` containing a literal colour.** Composition over a Tier-1 *or Tier-2* token passes. | **F11** | **0** ✅ — fixed in Phase 1 via `--color__shadow-black` / `--color__shadow-ink`. ⚠️ The `color-mix()` declarations are correct and must not be flagged; a check reporting any violation today is mis-implemented. |

**Report — warn:** scale histograms with off-scale values named · `@media` widths off the documented list · hardcoded `box-shadow` outside the theme · unnamespaced `@keyframes` name · **`title=` count, tracked down to zero** · **structurally equivalent components across members** (P9) · `shared-ui` primitive with fewer than two consumers (demotion candidate) · Tier 4 property not composed from a federal token where one exists · member context fragment over budget.

### The fidelity sweep — the half the script cannot do

**The drift script finds violations. It does not fix them, and it cannot read intent.** A `#c75bfb` in a member's CSS is a machine-detectable violation of F8; deciding whether the author meant `--color-accent`, meant a one-off that should become a Tier 4 property, or meant a colour we do not have yet and should — that is judgement, and it is where the remediation actually is.

[[context-v/loops/Sweep-Local-Federated-Design-System-for-Fidelity]] is the loop that does it. A developer says:

```
Run loop Sweep-Local-Federated-Design-System-for-Fidelity
```

and a coding agent works **inside one member**, scanning its CSS, its theme imports and its token usage across eight detectors — token inconsistencies, duplicated styles, components violating the system, unused tokens, accessibility, responsive behaviour, contract violations, and orphan values.

**It is documentation-first.** A run produces a **report** and changes nothing. Fixes are *proposed*, not applied, unless the developer adds `and implement` — and even then only the mechanical subset below.

**Its governing rule is the one that makes it safe to run against a sovereign member:**

> If a change alters a rendered pixel, it is a **proposal** that needs a human. If it only changes the name of a value that already renders identically, it is mechanical.

That line is what preserves local ownership. Substituting `var(--color-accent)` for a hex that already resolves to that exact value changes how the member *says* something. Snapping an off-scale `11.2px` to `--text-label` changes what the member *decided*, and the member decides. **The loop may change the first and never the second** — and every accessibility and responsive finding is in the second category, without exception.

#### Why it exists

Three gaps, none of which the drift script can close.

**1. Detection is not remediation.** `pnpm design:drift` produces a list. Someone still has to decide, per line, whether a hardcoded value wants a federal token, a Tier 4 property, or a federal gap raised. That decision is judgement, and until somebody makes it the list just grows. **A backlog that only ever gets longer stops being read.**

**2. A federated system has no reviewer who sees every change.** That is the deliberate trade — sixteen authors, no central queue, because the central queue was measurably ignored. The cost is that nothing sits between a member's CSS and production except the member's own author. The sweep is the periodic second read that a single-owner design system gets for free and this one does not.

**3. Drift is invisible at the moment it is created and expensive later.** The author writing `#c75bfb` at 2am is not being careless — the value is correct, on their screen, in dark mode. What they cannot see is that it will not respond to a mode switch, will not track the palette when it moves, and is invisible to the portal and to every agent that reads names rather than values. **By the time it is visible it is 158 button rule-sets.**

#### When developers should run it

Human triggers are workflow-shaped — points where a decision is about to be made that drift would corrupt.

| Run it | Because |
|---|---|
| **Before promoting a member's tier** | Tier is documentation depth. Documenting drift as though it were design makes it permanent. |
| **After a batch of feature work** in a member | The window where the author was thinking about the feature, not the vocabulary. That is when hardcoding happens. |
| **When a federal token family ships** — a 🔶 becomes ✅ | Values that had no legal home now have one. Each of `--text-*`, `--space-*`, `--radius-*` landing opens a sweep-shaped hole in **every** member. |
| **Before a member opts into `compliance.enforcement: fail`** | The ramp is per-member. This loop is how a member earns its way up it. |
| **When `compliance.failing` grows** | A new failing check with no declared *Deviation* is exactly what F9 fails on. |
| **On adopting a new contract version** | Re-validation without remediation just relabels the debt. |
| **Before an accessibility review** | The sweep gathers the F7 evidence the review would otherwise spend its time collecting. |
| **When inheriting a member** you did not write | Fastest way to learn what it actually owns versus what it accumulated. |

**Do not run it across the whole federation in one pass.** Seventeen members in one diff is unreviewable, and a single agent normalising every member is precisely the central-owner failure this architecture exists to avoid. **One member per run.**

**Do not run it while a token family is mid-migration** — sweeping onto a half-shipped vocabulary means sweeping twice — and never as a side effect of unrelated work. The sweep produces a document that wants its own read, and in implement mode a diff that wants its own review.

#### When AI coding agents should run it

**Agent triggers are different in kind, and the most important one is self-directed.** A developer runs the sweep on a schedule shaped by their workflow. An agent should run it in response to conditions it can detect *in its own work*, because **the agent is usually the one that just created the drift.**

| Trigger | What the agent does |
|---|---|
| **It just wrote CSS in a member** | Run in **report mode, scoped to its own diff**, before handing back. Do not hand back styling work unswept. |
| **It is asked to "clean up the styles" / "make this consistent"** | **That request *is* this loop.** Run it instead of improvising — improvised cleanup is homogenisation, and it is how a member loses design it deliberately owned. |
| **It reaches for a hardcoded value** because no token seems to fit | Stop and sweep the member first. The question *"is this a federal gap or do I just not know the vocabulary?"* is answered by X1 and X8, not by guessing. |
| **It is about to propose promoting a pattern to `shared-ui`** | X2 is the evidence. A promotion argued without duplication counts is an opinion. |
| **It is starting substantial work in a member it has not touched this session** | One report-mode run is cheaper than discovering the member's conventions by reading its CSS — and it surfaces the *declared deviations* that must not be "corrected". |

**Four hard rules for agents.** These are the ones that turn a useful loop into a destructive one when broken:

1. **Never self-authorise implement mode.** `and implement` comes from the developer. An agent that decides on its own to apply fixes has converted a report into an unreviewed change to a shared surface. **In doubt, report.**
2. **Never fan out across members.** The instinct to parallelise seventeen sweeps is exactly the failure this architecture exists to prevent — and an agent is far more likely to act on it than a person, because the cost feels like nothing. One member.
3. **A sweep is the exception to the two-file rule, not a repeal of it.** Routine work in a member reads `.design-context.json` plus the file being changed, and nothing else. The sweep deliberately reads more — so run it *as a task*, not as a preamble to every edit. An agent that sweeps before each small change has spent its context window on ceremony.
4. **Read the member's *Deviations* before scanning, never after.** An agent pattern-matching violations without that context will report settled decisions as findings — and in implement mode, revert them. **A declared deviation is a decision, not drift.**

#### How it preserves fidelity across local and federated systems

The word doing the work is *fidelity* rather than *compliance*. A member is not being made to match the others; it is being helped to say what it already means in the shared vocabulary. Five structural properties keep that true:

**1. It reads federal, writes local — and that asymmetry is enforced, not encouraged.** `packages/theme` and this document are read-only to the loop in **both** modes. A member can never amend the constitution by way of a cleanup pass, which is what makes it safe to run a sweep without federal review.

**2. The Bucket A/B line is drawn exactly where ownership changes hands.** Vocabulary is federal; decisions are local. Rewriting `#c75bfb` as `var(--color-accent)` changes only which words the member uses for a thing it already decided. Snapping `11.2px` to `--text-label` changes the decision — so the member's owner makes it. **Every accessibility and responsive finding falls on the ownership side, without exception**, because those change rendered output and often markup.

**3. Findings route by owner, not by whoever noticed them.** A theme defect found while sweeping `pack-runner` goes to the federal owner. Cross-member duplication becomes a promotion conversation, not an edit. An unused federal token is reported as a *candidate* — one member's evidence cannot support a seventeen-member claim. **Nothing is fixed by the party that happened to find it**, which is the discipline that keeps sovereignty from eroding one convenience at a time.

**4. Declared deviations are protected, not swept.** Federation permits divergence **when it is declared** (F9). A member that documented why it departs from a federal rule has done the right thing, and the loop's job is to preserve that record — including reaffirming it in the report so it stays visible. **Fidelity is not uniformity;** a system that erased its own declared exceptions would have replaced a federation with a style guide.

**5. It closes the loop the drift script leaves open, per member.** The script detects federally and reports per member; the sweep remediates locally and reports per member; the delta between runs is what tells you whether either is working. **A sweep whose exact-drift count has not moved since the last run is a more important finding than any single line in it.**

---

The loop document carries the full procedure: the invocation contract, the scan commands, the eight detectors, the Bucket A / Bucket B split, the ownership guard, the report template, the verification steps, and the stop conditions.

### The adoption ramp

*Added at contract 2.0. The contract was written in present tense while roughly 13 of 17 members violated F3, F4 or F7 on day one. A check that fails the build for everyone immediately is a check somebody disables at 2am, and a disabled check is worse than no check because it looks like coverage.*

`federation.adoption_phase` in this document's frontmatter is the global switch. **It is currently `warn`.**

| Phase | Behaviour | Exits when |
|---|---|---|
| **`warn`** *(now)* | Every check runs and reports. **Nothing fails the build.** Per-member counts are published each run so the trend is visible. | Baseline is published and every member has a `compliance:` block. 🚪 **Owner: Blake; due at the M2 boundary.** *An exit condition with no owner and no date is how a ramp becomes permanent — added at 0.0.3.2 after review.* |
| **`fail-new`** | A **new or modified** file must pass. Existing violations still warn. **This is the phase that stops the bleeding** — it costs nothing to comply going forward and does not demand a migration first. | M4 (namespace containment) exits |
| **`fail`** | Any violation fails the build. | — |

**Per-member override.** A member that reaches full compliance early opts into `fail` for itself via `compliance.enforcement: fail` in its own frontmatter, without waiting for the federation. `request-reviewer` qualifies today.

**Each member declares its own status**, so the ramp is legible per member rather than as one global number:

```yaml
compliance:
  contract_version: "2.0"    # the version this member was validated against.
                             # Current while the federal MAJOR is still 2.
  enforcement: warn          # warn | fail-new | fail
  passing: [F1, F2, F5, F6, F8]
  failing: [F3, F4]          # each must appear in Deviations with a gate
  unassessed: [F7]           # no audit has run
```

⚠️ **`failing:` and *Deviations* must agree.** Check `F9` fails a member that lists a failing contract item with no corresponding declared deviation — that is the check that stops the ramp from becoming a place to park violations quietly.

### The `DESIGN.md` frontmatter schema

*Added at contract 2.0. `F6` previously failed a member whose "frontmatter fails schema" while no schema existed anywhere — making it either unimplementable or satisfiable by an empty document.*

**Required in every member document:**

| Field | Type | Rule |
|---|---|---|
| `name` | string | Matches the directory name |
| `semantic_version` | `N.N.N.N` | Bumped on every amendment |
| `date_modified` | ISO date | |
| `extends` | path | Resolves to the federal document |
| `federation.layer` | `local` | |
| `federation.prefix` | string | Matches `federation.members` in the federal document (**F2**) |
| `federation.root_class` | selector | Matches `federation.members` (**F2**) |
| `federation.tier` | `A`\|`B`\|`C` | |
| `federation.contract_version` | string | **Major** must match the federal major, or the member is stale. A trailing minor is current — see *The federation contract* |
| `federation.owner` | string | |
| `federation.z_tokens` | list | Checked against actual CSS (**F4b**) |
| `components` | list | Local components only |
| `tokens_member` | list | Tier 4 properties; `[]` is valid |
| `compliance` | map | Per the adoption ramp above |

**Required body sections by tier:** Tier C — *Overview*, *Deviations*. Tier B — plus *Components*, *Consumes from shared-ui*. Tier A — plus *Patterns*, *Do's and Don'ts*.

**`tokens_local` is retired at 2.0** — it meant "must be empty", which Tier 4 makes wrong. Use `tokens_member`.

**The portal is the human half** — every token, scale and component variant × state, in all three modes, across every member, on one inspectable surface. It is also where every 🚪 gate in this document is resolved. See [[context-v/specs/Federated-Design-System-Architecture]].

**Visual regression.** Two different blast radii, and they need two different controls — an earlier draft named only one and it was the wrong one.

| Change | Blast radius | Control |
|---|---|---|
| A `shared-ui` primitive | Its consumer count | Screenshot the portal's component gallery, three modes |
| **A federal token** | **All 17 members** | ⚠️ **Screenshotting the portal does not catch this.** The portal renders *documentation*; a token change breaks *running members*. Requires screenshots of each member's real surface, mounted, in three modes. |

**The second row is the one that matters and the one we cannot do today.** A token change is the highest-blast-radius edit available in this system, and the only current control is that one person is making all of them. That is B2's bet showing up as a concrete risk.

🚪 **Gate (A17):** per-member visual regression, or an explicit acceptance that federal token changes ship unverified. **Do not leave this implicit.**

---

## Contributing

*Off-spec extension.*

### Ownership

| | |
|---|---|
| **Federal layer owner** | Blake — accountable for this document's accuracy against the runtime |
| **Local layer owners** | Each member's author, named in that member's `DESIGN.md` frontmatter. ⚠️ **All seventeen currently name Blake** — see *A note on ownership* below |
| **Approvers** | Michael Staton (architecture), CEO (scope and priority) |
| **Review cadence** | Every phase boundary; a drift-script run is the input |
| **Amendment** | Bump `semantic_version`, add a `revisions:` line, update `date_modified` in the same edit |
| **Contract change** | Any **breaking** edit to F1–F11 bumps `federation.contract_version`'s major and requires re-validating every member. A rule binding only `packages/theme` (F11) is additive — minor bump, no re-validation |
| **Escalation** | Any 🚪 gate unresolved at its milestone blocks that milestone's exit |

### A note on ownership — this architecture is a bet

*Added at contract 2.0, after an architecture review pointed out that the justification and the reality disagree.*

This system is justified by *"sixteen remotes authored and deployed independently, by different people, at different times."* **Today all seventeen members name the same owner.** Federation is therefore solving a coordination problem the team does not yet have.

**That is a deliberate bet, and it should be priced as one rather than presented as a description.**

| The bet | The cost if right | The cost if wrong |
|---|---|---|
| The team grows and members get distinct owners | The contract is already in place before the first cross-owner collision — which is the only time it is cheap to add | We maintain seventeen documents, a nine-clause contract and a promotion path to coordinate a team of one |

**Why it is still the right call now.** Every contract item exists because of a defect **already in the codebase**, written by one team: 99 leaked selectors, `.row-name` collisions decided by load order, four structurally-equivalent component pairs, four members independently choosing `z-index: 50`. Those are coordination failures *without* multiple owners. Adding owners makes them more frequent, not different in kind.

**What follows from naming it as a bet:**

- Scope is the CEO's call to price, not an engineering assumption to absorb
- If headcount does not arrive, the correct response is to **collapse tiers and shrink the contract** — not to keep maintaining ceremony for absent owners
- `owner:` fields are aspirational today. When a member gets a real distinct owner, that is the signal the bet is paying off — and the trigger to move `adoption_phase` forward

### The sync contract

| Trigger | Required update |
|---|---|
| New custom property in `:root` | Add to the token group + prose section **here** (federal only) |
| Token value changed | Update value; if non-trivial, update the prose |
| Token renamed | Rename **and grep every member's prose for references** |
| **New member added** | Add to `federation.members` + *Local design systems* + scaffold its `DESIGN.md` |
| **Member's prefix or root class changed** | Update `federation.members` — this is a contract change (F2) |
| New component shipped in a member | Add to **that member's** `DESIGN.md`, not this one |
| Component promoted to `shared-ui` | Add to `components:` here + [[packages/shared-ui/DESIGN.md]] + note in each consuming member |
| New mode added | Extend `modes:` + update *Overview — Brand & Style* |
| Scale extended | Add the step + update the matching section |
| **A `Don't` learned the hard way** | Add to *Do's and Don'ts* — **federal** if it can bite another member, **local** otherwise |

**Not** triggers: bug fixes changing no values, refactors moving CSS between files, one-off page styles.

**When code and doc disagree, trust the code and fix the doc.** The only exception is 🔶 material, which by design describes a future runtime.

### Adding a token — federal only

1. **Usually you need both.** A new colour is a **Tier 1 name** (the value) plus a **Tier 2 role** pointing at it (the job). Adding only Tier 1 gives you a colour nothing may use; adding only Tier 2 gives you a literal, which fails **F11**.
2. **Name Tier 1 for what it is** — `burnt-orange`, `amber-bright` — never for where it is used, and never in a way that implies an ordering it does not honour (see *Naming rules*, 🚪 A19).
3. **Check whether Tier 1 already has it.** Re-pointing an existing role at an existing name is the cheapest change in this system and it is frequently the right one. A second name for a colour we already have is how a palette doubles.
4. **Dimensional token?** Skip Tier 1 — `--space-*`, `--radius-*`, `--text-*` sizes and `--z-*` are Tier 2 only, by rule. See *Where Tier 1 is required, and where it is noise*.
5. Declare the Tier-2 token in **all three mode blocks** (P2), even if the value is identical.
6. Add it to the matching table here, **with its evidence**.
7. Add it to the portal.
8. Run the drift check.

**A member never adds a *federal* token.** It may add Tier 4 properties under its own prefix freely (see *Token architecture*).

### When you need a federal token that has not shipped

*Added at contract 2.0. The previous instruction was "raise a federal gap" with no timeline. Tokens land across phases; a member blocked today will hardcode, and hardcoding-while-waiting is exactly how 22 phantom warn-dialect declarations and 33 dead fallbacks got written.*

**Provisional tokens.** A member that needs a federal token before it ships declares it Tier 4 with a `--<prefix>-provisional-` marker:

```css
.pe-app { --pe-provisional-warn-bg: #3a2f1b; }   /* → --color-warn-bg, M2 */
```

| Rule | |
|---|---|
| **Named for its federal successor** | The rename must be mechanical when the real token lands |
| **Listed in `tokens_member`** with the target token and milestone | Makes the debt countable |
| **Drift reports every provisional token by name and age** | An old provisional is a federal gap nobody raised |
| **Deleted in the same commit that adopts the federal token** (E8) | |

**This is deliberately more work than hardcoding.** The point is not to make the shortcut comfortable — it is to make it *visible and reversible*, which a raw hex value is not.

⚠️ **A provisional token is not permission to skip raising the gap.** File it the same day; the provisional is what unblocks you meanwhile.

### Adding a component — local

1. Does the member's `DESIGN.md` already list something that does this? Reuse it.
2. Does `shared-ui` already have it, and does it fit? Consume it.
3. Tier-2/Tier-3 tokens only. Zero hardcoded values.
4. Document the a11y contract in the file header.
5. Add it to **the member's** `DESIGN.md` with a stable anchor id.
6. Walk it through **both** principle lists — the 12 interaction principles and P1–P13 here. A violation is **a deliberate choice to be defended in *Deviations***, not an oversight.
7. If no principle covers it, **add one when you ship, with its evidence.**

### Review checklist

- [ ] `pnpm design:drift` exits zero **for this member**
- [ ] Every new `var()` references a defined token (P3)
- [ ] No token declared locally (F1)
- [ ] Any new federal token added as **a Tier-1 name plus a Tier-2 role**, not a literal in Tier 2 (F11)
- [ ] Every selector namespaced to the member root class (F3)
- [ ] No raw `z-index` integer (F4)
- [ ] No hardcoded hex or `box-shadow` outside `packages/theme` (F8)
- [ ] Any new `@keyframes` name is prefixed
- [ ] Verified in **light, dark and vibrant** — vibrant is forgotten, light is where assumptions break
- [ ] Verified **standalone and mounted in the shell** (E6)
- [ ] Contrast ≥4.5:1 · target ≥`--control-h-sm` or documented exception · `:focus-visible` present · accessible name present (F7)
- [ ] Copy follows *Content & Voice*
- [ ] **The member's `DESIGN.md` updated** (F6); this document updated only if a federal sync trigger fired
- [ ] Any federal deviation declared under *Deviations* (F9)
- [ ] **If this change touched CSS or tokens** — a fidelity sweep run in report mode over the diff, and its findings either fixed or recorded (see *Enforcement — The fidelity sweep*)
- [ ] Changelog entry written

---

## Starting a new remote

*Off-spec extension. E9: the system has 17 members and will get more. If getting a new one right requires reading this document, it will be got wrong.*

`pnpm create-remote <name>` scaffolds:

```
apps/<name>/
  DESIGN.md         # the local contract — scaffolded, not optional (F6)
  src/
    index.ts        # theme.css → mode-switcher → app.css, in that order
    mount.ts        # theme.css → app.css (no mode-switcher — the shell owns data-mode)
    App.svelte      # root element carries .<prefix>-app
    app.css         # every rule descends from .<prefix>-app
    css.d.ts
  package.json      # @augment-it/theme + @augment-it/shared-ui as workspace:*
```

**Non-negotiables baked into the template**, so they cannot be forgotten:

| | Contract |
|---|---|
| A unique root class and 3–4 letter prefix, **claimed in `federation.members` by the scaffold itself** | F2, P7 |
| `DESIGN.md` generated with frontmatter pre-filled from the scaffold's own arguments, valid against the schema | **F6** |
| `.design-context.json` generated alongside it | *Reading this system* |
| `index.ts` imports `theme.css` before `app.css` — standalone has no shell | `var()` resolution order |
| **`mount.ts` imports only `./app.css`** — never `theme.css`, never `mode-switcher` | **F10**, F5, E2 |
| `app.css` starts empty, with a comment pointing at `shared-ui` | P9 |
| The drift script runs against the new member from its first commit | F6, E7 |
| `z-index` only from the four remote-local tokens | F4, P8 |

**A new remote should need almost no CSS.** If it needs more than a layout grid, that is the signal a `shared-ui` primitive is missing or a promotion candidate has appeared — the promotion path firing at exactly the right moment. This is the mechanism by which the system gets *better* as the product grows rather than worse.

**The scaffold is the enforcement.** Under federation nobody reviews every member. What makes seventeen sovereign systems comply is that the correct thing is what the generator produced.

---

## Do's and Don'ts

### Federal — these bite other members

**Do** define a token in all three mode blocks, even when the value is identical.
**Don't** rely on source order. `:root` and `[data-mode='light']` are both specificity (0,1,0) — light wins only because it appears later in the file.

**Do** consume Tier-2 tokens from `packages/theme`, and let the shell inject the token layer once.
**Don't** import `theme.css` from a `mount.ts`. Sixteen copies of the federal vocabulary in one document race on chunk load order the moment two members deploy at different times (F10).

**Do** declare genuinely-local geometry as a Tier 4 property under your prefix.
**Don't** declare a colour, type size, radius or shadow locally. Those are federal by category, and a prefix does not make a forked palette safe (F1).

**Do** namespace every selector to the member's root class.
**Don't** ship `.row`, `.error`, `.muted` as globals from a federated remote. When two remotes both define `.row-name`, the winner depends on chunk load order — and today `pack-runner` and `sort-filter-lens` both do.

**Do** namespace `@keyframes` names too.
**Don't** assume animation names are scoped. They are global, like selectors. Six spinners share four names across members.

**Do** take `z-index` from the four remote-local tokens.
**Don't** write a raw integer. Three members and the shell independently chose `50`; none of them can see the others.

**Do** put shadows in `--fx-*` tokens.
**Don't** hardcode a `box-shadow`. 47% of the product's shadows are hardcoded and every one keeps a heavy black drop on warm paper in light mode.

**Do** let the shell own `data-mode`, the `ToastRegion`, and slot geometry.
**Don't** mount a second mode-switcher or a second toast region from a remote.

**Do** treat a `var()` fallback as a safety net.
**Don't** treat it as the value. `var(--radius-md, 6px)` in one member and `var(--radius-md, 8px)` in another is two design decisions wearing one name.

**Don't** ship `var(--undefined-token)` with no fallback. It is invalid at computed-value time — which is how four apps ended up painting transparent root surfaces on a live deploy without anyone noticing.

**Do** name Tier-2 tokens for their role.
**Don't** abbreviate. `--color-bg` alongside `--color-background` cost 62 broken declarations and a production defect.

**Do** check the ramp before adding a colour token.
**Don't** assume a higher step number means darker. `paper-200` is lighter than `paper-100`; `graphite-700` is darker than `graphite-900`.

**Do** publish a `DESIGN.md` before the member's first component ships.
**Don't** treat documentation as a follow-up. Under federation an undocumented member is invisible to the portal, to other members, and to every agent (F6).

**Do** declare a federal deviation in your *Deviations* section.
**Don't** silently break a contract. An undeclared deviation is indistinguishable from a bug (F9).

**Do** re-point a Tier-2 role at a different Tier-1 name when the brand moves.
**Don't** edit a hex in place across three mode blocks. Re-pointing is one reviewable line; editing values is how you discover in vibrant, three weeks later, that one of the three did not get changed.

**Don't** put a literal in a Tier-2 declaration (F11). A value with no name is invisible to re-skinning, to the portal, and to every agent that reads names instead of values. Two of ours prove it — nobody noticed `--fx-card-shadow` was raw `rgba()` until the tier rule was written down.

**Do** name a Tier-1 token for what it looks like — `burnt-orange`, `amber-bright`.
**Don't** name it for where it is used. `--color__button-bg` is a Tier-2 token wearing a Tier-1 name, and it will be wrong the first time something else needs the colour.

**Don't** invent a hex when the token you want does not exist. Add the Tier-1 name and point a role at it, or raise the federal gap and use a provisional. The 33 dead fallbacks and 47% hardcoded shadows are all the same move made sixteen times.

### Local — these bite only you

**Do** derive tints with `color-mix()`.
**Don't** hand-roll `rgba(120,160,255,0.12)`. That exact value appears 9 times as a fallback for a token defined since May.

**Do** shift a colour token for a disabled state.
**Don't** reach for `opacity` alone. It produced five disabled values here — including `0.9`, which is not a perceptible affordance.

**Do** use `:focus-visible`.
**Don't** write `outline: none` and replace it with a 1px border swap between adjacent palette values. One such rule here is a no-op; another **erases the focus indicator entirely in light mode**.

**Do** use the platform primitive — `<dialog>`, `<details>`, `<button>`.
**Don't** hand-roll an overlay. Eight were; zero trap focus, zero restore it, five cannot be closed with Escape.

**Do** give every input a real `<label for>`.
**Don't** style a `<span>` to look like a label. That pattern exists here deliberately — the CSS styles `label` and `.sc-label` identically — and it produces controls a screen reader cannot name.

**Do** announce state changes with a live region.
**Don't** assume a visible banner is a communicated banner. This product has two live regions and neither is an error.

**Do** report progress on long operations.
**Don't** ship a spinner and call it progress. The team earned a principle requiring this and the system had no way to express it.

**Do** let density yield to target size.
**Don't** ship a 15px-tall button because the design is dense. Use the spacing exception deliberately and document it, or make the control bigger.

**Do** consider promoting a pattern a third member now needs.
**Don't** copy a component file between members. Four components are currently byte-identical duplicates across two members each (P9).

**Do** re-read the runtime CSS before writing into any `DESIGN.md`.
**Don't** copy values from `splash/DESIGN.md`. It is a different design system with a different default mode, a different magenta, and a spacing scale built for a marketing page.

---

## See also

- [[context-v/specs/Federated-Design-System-Architecture]] — why the federation is shaped this way
- [[context-v/specs/Design-System-Portal]] — the portal that aggregates every member's documentation (P0 and P1)
- [[context-v/specs/Design-Context-Artifacts]] — the JSON contracts an agent reads instead of this document
- [[context-v/specs/Design-Drift-Enforcement]] — the script that makes F1–F11 real rather than prose
- [[context-v/loops/Sweep-Local-Federated-Design-System-for-Fidelity]] — **the per-member remediation loop.** The script finds drift; this is how a member fixes it without surrendering local ownership. See *Enforcement — The fidelity sweep* for when to run it.
- [[packages/theme/DESIGN.md]] — the full federal token reference
- [[packages/shared-ui/DESIGN.md]] — the opt-in primitives catalogue and promotion path
- [[context-v/plans/Impose-the-Full-Token-Vocabulary-on-augment-it]] — the roadmap that lands every 🔶 in this document
- [[context-v/explorations/Design-Language-Audit-2026-07]] — the raw measurements behind every claim here
- [[context-v/specs/Shell-and-Micro-Frontend-UX-Coherence]] — the 12 earned interaction principles a new affordance must also walk
- [[context-v/plans/Impose-Theme-Modes-System]] — the shipped three-mode system this extends
- [[context-v/specs/Tooltip-System]] — the stub spec that replaces 123 native `title=` attributes
- `theme-system` skill — owns the token architecture; this document describes it
- `maintain-design-md` skill — owns this document's shape and its sync triggers
