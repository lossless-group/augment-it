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
    /** Render `{max}+` above this. Set 0 to disable. */
    max?: number;
    /** Accessible name. Without one a bare number announces as a bare number. */
    label?: string;
    class?: string;
    [key: string]: unknown;
  };

  let { count, tone = 'inherit', max = 999, label, class: klass = '', ...rest }: Props = $props();

  const capped = $derived(max > 0 && count > max);
  const shown = $derived(capped ? `${max}+` : String(count));
  const name = $derived(label ? `${label}: ${count}` : undefined);
</script>

<span
  class="ui-countbadge {klass}"
  data-tone={tone}
  aria-label={name}
  title={capped ? String(count) : undefined}
  {...rest}
>{shown}</span>

<style>
  .ui-countbadge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-inline-size: var(--control-h-sm);
    block-size: var(--control-h-sm);
    padding-inline: var(--space-2xs);
    border-radius: var(--radius-pill);
    font-family: var(--font-mono);
    font-size: var(--text-label);
    font-variant-numeric: tabular-nums;  /* a changing count must not jitter */
    line-height: 1;
  }

  /* The default. Takes the host control's colour, which is why this is not a
     Chip — see the header. */
  .ui-countbadge[data-tone='inherit'] {
    background: color-mix(in srgb, currentColor 15%, transparent);
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
