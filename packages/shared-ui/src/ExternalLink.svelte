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
  title={noTruncate ? undefined : text}
  class="ui-extlink {klass}"
  data-truncate={!noTruncate || undefined}
>
  <span class="ui-extlink__label">{#if children}{@render children()}{:else}{text}{/if}</span>
  {#if !sameTab}
    <span class="ui-extlink__newtab">(opens in a new tab)</span>
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
  .ui-extlink:hover { text-decoration-thickness: 2px; }
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
