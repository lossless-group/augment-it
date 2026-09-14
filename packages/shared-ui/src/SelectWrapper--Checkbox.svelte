<script lang="ts">
  /**
   * SelectWrapper--Checkbox — multi-select, with a real checkbox.
   *
   * The third variant on the what-you-click axis, and the simplest by a wide
   * margin: no overlay, no positioning contract, nothing to bury. A real
   * <input type="checkbox"> inside a real <label> is better than anything this
   * component could invent — it is keyboard-operable, announces its own state,
   * and works with every assistive technology without help.
   *
   * WHY IT EXISTS ANYWAY: five members hand-roll this shape, and one ships a
   * checkbox measured at 13x13 — FIFTY-FOUR PERCENT of the WCAG 2.2 SC 2.5.8
   * 24px floor. A native control is not automatically an accessible one if
   * nobody sized it.
   *
   * MULTI-SELECT, NOT SINGLE. `aria-checked` on a checkbox means "this one is in
   * the set"; the toggle-button semantics the other two wrappers carry
   * (`aria-pressed`) are wrong here and deliberately absent. For choose-exactly-
   * one, that is a radio, and there are currently ZERO radios in the federation —
   * so it is not built. Shipping ahead of consumers is how the federal layer got
   * a spacing scale with no adopters.
   *
   * THE LABEL WRAPS THE CONTROL. That is what makes the whole row's text a hit
   * target without any overlay, and it is why this variant has none of
   * --ClickBody's hazards.
   */
  import type { Snippet } from 'svelte';

  type Props = {
    /** Accessible name. REQUIRED — a checkbox whose only label is a row of text
        it does not wrap has no name at all. */
    label: string;
    checked?: boolean;
    /** Neither checked nor unchecked — for a "select all" over a partial set. */
    indeterminate?: boolean;
    disabled?: boolean;
    onchange?: (checked: boolean) => void;
    /**
     * `comfortable` (default) gives the label a 28px floor. `compact` drops it to
     * the 24px box itself, for dense data tables.
     *
     * Added because the label's own floor set the ROW HEIGHT of any table that
     * adopted this: one 12px-font data table measured 34.7px -> 44.7px, a 29%
     * increase, purely from the 4px the label carried above its own control. The
     * control never shrinks below 24px in either density — the WCAG floor is not
     * a density setting.
     */
    density?: 'comfortable' | 'compact';
    /**
     * Attributes for the LABEL rather than the input — `title`, `id`, `data-*`.
     * `{...rest}` lands on the input, so without this a member wanting a tooltip
     * on the whole toggle had to wrap the component in a span to get one.
     *
     * IT SOLVES ATTRIBUTES, NOT TYPOGRAPHY. `.ui-selectcheck` declares
     * `font: inherit; color: inherit` on purpose, so the control takes its type
     * from an ancestor — which means ONLY A PARENT CAN SAY "this option is
     * secondary". A member class passed via `class=` ties the component's own
     * scoped rule at (0,2,0) and loses on source order: one member measured its
     * muted 12px option silently promoted to 13px body text, directly under the
     * primary Button it qualifies. If you need non-inherited type, you still need
     * a wrapper, and that wrapper is not dead weight.
     */
    labelProps?: Record<string, unknown>;
    /** Merged, never replacing the component's own class. */
    class?: string;
    children?: Snippet;
    [key: string]: unknown;
  };

  let {
    label,
    checked = false,
    indeterminate = false,
    disabled = false,
    onchange,
    density = 'comfortable',
    labelProps = {},
    class: klass = '',
    children,
    ...rest
  }: Props = $props();

  let input = $state<HTMLInputElement | undefined>();

  // `indeterminate` is a DOM property with no HTML attribute, so it cannot be set
  // declaratively — a member that tries silently gets nothing.
  $effect(() => {
    if (input) input.indeterminate = indeterminate;
  });
</script>

<label class="ui-selectcheck {klass}" data-density={density} class:is-disabled={disabled} {...labelProps}>
  <input
    bind:this={input}
    type="checkbox"
    {checked}
    {disabled}
    aria-label={children ? undefined : label}
    onchange={(e) => onchange?.(e.currentTarget.checked)}
    {...rest}
  />
  {#if children}
    <span class="ui-selectcheck__label">{@render children()}</span>
  {/if}
</label>

<style>
  .ui-selectcheck {
    display: inline-flex;
    align-items: center;
    gap: var(--space-sm);
    /* The label is the target, so it carries the floor — not the box. */
    min-block-size: var(--control-h-md);
    /* NOTE ON DENSITY, measured rather than assumed: this label is INLINE-LEVEL,
       so a container whose only content is the control still reserves leading for
       text it does not have. One dense table paid ~5.4px of phantom leading —
       more than the `density` prop is worth. The fix is `line-height: 0` on that
       container, which is the PARENT's job and therefore rung 0. Do not set it
       here: a label with children does need its leading. */
    /* A shrink-wrapped label is what makes this variant safe beside other
       controls in the same row: it is a SIBLING, never an ancestor, so it
       captures nothing. Do not give it flex:1 or an inset overlay to make "the
       whole row" clickable — that swallows the neighbouring buttons and lands
       back in the --ClickBody problem. The property is load-bearing. */
    font: inherit;
    color: inherit;
    cursor: pointer;
  }
  .ui-selectcheck[data-density='compact'] { min-block-size: var(--control-h-sm); }

  .ui-selectcheck.is-disabled { cursor: not-allowed; color: var(--color-text-muted); }

  .ui-selectcheck input {
    /* 24px, because a native checkbox defaults to ~13px and five members shipped
       it that way — 54% of the SC 2.5.8 floor. accent-color keeps the platform's
       own checked rendering rather than re-drawing a control from scratch. */
    inline-size: var(--control-h-sm);
    block-size: var(--control-h-sm);
    flex: 0 0 auto;
    margin: 0;
    accent-color: var(--color-primary);
    cursor: inherit;
  }
  .ui-selectcheck input:focus-visible {
    box-shadow: var(--focus-ring);
    outline: none;
    border-radius: var(--radius-sm);
  }

  .ui-selectcheck__label {
    /* display: flex, NOT inline. The first version was inline, which did two
       silent things: it re-parented children that had been flex items of the
       member's own row into one inline box, and it made `text-overflow: ellipsis`
       dead — one member's truncating org name measured scrollWidth 423 before and
       0 after. `min-inline-size: 0` is also a NO-OP on an inline box, so the
       declaration meant to permit truncation could not have worked either.
       Two of two members with children had to add this back at rung 0, which is
       the evidence that it belongs here. */
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    min-inline-size: 0;
  }
</style>
