#!/usr/bin/env bash
#
# generate-og.sh — augment-it OG-image generation, locked recipe.
#
# Wraps the Ideogram v3 generate API per augment-it/splash/DESIGN.md's
# imagery: block. The locked channels (style_type, magic_prompt,
# rendering_speed, seed, color_palette, negative_prompt, style_reference)
# are baked into this script verbatim from DESIGN.md. The only two
# variables per invocation are the format and (optionally) a custom
# prompt. Each format has a canonical prompt baked in.
#
# Usage:
#   ./scripts/generate-og.sh <format> [custom-prompt]
#
# Formats (must match imagery.aspect_ratios in DESIGN.md):
#   banner            16x9   — OG / Twitter / Slack default
#   banner_tall       3x4    — WhatsApp / iMessage default (priority)
#   banner_tall_max   2x3    — extra-dramatic vertical
#   portrait          4x5    — LinkedIn portrait / IG feed
#   portrait_tall     9x16   — Stories / Reels / TikTok
#   square            1x1    — avatars / square fallbacks
#
# Requires:
#   - IDEOGRAM_API_KEY in env (from ~/.secrets)
#   - curl, jq
#   - Run from splash/ (the parent of scripts/, public/, DESIGN.md)
#
# Notes on bootstrap state:
#   The canonical style_reference path (public/ogimage__Augment-It--Default.jpg)
#   doesn't exist yet on the first run. The script falls back to the
#   bootstrap_reference (context-vigilance-kit's ogimage) when the
#   canonical isn't present. After the first run produces a winner and
#   it's saved as the canonical, subsequent runs auto-switch to it.

set -euo pipefail

# ─── arg parsing ──────────────────────────────────────────────────────
if [[ $# -lt 1 ]]; then
  cat <<'EOF' >&2
Usage: ./scripts/generate-og.sh <format> [custom-prompt]

Formats:
  banner            16x9   — OG / Twitter / Slack default
  banner_tall       3x4    — WhatsApp / iMessage default (priority)
  banner_tall_max   2x3    — extra-dramatic vertical
  portrait          4x5    — LinkedIn portrait / IG feed
  portrait_tall     9x16   — Stories / Reels / TikTok
  square            1x1    — avatars / square fallbacks

Examples:
  ./scripts/generate-og.sh banner_tall
  ./scripts/generate-og.sh banner "Top 1/3 of frame is empty negative space, dark dot-grid sky. Bottom 2/3 contains <custom subject>."
EOF
  exit 2
fi

FORMAT="$1"
CUSTOM_PROMPT="${2:-}"

# ─── prerequisites ───────────────────────────────────────────────────
: "${IDEOGRAM_API_KEY:?IDEOGRAM_API_KEY not set in env. Run \`source ~/.secrets\` first (or invoke this script in a shell where the key is already exported).}"

command -v curl >/dev/null || { echo "curl not found" >&2; exit 1; }
command -v jq   >/dev/null || { echo "jq not found"   >&2; exit 1; }

if [[ ! -f DESIGN.md ]]; then
  echo "DESIGN.md not found. Run from splash/ directory." >&2
  exit 1
fi

# ─── format → aspect_ratio + canonical prompt ────────────────────────
#
# Prompts follow the generate-consistent-og-images skill canonical:
#   "Top 1/3 of frame is empty negative space, dark gradient sky.
#    Bottom 2/3 contains {short subject noun phrase}."
#
# Empty-region-first framing is the load-bearing rule — without it,
# the subject expands to fill the canvas and there's no overlay zone
# left for SVG site branding. The skill calls this the iter1→iter3
# Perplexed lesson: subject-first prompts produce 75-85% canvas-height
# subjects; empty-region-first prompts produce 40-65% canvas-height
# subjects with the upper region genuinely empty.
#
# Forbidden in prompts (already encoded via style_reference and
# color_palette — repeating them dilutes attention budget):
#   - color words ("magenta", "dark" beyond the sky descriptor)
#   - texture descriptors ("dot-grid", "halftone", "ink")
#   - aesthetic adjectives
#   - brand names
#
# Target ≤220 chars per prompt.
case "$FORMAT" in
  banner)
    ASPECT_RATIO="16x9"
    DEFAULT_PROMPT="Top 1/3 of frame is empty negative space, dark gradient sky. Bottom 2/3 contains 1950s clerks at a mailroom hatch, manila envelopes spilling onto a checkered floor, metal cabinets behind them."
    ;;
  banner_tall)
    ASPECT_RATIO="3x4"
    DEFAULT_PROMPT="Top 1/3 of frame is empty negative space, dark gradient sky. Bottom 2/3 contains a 1950s clerk in profile placing a manila envelope into an open metal cabinet, satchel at their feet."
    ;;
  banner_tall_max)
    ASPECT_RATIO="2x3"
    DEFAULT_PROMPT="Top 1/3 of frame is empty negative space, dark gradient sky. Bottom 2/3 contains a 1950s clerk against a towering metal cabinet wall, manila envelopes cascading at their feet on a checkered floor."
    ;;
  portrait)
    ASPECT_RATIO="4x5"
    DEFAULT_PROMPT="Top 1/3 of frame is empty negative space, dark gradient sky. Bottom 2/3 contains a 1950s clerk's hands placing a manila envelope into an open metal cabinet drawer."
    ;;
  portrait_tall)
    ASPECT_RATIO="9x16"
    DEFAULT_PROMPT="Top 1/3 of frame is empty negative space, dark gradient sky. Bottom 2/3 contains a 1950s clerk at a metal cabinet, manila envelopes cascading toward them on a checkered floor."
    ;;
  square)
    ASPECT_RATIO="1x1"
    DEFAULT_PROMPT="Top 1/3 of frame is empty negative space, dark gradient sky. Bottom 2/3 contains a 1950s clerk placing a manila envelope into a metal cabinet, satchel beside them on a checkered floor."
    ;;
  *)
    echo "Unknown format: $FORMAT" >&2
    echo "Valid formats: banner banner_tall banner_tall_max portrait portrait_tall square" >&2
    exit 2
    ;;
esac

PROMPT="${CUSTOM_PROMPT:-$DEFAULT_PROMPT}"

# ─── locked channels (from DESIGN.md imagery: block) ─────────────────
SEED="20250118"
STYLE_TYPE="AUTO"
MAGIC_PROMPT="OFF"
RENDERING_SPEED="QUALITY"
NUM_IMAGES="4"

NEGATIVE_PROMPT="text, typography, lettering, logos, watermarks, central subject filling frame, photorealistic human faces, saturated, rainbow, vibrant, oversized subject, subject in top half"

# Augment-It palette — 5 weighted members. Mono-with-magenta-pop discipline.
COLOR_PALETTE_JSON='{"members":[{"color_hex":"#0a0712","color_weight":0.40},{"color_hex":"#f7f4fa","color_weight":0.25},{"color_hex":"#cb5bde","color_weight":0.15},{"color_hex":"#c157f2","color_weight":0.10},{"color_hex":"#3a3052","color_weight":0.10}]}'

# ─── style reference — canonical or bootstrap ────────────────────────
CANONICAL_REF="public/ogimage__Augment-It--Default.jpg"
BOOTSTRAP_REF="../../context-vigilance-kit/splash/public/ogimage_Context-Vigilance_1024x1024.jpg"

if [[ -f "$CANONICAL_REF" ]]; then
  STYLE_REF_PATH="$CANONICAL_REF"
  STYLE_REF_KIND="canonical"
elif [[ -f "$BOOTSTRAP_REF" ]]; then
  STYLE_REF_PATH="$BOOTSTRAP_REF"
  STYLE_REF_KIND="bootstrap (context-vigilance — first-run only)"
else
  echo "Neither canonical ($CANONICAL_REF) nor bootstrap ($BOOTSTRAP_REF) style reference exists." >&2
  echo "Fix one of those paths before generating." >&2
  exit 1
fi

# ─── archive paths ────────────────────────────────────────────────────
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
SUBJECT_SLUG="mailroom"
RUN_DIR="ideogram-candidates/${SUBJECT_SLUG}-${FORMAT}-${TIMESTAMP}"
mkdir -p "$RUN_DIR"

# ─── log invocation ──────────────────────────────────────────────────
echo "→ POST https://api.ideogram.ai/v1/ideogram-v3/generate"
echo "    format:          $FORMAT  ($ASPECT_RATIO)"
echo "    style_reference: $STYLE_REF_PATH  [$STYLE_REF_KIND]"
echo "    seed:            $SEED"
echo "    num_images:      $NUM_IMAGES"
echo "    prompt:          $PROMPT"
echo "    candidates →     $RUN_DIR/"
echo ""

# ─── construct + send ────────────────────────────────────────────────
RESPONSE="$(curl -sS \
  -H "Api-Key: $IDEOGRAM_API_KEY" \
  -F "prompt=$PROMPT" \
  -F "aspect_ratio=$ASPECT_RATIO" \
  -F "style_type=$STYLE_TYPE" \
  -F "magic_prompt=$MAGIC_PROMPT" \
  -F "rendering_speed=$RENDERING_SPEED" \
  -F "seed=$SEED" \
  -F "num_images=$NUM_IMAGES" \
  -F "negative_prompt=$NEGATIVE_PROMPT" \
  -F "color_palette=$COLOR_PALETTE_JSON" \
  -F "style_reference_images=@${STYLE_REF_PATH}" \
  https://api.ideogram.ai/v1/ideogram-v3/generate)"

# Surface API errors clearly.
if echo "$RESPONSE" | jq -e '.error // .detail // .message' >/dev/null 2>&1; then
  echo "Ideogram API returned an error:" >&2
  echo "$RESPONSE" | jq . >&2
  exit 1
fi

NUM_RETURNED="$(echo "$RESPONSE" | jq '.data | length')"
if [[ "$NUM_RETURNED" -lt 1 ]]; then
  echo "Unexpected response (no images):" >&2
  echo "$RESPONSE" | jq . >&2
  exit 1
fi

# Download each image immediately — Ideogram URLs expire.
for i in $(seq 0 $((NUM_RETURNED - 1))); do
  URL="$(echo "$RESPONSE" | jq -r ".data[$i].url")"
  OUT="${RUN_DIR}/candidate-${i}.png"
  echo "→ saving $OUT"
  curl -sS -L "$URL" -o "$OUT"
done

# Save metadata so we know what was actually run.
echo "$RESPONSE" | jq . > "${RUN_DIR}/response.json"
cat > "${RUN_DIR}/request.txt" <<EOF
prompt:           $PROMPT
aspect_ratio:     $ASPECT_RATIO
style_type:       $STYLE_TYPE
magic_prompt:     $MAGIC_PROMPT
rendering_speed:  $RENDERING_SPEED
seed:             $SEED
num_images:       $NUM_IMAGES
negative_prompt:  $NEGATIVE_PROMPT
color_palette:    $COLOR_PALETTE_JSON
style_reference:  $STYLE_REF_PATH  [$STYLE_REF_KIND]
timestamp:        $TIMESTAMP
EOF

echo ""
echo "Done. $NUM_RETURNED candidates saved to $RUN_DIR/"
echo ""
echo "Next steps:"
echo "  1. Open $RUN_DIR/ and pick a winner."
echo "  2. If you're picking the first canonical, install ffmpeg if needed, then:"
echo "       ffmpeg -y -i $RUN_DIR/candidate-N.png -q:v 2 $CANONICAL_REF"
echo "  3. For subsequent format winners, save as:"
echo "       ffmpeg -y -i $RUN_DIR/candidate-N.png -q:v 2 public/ogimage__Augment-It--{Format}.jpg"
echo "       (where {Format} matches the format name above — Banner / BannerTall / Portrait / etc.)"
echo "  4. If you replace an existing canonical, archive the old one first:"
echo "       mv $CANONICAL_REF ogimage-archive/ogimage__Augment-It--Default--\$(date +%Y-%m-%d).jpg"
