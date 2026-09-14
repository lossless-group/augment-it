<script lang="ts">
  /**
   * CardRow — one object in a list surface. FIRST PASS, deliberately thin.
   *
   * WHAT THIS IS. Sixteen of eighteen members are the same shape: controls up
   * top, a generated list below. This is one row of that list — a card that is
   * also a list item. It is NOT a control: it renders a <div> and has no
   * onclick. Selection is composed in from outside; see SelectWrapper.
   *
   * See context-v/decisions/The-List-Surface-Paradigm-CardRow-ListContainer-And-Selection.md
   * Several decisions there are deliberately OPEN. This component is the cheapest
   * thing that lets the three pilot members answer them with evidence.
   *
   * D1 IS OPEN — one component with props, or many named files? This ships as a
   * thin base on purpose. A member that needs a distinct look creates
   * `CardRow--<Kind>.svelte` in its OWN src/, wrapping this. If three members'
   * wrappers turn out identical, they promote. If they stay different, the BEM
   * names already document the spread:
   *
   *     rg -o 'CardRow--\w+' | sort | uniq -c
   *
   * That rollup works whether the answer is one component or sixteen, which is
   * why the question does not need answering yet.
   *
   * LAYOUT IS NOT THIS COMPONENT'S JOB (rung 0). A CardRow does not set its own
   * margin, width or position. Its parent — a ListContainer, eventually — does.
   *
   * A11Y. The row is a <div> with no role. If the whole row must be reachable,
   * that is SelectWrapper's job, and it has rules about nesting that exist
   * because every row surface in this federation already contains 3-23 controls.
   */
  import type { Snippet } from 'svelte';

  type Props = {
    /** Visual density. `comfortable` is the default; `compact` for dense tables. */
    density?: 'comfortable' | 'compact';
    /** Reflects selection for styling. Does NOT make the row interactive. */
    selected?: boolean;
    /** Rung 4 — requires data-deviation. See Button's header: style, not class. */
    style?: string;
    class?: string;
    children?: Snippet;
    [key: string]: unknown;
  };

  let {
    density = 'comfortable',
    selected = false,
    style: styleProp,
    class: klass = '',
    children,
    ...rest
  }: Props = $props();

  const a11yError = $derived(
    (klass || styleProp) && !rest['data-deviation']
      ? 'class= or style= requires a data-deviation reason (override ladder rung 4)'
      : undefined,
  );
  $effect(() => {
    if (a11yError) console.error(`[@augment-it/shared-ui] <CardRow> ${a11yError}`);
  });
</script>

<div
  class="ui-cardrow {klass}"
  data-density={density}
  data-selected={selected || undefined}
  data-a11y-error={a11yError}
  style={styleProp}
  {...rest}
>
  {@render children?.()}
</div>

<style>
  .ui-cardrow {
    position: relative;           /* the anchor SelectWrapper--ClickBody overlays */
    display: flex;
    align-items: flex-start;
    gap: var(--space-md);
    inline-size: 100%;
    background: var(--color-surface);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-md);
    color: var(--color-text);
    font-family: var(--font-sans);
    font-size: var(--text-body);
    /* NO margin, NO width constraint, NO position offset — rung 0. */
  }
  .ui-cardrow[data-density='comfortable'] { padding: var(--space-lg) var(--space-xl); }
  .ui-cardrow[data-density='compact']     { padding: var(--space-sm) var(--space-lg); }

  .ui-cardrow[data-selected] {
    border-color: var(--color-primary);
    background: var(--color-accent-bg);
  }

  .ui-cardrow[data-a11y-error] {
    outline: var(--space-3xs) dashed var(--color-error-fg);
  }
</style>
