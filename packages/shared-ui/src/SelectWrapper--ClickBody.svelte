<script lang="ts">
  /**
   * SelectWrapper--ClickBody — clicking ANYWHERE on the row's surface selects it.
   *
   * THE RULE THIS COMPONENT EXISTS TO OBEY (operator's call, 2026-09-13):
   * a select wrapper may NOT be a <button> wrapped around a card, because every
   * row surface in this federation already contains controls — measured, 3 to 23
   * of them, and NOT ONE has zero. A button inside a button is invalid HTML, and
   * it is exactly the defect removed from sort-filter-lens today, where a nested
   * <span role="button"> measured 14x14 — 34% of the WCAG 2.2 SC 2.5.8 floor.
   *
   * SO: this renders NO wrapper element and NO button. It provides a single real
   * <button> that carries the accessible name, and stretches it across the
   * nearest positioned ancestor with a pseudo-element. Sibling controls sit above
   * the overlay and keep working.
   *
   *   .ui-selectbody::after { content:''; position:absolute; inset:0 }   <- the hit area
   *   .ui-cardrow > *       { position: relative }                       <- siblings above it
   *
   * Click anywhere selects. The delete button still deletes. One accessible name.
   * No nesting.
   *
   * REQUIRES a positioned ancestor. CardRow is `position: relative` for exactly
   * this reason. Used anywhere else, position the parent yourself.
   *
   * NAMED VARIANT ON PURPOSE. The plain name is not taken and will not be: spell
   * the variant even when it is not strictly necessary. It organises, it cues the
   * reader before they open the file, `rg 'SelectWrapper--'` is the whole query,
   * and a distinction that lives only in a maintainer's head is invisible to
   * every tool we own. See SelectWrapper--ClickPrimary for the other case.
   *
   * OPEN (agent leaning, not settled): whether the family is named on what-you-
   * click (this) or on what-the-card-holds. See the decision doc.
   */
  import type { Snippet } from 'svelte';

  type Props = {
    /** The accessible name for the whole row. REQUIRED — it is the only name. */
    label: string;
    onselect?: () => void;
    selected?: boolean;
    disabled?: boolean;
    children?: Snippet;
    [key: string]: unknown;
  };

  let { label, onselect, selected = false, disabled = false, children, ...rest }: Props = $props();

  let el = $state<HTMLButtonElement | undefined>();

  // ENFORCE, do not merely document. A convention that lives only in a context-v
  // file gets violated by the fourth engineer who never reads it.
  $effect(() => {
    const host = el?.parentElement;
    if (!host) return;
    const nested = host.querySelectorAll('button, a[href], input, select, textarea, [tabindex]');
    // Our own button is one of them; anything beyond it sits under the overlay.
    const others = Array.from(nested).filter((n) => n !== el && !el?.contains(n));
    const unpositioned = others.filter(
      (n) => getComputedStyle(n as HTMLElement).position === 'static',
    );
    if (unpositioned.length) {
      console.error(
        `[@augment-it/shared-ui] <SelectWrapper--ClickBody> ${unpositioned.length} sibling control(s) ` +
          `are position:static and sit UNDER the click overlay — they are unclickable. ` +
          `Give them position:relative, or use <SelectWrapper--ClickPrimary>.`,
        unpositioned,
      );
    }
  });
</script>

<button
  bind:this={el}
  type="button"
  class="ui-selectbody"
  aria-pressed={selected}
  {disabled}
  onclick={onselect}
  aria-label={label}
  {...rest}
>
  {@render children?.()}
</button>

<style>
  .ui-selectbody {
    /* A real control, visually inert — the CardRow paints the surface. */
    display: contents;
    font: inherit;
    color: inherit;
    background: none;
    border: 0;
    padding: 0;
    text-align: inherit;
    cursor: pointer;
  }

  /* The hit area. Covers the positioned ancestor (CardRow), sits BELOW siblings
     that carry position:relative. */
  .ui-selectbody::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
  }

  .ui-selectbody:focus-visible::after {
    box-shadow: var(--focus-ring);
  }
  .ui-selectbody:disabled { cursor: not-allowed; }
</style>
