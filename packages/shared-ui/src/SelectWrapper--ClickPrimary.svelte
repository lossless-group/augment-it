<script lang="ts">
  /**
   * SelectWrapper--ClickPrimary — only the row's primary label selects it.
   *
   * The conservative sibling of SelectWrapper--ClickBody. The rest of the card is
   * inert, so there is no overlay, no positioning contract, and nothing for
   * sibling controls to sit above. Reach for this when the row is dense with
   * controls, or when "click anywhere" would make an adjacent destructive action
   * feel dangerous.
   *
   * Renders one real <button>. It is NOT stretched, so it does not need a
   * positioned ancestor and cannot swallow a sibling.
   *
   * OPEN (agent leaning): this name sits on the what-you-click axis, parallel to
   * --ClickBody. The operator originally proposed --SingleControl, which sits on
   * the what-the-card-holds axis. That is a genuine coin-flip and should be
   * overturned freely if the team reasons about card composition instead.
   */
  import type { Snippet } from 'svelte';

  type Props = {
    label?: string;
    onselect?: () => void;
    selected?: boolean;
    disabled?: boolean;
    /** Merged, never replacing the component's own class. Rung 4 — see Button. */
    class?: string;
    children?: Snippet;
    [key: string]: unknown;
  };

  let {
    label,
    onselect,
    selected = false,
    disabled = false,
    class: klass = '',
    children,
    ...rest
  }: Props = $props();
</script>

<button
  type="button"
  class="ui-selectprimary {klass}"
  aria-pressed={selected}
  {disabled}
  onclick={onselect}
  aria-label={label}
  {...rest}
>
  {@render children?.()}
</button>

<style>
  .ui-selectprimary {
    display: inline-flex;
    align-items: baseline;
    gap: var(--space-2xs);
    min-block-size: var(--control-h-sm);   /* WCAG 2.2 SC 2.5.8 */
    /* Without this a flex item defaults to min-width:auto, so ONE long
       unbreakable token pushes the row's sibling controls clean out of the card.
       Measured: a long output-column name made a delete button 0% reachable. */
    min-inline-size: 0;
    font: inherit;
    color: inherit;
    background: none;
    border: 0;
    padding: 0;
    text-align: start;
    cursor: pointer;
  }
  .ui-selectprimary:focus-visible {
    box-shadow: var(--focus-ring);
    outline: none;
    border-radius: var(--radius-sm);
  }
  .ui-selectprimary:disabled { cursor: not-allowed; color: var(--color-text-muted); }
</style>
