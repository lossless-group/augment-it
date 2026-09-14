<script lang="ts">
  /**
   * Selector--Listbox — choose one of a set, with a keyboard that actually works.
   *
   * WHY THIS EXISTS, counted: nine surfaces across seven members of this
   * federation declare `role="listbox"`, `role="menu"` or `role="radiogroup"`,
   * and NOT ONE implements arrow-key navigation. Two declare `role="menu"` with
   * no `menuitem` children; one declares `role="radiogroup"` containing no
   * radios. Each of those roles is a promise to a screen-reader user — *this is a
   * widget you navigate with arrows, and Tab takes you out of it* — and all nine
   * deliver a plain list of tab stops instead.
   *
   * Seven members got it wrong independently. That is the tell: the
   * roving-tabindex contract IS the substance of this organ, and nobody should be
   * hand-rolling it seven times.
   *
   * THIS IS THE FIRST COMPONENT HERE WITH REAL TESTS, and the tests were written
   * BEFORE it. Button, Chip and CardRow are appearance with a little behaviour,
   * so a probe screenshot catches their defects. This is behaviour with a little
   * appearance — a defect here looks like NOTHING HAPPENING, which no screenshot
   * shows. See test/selector.test.ts; each case is one line of the WAI-ARIA
   * authoring practices for composite widgets.
   *
   * ROVING TABINDEX, which is the whole point. The active option is tabindex="0"
   * and every other option is tabindex="-1", so the widget is ONE tab stop. Tab
   * enters it and Tab leaves it; arrows move within it. A list of N tab stops —
   * which is what all nine ship — is the thing this replaces.
   *
   * WRAPPING IS A DECISION, MADE ONCE. Arrowing past the end returns to the
   * start. Picked because every member that hand-rolled anything here wrapped,
   * and because the alternative silently strands a keyboard user at a boundary
   * with no feedback.
   *
   * NOT A MENU. A menu is a list of ACTIONS and takes `menuitem` with no selected
   * state; this is a list of CHOICES and takes `aria-selected`. They are
   * different organs on purpose — see Selector--Menu. And there is no
   * Selector--Radio, because the federation currently contains zero radios and
   * shipping ahead of consumers is how the federal layer got a spacing scale with
   * no adopters.
   */
  import type { Snippet } from 'svelte';

  type Option = {
    id: string;
    label: string;
    disabled?: boolean;
    [key: string]: unknown;
  };

  type Props = {
    options: Option[];
    /** Accessible name for the widget. REQUIRED — an unnamed listbox is a list. */
    label: string;
    /** The selected option's id. */
    value?: string;
    onselect?: (id: string) => void;
    /**
     * `vertical` (default) or `horizontal`.
     *
     * The handler already treated ArrowLeft/Right as equivalent to Up/Down, so
     * the component was half-aware of horizontal and then refused to DRAW it.
     * One adopter spent this rollout's only rung-4 escape on
     * `style="flex-direction: row"` plus a hand-written `aria-orientation`,
     * which per the loop means the API was wrong. It sets both.
     */
    orientation?: 'vertical' | 'horizontal';
    /**
     * Move focus to the active option on mount. OFF by default here, unlike
     * Selector--Menu — a listbox is often always-present rather than opened, and
     * stealing focus on mount would be wrong. Pass `true` for a popdown.
     */
    autofocus?: boolean;
    /** Called on Escape. Pair with `trigger`. */
    onclose?: () => void;
    /** The element that opened this listbox. Escape returns focus to it. */
    trigger?: HTMLElement;
    /** Render one option. Receives the option; defaults to its label. */
    option?: Snippet<[Option]>;
    /**
     * Let an option's text wrap onto more than one line. OFF by default.
     *
     * The default is NOT a style preference — it is swap-compatibility. `Button`
     * declares `white-space: nowrap` AND a fixed height; this option declares
     * neither, only a `min-block-size`. So a member replacing Button rows with
     * options silently converted a CLIP into a WRAP: one real row measured 48px
     * against its neighbours' 29px, with its label squeezed to the min-content of
     * its first word.
     *
     * jsdom cannot see it — there is no layout — so it survived every test and
     * was caught by a browser drive on the federation host. It is latent in every
     * member that made the same swap.
     */
    wrapOptions?: boolean;
    class?: string;
    [key: string]: unknown;
  };

  let {
    options,
    label,
    value,
    onselect,
    orientation = 'vertical',
    autofocus = false,
    onclose,
    trigger,
    option,
    wrapOptions = false,
    class: klass = '',
    ...rest
  }: Props = $props();

  // The active index is the roving tab stop. It follows `value` when there is
  // one, and otherwise rests on the first option a keyboard user could reach —
  // never on a disabled one, which would spend the widget's single tab stop on
  // something that cannot be activated.
  const firstEnabled = $derived(options.findIndex((o) => !o.disabled));
  let active = $state<number | null>(null);
  const activeIndex = $derived.by(() => {
    if (active !== null && !options[active]?.disabled) return active;
    const fromValue = options.findIndex((o) => o.id === value && !o.disabled);
    return fromValue >= 0 ? fromValue : Math.max(firstEnabled, 0);
  });

  // The container comes from the EVENT, not from `bind:this`. The handler is on
  // the listbox, so `currentTarget` is always it — no binding to go stale, and
  // nothing to be undefined on the first keypress.
  let box: HTMLElement | undefined;
  let didFocus = false;

  function focusIndex(i: number) {
    active = i;
    // SYNCHRONOUS, deliberately. Focus follows the active option — that is what
    // makes arrows feel like navigation rather than a highlight the screen reader
    // never hears about — and it must land in the same task as the keypress. A
    // deferred focus() is a frame of limbo where the widget has an active option
    // nothing is focused on, and assistive tech reads the gap.
    // The options are already in the DOM; only the tabindex ATTRIBUTE waits for
    // Svelte's next flush, and that is fine because focus does not depend on it.
    box?.querySelectorAll<HTMLElement>('[role="option"]')[i]?.focus();
  }

  /** Next enabled index in `dir`, wrapping. Returns `from` if none exists. */
  function step(from: number, dir: 1 | -1): number {
    const n = options.length;
    for (let k = 1; k <= n; k++) {
      const i = (from + dir * k + n * k) % n;
      if (!options[i]?.disabled) return i;
    }
    return from;
  }

  function edge(dir: 1 | -1): number {
    const order = dir === 1 ? options.map((_, i) => i) : options.map((_, i) => i).reverse();
    return order.find((i) => !options[i].disabled) ?? 0;
  }

  // Typeahead. A printable character moves to the next option starting with it,
  // searching from AFTER the active one so repeated presses cycle synonyms.
  function typeahead(ch: string): number | null {
    const n = options.length;
    const c = ch.toLowerCase();
    for (let k = 1; k <= n; k++) {
      const i = (activeIndex + k) % n;
      const o = options[i];
      if (!o.disabled && o.label.toLowerCase().startsWith(c)) return i;
    }
    return null;
  }

  function onkeydown(e: KeyboardEvent) {
    box = e.currentTarget as HTMLElement;
    const k = e.key;
    if (k === 'ArrowDown' || k === 'ArrowRight') {
      e.preventDefault();
      focusIndex(step(activeIndex, 1));
    } else if (k === 'ArrowUp' || k === 'ArrowLeft') {
      e.preventDefault();
      focusIndex(step(activeIndex, -1));
    } else if (k === 'Home') {
      e.preventDefault();
      focusIndex(edge(1));
    } else if (k === 'End') {
      e.preventDefault();
      focusIndex(edge(-1));
    } else if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      const o = options[activeIndex];
      if (o && !o.disabled) onselect?.(o.id);
    } else if (k === 'Escape') {
      e.preventDefault();
      // Capture before onclose, and claim the one-shot before releasing focus.
      // Both of those are scars from Selector--Menu — see its header. `trigger`
      // is a live getter that a member's onclose usually clears, and an
      // attachment that has not yet run will steal focus back a tick later.
      const returnTo = trigger;
      didFocus = true;
      onclose?.();
      returnTo?.focus();
    } else if (k.length === 1 && /\S/.test(k) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const i = typeahead(k);
      if (i !== null) {
        e.preventDefault();
        focusIndex(i);
      }
    }
  }
</script>

<div
  role="listbox"
  aria-label={label}
  aria-orientation={orientation}
  data-orientation={orientation}
  class="ui-listbox {klass}"
  data-wrap={wrapOptions || undefined}
  {onkeydown}
  {@attach (node) => {
    box = node as HTMLElement;
    if (!autofocus || didFocus) return;
    didFocus = true;
    node.querySelector<HTMLElement>('[role="option"][tabindex="0"]')?.focus();
  }}
  {...rest}
>
  {#each options as o, i (o.id)}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- The keyboard handler is on the LISTBOX, not here, because that is what a
         composite widget is: one tab stop, arrows moving within it. Putting a
         keydown on each option would give the widget N tab stops, which is
         exactly the defect this component replaces in nine surfaces. -->
    <div
      role="option"
      aria-selected={o.id === value}
      aria-disabled={o.disabled || undefined}
      tabindex={i === activeIndex && !o.disabled ? 0 : -1}
      data-active={i === activeIndex || undefined}
      class="ui-listbox__option"
      onclick={() => !o.disabled && onselect?.(o.id)}
    >
      {#if option}{@render option(o)}{:else}{o.label}{/if}
    </div>
  {/each}
</div>

<style>
  .ui-listbox {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }
  .ui-listbox[data-orientation='horizontal'] {
    flex-direction: row;
    flex-wrap: wrap;
    gap: var(--space-2xs);
  }

  /* Truncate by default so swapping a Button row for an option is not a silent
     layout change — see `wrapOptions`. */
  .ui-listbox:not([data-wrap]) .ui-listbox__option {
    white-space: nowrap;
    overflow: hidden;
  }
  .ui-listbox:not([data-wrap]) .ui-listbox__option > :global(*) {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ui-listbox__option {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    min-block-size: var(--control-h-md);
    padding: var(--space-2xs) var(--space-md);
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    color: var(--color-text);
    font-family: var(--font-sans);
    font-size: var(--text-body);
    cursor: pointer;
  }

  .ui-listbox__option:hover:not([aria-disabled]) {
    background: color-mix(in srgb, var(--color-text) 10%, transparent);
  }

  .ui-listbox__option[aria-selected='true'] {
    background: var(--color-accent-bg);
    border-color: var(--color-accent-fg);
    color: var(--color-accent-fg);
  }

  .ui-listbox__option[aria-disabled] {
    color: var(--color-text-muted);
    cursor: not-allowed;
  }

  .ui-listbox__option:focus-visible {
    box-shadow: var(--focus-ring);
    outline: none;
  }
</style>
