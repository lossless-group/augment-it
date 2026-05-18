---
version: alpha
name: Augment It — Splash
description: >-
  Design system for the augment-it splash site. Three-mode contract
  (vibrant-default / dark / light) with a magenta-violet-iris brand spine
  pulled straight from the augment-it wordmark gradient, monospace-forward
  typography (JetBrains Mono display + Space Grotesk body), and a
  module-federation-manifest aesthetic — dot-grid ornament, corner-tick
  framed cards, version-chip ledger meta. Tokens mirror the CSS custom
  properties in src/styles/theme.css — that file remains the runtime
  source of truth; this DESIGN.md is the human- and agent-readable
  contract.

# ── Tier-1 raw values — mode-invariant ─────────────────────────────────
# These are the primitives. Semantic tokens (below) map onto these and
# rebind per <html data-mode="...">. The vibrant-mode bindings are the
# defaults; dark and light bindings live under modes: below.
colors:
  # ── Brand spine — straight from the augment-it wordmark gradient ────
  # Wordmark linear-gradient stops: B62DC2 → 794AC3 → CB5BDE → 7D32C6 →
  # C157F2 → 6A16AB. The three pairs below name them.
  magenta: "#cb5bde"
  magenta-deep: "#b62dc2"
  magenta-soft: "#efb6f7"
  violet: "#794ac3"
  violet-deep: "#6a16ab"
  violet-soft: "#b9a0ee"
  iris: "#c157f2"
  iris-deep: "#7d32c6"
  iris-soft: "#e0b3ff"

  # ── Signal hues — off-spine, used for status / mode-specific threads
  cyan: "#4ad7ff"          # "live" / status-thread in vibrant mode
  amber: "#ffb547"          # "wip" / Archive-Backfill / warm warning
  lime: "#9ce86b"           # "thread" in dark mode

  # ── Editorial neutrals — the ink-pad axis ───────────────────────────
  ink-deep: "#0a0712"
  ink: "#14101e"
  ink-soft: "#1f1830"
  charcoal: "#251d3a"
  slate-700: "#3a3052"
  slate-500: "#6b5f86"
  slate-400: "#8a7da3"
  slate-300: "#aaa0c0"
  slate-200: "#cdc4de"
  slate-100: "#e7e2ef"
  paper: "#f7f4fa"
  paper-soft: "#efe9f4"
  paper-deep: "#e2d8eb"

  # ── Semantic — vibrant-mode bindings (the defaults) ─────────────────
  # When data-mode="vibrant" (or unset), these are the active values.
  # See modes: below for dark / light overrides.
  surface-base: "{colors.ink-deep}"        # body background
  surface-soft: "{colors.ink}"             # next-shade-up surface
  surface-elevated: "{colors.charcoal}"    # palette window, modals, header backdrop
  surface-card: "rgba(31, 24, 48, 0.78)"   # cards (slightly translucent ink-soft)
  surface-code: "#060410"                  # code blocks, version chips bg

  on-surface: "#f6eefb"                    # primary text
  on-surface-soft: "{colors.slate-200}"    # secondary text
  on-surface-dim: "{colors.slate-400}"     # tertiary / metadata
  on-surface-dimmer: "#786994"             # weakest
  on-surface-faint: "#58496f"              # almost-invisible (timestamps)

  primary: "{colors.magenta}"              # primary accent (vibrant default)
  primary-soft: "{colors.magenta-soft}"    # hover / glow variant
  accent-warm: "{colors.iris}"             # secondary accent
  accent-hot: "{colors.magenta-deep}"      # deepest accent (pressed states)

  thread: "{colors.cyan}"                  # "live" status-thread color
  thread-soft: "#a8ecff"

  border: "rgba(203, 91, 222, 0.16)"       # default border (magenta @ 16%)
  border-strong: "rgba(203, 91, 222, 0.36)"# pill borders, kbd borders
  border-accent: "rgba(193, 87, 242, 0.62)"# hover / focus borders (iris @ 62%)

  # ── Archive marker (off-spine; used to tint archived eras / cards) ──
  archive: "{colors.amber}"

typography:
  # Two families. Both ride together — JetBrains Mono for anything that
  # should feel "engineered" (display, mono, eyebrows, code chips, button
  # labels in some places) and Space Grotesk for sans body and headings.
  # The display family is monospace on purpose — augment-it is a data
  # tool, and the splash should read like one.
  display-hero:
    fontFamily: Space Grotesk
    fontSize: 3rem                  # clamp(2rem, 4.6vw, 3rem) at top
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 2.4rem                # used on /changelog and /context-v list pages h1
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: -0.018em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 1.4rem                # entry-list titles, module-card titles
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: -0.012em
  headline-sm:
    fontFamily: Space Grotesk
    fontSize: 1.18rem
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Space Grotesk
    fontSize: 1.1rem                # manifest tagline, page ledes
    fontWeight: 400
    lineHeight: 1.55
  body-md:
    fontFamily: Space Grotesk
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.6
  body-sm:
    fontFamily: Space Grotesk
    fontSize: 0.92rem               # module-card body / prose preview
    fontWeight: 400
    lineHeight: 1.55
  mono-md:
    fontFamily: JetBrains Mono
    fontSize: 0.85rem               # pipeline rail, sort controls
    fontWeight: 500
    lineHeight: 1.4
  mono-sm:
    fontFamily: JetBrains Mono
    fontSize: 0.72rem
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: 0.04em
  label-eyebrow:
    fontFamily: JetBrains Mono
    fontSize: 0.72rem
    fontWeight: 500
    lineHeight: 1
    letterSpacing: 0.18em
  label-pill:
    fontFamily: JetBrains Mono
    fontSize: 0.7rem
    fontWeight: 500
    lineHeight: 1
    letterSpacing: 0.06em
  label-version:
    fontFamily: JetBrains Mono
    fontSize: 0.66rem               # ver-chip
    fontWeight: 500
    lineHeight: 1
    letterSpacing: 0.04em

rounded:
  # Squarer than memopop and content-farm; the "module manifest" feel
  # wants edges. Pills stay round.
  sm: 2px      # ver-chip, chip, from-tag, kbd
  md: 4px      # btn, cards (most), input
  lg: 6px      # search-compact panel, manifest-card variant
  xl: 10px    # hero panels, large containers
  full: 9999px # status pills, search-compact trigger, mode-toggle items

spacing:
  base: 1rem
  "1": 0.25rem      # 4px
  "2": 0.5rem       # 8px
  "3": 0.75rem      # 12px
  "4": 1rem         # 16px
  "5": 1.25rem      # 20px
  "6": 1.5rem       # 24px
  "8": 2rem         # 32px
  "10": 2.5rem      # 40px
  "12": 3rem        # 48px — section gap
  "16": 4rem        # 64px — hero block padding
  "20": 5rem        # 80px
  "24": 6rem        # 96px — site-footer top margin

  # Layout-named tokens
  container-max: 1180px
  container-narrow-max: 760px
  container-padding: 24px           # {spacing.6}
  grid-pitch: 32px                  # dot-grid ornament pitch (--grid-pitch)
  header-height: 64px

components:
  # ── Pill (status indicator) ───────────────────────────────────────────
  pill:
    backgroundColor: "rgba(246, 238, 251, 0.04)"   # color-mix of on-surface
    textColor: "{colors.on-surface-soft}"
    typography: "{typography.label-pill}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
    border: "1px solid {colors.border-strong}"
  pill-stable:
    textColor: "{colors.thread}"
    backgroundColor: "rgba(74, 215, 255, 0.12)"
  pill-beta:
    textColor: "{colors.primary}"
    backgroundColor: "rgba(203, 91, 222, 0.12)"
  pill-alpha:
    textColor: "{colors.accent-warm}"
    backgroundColor: "rgba(193, 87, 242, 0.12)"

  # ── ver-chip (semver / manifest-version badge) ───────────────────────
  ver-chip:
    backgroundColor: "rgba(203, 91, 222, 0.08)"
    textColor: "{colors.primary}"
    typography: "{typography.label-version}"
    rounded: "{rounded.sm}"
    padding: "1px 6px"
    border: "1px solid rgba(203, 91, 222, 0.36)"

  # ── chip (inline code-styled tag for paths / syntaxes) ───────────────
  chip:
    backgroundColor: "{colors.surface-code}"
    textColor: "{colors.on-surface-soft}"
    typography: "{typography.mono-md}"
    rounded: "{rounded.sm}"
    padding: "2px 7px"
    border: "1px solid {colors.border}"

  # ── from-tag (provenance / submodule-origin tag) ─────────────────────
  from-tag:
    backgroundColor: "rgba(74, 215, 255, 0.12)"
    textColor: "{colors.thread}"
    typography: "{typography.mono-sm}"
    rounded: "{rounded.sm}"
    padding: "3px 9px"
    border: "1px solid rgba(74, 215, 255, 0.35)"

  # ── btn (default / ghost) ────────────────────────────────────────────
  btn:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: "10px 18px"
    border: "1px solid {colors.border-strong}"
  btn-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface-base}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: "10px 18px"

  # ── module (FeatureCard) — the corner-tick framed primary card ──────
  module:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: "{spacing.6}"
    border: "1px solid {colors.border}"
    # Corner ticks: 10px L-shapes anchored at each corner via absolutely-
    # positioned divs with 2px borders in {colors.primary}.
    cornerTickColor: "{colors.primary}"
    cornerTickSize: "10px"
  module-featured:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: "{spacing.6}"
    border: "1px solid rgba(203, 91, 222, 0.42)"
    # Adds a "Featured" pill at top-left in primary color, surface-base text

  # ── search-compact (header search popover) ───────────────────────────
  search-compact-trigger:
    backgroundColor: "rgba(246, 238, 251, 0.04)"
    textColor: "{colors.on-surface-soft}"
    typography: "{typography.mono-sm}"
    rounded: "{rounded.full}"
    padding: "6px 12px 6px 10px"
    border: "1px solid {colors.border-strong}"
  search-compact-panel:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: "{spacing.4}"
    border: "1px solid {colors.border-strong}"

  # ── mode-toggle (vibrant / dark / light selector) ───────────────────
  mode-toggle:
    backgroundColor: "{colors.surface-elevated}"
    rounded: "{rounded.md}"
    padding: "3px"
    border: "1px solid {colors.border-strong}"
  mode-toggle-button:
    backgroundColor: transparent
    textColor: "{colors.on-surface-dim}"
    rounded: "{rounded.sm}"
    size: "32px"
  mode-toggle-button-active:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface-base}"

  # ── sort-controls (per-page list ordering, header for /changelog & /context-v) ──
  sort-controls:
    backgroundColor: "{colors.surface-elevated}"
    typography: "{typography.mono-md}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
    border: "1px solid {colors.border}"
  sort-controls-chip:
    backgroundColor: transparent
    textColor: "{colors.on-surface-dim}"
    typography: "{typography.mono-sm}"
    rounded: "{rounded.sm}"
    padding: "4px 10px"
  sort-controls-chip-active:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface-base}"

  # ── pipeline-rail (the six MFE flow on the splash index) ─────────────
  pipeline-rail:
    backgroundColor: "rgba(74, 215, 255, 0.04)"
    typography: "{typography.mono-md}"
    rounded: "{rounded.md}"
    padding: "16px 20px"
    border: "1px solid rgba(74, 215, 255, 0.25)"
  pipeline-step:
    backgroundColor: "rgba(203, 91, 222, 0.10)"
    textColor: "{colors.on-surface}"
    typography: "{typography.mono-md}"
    rounded: "{rounded.sm}"
    padding: "4px 10px"
    border: "1px solid rgba(203, 91, 222, 0.30)"

  # ── folio (manuscript-style section marker; data-num as a chip) ─────
  folio:
    typography: "{typography.label-eyebrow}"
    textColor: "{colors.on-surface-dim}"
    # ::before renders data-num as a small bordered chip in primary
    markerColor: "{colors.primary}"

# ─── modes: extension ──────────────────────────────────────────────────
# Off-spec extension (Stitch spec accepts unknown top-level keys). Each
# mode rebinds the semantic tokens above; tier-1 values stay constant.
# data-mode attribute on <html> drives this; the pre-paint script in
# BaseLayout.astro reads `augment-it-splash-mode` from localStorage and
# applies it before first paint to avoid FOUC.
modes:
  vibrant:
    # Default. The semantic bindings in colors: above ARE the vibrant
    # bindings. Listed here for completeness.
    label: "demo shop"
    surface-base: "{colors.ink-deep}"
    surface-soft: "{colors.ink}"
    surface-elevated: "{colors.charcoal}"
    surface-card: "rgba(31, 24, 48, 0.78)"
    on-surface: "#f6eefb"
    primary: "{colors.magenta}"
    accent-warm: "{colors.iris}"
    thread: "{colors.cyan}"
  dark:
    label: "operator"
    surface-base: "{colors.ink}"
    surface-soft: "{colors.ink-soft}"
    surface-elevated: "{colors.charcoal}"
    surface-card: "rgba(31, 24, 48, 0.72)"
    on-surface: "#ece4f5"
    primary: "{colors.violet-soft}"
    accent-warm: "{colors.magenta-soft}"
    thread: "{colors.lime}"
  light:
    label: "ledger"
    surface-base: "{colors.paper}"
    surface-soft: "{colors.paper-soft}"
    surface-elevated: "#ffffff"
    surface-card: "rgba(255, 255, 255, 0.92)"
    on-surface: "{colors.ink}"
    primary: "{colors.violet-deep}"
    accent-warm: "{colors.magenta-deep}"
    thread: "#2a8f4a"

# ─── ornament: extension ───────────────────────────────────────────────
# The fixed `.bg-mesh` element painted behind every page. Three radial
# gradients per mode (declared via --gradient-mesh-1/2/3) plus a dot grid
# from a single radial pseudo-element at the page-wide --grid-pitch.
ornament:
  mesh:
    type: triple-radial-gradient
    blend: "overlay (default)"
    opacity-vibrant: 0.22-0.26
    opacity-dark: 0.10-0.18
    opacity-light: 0.04-0.05
  dot-grid:
    type: radial-gradient-tile
    pitch: 32px
    opacity-dark-modes: 0.35
    opacity-light-mode: 0.18
    mask: "radial ellipse fading to transparent at 60% from top-30%"

# ─── imagery: extension — Ideogram v3 generate recipe ──────────────────
# Project-specific extension (outside the Stitch standard groups). Spec-
# compliant consumers preserve unknown top-level keys, so this is safe
# to keep here as the single source of truth for image generation.
#
# The contract: every Ideogram request for an augment-it OG asset uses
# the values below for ALL fields. The only per-request variables are:
#   - `prompt`           — subject + composition (see imagery.prompt + imagery.subject_canon)
#   - `aspect_ratio`     — one of imagery.aspect_ratios
#   - `num_images`       — optional, defaults to 4 (lets us pick a winner)
# Anything else is locked. This is what produces a coherent visual
# family across banner / banner_tall / portrait / square.
#
# Aesthetic family — deliberately related to the context-vigilance-kit
# splash but distinct: same comic-ink crosshatch language, but with
# magenta-deep as the single pop color (vs. the context-vigilance sienna).
# This signals "same family of Lossless illustrative imagery" while
# preserving augment-it's brand spine.
imagery:
  provider: ideogram
  endpoint: POST https://api.ideogram.ai/v1/ideogram-v3/generate
  content_type: multipart/form-data

  # ── Locked defaults — DO NOT vary per request ───────────────────────
  defaults:
    style_type: AUTO              # required when style_reference_images is uploaded
                                  # (v3 API rejects DESIGN / REALISTIC / FICTION with
                                  # a style reference). AUTO lets the reference image
                                  # drive aesthetic, which is what we want.
    magic_prompt: OFF             # non-negotiable — prompt-rewriter is the #1
                                  # source of drift across "identical" requests.
    rendering_speed: QUALITY      # use TURBO only when iterating prompts.
    seed: 20250118                # canonical seed — reads as the ISO date of the
                                  # Bolt-era foundation entry (the first changelog
                                  # date in the project's backfilled history).
                                  # Bump only when the visual canon itself shifts.
    num_images: 4                 # generate four candidates per run so we can pick
                                  # a winner without burning tokens on a retry.

  # ── Locked negative prompt — skill canonical (~12 tokens) ──────────
  # Per the generate-consistent-og-images skill: short on purpose,
  # each token competes with the positive prompt for attention. The
  # last block (saturated / rainbow / vibrant / oversized subject /
  # subject in top half) is anti-failure-mode — "subject in top half"
  # specifically defends the SVG overlay zone in tall aspect ratios,
  # paired with the positive-prompt empty-region declaration.
  negative_prompt: >-
    text, typography, lettering, logos, watermarks, central subject
    filling frame, photorealistic human faces, saturated, rainbow,
    vibrant, oversized subject, subject in top half

  # ── Prompt convention — skill canonical empty-region-first pattern ──
  # Pattern: "Top 1/3 of frame is empty negative space, dark gradient
  # sky. Bottom 2/3 contains {short subject noun phrase}."
  #
  # Empty-region-first framing is the load-bearing rule. Without it,
  # the subject expands to fill the canvas (observed on 2026-05-12
  # when a misguided "fix" removed the empty-region declaration —
  # outputs were busy edge-to-edge with no room for SVG branding
  # overlay). Per the skill: "empty space won't be left as residue;
  # it has to be declared, named, and given content."
  #
  # Forbidden in prompts (already encoded via style_reference and
  # color_palette — repeating dilutes attention budget):
  #   - color words ("magenta", "ink", brand colors)
  #   - texture descriptors ("dot-grid", "halftone", "ink-on-paper")
  #   - aesthetic adjectives
  #   - brand names
  #   - any mention of text, writing, labels (negation primes the
  #     concept — text encoders don't process "no X" correctly)
  prompt:
    pattern: "Top 1/3 of frame is empty negative space, dark gradient sky. Bottom 2/3 contains {subject}."
    max_chars_recommended: 220

  # ── Locked color palette — augment-it brand, weighted ──────────────
  # Weighted for a near-monochrome ink illustration with a single
  # magenta pop. The ink-deep dominates so the canvas defaults to the
  # dark void; paper carries the ink-on-paper character work; magenta
  # and iris carry the single pop accent; slate-700 carries crosshatch
  # mid-tones for depth. Sum of weights does not need to equal 1;
  # Ideogram interprets them as relative emphasis.
  color_palette:
    members:
      - { color_hex: "#0a0712", color_weight: 0.40 }   # ink-deep (void background)
      - { color_hex: "#f7f4fa", color_weight: 0.25 }   # paper (ink-on-paper figure linework)
      - { color_hex: "#cb5bde", color_weight: 0.15 }   # magenta (the single pop — labels, key papers)
      - { color_hex: "#c157f2", color_weight: 0.10 }   # iris (secondary pop, used sparingly)
      - { color_hex: "#3a3052", color_weight: 0.10 }   # slate-700 (crosshatch mid-tones)

  # ── Locked style reference — uploaded as style_reference_images ─────
  # This is the strongest consistency signal in the v3 API. Every
  # request uploads this file; texture, lighting, ink density, and
  # crosshatch language are inherited from it.
  #
  # Bootstrap state: the file at this path doesn't exist yet. For the
  # FIRST generation run, use the bootstrap_reference below as the
  # style anchor. After the first run produces a winner, save it as
  # the canonical path here and switch all subsequent runs to it.
  style_reference:
    path: public/ogimage__Augment-It--Default.jpg
    mime: image/jpeg

  # ── Bootstrap reference — temporary anchor for the FIRST run only ──
  # Until augment-it has its own canonical illustration, use the
  # context-vigilance-kit ogimage as the style anchor. It carries the
  # comic-ink crosshatch aesthetic the user explicitly cited as the
  # target. The single sienna pop in that image will be displaced by
  # the magenta-weighted color_palette above on generation — but the
  # linework / texture / density language transfers.
  # Once we have a winning augment-it asset, set style_reference.path
  # to it and delete this bootstrap_reference block.
  bootstrap_reference:
    path: ../../context-vigilance-kit/splash/public/ogimage_Context-Vigilance_1024x1024.jpg
    mime: image/jpeg
    intent: "Style language only — comic-ink crosshatch, monochrome with single pop. The color_palette above will displace the source pop color (sienna → magenta)."

  # ── Aspect ratio enum — pick one per request ────────────────────────
  # Maps Lossless format names to Ideogram's allowed values. The
  # Lossless default tall (banner_tall = 3x4) is the most important
  # variant — iMessage / WhatsApp chat previews are the primary share
  # surface per the open-graph-share-seo-geo skill.
  aspect_ratios:
    banner: 16x9                  # OG / Twitter / Slack / generic share
    portrait: 4x5                 # LinkedIn portrait, Instagram feed
    portrait_tall: 9x16           # Stories, Reels, TikTok
    square: 1x1                   # avatars, square unfurls, fallbacks
    banner_tall: 3x4              # WhatsApp / iMessage previews (default tall)
    banner_tall_max: 2x3          # dramatic-tall variant; use sparingly

  # ── Subject canon — the agreed visual subject for augment-it ─────
  # The "mailroom metaphor" for the augment-it workshop:
  #   - Data sources = mailbags arriving from the mailroom hatch.
  #   - Microfrontends = file clerks intaking + classifying + filing.
  #   - The canonical record store = tall metal filing cabinets.
  #   - Augmentation = the act of filing (placing each piece of paper
  #     in the right place, with provenance back to the source bag).
  #
  # This is the *only* subject family used for augment-it OG imagery
  # in the current canon. Per-format crops focus on different parts of
  # the same scene so the family reads as one visual story across
  # banner / banner_tall / portrait / square.
  subject_canon:
    metaphor: "Data augmentation as mailroom + filing-clerk workflow."
    era: "1950s office aesthetic — period-correct file clerks, canvas mailbags, tall metal filing cabinets, checkered or parquet floor, hatch window from the mailroom."
    canonical_subject: "1950s file clerks receiving mailbags at a mailroom hatch, papers spilling onto floor, others filing into tall metal cabinets"
    per_format_focus:
      banner: "Wide scene — full hatch + clerks + cabinets visible. Mailbags being received in foreground, papers cascading, two clerks at cabinets in mid/background."
      banner_tall: "Vertical focus — the cabinet wall dominates the bottom 2/3, one clerk reaching into an open cabinet, papers spilling around their feet from a tipped mailbag. Hatch implied at side."
      banner_tall_max: "Same as banner_tall but more dramatic vertical — taller cabinets, more papers cascading, single clerk."
      portrait: "Single-clerk close-up — clerk hands inserting a folder into an open cabinet drawer, magenta file tab visible. Some papers on floor in lower-frame."
      portrait_tall: "Stacked composition — papers cascading top, clerk filing in middle, cabinet base anchor at bottom."
      square: "Tight crop on the canonical wide scene — one mailbag, one clerk filing, one cabinet visible. Tightest framing of the metaphor."

  # ── Prompt convention — the ONLY free-text per request ─────────────
  # Constraints documented in the Imagery prose section below. The
  # pattern follows the empirical empty-space-first structure from the
  # generate-consistent-og-images skill (iter3 — subject-first prompts
  # produce subjects that swallow the overlay zone). Two clauses
  # separated by a period:
  #   1. Top region: declared as empty negative space with concrete
  #      content (a "dark dot-grid sky") — the model renders it.
  #   2. Bottom region: contains the actual subject from subject_canon.
  # Explicit numeric proportions ("1/3", "2/3"), never soft terms.
  prompt:
    pattern: "Top 1/3 of frame is empty negative space, dark dot-grid sky. Bottom 2/3 contains {subject_from_subject_canon}."
    example_banner_tall: "Top 1/3 of frame is empty negative space, dark dot-grid sky. Bottom 2/3 contains a 1950s file clerk reaching into an open metal filing cabinet, an overturned canvas mailbag at their feet with papers cascading onto a checkered floor."
    example_banner: "Top 1/3 of frame is empty negative space, dark dot-grid sky. Bottom 2/3 contains 1950s file clerks at a mailroom hatch receiving canvas mailbags, papers spilling onto checkered floor, two clerks filing folders into tall metal cabinets."
    example_square: "Top 1/3 of frame is empty negative space, dark dot-grid sky. Bottom 2/3 contains a 1950s file clerk filing folders into a tall metal cabinet, an overturned canvas mailbag spilling papers onto the floor beside them."
    max_chars_recommended: 220
    forbid:
      # Vocabulary that belongs in tokens, NOT in the prompt:
      - brand names ("Augment-It", "Lossless")
      - color names ("magenta", "iris", "violet", "dark", "warm")
      - aesthetic adjectives ("comic-style", "vibrant-minimal", "demo-shop")
      - texture descriptors ("crosshatch", "ink", "engraved", "monochrome")
      # All of the above are already locked via style_reference_images,
      # color_palette, and style_type. Repeating them in the prompt
      # only dilutes the model's attention budget for the actual subject.

  # ── Preservation discipline — paths the generation flow uses ───────
  candidate_archive: .ideogram-candidates/    # one timestamped subdir per run
  canonical_archive: .ogimage-archive/        # date-suffixed copies of replaced canonicals
  output_dir: public/                          # canonical JPEGs live here
  naming_convention: "ogimage__Augment-It--{Format-Or-Variant}.{ext}"
---

# Augment It — Design System

> The runtime source of truth is `src/styles/theme.css` (Tier-1 raw values + Tier-2 semantic bindings under each `:root[data-mode='...']`).
> The pre-paint resolver lives in `src/layouts/BaseLayout.astro`'s inline script (`localStorage.getItem('augment-it-splash-mode')`).
> This document is the **human- and agent-readable** contract that explains the system's intent. Keep the two in sync when either changes.

## Brand & Style

augment-it is a microfrontend workshop for augmenting structured data with AI — six federated remotes (`record-collector` → `prompt-template-manager` → `request-reviewer` → `response-reviewer` → `highlight-collector` → `insight-manager`) composed by a single host shell. The splash exists to make that architecture **legible** before a visitor opens the repo, and to surface the project's full changelog (including pre-restart Bolt-era and extraction-attempt entries) alongside curated `feature-highlights` cards for the six microfrontends.

The aesthetic is **module-federation-manifest as primary surface.** Where memopop centers a headline, lfm leans into a manuscript hero, and content-farm uses a command-palette teaser, augment-it puts a **2×3 grid of the microfrontends *first*** — no centered title-and-diagram pair. The cards *are* the hero. Beneath the grid sits a six-step "pipeline rail" of monospace pills with arrows between them — a quiet textual reinforcement of the flow story the cards just told.

Tone calibration:

- **Engineered, not marketed.** Monospace display family. Version chips on changelog entries. Pipeline rail with explicit numeric `01`–`06` prefixes. Eyebrows render the section index as a small bordered chip (e.g. `MFE`, `§ 1`, `§ 2`). The visual vocabulary borrows from manifest files and ledgers, not from product landing pages.
- **Operator-confident, faintly playful.** The brand spine is a saturated magenta-violet-iris — lifted byte-for-byte from the augment-it wordmark gradient. It glows but doesn't shout; primary CTAs and active toggles wear it, ambient surfaces stay deep ink.
- **Three modes, vibrant first.** The default mode is **vibrant** (saturated magenta on near-black, demo-shop posture) — augment-it's job is to *enrich* data, and vibrant matches that posture. Dark mode ("operator") dims chrome to violet-soft and swaps the live-thread color to lime. Light mode ("ledger") flips the entire surface to paper-pale with violet-deep as primary, terminal-on-paper for reading at length. The mode-toggle order in the header is **vibrant → dark → light**, deliberately departing from the conventional light/dark/auto sequence.

Where the splash departs from sibling Lossless splashes is **shape, not just hue.** Cards have **2px L-shaped corner ticks** at each corner (printer's-mark / manifest-frame aesthetic). Section markers ("folios") render the section index as a small bordered chip in primary color. The ornament is a **dot grid** (32px pitch, radial-faded toward the top of the viewport) — not the radial mesh siblings use. This is the experimentation surface that the `maintain-splash-pages` skill explicitly invites — diverge in moves, not just in palette swaps.

## Colors

The palette is rooted in two axes: a **brand spine** straight from the wordmark gradient, and an **editorial-neutral ladder** (ink → slate → paper) the modes pivot through.

### Brand spine (mode-invariant; the wordmark gradient stops)

The augment-it wordmark SVG uses a linear-gradient with these stops:
`#B62DC2 → #794AC3 → #CB5BDE → #7D32C6 → #C157F2 → #6A16AB`.

That gradient is the single source of brand color. The frontmatter maps it into three pairs of tones:

- **Magenta** — `magenta-deep #b62dc2` / `magenta #cb5bde` / `magenta-soft #efb6f7`. The headline pair; `magenta` is the default `--color-accent` in vibrant mode.
- **Violet** — `violet-deep #6a16ab` / `violet #794ac3` / `violet-soft #b9a0ee`. Carries the brand into light + dark modes — `violet-soft` is the dark-mode accent, `violet-deep` is the light-mode accent. Also forms the `--gradient-thread` 110° linear used for `.gradient-text` on headlines.
- **Iris** — `iris-deep #7d32c6` / `iris #c157f2` / `iris-soft #e0b3ff`. The "accent-warm" — secondary accent for hover states, the search-compact panel border, and the `--color-border-accent` focus ring.

### Signal hues (off-spine; reserved for status / mode-specific roles)

- **Cyan `#4ad7ff`** — the `thread` color in **vibrant mode only**. Used on `pill[data-status='Active'|'Stable'|'live']`, the `from-tag` provenance marker, and the pipeline-rail container. Never appears as a brand-spine color — it's deliberately off-palette so it reads as "system-state" rather than "brand."
- **Amber `#ffb547`** — the `archive` marker. Used on the gallery landing page's two pre-history era cards ("Bolt-era monolith", "Extraction attempt") and the matching `category: Archive-Backfill` changelog entries on the splash. Warm-tinted because archived work is *historical*, not *broken*.
- **Lime `#9ce86b`** — replaces cyan as the thread color in **dark mode only**. Dark mode is "operator" — the lime reads as a CRT-terminal status LED.

### Editorial neutrals (the ink-pad axis)

A nine-step ramp from `ink-deep #0a0712` to `paper-deep #e2d8eb`. Vibrant + dark mode draw their surfaces from the bottom of the ladder (ink-deep → ink → ink-soft → charcoal); light mode draws from the top (paper-deep → paper-soft → paper → white). The slate-700/500/400/300/200/100 mids serve as text colors across all three modes — slate-700 is the soft text in light mode; slate-200 is the soft text in vibrant mode.

### Semantic bindings (the Tier-2 layer)

Every component on the splash references **semantic tokens** (e.g. `--color-bg`, `--color-text`, `--color-accent`), never the Tier-1 raw values directly. The semantic-to-raw mapping rebinds when the user clicks the mode-toggle. The default (vibrant) bindings are in the frontmatter's `colors:` block; the dark and light overrides live in `modes:`. The single largest "do" of the system is **always reference the semantic token**, because the system has three modes and a component that hard-codes a hex value will only look right in one of them.

### Status pills

Four status values appear on changelog and context-v entries:

- `Stable` / `Active` / `live` → cyan (vibrant thread) / lime (dark thread) / green (light thread)
- `Beta` → primary (mode-dependent: magenta / violet-soft / violet-deep)
- `Alpha` / `Experiment` / `Draft` → accent-warm (iris / magenta-soft / magenta-deep)
- `Archived` → renders inline; carries the amber color on the landing-page era cards

Each pill is ~12% fill + ~40% border alpha in its own accent — so pills coexist with the dark surface without becoming louder than primary CTAs.

## Typography

**Two families. Mono-forward by design.**

- **JetBrains Mono** — used for the *display* family (h1/h2 hero), all eyebrows, the pipeline-rail steps, version chips, status pills, sort-controls, the search popover trigger, code chips, and the brand-mark glyph. The mono-as-display choice is the central typographic move — augment-it is a *data tool*, and the splash should read like a developer-facing surface, not a marketing landing.
- **Space Grotesk** — used for sans body, section H2s, card titles (module / entry-list), and the manifest tagline. Geometric and slightly technical; pairs cleanly with the mono display without competing for the "engineered" feel.

Scale (vibrant-mode bindings; mode does not affect type size):

- **Display Hero** — Space Grotesk 700 at `clamp(2rem, 4.6vw, 3rem)`. The manifest title on the splash index. Lower top-end than memopop/content-farm — augment-it's hero composition gives more vertical real estate to the MFE grid, so the title doesn't need to dominate.
- **Headline LG** — Space Grotesk 700 at `clamp(2rem, 4.6vw, 2.8rem)`. Section H1s on `/changelog`, `/context-v`, and entry detail pages.
- **Headline MD** — Space Grotesk 700 at 1.4rem. Entry-list titles, manifest module-card titles.
- **Headline SM** — Space Grotesk 700 at 1.18rem. Context-v entry-list titles in grouped views.
- **Body LG / MD / SM** — Space Grotesk 400 at 1.1rem / 1rem / 0.92rem. Manifest tagline uses body-lg; module-card descriptions use body-sm; prose paragraphs use body-md via `prose.css`.
- **Mono MD / SM** — JetBrains Mono 500. Pipeline rail, sort-controls labels, status meta, hero install line.
- **Label Eyebrow** — JetBrains Mono 500, 0.72rem, 0.18em letter-spaced uppercase. Used by the `.folio` component. The eyebrow's `data-num` attribute renders as a small bordered chip in primary (e.g. `MFE` for the manifest, `§ 1` / `§ 2` for sub-sections).
- **Label Pill** — JetBrains Mono 500, 0.7rem, 0.06em. Tighter letter-spacing than eyebrow because pills sit in tighter UI spaces.
- **Label Version** — JetBrains Mono 500, 0.66rem, 0.04em. Used by the `.ver-chip` (semver / manifest-version badge), which appears on every changelog list item and detail page.

**Reading-width convention.** Prose articles in `.entry__body` and `.module__body` cap at `68ch`. The splash's `.container-narrow` caps the layout itself at 760px, which produces ~70ch line-length on body-md. Module-card lede paragraphs are uncapped because they're already inside a sub-container with its own width.

## Layout & Spacing

A **fixed-max-width** layout with two widths:

- **`.container` — 1180px** — full-width sections (manifest grid, landing-page eras, footer).
- **`.container-narrow` — 760px** — single-column long-form (changelog/context-v lists + detail pages, search page).

Inside both, `padding-inline: var(--space-6)` (24px) reserves a consistent minimum gutter to the viewport edge.

**Vertical rhythm.** Sections under `.manifest` and equivalent get `padding: var(--space-12) 0` (48px top + bottom). The hero block uses `var(--space-12) 0 var(--space-16)` (48px top, 64px bottom) for slightly more presence; the recent-changes section adds a `border-top: 1px solid var(--color-border)` so the section break reads even if the content above happens to end shy.

**Section-internal rhythm.** Inside a section: the section-head has `margin-bottom: var(--space-8)` to `var(--space-10)` (32–40px) before the first grid or list. Section-head children (`folio → h2 → lede`) use `var(--space-3)` and `var(--space-4)` to step down.

**Grid gap convention:**

- **3-col manifest grid** (the six microfrontend cards on the splash index): `gap: var(--space-5)` (20px). Below 980px collapses to 2 cols; below 620px collapses to 1.
- **List view** (`/changelog`, `/context-v`): no gap between `<li>` items — each `<li>` carries `border-bottom: 1px solid var(--color-border)` and `padding: var(--space-6) 0`, producing a clean ledger look without compounding gaps.
- **Header → page-body gap** is fixed by the sticky `.site-header { height: 64px }` plus the first content section's top-padding; no additional spacer.

**Container padding.** `var(--space-6)` (24px) on each side of both containers. Never let an element extend past that gutter.

## Elevation & Depth

The system is **mostly flat with corner-tick framing.** Depth signals (in order of strength):

1. **Tonal layering.** `surface-base` (body) → `surface-card` (translucent rgba over `surface-elevated`, the "card shelf") → `surface-elevated` (search popover, palette-like surfaces). Each layer reads as "one shelf up" without needing a drop shadow.
2. **Corner ticks on cards.** The `module` component (FeatureCard) carries **four absolutely-positioned 10×10 divs** — one per corner, each rendering an L-shape via 2px borders in `--color-accent`. This is the project's signature visual move; it makes every module card read as a "framed manifest entry" rather than a generic card.
3. **Border-accent on hover.** Cards transition `border-color` to `--color-border-strong` on hover and lift `translateY(-2px)`. The shadow stays minimal — only the `box-shadow: var(--shadow-card)` is layered in.
4. **Glow shadow — rare.** `--shadow-glow` (a soft `0 0 80px` of magenta at 22% alpha in vibrant; 18% in dark; 8% in light) is **never set on a default state**. It's reserved for the splash-index hero block where the manifest CTA sits and for the search-popover panel.

The fixed `.bg-mesh` element provides ambient depth via three radial gradients (mode-tinted) plus a 32px-pitch dot grid in `--color-accent` at ~35% opacity (dark modes) / 18% (light mode). The dot grid is masked toward the top of the viewport via a radial-ellipse `mask-image`, so the dots fade out below the fold. Everything sits at `z-index: 0` with `pointer-events: none`; page content is `z-index: 1`. **The mesh + dot grid is the only ambient lighting — do not add a second background gradient.**

## Shapes

**Squarer than memopop and content-farm.** The "module manifest" aesthetic wants edges, not generous rounding.

- **`sm` (2px)** — version chips, code chips, from-tags, kbd. The smallest reusable surface.
- **`md` (4px)** — buttons, most cards including the `module` component, sort controls, mode-toggle frame, search-compact popover.
- **`lg` (6px)** — search-compact panel, manifest-card variants, the elevated surface popovers.
- **`xl` (10px)** — hero panels. Not currently used on the splash, but reserved.
- **`full` (9999px)** — pills, status badges, search-compact trigger, mode-toggle inner items. Anything that needs to read as "stamp" or "tap-target."

**Border thickness.** All borders are `1px solid` by default. The exceptions:

- **Corner ticks** on the `module` component are `2px` borders (the L-shapes).
- **Manuscript margin rule** — none. (memopop has one; we don't.)
- **Hairline section breaks** — `1px solid var(--color-border)` between `<section>` elements.

**Icons.** SVG icons use `stroke-width: 2` with rounded line-caps. The brand-mark glyph in the header (`⌬`) is a Unicode character set at `1.4rem` in primary color. Mode-toggle icons (sun / moon / sparkle) are inline SVG at 14×14.

## Components

### Header

Sticky top, 64px tall, full-width with internal `.container`. Background is `color-mix(in oklab, var(--color-bg) 88%, transparent)` with `backdrop-filter: blur(10px)` — a translucent overlay that lets the dot grid bleed through faintly. Hairline `border-bottom: 1px solid var(--color-border)`.

Contains:

- **Brand link** (left) — `⌬` glyph in primary + "Augment It" wordmark + responsive `A·IT` short-form (visible below 720px).
- **Primary nav** (center-right) — Apps / Changelog / Context / Search / GitHub. Below 860px, items beyond the 3rd are hidden.
- **Actions cluster** (right) — `SearchBox compact` + `ModeToggle`.

### SearchBox (Pagefind)

Two variants:

- **`compact`** (default in header) — `<details>` element with a pill-shaped trigger showing a magnifying-glass icon + "Search" + a `/` kbd hint. Opens a 380–560px popover beneath the trigger. On mobile (≤720px), the popover becomes a fixed-position drawer.
- **`full`** (used on `/search`) — permanent panel, max-width 760px, with `autoFocus` to land cursor in the input.

Pagefind UI variables are mapped to semantic tokens (`--pagefind-ui-primary: var(--color-accent)`, etc.) so the search UI pivots through all three modes with the rest of the site. Global `/` keyboard shortcut focuses the compact popover from anywhere.

### ModeToggle

Three-button segmented control: **vibrant → dark → light** (not the conventional light/dark/auto order). 32×32 each, 2px gap, `rounded-md` frame with `1px solid border-strong`. Active button gets `background: var(--color-accent)` + `color: var(--color-bg)`. Persists choice to `localStorage` under key `augment-it-splash-mode`. Pre-paint resolution happens in `BaseLayout.astro`'s inline script before first render, so there's no FOUC.

### FeatureCard (the `module` component)

The corner-tick framed primary card on the splash index. Used for the six microfrontends on `/`, plus any future curated highlight. Anatomy:

- **Four corner-tick divs** (absolutely positioned, 2px L-shapes in `--color-accent`).
- **`module__head`** — `module__id` row (mono slug + status pill) → `module__title` (Space Grotesk 700 1.18rem) → `module__lede`.
- **`module__body`** — rendered markdown via the `prose` class.
- **`module__tags`** — flat mono tags with a dashed top border (`1px dashed`).

A `module--featured` variant adds a top-left "Featured" pill in primary + surface-base text and ups the border opacity. The corner ticks stay the same.

### SortControls

Mounted at the top of `/changelog/` and `/context-v/` list pages. Renders as a single horizontal control bar: label ("Sort by") + chip-group of sort keys (`Modified` / `Created` / `Published` / `Title`) + a direction toggle (`↓ Newest first` / `↑ Oldest first`; for `Title` it becomes `Z → A` / `A → Z`). The active chip wears `background: var(--color-accent)` + `color: var(--color-bg)`.

Persistence is per-page in `localStorage` under namespaced keys (`augment-it-splash-sort:changelog`, `augment-it-splash-sort:context-v`) — `/changelog` and `/context-v` keep independent sort preferences. Server pre-sorts to match the UI default (`date_modified desc`) so the static HTML reads correctly even before JS hydrates.

### Pipeline rail

Used once, on the splash index, beneath the manifest grid. Renders the six microfrontend slugs as monospace pills separated by `→` arrows: `record-collector → prompt-template-manager → request-reviewer → response-reviewer → highlight-collector → insight-manager`. Each pill wears a faint magenta tint (`rgba(203, 91, 222, 0.10)` fill + `rgba(203, 91, 222, 0.30)` border). The arrows are `accent-warm` (iris). Wraps to multiple lines on narrow viewports.

### Pill (status)

JetBrains Mono 0.7rem at 0.06em letter-spacing, pill-shaped. Four `data-status` variants:

- `Active` / `Stable` / `live` → thread (mode-dependent)
- `Beta` → primary
- `Alpha` / `Experiment` / `planned` / `Draft` → accent-warm
- (default) → on-surface-soft

Each variant is ~12% fill + ~50% border-alpha in its accent. Never put more than one status pill on a card.

### ver-chip (semver / manifest-version chip)

Tiny mono badge (0.66rem) used inline next to dates. `rgba(203, 91, 222, 0.08)` fill + `rgba(203, 91, 222, 0.36)` border. Shows on every changelog list item and detail page when `at_semantic_version` or `semantic_version` is in the entry's frontmatter.

### from-tag (provenance marker)

Cyan-tinted (`rgba(74, 215, 255, 0.12)` fill + `rgba(74, 215, 255, 0.35)` border) mono tag with a 6px round dot before the text. Used on changelog entries that come from a different submodule than the current splash (the rolled-up case). Not currently visible since this is the single-project variant, but the styling is shipped and ready when the splash ever becomes a rollup target.

### folio (section marker)

The "manuscript-style chapter mark" — but stamped with a module-marker chip. Renders as an eyebrow (label-eyebrow type) with a `::before` pseudo-element rendering the element's `data-num` attribute as a small bordered chip in primary color. Used as the `<p class="folio" data-num="§ 1">` opener on every section. The `data-num` values are typically `MFE`, `§`, `§ 1`, `§ 2`, etc.

## Imagery

All augment-it OG imagery is generated via Ideogram's v3 generate endpoint. The frontmatter's `imagery:` block is the **complete, locked recipe**: every field there is constant across every request. The only two things that vary per call are the `prompt` (subject + composition) and the `aspect_ratio` (one entry from `imagery.aspect_ratios`).

This is on purpose. The single biggest cause of "why don't these four banners look like they belong together" is per-request drift in brand vocabulary, palette wording, and style adjectives smuggled into the prompt. Ideogram's v3 schema gives us structured channels for all of that — `style_reference_images`, `color_palette`, `style_type`, `magic_prompt` — and using them is strictly more reliable than typing the same adjectives into every prompt and hoping the model interprets them the same way twice.

### Aesthetic family — comic-ink, monochrome with a single magenta pop

The illustrative language is **comic-style inking — heavy contour lines and dense crosshatching, near-monochrome on a near-black ground, with a single brand-spine color used sparingly as a pop accent.** This is deliberately the same illustration family as [`context-vigilance-kit/splash`](../../context-vigilance-kit/splash/) — same crosshatch density, same dark-void atmosphere, same single-pop discipline — but with **magenta-deep** displacing context-vigilance's sienna/orange. A reader who lands on both splashes back-to-back should feel the family resemblance; a reader who lands on augment-it alone should never wonder what brand they're looking at.

Why mono-with-one-pop rather than full-color? Three reasons:

1. **Augment-it's full palette has three brand-spine colors (magenta + violet + iris) plus three signal hues (cyan + amber + lime).** If all six show up in a generated image, the image reads as "an Ideogram thing" rather than as "an augment-it thing." Constraining the visual palette to a single magenta pop forces the image to lean on *composition + line work* for legibility, not on color noise.
2. **Comic-ink imagery scales gracefully across aspect ratios.** A 9×16 portrait_tall and a 16×9 banner share a visual language even though they crop the scene differently; full-color illustrations tend to lose their identity when the composition changes.
3. **It pairs cleanly with the splash's vibrant UI.** The page itself already carries the saturated magenta-iris brand experience. An equally saturated OG image would compete; a near-monochrome image with a single magenta call-out *complements* and gives the live page somewhere to be the louder voice.

### Subject canon — the mailroom metaphor

augment-it's job, in one sentence: *records arrive from many sources, get filed into a canonical store, and are augmented along the way with provenance back to where they came from*. The OG imagery uses a literal mid-century-office metaphor for this:

| Augment-it abstraction | OG-image rendering |
|---|---|
| Data sources / ingest | Canvas mailbags arriving through a mailroom hatch |
| The six microfrontends | Period-correct file clerks (1950s office attire) |
| The canonical record store | Tall metal filing cabinets |
| The augmentation pass | The act of *filing* — placing each paper in the right drawer |
| Provenance back to the source | The mailbag a paper just came out of, still visible in frame |

The full-scene canonical prompt (subject only — the empty-region clause is the locked composition rule, see below):

> *1950s file clerks at a mailroom hatch receiving canvas mailbags, papers spilling onto checkered floor, two clerks filing folders into tall metal cabinets*

Per-format crops focus on different beats of the same scene so the family reads as one continuous visual story — see `imagery.subject_canon.per_format_focus` in the frontmatter for the per-aspect-ratio framing.

### The locked channels (don't touch per request)

- **`style_reference_images`** — the canonical illustration anchor. Until the first augment-it generation produces a winner, the **bootstrap reference** is `context-vigilance-kit/splash/public/ogimage_Context-Vigilance_1024x1024.jpg` — used for style language only (the comic-ink crosshatch). The `color_palette` below displaces its sienna pop with our magenta. After the first winner ships, set `imagery.style_reference.path` to that asset and delete `imagery.bootstrap_reference`.
- **`color_palette.members`** — five weighted entries (ink-deep, paper, magenta, iris, slate-700). Surface ink-deep dominates at 0.40 so the dark void is the default ground; paper-white carries the linework on the figure; magenta + iris carry the single-color pop accents (file tabs, key papers); slate-700 carries crosshatch mid-tones for depth.
- **`style_type: AUTO`** — required whenever `style_reference_images` is uploaded. The v3 API enforces mutual exclusion: `DESIGN` / `REALISTIC` / `FICTION` are rejected when a reference is present. `AUTO` lets the reference image drive style.
- **`magic_prompt: OFF`** — non-negotiable. With magic_prompt on, Ideogram rewrites your prompt before generation, which produces visible drift across "identical" runs.
- **`negative_prompt`** — short on purpose. Adds `vibrant colors` and `rainbow` on top of the standard list because the multi-hex `color_palette` can otherwise get interpreted as "make it colorful" rather than "weight these colors this way." Adds `subject in top half` to actively penalize the model growing the subject up into the overlay zone (see "empty-space-first composition" below).
- **`seed: 20250118`** — fixed. Reads as the ISO date `2025-01-18` — the foundation entry in augment-it's backfilled changelog (the Bolt-era working demo). Bump only when the visual canon itself shifts.
- **`rendering_speed: QUALITY`** — for production. Use `TURBO` or `FLASH` only during prompt iteration.

### The variable channels (the only things you change)

- **`prompt`** — one or two sentences total. Two ingredients only, in this exact order:
  1. **Empty region as a first-class subject.** Lead the prompt with the empty region — declare it explicitly, give it concrete content. The augment-it pattern is `Top 1/3 of frame is empty negative space, dark dot-grid sky.` The dot-grid sky echoes the splash's own ornament layer (the `--grid-pitch` 32px dot grid) so the image and the live page share a visual cue.
  2. **Subject** from the canon above, with per-format focus. *"Bottom 2/3 contains a 1950s file clerk reaching into an open metal filing cabinet, an overturned canvas mailbag at their feet with papers cascading onto a checkered floor."*

  Target ≤220 characters total. Past that, hard composition asks start losing to subject elaboration.

  **Three rules that survive aspect-ratio changes:**
  - **Lead with the empty region**, not the subject — first sentence describes what's empty and what fills that emptiness (the dot-grid sky).
  - **Use explicit numeric proportions** ("top 1/3 / bottom 2/3"), never soft terms ("lower portion", "behind").
  - **Reinforce in `negative_prompt`** with the specific failure mode (`subject in top half`).

  See `imagery.prompt.example_*` in the frontmatter for the canonical phrasings of the three most-used aspect ratios.

- **`aspect_ratio`** — pick from `imagery.aspect_ratios`. Default tall (`banner_tall = 3x4`) is the priority surface — iMessage and WhatsApp chat previews unfurl this format first.

### Bootstrap — the first run

There is no canonical augment-it style reference yet. For the first generation pass:

1. Upload `context-vigilance-kit/splash/public/ogimage_Context-Vigilance_1024x1024.jpg` as `style_reference_images`. It carries the comic-ink crosshatch language.
2. Run the recipe with the canonical `banner` subject first (16×9). The wide framing makes the scene's spatial relationships clearest, which is what we want to lock in.
3. Generate 4 candidates (`num_images: 4`). Pick the winner.
4. Convert PNG → JPEG (`ffmpeg -y -i candidate-N.png -q:v 2 public/ogimage__Augment-It--Default.jpg`).
5. Update `imagery.style_reference.path` in `DESIGN.md` to `public/ogimage__Augment-It--Default.jpg` and **delete the `bootstrap_reference` block**.
6. Run the recipe for the other five aspect ratios using the new canonical reference. The family is now self-anchored — every subsequent run inherits the texture, density, and pop weighting from augment-it's own asset, not from context-vigilance's.

### Preservation discipline

Per the `generate-consistent-og-images` skill, two preservation layers apply to every run:

- **Layer 1 — raw candidates auto-archive.** Every Ideogram call writes its four candidates into `.ideogram-candidates/<subject>-<aspect>-<YYYYMMDD-HHMMSS>/` (alongside the response JSON). The dot-prefixed parent sits outside `public/` so Astro doesn't ship raw PNGs to GitHub Pages. Timestamped per-run subdirs are never overwritten.
- **Layer 2 — canonical JPEGs archive on replacement.** When a re-run produces a new winner for an existing format, the prior canonical `public/ogimage__Augment-It--Foo.jpg` moves to `.ogimage-archive/ogimage__Augment-It--Foo--YYYY-MM-DD.jpg` before the new file is written. The unfurler URL stays stable; the byte history is preserved.

### Anti-patterns

- **Putting brand or palette words in the prompt.** "Magenta accent, comic-style inking…" — every word competes with the actual subject. The locked channels already encode this.
- **Long negative prompts.** Each token in `negative_prompt` is also a competitor for attention. Stay close to the locked list.
- **Varying `magic_prompt` or `seed` across requests in a set.** Either change is the single largest source of "why don't these match." Lock both at the project level.
- **Subject-first framing for overlay-bearing imagery.** Saying *"clerks in the lower third"* alone is not enough. Lead with the empty region as a first-class rendered subject; the subject won't be left as residue, it has to be declared, named, and given content.
- **Pulling a *different* subject family for one aspect ratio.** All augment-it OG imagery uses the mailroom-and-filing-clerks subject canon. Don't substitute "abstract module-federation diagram" for the square format because square is harder to compose — recrop the canonical scene instead.

## Do's and Don'ts

- **Do** use semantic tokens (`--color-*`, `--font__*`) in component styles. Never hard-code a hex value. The splash has three modes; a component that hard-codes will look right in exactly one of them.
- **Do** keep the corner-tick treatment on the `module` component. It's the project's signature visual move and the most direct expression of the "manifest-file" aesthetic. Don't replace with a generic card outline.
- **Do** order the mode-toggle as **vibrant → dark → light**, not light → dark → vibrant. Vibrant is the default and the project's *posture*; it leads.
- **Do** lead with the **MFE manifest grid** on the splash index. The cards are the hero. Don't reach for a centered headline-plus-diagram layout.
- **Do** use the cyan thread (vibrant) / lime thread (dark) / green thread (light) for status-only cues — never as a brand-spine color. The off-spine thread is what signals "system state" vs. "brand."
- **Do** maintain the JetBrains-Mono-on-display / Space-Grotesk-on-body split. Card titles are Space Grotesk (they name a *thing*); pipeline rail and version chips are mono (they describe *manifest data*).

- **Don't** introduce a third typeface. JetBrains Mono and Space Grotesk are the system.
- **Don't** add corner ticks to non-`module` components. They're the manifest-card signature; spreading them dilutes the move.
- **Don't** swap the order in the brand spine. The wordmark gradient stops are the canonical sequence; if you ever extract the gradient for a different surface (banner, OG, etc.), preserve the magenta → violet → iris → magenta order.
- **Don't** introduce a second background gradient layer. The fixed `.bg-mesh` (radial mesh + dot grid) is the only ambient lighting.
- **Don't** drop the `data-mode` attribute or remove the pre-paint resolver in `BaseLayout.astro`. The script that reads `augment-it-splash-mode` from `localStorage` runs *before* the first paint to avoid FOUC — without it, every reload flashes vibrant before settling to the user's chosen mode.
- **Don't** soften the radii. The `rounded` scale (2/4/6/10/full) is deliberately tight. Pills stay round; everything else stays close to a 1×1 grid square.
- **Don't** use `gap` on the changelog or context-v `<ul>` lists. Each `<li>` carries its own `border-bottom + padding`; adding `gap` produces a ladder-rung look that breaks the ledger aesthetic.
- **Don't** put a status pill on a `module` card and a `ver-chip` next to it in the same module-id row. Pick one — module cards use status pills; entry-list items use ver-chips. Mixing the two in one frame produces stacked-badge noise.
