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

  let el = $state<HTMLButtonElement | undefined>();

  // ENFORCE, do not merely document. A convention that lives only in a context-v
  // file gets violated by the fourth engineer who never reads it.
  $effect(() => {
    const host = el?.parentElement;
    if (!host) return;
    const nested = host.querySelectorAll('button, a[href], input, select, textarea, [tabindex]');
    const others = Array.from(nested).filter((n) => n !== el && !el?.contains(n));
    // HIT-TEST, do not infer. An earlier version read `position` on the control
    // itself and was wrong twice over: a control inside a position:relative
    // WRAPPER is genuinely above the overlay and was still flagged, and the only
    // legal member remedy IS that wrapper, because a member cannot set position
    // on a Button without reaching into .ui-btn. Asking the browser what is
    // actually on top is the only check that matches reality.
    const buried = others.filter((n) => {
      const r = (n as HTMLElement).getBoundingClientRect();
      if (!r.width || !r.height) return false;
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return top === el || (!!el && el.contains(top));
    });
    if (buried.length) {
      console.error(
        `[@augment-it/shared-ui] <SelectWrapper--ClickBody> ${buried.length} sibling control(s) ` +
          `are UNDER the click overlay and cannot be clicked — hit-tested, not inferred. ` +
          `Wrap each in a position:relative element, or use <SelectWrapper--ClickPrimary>.`,
        buried,
      );
    }
  });
</script>

<button
  bind:this={el}
  type="button"
  class="ui-selectbody {klass}"
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
    /* `display: contents` was here and it made this button KEYBOARD-DEAD.
       Chromium generates no box for it, so it is not focusable: it reports
       tabIndex=0, keeps its accessible name, works with a mouse, and Tab skips
       it entirely. Two pilots caught it independently — one by enumerating tab
       order, one by measuring a 0x0 target rect. It rendered perfectly and
       looked like it worked, which is the failure shape this whole practice
       exists to catch.
       A real box, visually inert, is what was always intended: the CardRow
       paints the surface, this carries the name and the tab stop, and ::after
       does the stretching. */
    display: inline-flex;
    align-items: baseline;
    gap: var(--space-2xs);
    min-inline-size: 0;        /* a long unbreakable token must not push siblings out */
    flex: 1 1 auto;
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
