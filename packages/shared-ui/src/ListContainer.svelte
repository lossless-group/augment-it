<script lang="ts">
  /**
   * ListContainer — the small window: controls up top, a generated list below.
   *
   * WHY THIS EXISTS. Sixteen of eighteen members are this exact shape, and the
   * sweep that put CardRow into twenty of them produced one clear result about
   * where the remaining decision lives:
   *
   *   `direction` is determined by the CONTAINER'S WIDTH and never by the card's
   *   content. Four treatments of IDENTICAL children across a 280px grid track
   *   and a full-width list: three render cleanly, and the one that breaks is a
   *   row in a narrow track. Same children, different container.
   *
   * So the container owns it. A member sets `layout` once here instead of
   * repeating `direction` at every call site, and CardRow reads it from context.
   * An explicit `direction` on a CardRow still wins — context is a default, not
   * a mandate.
   *
   * THIS IS A LAYOUT, IN THE SENSE THE DECISION DOC MEANS. It places children
   * whose shape it deliberately does not know. And it is therefore one of the
   * few components ALLOWED TO SET SPACING — see
   * context-v/decisions/The-List-Surface-Paradigm-CardRow-ListContainer-And-Selection.md:
   *
   *   A layout may set spacing, placement and container width. A component may
   *   not.
   *
   * That rule is the lever on the problem the layout issue names: 912 raw
   * paddings against zero uses of `var(--space-*)`. Members hand-roll spacing
   * because nothing owns it. This owns it.
   *
   * LAYOUTS NEST, and a Layout is a KIND rather than a SCOPE — being one does not
   * make it a PageLayout or a WindowLayout. A ListContainer inside a two-column
   * layout inside a page layout is three parents each owning the placement of its
   * own slot, which is exactly right.
   *
   * NOT IN SCOPE, deliberately: this does not own the header's contents, the
   * empty state, or the data. It places them.
   */
  import { setContext, type Snippet } from 'svelte';

  type Props = {
    /**
     * `list` — full-width rows, stacked. The default, and 16 of 18 members.
     * `grid` — tiles in tracks. Sets its rows to `direction="column"`, because a
     *          horizontal row in a narrow track is the one treatment that breaks.
     */
    layout?: 'list' | 'grid';
    /** Rendered element. `ul` gives the list free `list` semantics to AT. */
    as?: 'div' | 'ul' | 'ol' | 'section';
    /** Gap between rows. A token NAME, not a value — the layout owns spacing. */
    gap?: 'sm' | 'md' | 'lg';
    /** Minimum track width when `layout="grid"`. A token name or a length. */
    trackMin?: string;
    /** Accessible name for the list region. Strongly recommended on `ul`/`ol`. */
    label?: string;
    /** Sticky header slot — the "controls up top" half of the shape. */
    header?: Snippet;
    children?: Snippet;
    [key: string]: unknown;
  };

  let {
    layout = 'list',
    as = 'div',
    gap = 'sm',
    trackMin = '280px',
    label,
    header,
    children,
    ...rest
  }: Props = $props();

  // CardRow reads this as its DEFAULT direction. An explicit prop still wins.
  setContext('ui-list', {
    get direction() {
      return layout === 'grid' ? ('column' as const) : ('row' as const);
    },
  });
</script>

<div class="ui-listcontainer" data-layout={layout}>
  {#if header}
    <div class="ui-listcontainer__header">{@render header()}</div>
  {/if}
  <svelte:element
    this={as}
    class="ui-listcontainer__rows"
    data-gap={gap}
    role={as === 'div' || as === 'section' ? undefined : undefined}
    aria-label={label}
    style={layout === 'grid' ? `--ui-track-min: ${trackMin};` : undefined}
    {...rest}
  >
    {@render children?.()}
  </svelte:element>
</div>

<style>
  .ui-listcontainer {
    display: flex;
    flex-direction: column;
    min-block-size: 0;          /* so the rows region can actually scroll */
    inline-size: 100%;
  }

  /* The "functionality up top" half. Sticky because in every member that has one
     it stays put while the list scrolls under it. */
  .ui-listcontainer__header {
    position: sticky;
    inset-block-start: 0;
    z-index: var(--z-sticky);
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    flex-wrap: wrap;            /* a toolbar that cannot wrap clips its own controls */
    padding-block: var(--space-sm);
    background: var(--color-background);
  }

  .ui-listcontainer__rows {
    display: flex;
    flex-direction: column;
    min-block-size: 0;
    overflow-y: auto;
    margin: 0;
    padding: 0;
    list-style: none;           /* `as="ul"` keeps the semantics, drops the marker */
  }

  .ui-listcontainer__rows[data-gap='sm'] { gap: var(--space-sm); }
  .ui-listcontainer__rows[data-gap='md'] { gap: var(--space-lg); }
  .ui-listcontainer__rows[data-gap='lg'] { gap: var(--space-2xl); }

  .ui-listcontainer[data-layout='grid'] .ui-listcontainer__rows {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--ui-track-min, 280px), 1fr));
    align-items: stretch;       /* equal-height tiles without a per-card override */
  }
</style>
