<script lang="ts">
  /**
   * ExternalLink — a link that leaves the app, said out loud.
   *
   * 34 sightings across 12 members, and measured across all of them:
   *
   *   0  warn a screen reader that the link opens a new tab
   *   7  set target="_blank" with no rel="noopener" — the opened page gets
   *      window.opener access back into ours
   *   1  measured at 10x20px, 21% of the WCAG 2.2 SC 2.5.8 target floor
   *
   * None of that is visible in a screenshot, which is how it survived twelve
   * members and nine migrations. A sighted mouse user cannot tell any of these
   * three apart from a correct link.
   *
   * THE NEW-TAB NOTICE IS VISUALLY HIDDEN, NOT display:none. `display: none`
   * removes an element from the accessibility tree as well as the page, so the
   * notice would be invisible to exactly the user it exists for — while looking
   * finished in the markup. That mistake is the reason this is a component and
   * not a lint rule.
   *
   * A NOTE ON OVERRIDING THIS FROM A MEMBER, learned the hard way: this
   * component's scoped rule compiles to (0,2,0). A member rule from ONE class is
   * (0,1,0) and loses silently; from two classes it TIES and resolves on
   * stylesheet injection order, which under Module Federation is not decidable.
   * And a `class` handed to a child component gets no scope hash at all, so a
   * rule in a member's own component style block targeting it is dead on
   * arrival — svelte-check reports it as an unused selector. (Written without
   * the literal tag on purpose: svelte-preprocess scans raw file text, so that
   * tag inside a comment makes postcss parse the rest of the file as CSS. It
   * cost this commit one round trip.)
   *
   * So: use the props. `inheritColor` exists precisely so a contrast decision is
   * a declaration rather than a specificity argument.
   *
   * `rel` is MERGED, never replaced. A member passing `rel="nofollow"` keeps
   * noopener, because the security property must not be something a call site
   * can drop by accident.
   */
  import type { Snippet } from 'svelte';

  type Props = {
    href: string;
    /** The visible text. Falls back to the href, which is usually what a URL row wants. */
    label?: string;
    /** Navigate in place. Drops the target, the rel and the notice. */
    sameTab?: boolean;
    /** Added to the enforced rel rather than replacing it. */
    rel?: string;
    /** Do not truncate — for short labels in a wide row. */
    noTruncate?: boolean;
    /**
     * Take the surrounding text colour instead of the link colour.
     *
     * For a link inside a coloured container — an error banner, a warning strip —
     * where the container has already made a CONTRAST decision and link-blue
     * would break it.
     *
     * This exists because that decision nearly vanished silently. A member had
     * `.lib-error a { color: inherit }` for a link sitting on --color-error-bg;
     * this component's scoped rule is (0,2,0) and a one-class member rule is
     * (0,1,0), so adoption would have turned it link-blue inside a red box with
     * NOTHING IN THE DIFF TO SHOW IT. Caught by reading specificity, not by a
     * gate.
     *
     * Expressing it as a prop beats winning on specificity: the intent is at the
     * call site, and it cannot be lost to a stylesheet injection order that
     * differs between dev and a federated production build.
     */
    inheritColor?: boolean;
    /**
     * The visible content is an icon; `label` becomes the accessible name.
     *
     * TWO blockers made this necessary, either alone sufficient, and both were
     * found by an adoption that correctly refused rather than shipping a
     * regression:
     *
     *  1. An `aria-label` on the anchor SUPPRESSES the visually-hidden new-tab
     *     notice — the one thing this component exists to add. So a member
     *     naming its icon link lost the feature it adopted the component for.
     *     Here the component composes the name itself, in the DOM, so the notice
     *     is part of it and cannot be overridden away.
     *  2. `min-inline-size: 0` is declared in this component's scoped style at
     *     (0,2,0), so a member class at (0,1,0) cannot restore a width floor —
     *     reaching 24px WIDE needed rung 4. An icon link is square here.
     *
     * The refusal was right: one of those sites already cleared the target floor
     * with its own rules, so adopting would have turned a measured pass into a
     * measured failure.
     */
    iconOnly?: boolean;
    children?: Snippet;
    class?: string;
    [key: string]: unknown;
  };

  let {
    href,
    label,
    sameTab = false,
    rel = '',
    noTruncate = false,
    iconOnly = false,
    inheritColor = false,
    children,
    class: klass = '',
    ...rest
  }: Props = $props();

  const text = $derived(label ?? href);

  // Merge, never replace. Dedup so `rel="noopener"` from a member does not
  // produce "noopener noopener noreferrer".
  const relValue = $derived(
    sameTab
      ? rel || undefined
      : Array.from(new Set(['noopener', 'noreferrer', ...rel.split(/\s+/)].filter(Boolean))).join(' '),
  );
</script>

<a
  {...rest}
  {href}
  target={sameTab ? undefined : '_blank'}
  rel={relValue}
  title={iconOnly ? text : noTruncate ? undefined : text}
  class="ui-extlink {klass}"
  data-truncate={!iconOnly && !noTruncate || undefined}
  data-icon={iconOnly || undefined}
  data-inherit-color={inheritColor || undefined}
>
  {#if iconOnly}
    <span class="ui-extlink__icon" aria-hidden="true">{@render children?.()}</span>
    <!-- The name is composed HERE, not via aria-label, so the new-tab notice is
         part of it. An aria-label would replace this whole subtree and take the
         notice with it. -->
    <span class="ui-extlink__newtab">{text}{sameTab ? '' : ' (opens in a new tab)'}</span>
  {:else}
    <span class="ui-extlink__label">{#if children}{@render children()}{:else}{text}{/if}</span>
    {#if !sameTab}
      <span class="ui-extlink__newtab">(opens in a new tab)</span>
    {/if}
  {/if}
</a>

<style>
  .ui-extlink {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2xs);
    /* Declared, not inherited from whatever line-height happens to apply. One
       sighting measured 10x20px — 21% of the floor — purely by accident. */
    min-block-size: var(--control-h-sm);
    min-inline-size: 0;
    color: var(--color-link);
    font-family: var(--font-sans);
    font-size: inherit;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .ui-extlink[data-inherit-color],
  .ui-extlink[data-inherit-color]:visited { color: inherit; }

  .ui-extlink:hover { text-decoration-thickness: 2px; }
  /* A visited link that looks unvisited is a usability regression, and one
     member had a :visited rule that adoption deleted. Restored federally rather
     than left to each member to rediscover. */
  .ui-extlink:visited { color: var(--color-link-visited, var(--color-link)); }

  /* Square, and wide enough. See `iconOnly` — a member could not restore a width
     floor from outside, because min-inline-size is declared here at (0,2,0). */
  .ui-extlink[data-icon] {
    justify-content: center;
    min-inline-size: var(--control-h-sm);
    text-decoration: none;
  }
  .ui-extlink__icon { display: inline-flex; }
  .ui-extlink:focus-visible {
    box-shadow: var(--focus-ring);
    outline: none;
    border-radius: var(--radius-sm);
  }

  .ui-extlink__label { min-inline-size: 0; }
  .ui-extlink[data-truncate] .ui-extlink__label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Visually hidden, still in the accessibility tree. NOT display:none — see the
     header. The clip-path pair is the modern spelling; the 1px/clip rect is the
     fallback older AT still needs. */
  .ui-extlink__newtab {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }
</style>
