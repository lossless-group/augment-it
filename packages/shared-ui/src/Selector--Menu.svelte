<script lang="ts">
  /**
   * Selector--Menu — a list of ACTIONS, with a keyboard that works.
   *
   * The sibling of Selector--Listbox on the what-you-click axis, and the
   * distinction is not cosmetic: a menu has NO SELECTED STATE. Its children are
   * `menuitem`, never `option`, and they carry neither `aria-selected` nor
   * `aria-checked`. Two members in this federation currently ship `role="menu"`
   * with no `menuitem` children at all, which a screen reader announces as a
   * structurally broken widget.
   *
   * If the thing has a selected state, it is a LISTBOX even when it is drawn as
   * a popdown. Use Selector--Listbox.
   *
   * ESCAPE RETURNS FOCUS TO THE TRIGGER. Pass `trigger`. A popup that closes and
   * drops focus to <body> is worse than one that never opened — the user's place
   * in the document is gone and a screen reader starts over. This is asserted in
   * test/selector-menu.test.ts rather than left to good intentions.
   *
   * Keyboard contract, roving tabindex, and the reasoning behind it: see
   * Selector--Listbox's header. Identical, minus the selected state.
   */
  import type { Snippet } from 'svelte';
  import MenuItem from './MenuItem.svelte';

  type Item = {
    id: string;
    label: string;
    danger?: boolean;
    disabled?: boolean;
    hint?: string;
    [key: string]: unknown;
  };

  type Props = {
    items: Item[];
    /** Accessible name. REQUIRED — an unnamed menu is a list of divs. */
    label: string;
    onselect?: (id: string) => void;
    /** Called on Escape. Pair with `trigger` so focus goes somewhere real. */
    onclose?: () => void;
    /** The element that opened this menu. Escape returns focus to it. */
    trigger?: HTMLElement;
    /**
     * Move focus to the active item on mount. ON by default.
     *
     * A popup whose keyboard handler is on the menu, opened with focus still on
     * the trigger, has a widget whose entire keyboard is unreachable. The first
     * two adopters each hand-rolled the same seven-line querySelector to fix it —
     * two independent copies on the first two call sites, which is the same tell
     * that justified building this component at all.
     *
     * Pass `false` only for a menu that is always mounted rather than opened.
     */
    autofocus?: boolean;
    /** Render one item. Defaults to <MenuItem>. */
    item?: Snippet<[Item]>;
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
    items,
    label,
    onselect,
    onclose,
    trigger,
    autofocus = true,
    item,
    wrapOptions = false,
    class: klass = '',
    ...rest
  }: Props = $props();

  const firstEnabled = $derived(items.findIndex((i) => !i.disabled));
  let active = $state<number | null>(null);
  const activeIndex = $derived.by(() => {
    if (active !== null && !items[active]?.disabled) return active;
    return Math.max(firstEnabled, 0);
  });

  // From the event, not `bind:this` — see Selector--Listbox. A binding that was
  // never assigned made an entire keyboard silently do nothing there.
  let box: HTMLElement | undefined;
  let didFocus = false;

  function focusIndex(i: number) {
    active = i;
    box?.querySelectorAll<HTMLElement>('[role="menuitem"]')[i]?.focus();
  }

  function step(from: number, dir: 1 | -1): number {
    const n = items.length;
    for (let k = 1; k <= n; k++) {
      const i = (from + dir * k + n * k) % n;
      if (!items[i]?.disabled) return i;
    }
    return from;
  }

  function edge(dir: 1 | -1): number {
    const order = dir === 1 ? items.map((_, i) => i) : items.map((_, i) => i).reverse();
    return order.find((i) => !items[i].disabled) ?? 0;
  }

  function typeahead(ch: string): number | null {
    const n = items.length;
    const c = ch.toLowerCase();
    for (let k = 1; k <= n; k++) {
      const i = (activeIndex + k) % n;
      const it = items[i];
      if (!it.disabled && it.label.toLowerCase().startsWith(c)) return i;
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
      const it = items[activeIndex];
      if (it && !it.disabled) onselect?.(it.id);
    } else if (k === 'Escape') {
      e.preventDefault();
      // CAPTURE FIRST. `trigger` is a Svelte prop, which is a LIVE GETTER — it is
      // read at the moment of the call, not at the moment of the keypress. Both
      // of the first two adopters did the obvious thing and nulled their anchor
      // inside `onclose`, so reading `trigger` one line later returned undefined
      // and focus went to <body> — the exact defect this component's header says
      // it exists to prevent.
      //
      // The component's own test did not catch it because its fixture trigger is
      // a local const that `onclose` cannot touch. The test and the realistic
      // call site disagreed, and the test won. There is now a test whose onclose
      // clears the trigger.
      const returnTo = trigger;
      // Claim the one-shot BEFORE releasing focus. A member can close the menu
      // before the attachment has run even once — the attachment then fires
      // afterwards, sees `didFocus === false`, and pulls focus back out of the
      // trigger a tick later. The guard has to mean "focus has been placed",
      // not "the attachment has run".
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
  role="menu"
  aria-label={label}
  class="ui-menu {klass}"
  data-wrap={wrapOptions || undefined}
  {onkeydown}
  {@attach (node) => {
    box = node as HTMLElement;
    // ONE-SHOT. An attachment re-runs on every update, and an unguarded focus()
    // here stole focus BACK from the trigger a tick after Escape had correctly
    // returned it — so the component defeated its own headline promise on the
    // update, not on the keypress. Found because the fix for the live-getter bug
    // made this one visible.
    if (!autofocus || didFocus) return;
    didFocus = true;
    node.querySelector<HTMLElement>('[role="menuitem"][tabindex="0"]')?.focus();
  }}
  {...rest}
>
  {#each items as it, i (it.id)}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- The keyboard handler is on the MENU. One tab stop, arrows within it —
         a keydown per item would give the widget N tab stops, which is the
         defect this replaces. -->
    <div
      role="menuitem"
      aria-disabled={it.disabled || undefined}
      data-danger={it.danger || undefined}
      tabindex={i === activeIndex && !it.disabled ? 0 : -1}
      class="ui-menu__row"
      onclick={() => !it.disabled && onselect?.(it.id)}
    >
      {#if item}{@render item(it)}{:else}
        <MenuItem label={it.label} danger={it.danger} disabled={it.disabled} hint={it.hint} />
      {/if}
    </div>
  {/each}
</div>

<style>
  .ui-menu {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }
  /* Truncate by default so swapping a Button row for an option is not a silent
     layout change — see `wrapOptions`. */
  .ui-menu:not([data-wrap]) .ui-menu__row {
    white-space: nowrap;
    overflow: hidden;
  }
  .ui-menu:not([data-wrap]) .ui-menu__row > :global(*) {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ui-menu__row {
    display: flex;
    align-items: center;
    min-block-size: var(--control-h-md);
    padding: var(--space-2xs) var(--space-md);
    border-radius: var(--radius-md);
    color: var(--color-text);
    cursor: pointer;
  }
  .ui-menu__row:hover:not([aria-disabled]) {
    background: color-mix(in srgb, var(--color-text) 10%, transparent);
  }
  .ui-menu__row[aria-disabled] { cursor: not-allowed; }
  .ui-menu__row:focus-visible {
    box-shadow: var(--focus-ring);
    outline: none;
  }
</style>
