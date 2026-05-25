<!--
  ConfidencePill — small numeric badge for pack-response confidence (0-100).
  Color band: 0-39 = low (red), 40-69 = med (amber), 70-100 = high (green).
  Colors come from theme tokens defined in @augment-it/theme/theme.css; the
  pill mixes its background via color-mix(token, transparent) so the same
  token drives both ink and tint.

  Spec: context-v/blueprints/Packs-and-Bundles-Pattern.md §Confidence pill
-->
<script lang="ts">
  type Props = {
    confidence: number; // 0-100
    tooltip?: string;
  };

  let { confidence, tooltip }: Props = $props();

  // Clamp + round so out-of-range or float inputs render sanely.
  const value = $derived(Math.max(0, Math.min(100, Math.round(confidence))));
  const band = $derived(value >= 70 ? 'high' : value >= 40 ? 'med' : 'low');
</script>

<span class="pill" data-band={band} title={tooltip ?? `Confidence ${value}/100`}>
  {value}
</span>

<style>
  .pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 2.25em;
    padding: 0.1em 0.55em;
    border-radius: 999px;
    font: 600 0.78em/1 var(--font-mono);
    letter-spacing: 0.02em;
    border: 1px solid currentColor;
    vertical-align: middle;
  }

  /* Each band: text in the token's full color, bg as a translucent mix.
     Components only reference Tier-2 tokens (--color-confidence-*), so the
     pill stays mode-agnostic — theme.css's three mode blocks repoint the
     same names at the appropriate Tier-1 named colors. */
  .pill[data-band='low'] {
    color: var(--color-confidence-low);
    background: color-mix(in srgb, var(--color-confidence-low) 14%, transparent);
  }
  .pill[data-band='med'] {
    color: var(--color-confidence-med);
    background: color-mix(in srgb, var(--color-confidence-med) 14%, transparent);
  }
  .pill[data-band='high'] {
    color: var(--color-confidence-high);
    background: color-mix(in srgb, var(--color-confidence-high) 14%, transparent);
  }
</style>
