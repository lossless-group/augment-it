<script lang="ts">
  /**
   * CountBadge — a small number attached to something else.
   *
   * ~28 sightings under seven different class names: `badge`, `chip-count`,
   * `ow-list-count`, `count`, `pe-counter`, `rs-family-count`,
   * `record-card-count`. Some sit inside a Button's label, some beside a
   * heading, one is an arrival signal in the shell.
   *
   * NOT A CHIP. A Chip paints its own ground from page-level tokens. A count
   * badge inside a Button must take the control's colour — `pack-runner` and
   * `response-reviewer` both hand-rolled `color-mix(currentColor 15%)` for
   * exactly that reason, and adopting a Chip there would have put muted text on
   * an accent fill and erased the selected-state cue on a whole filter row.
   *
   * So this INHERITS by default (`tone="inherit"`) and only paints when asked.
   * That is the whole difference between the two organs.
   *
   * `max` exists because a count is an at-a-glance signal: 1,982 is not one.
   * Over the cap it renders `999+` and puts the true number in the accessible
   * name, so nothing is lost to a screen reader.
   */
  type Props = {
    count: number;
    /** `inherit` takes the host control's colour — the default, and the point. */
    tone?: 'inherit' | 'neutral' | 'accent' | 'error';
    /**
     * `md` (default, 24px) or `sm` (18px).
     *
     * The first version had one size, exactly `--control-h-sm` — which is
     * exactly an `sm` Button's OUTER height, so a badge inside one measured
     * 0.00px inset top and bottom and its pill ground painted straight across
     * the control's 1px border. Measured in three modes. `sm` exists so a badge
     * can sit inside a uniformly-small row without the row having to grow.
     */
    size?: 'sm' | 'md';
    /** Render `{max}+` above this. Set 0 to disable. */
    max?: number;
    /** Accessible name. Without one a bare number announces as a bare number. */
    label?: string;
    class?: string;
    [key: string]: unknown;
  };

  let {
    count,
    tone = 'inherit',
    size = 'md',
    max = 999,
    label,
    class: klass = '',
    ...rest
  }: Props = $props();

  const capped = $derived(max > 0 && count > max);
  const shown = $derived(capped ? `${max}+` : String(count));
  const name = $derived(label ? `${label}: ${count}` : undefined);
</script>

<span
  class="ui-countbadge {klass}"
  data-tone={tone}
  data-size={size}
  aria-label={name}
  title={capped ? String(count) : undefined}
  {...rest}
>{shown}</span>

<style>
  .ui-countbadge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding-inline: var(--space-2xs);
    border-radius: var(--radius-pill);
    font-family: var(--font-mono);
    font-size: var(--text-label);
    font-variant-numeric: tabular-nums;  /* a changing count must not jitter */
    line-height: 1;
  }

  .ui-countbadge[data-size='md'] {
    min-inline-size: var(--control-h-sm);
    block-size: var(--control-h-sm);
  }
  .ui-countbadge[data-size='sm'] {
    min-inline-size: var(--space-2xl);
    block-size: var(--space-2xl);
  }

  /* The default. Takes the host control's colour, which is why this is not a
     Chip — see the header.
     A RING, NOT A FILL. The first version used
     color-mix(currentColor 15%, transparent), which is what both members
     hand-rolled and which measured 4.01:1 on a primary button and 3.97:1 on a
     destructive one — under the 4.5 floor. The tint mixes toward TRANSPARENT, so
     it always lands between the text and the ground and costs roughly 23% of the
     control's own text contrast. A ring leaves the ground alone, so the number
     keeps whatever contrast the button already earned.
     Same fix, same reason, as the gallery's classification-tree count slot:
     3.68 -> 5.47 by replacing a color-mix fill with a currentColor ring. */
  .ui-countbadge[data-tone='inherit'] {
    background: transparent;
    box-shadow: inset 0 0 0 1px currentColor;
    color: inherit;
  }
  .ui-countbadge[data-tone='neutral'] {
    background: var(--color-surface-2);
    color: var(--color-text-muted);
  }
  .ui-countbadge[data-tone='accent'] {
    background: var(--color-accent-bg);
    color: var(--color-accent-fg);
  }
  .ui-countbadge[data-tone='error'] {
    background: var(--color-error-bg);
    color: var(--color-error-fg);
  }
</style>
