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
    /**
     * Gap between rows. A SPACING-SCALE token name, not a private remap.
     *
     * The first version offered sm|md|lg mapped to --space-sm|-lg|-2xl, so
     * `gap="md"` silently gave you --space-lg and `--space-md` was unreachable.
     * A member reached for the same-sounding name and its grid went from four
     * tracks at 280.5px to three at 376px. Names that look like the scale must BE
     * the scale.
     */
    gap?: '2xs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
    /** Minimum track width when `layout="grid"`. A token name or a length. */
    trackMin?: string;
    /**
     * Pin the header while the rows scroll. OFF by default.
     *
     * It used to be unconditional, and that is why the slot had zero consumers:
     * `position: sticky` only pins to the nearest scrolling ancestor, so a list
     * that is not its own scroll container pins its header to the VIEWPORT
     * instead. Every in-page list in the first sweep would have glued a heading
     * to the top of the page. Opt in when the rows region actually scrolls.
     */
    stickyHeader?: boolean;
    /**
     * Draw a hairline under the header.
     *
     * Three of four members in the first sweep had one, deleted it with their own
     * header recipe, and had no way to get it back — `class=` lands on the rows
     * element, not the header. Their dividers were drawn with `--color-border` at
     * ~1.26:1 anyway, under the non-text floor; this uses `--color-border-strong`.
     */
    headerDivider?: boolean;
    /**
     * Cap the rows region's height so `overflow-y: auto` has something to scroll
     * against. Without it the layout owned the scrolling and the member still
     * owned the bound, which made "ListContainer owns the scroll region" half
     * true — two members had to add a flex wrapper back just to keep their cap.
     */
    maxBlockSize?: string;
    /**
     * Rendered when there are no rows — outside the rows element, so a `<p>` is
     * legal even when `as="ul"`. Without this, a member whose list has
     * loading/error/empty branches could not use the header slot at all, because
     * the branch content is not a valid `<li>`.
     */
    empty?: Snippet;
    /** Accessible name for the list region. Strongly recommended on `ul`/`ol`. */
    label?: string;
    /** Sticky header slot — the "controls up top" half of the shape. */
    header?: Snippet;
    /** Merged onto the rows element, never replacing its own class. */
    class?: string;
    children?: Snippet;
    [key: string]: unknown;
  };

  let {
    layout = 'list',
    as = 'div',
    gap = 'sm',
    trackMin = '280px',
    stickyHeader = false,
    headerDivider = false,
    maxBlockSize,
    label,
    header,
    empty,
    class: klass = '',
    children,
    ...rest
  }: Props = $props();

  // `aria-label` on a role-less <div> is not exposed to assistive tech at all, so
  // a `label` on `as="div"` was a silently lying attribute. Give the div list
  // semantics when it is named, or drop the name.
  const listSemantics = $derived(
    !label
      ? {}
      : as === 'ul' || as === 'ol'
        ? { 'aria-label': label }
        : { role: 'list', 'aria-label': label },
  );

  const rowsStyle = $derived(
    [
      layout === 'grid' ? `--ui-track-min: ${trackMin};` : '',
      maxBlockSize ? `max-block-size: ${maxBlockSize};` : '',
    ]
      .filter(Boolean)
      .join(' ') || undefined,
  );

  // CardRow reads this as its DEFAULT direction. An explicit prop still wins.
  setContext('ui-list', {
    get direction() {
      return layout === 'grid' ? ('column' as const) : ('row' as const);
    },
  });
</script>

<div class="ui-listcontainer" data-layout={layout}>
  {#if header}
    <div
      class="ui-listcontainer__header"
      data-sticky={stickyHeader || undefined}
      data-divider={headerDivider || undefined}
    >
      {@render header()}
    </div>
  {/if}
  <svelte:element
    this={as}
    class="ui-listcontainer__rows {klass}"
    data-gap={gap}
    {...listSemantics}
    style={rowsStyle}
    {...rest}
  >
    {@render children?.()}
  </svelte:element>
  {#if empty}{@render empty()}{/if}
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
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    flex-wrap: wrap;            /* a toolbar that cannot wrap clips its own controls */
    padding-block: var(--space-sm);
    /* NO background by default. It used to be --color-background, which painted a
       near-black strip inside any --color-surface panel — three of four members
       in the first sweep, with no prop to change it and no reachable selector to
       override it. A layout inherits the surface it is placed on. */
  }

  .ui-listcontainer__header[data-divider] {
    border-block-end: 1px solid var(--color-border-strong);
  }

  /* BEFORE REACHING FOR THIS, CHECK WHETHER YOU NEED IT. The rows element is
     already the scroll container, so a header placed outside it is pinned
     STRUCTURALLY and needs no sticky at all. One member in the first sweep
     reached for sticky, then made the rows region scroll instead and deleted it —
     which is the better pattern and the one this layout is shaped for. `sticky`
     is for a header whose scrolling ancestor is somewhere else entirely. */
  .ui-listcontainer__header[data-sticky] {
    position: sticky;
    inset-block-start: 0;
    z-index: var(--z-sticky);
    /* A pinned header MUST occlude what scrolls under it. This used to be
       `background: inherit`, and `.ui-listcontainer` declares no background, so
       inherit resolved to transparent and content scrolled visibly through the
       header — the fix for the original hardcoded-background bug reintroduced the
       same symptom by a different route.
       --color-surface is the panel most lists sit on; override the custom
       property when yours does not. */
    background: var(--ui-list-header-bg, var(--color-surface));
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

  .ui-listcontainer__rows[data-gap='2xs'] { gap: var(--space-2xs); }
  .ui-listcontainer__rows[data-gap='xs']  { gap: var(--space-xs); }
  .ui-listcontainer__rows[data-gap='sm']  { gap: var(--space-sm); }
  .ui-listcontainer__rows[data-gap='md']  { gap: var(--space-md); }
  .ui-listcontainer__rows[data-gap='lg']  { gap: var(--space-lg); }
  .ui-listcontainer__rows[data-gap='xl']  { gap: var(--space-xl); }
  .ui-listcontainer__rows[data-gap='2xl'] { gap: var(--space-2xl); }

  .ui-listcontainer[data-layout='grid'] .ui-listcontainer__rows {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--ui-track-min, 280px), 1fr));
    align-items: stretch;       /* equal-height tiles without a per-card override */
  }
</style>
