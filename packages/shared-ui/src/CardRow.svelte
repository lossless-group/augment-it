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
  import { getContext, type Snippet } from 'svelte';

  type Props = {
    /**
     * Row state, as a semantic tone — NOT a colour.
     *
     * Added on the first sweep's evidence: two independent members needed an
     * error/success row boundary in the same night. One spelled it as rung-4
     * `style=` + `data-deviation` and said what the loop says that means — an
     * escape hatch reached on the FIRST adoption is the API being wrong. The
     * other refused to mint a second deviation and left its row raw. Both halves
     * of the evidence, one sweep.
     *
     * `selected` is a different axis and they compose: a row can be selected AND
     * in error. Pick by what the row MEANS, exactly as Chip's tone works.
     *
     * `data-tone` IS A MEMBER-FACING STATE HOOK. It is published on the element,
     * so a member's own descendants can read state off it —
     * `[data-tone='error'] .my-icon { … }` — instead of keeping a second copy of
     * the same state in their own classes. One member deleted three state
     * classes and a wrapper this way, and in doing so fixed a bug the duplicate
     * state had been hiding: it had been drawing a warn border over ok-coloured
     * text, because the two copies had drifted.
     *
     * Documented because the next member will otherwise reach for `class=` and
     * spend a `data-deviation` on something that is not a deviation.
     */
    tone?: 'neutral' | 'ok' | 'warn' | 'error' | 'info';
    /** Visual density. `comfortable` is the default; `compact` for dense tables. */
    density?: 'comfortable' | 'compact';
    /**
     * Main-axis direction. `row` (default) lays children horizontally; `column`
     * stacks them.
     *
     * Added 2026-09-13 on the first sweep's evidence. The base shipped
     * horizontal-only, and the resolver family's candidate cards are stacked —
     * identity, stats, disclosure, preview, commit — so rendering them as flex
     * children laid the head and the action side by side. Two members wrote
     * byte-equivalent `CardRow--Stacked` wrappers whose entire content was
     * `flex-direction: column`, carrying no domain knowledge at all. A wrapper
     * that is one layout property is what a prop is for, so this is a prop.
     *
     * KNOWN TRAP: `column` makes an inline-flex child stretch to full width. One
     * probe measured a Button at 1034px inside a 1060px row. Wrap it, or give the
     * child `align-self: flex-start` — rung 0 either way, and no gate catches it.
     *
     * DEFAULTS FROM THE CONTAINER. Inside a `<ListContainer>` this is inherited
     * from its `layout` — `grid` gives `column`, `list` gives `row` — because the
     * sweep measured that direction is decided by the CONTAINER'S WIDTH and never
     * by the card's content. Four treatments of identical children: the only one
     * that breaks is a horizontal row in a narrow track. Pass it explicitly to
     * override; context is a default, not a mandate.
     */
    direction?: 'row' | 'column';
    /**
     * The element to render. Defaults to `div`; pass `li` inside a `<ul>`/`<ol>`.
     *
     * Added on pilot evidence: 16 of 20 members render their rows as `<li>`, and
     * a `<ul>` permits only `<li>`. Shipping div-only meant every one of those
     * members independently discovering the same workaround — an extra wrapper
     * level — which is how a paradigm accumulates sixteen slightly different
     * solutions to one problem. It decides once, here.
     */
    as?: 'div' | 'li';
    /**
     * Reflects selection for STYLING ONLY. Does NOT make the row interactive and
     * does NOT announce anything — `SelectWrapper` owns `aria-pressed`.
     *
     * The duplication with SelectWrapper's `selected` is deliberate and correct:
     * this is a PAINT instruction on a non-interactive div, that is an ARIA state
     * on a real button. Same source of truth, two different jobs. Pass both from
     * one member-level value; never derive one from the other.
     */
    selected?: boolean;
    /** Rung 4 — requires data-deviation. See Button's header: style, not class. */
    style?: string;
    class?: string;
    children?: Snippet;
    [key: string]: unknown;
  };

  // A ListContainer publishes the direction its layout implies. Absent one, a
  // bare CardRow is horizontal, which is what 16 of 18 members render.
  const listCtx = getContext<{ direction: 'row' | 'column' } | undefined>('ui-list');

  let {
    as = 'div',
    tone = 'neutral',
    density = 'comfortable',
    direction,
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

<svelte:element
  this={as}
  class="ui-cardrow {klass}"
  data-tone={tone}
  data-density={density}
  data-direction={direction ?? listCtx?.direction ?? 'row'}
  data-selected={selected || undefined}
  data-a11y-error={a11yError}
  style={styleProp}
  {...rest}
>
  {@render children?.()}
</svelte:element>

<style>
  .ui-cardrow {
    position: relative;
    list-style: none;   /* `as="li"` must not render a marker */           /* the anchor SelectWrapper--ClickBody overlays */
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
  .ui-cardrow[data-direction='column'] {
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-sm);
  }

  .ui-cardrow[data-density='comfortable'] { padding: var(--space-lg) var(--space-xl); }
  .ui-cardrow[data-density='compact']     { padding: var(--space-sm) var(--space-lg); }

  /* A selectable row with no hover cue reads as inert — one pilot spent its only
     rung-4 escape restoring the `li:hover` its own stylesheet used to provide.
     The selectors inside :has() must be :global(): the children are slotted, so
     Svelte cannot see them statically and PRUNES the whole rule as unused —
     silently, at build time, which svelte-check reports only as a warning. */
  .ui-cardrow:hover:has(:global(button), :global(a[href]), :global(input), :global(select), :global(textarea)) {
    /* --color-text-muted, NOT --color-border. The first version of this rule used
       the FAINT token, so hovering an interactive row made its boundary weaker —
       2.73:1 at rest dropping to 1.34:1 on hover. A hover cue that reduces
       contrast is worse than no hover cue, and it shipped because "add a hover
       state" was reasoned about and never measured. Caught by a probe comparing
       rest and hover on the same row. */
    border-color: var(--color-text-muted);
  }

  /* Tones paint the BOUNDARY, not the fill — a row's content has to stay legible
     on the same surface at every tone, and a tinted fill would move every text
     contrast pair in the row. selected still owns the fill. */
  .ui-cardrow[data-tone='ok']    { border-color: var(--color-ok-fg); }
  .ui-cardrow[data-tone='warn']  { border-color: var(--color-warn-fg); }
  .ui-cardrow[data-tone='error'] { border-color: var(--color-error-fg); }
  .ui-cardrow[data-tone='info']  { border-color: var(--color-info-fg); }

  .ui-cardrow[data-selected] {
    border-color: var(--color-primary);
    background: var(--color-accent-bg);
  }

  .ui-cardrow[data-a11y-error] {
    outline: var(--space-3xs) dashed var(--color-error-fg);
  }
</style>
