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
    /** Render one item. Defaults to <MenuItem>. */
    item?: Snippet<[Item]>;
    class?: string;
    [key: string]: unknown;
  };

  let { items, label, onselect, onclose, trigger, item, class: klass = '', ...rest }: Props =
    $props();

  const firstEnabled = $derived(items.findIndex((i) => !i.disabled));
  let active = $state<number | null>(null);
  const activeIndex = $derived.by(() => {
    if (active !== null && !items[active]?.disabled) return active;
    return Math.max(firstEnabled, 0);
  });

  // From the event, not `bind:this` — see Selector--Listbox. A binding that was
  // never assigned made an entire keyboard silently do nothing there.
  let box: HTMLElement | undefined;

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
      onclose?.();
      // Focus first, then let the member unmount. Returning focus AFTER the menu
      // is gone is what drops it to <body>.
      trigger?.focus();
    } else if (k.length === 1 && /\S/.test(k) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const i = typeahead(k);
      if (i !== null) {
        e.preventDefault();
        focusIndex(i);
      }
    }
  }
</script>

<div role="menu" aria-label={label} class="ui-menu {klass}" {onkeydown} {...rest}>
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
