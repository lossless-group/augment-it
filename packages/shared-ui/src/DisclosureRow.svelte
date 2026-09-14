<script lang="ts">
  /**
   * DisclosureRow — a row that expands. Eight members hand-roll this.
   *
   * NOT A SELECTION, AND NOT A CARDROW. A disclosure toggles a region; it does
   * not choose anything. Both `SelectWrapper` variants hard-render
   * `aria-pressed`, which is the toggle-BUTTON contract, so adopting one here
   * announces the wrong thing — the same class of error as the nine surfaces
   * declaring `role="menu"` with no arrow keys. And a group header is not a row:
   * wrapping one in `CardRow` negates its border, radius, background and padding,
   * which is four of the five properties CardRow contributes.
   *
   * THE THREE THINGS EVERY HAND-ROLL GETS WRONG, and none of them is visible:
   *
   *  1. `aria-expanded` tracking the INTENT rather than the state. If the panel
   *     renders conditionally and the attribute is set from a separate variable,
   *     they drift and a screen reader is told the opposite of what is on screen.
   *     Here one `$state` drives both — they cannot disagree.
   *  2. `aria-controls` pointing at an id that does not exist when collapsed.
   *     A test asserts the target is really in the document.
   *  3. Enter/Space not toggling, because someone used a `<div onclick>`. This
   *     renders a real `<button>`, so the browser handles both for free.
   *
   * TARGET SIZE. One member's archive disclosure measured 27px and cleared the
   * 24px floor only because its `0.3rem` padding happened to add up. That is luck,
   * not a contract. `--control-h-md` is the contract.
   *
   * COMPOSING WITH CardRow IS FINE, and is the answer for "a card row that
   * discloses" — two members have one. Put the DisclosureRow INSIDE the CardRow;
   * the card owns the surface, the disclosure owns the control. What is NOT fine
   * is a SelectWrapper on the same element, because those hard-render
   * `aria-pressed` and a control announcing both `aria-pressed` and
   * `aria-expanded` claims two contradictory contracts at once. Both members were
   * doing exactly that.
   */
  import type { Snippet } from 'svelte';

  type Props = {
    label: string;
    /** Controlled open state. Omit to let the component own it. */
    open?: boolean;
    ontoggle?: (open: boolean) => void;
    disabled?: boolean;
    /** Right-aligned meta — a count, a timestamp. */
    hint?: string;
    /** The region this discloses. */
    children?: Snippet;
    /** Replace the row's own label rendering. */
    row?: Snippet;
    /** Attributes for the WRAPPER rather than the button — layout hooks, data-*. */
    wrapperProps?: Record<string, unknown>;
    class?: string;
    [key: string]: unknown;
  };

  let {
    label,
    open: openProp,
    ontoggle,
    disabled = false,
    hint,
    children,
    row,
    wrapperProps = {},
    class: klass = '',
    ...rest
  }: Props = $props();

  // ONE source of truth for both the attribute and the render. See note 1.
  //
  // `internal` starts false rather than `openProp ?? false`: that initializer
  // captures only the FIRST value of a prop, which Svelte warns about and which
  // would quietly desync a controlled row whose parent changed `open` later.
  // When `open` is passed the component is controlled and `internal` is unused;
  // when it is not, this is the state.
  let internal = $state(false);
  const isOpen = $derived(openProp ?? internal);

  // Stable per instance, so aria-controls always names this row's own panel.
  const panelId = `ui-disclosure-${Math.random().toString(36).slice(2, 10)}`;

  function toggle() {
    if (disabled) return;
    const next = !isOpen;
    internal = next;
    ontoggle?.(next);
  }
</script>

<!-- `{...rest}` lands on the BUTTON, not this wrapper. It used to land here, which
     meant any aria-* a member passed silently missed the control it was meant to
     describe — the attribute existed, on the wrong element, and nothing warned.
     Layout hooks go through `wrapperProps`. -->
<div class="ui-disclosure {klass}" {...wrapperProps}>
  <button
    type="button"
    class="ui-disclosure__row"
    {...rest}
    aria-expanded={isOpen}
    aria-controls={isOpen ? panelId : undefined}
    {disabled}
    onclick={toggle}
  >
    <span class="ui-disclosure__chevron" data-chevron aria-hidden="true" data-open={isOpen || undefined}>
      <svg viewBox="0 0 16 16" focusable="false">
        <path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.75"
              stroke-linecap="round" stroke-linejoin="round" fill="none" />
      </svg>
    </span>
    <span class="ui-disclosure__label">{#if row}{@render row()}{:else}{label}{/if}</span>
    {#if hint}<span class="ui-disclosure__hint">{hint}</span>{/if}
  </button>

  {#if isOpen}
    <div id={panelId} data-disclosure-panel class="ui-disclosure__panel">
      {@render children?.()}
    </div>
  {/if}
</div>

<style>
  .ui-disclosure { display: flex; flex-direction: column; min-inline-size: 0; }

  .ui-disclosure__row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    inline-size: 100%;
    /* Not luck. See the header — one member cleared the floor by accident. */
    min-block-size: var(--control-h-md);
    padding: var(--space-2xs) var(--space-md);
    border: 0;
    border-radius: var(--radius-md);
    background: none;
    color: var(--color-text);
    font: inherit;
    font-family: var(--font-sans);
    font-size: var(--text-body);
    text-align: start;
    cursor: pointer;
  }
  .ui-disclosure__row:hover:not(:disabled) {
    background: color-mix(in srgb, var(--color-text) 10%, transparent);
  }
  .ui-disclosure__row:focus-visible { box-shadow: var(--focus-ring); outline: none; }
  .ui-disclosure__row:disabled { cursor: not-allowed; color: var(--color-text-muted); }

  .ui-disclosure__chevron { display: inline-flex; flex: 0 0 auto; transition: transform 120ms ease; }
  .ui-disclosure__chevron[data-open] { transform: rotate(90deg); }
  @media (prefers-reduced-motion: reduce) {
    .ui-disclosure__chevron { transition: none; }
  }
  .ui-disclosure__chevron svg { inline-size: var(--icon-sm); block-size: var(--icon-sm); }

  .ui-disclosure__label { flex: 1 1 auto; min-inline-size: 0; }
  .ui-disclosure__hint { flex: 0 0 auto; color: var(--color-text-muted); font-size: var(--text-label); }

  .ui-disclosure__panel { min-inline-size: 0; }
</style>
