<script lang="ts">
  import Button from '@augment-it/shared-ui/Button.svelte';
  import SelectorMenu from '@augment-it/shared-ui/Selector--Menu.svelte';
  // JumboPopdown — a large, content-rich header dropdown. Svelte port of
  // the Lossless "jumbo popdown" convention
  // (astro-knots/context-v/blueprints/Jumbotron-Popdown-Patterns.md;
  // reference impl astro-knots/sites/fullstack-vc's JumboPopdown__*.astro).
  // Pattern port, not a shared dependency — augment-it's shell is Svelte,
  // not Astro Knots, per the "no shared dependency across ai-labs apps"
  // convention.
  //
  // Interaction contract (matches the blueprint): hover-open (short delay)
  // + click-toggle (touch-friendly), Esc closes, click-outside closes,
  // role="menu"/"menuitem" for AT navigation. Unlike WorkspaceSwitcher's
  // compact single-column listbox, each item here carries a title AND a
  // description — the "content-rich" half of "jumbo."
  //
  // THE KEYBOARD IS NOT THIS FILE'S ANY MORE. It shipped `role="menu"` over
  // real `role="menuitem"` buttons — the triad was right — and delivered none
  // of what the role PROMISES: no keydown handler anywhere on the panel, so
  // arrows/Home/End/typeahead moved nothing; N tab stops instead of one; and a
  // document-level Escape that closed the panel and dropped focus to <body>,
  // because the focused button was unmounted with it. `Selector--Menu` owns all
  // of that now. This file owns the trigger, the hover/click open contract, the
  // popup surface, and what one row LOOKS like.
  //
  // MENU, NOT LISTBOX: every item is an ACTION (navigate to a flow, open the
  // design system, copy diagnostics). Nothing here has a selected state. The
  // sibling WorkspaceSwitcher picks a current workspace and is therefore a
  // listbox even though it is drawn as the same popdown.
  //
  // First use: the shell's flow-navigation popdown (see
  // context-v/explorations/Augment-It-Has-Outgrown-One-Flow-The-Choose-A-Flow-Front-Door.md)
  // — one "Build Corpora" item that navigates to corporaCurator. Generic
  // on purpose so a second flow-entry is just another item, not a new
  // component. The Developers menu is the second caller; it declares no role of
  // its own and inherits this keyboard wholesale.

  export type PopdownItem = {
    id: string;
    title: string;
    description: string;
  };

  let {
    triggerLabel,
    items,
    onSelect,
    // Defaults to the grid mark the flow-navigation popdown has always used, so
    // adding this prop changed nothing for the first caller. A second caller
    // (the Developers menu) wants its own glyph rather than a tiling icon.
    triggerIcon = '▥',
  }: {
    triggerLabel: string;
    items: PopdownItem[];
    onSelect: (id: string) => void;
    triggerIcon?: string;
  } = $props();

  let open = $state(false);
  let wrapEl = $state<HTMLDivElement | undefined>(undefined);
  let hoverTimer: ReturnType<typeof setTimeout> | undefined;

  // The real trigger node, handed over by Button's `ref`. Escape must return
  // focus HERE and not to <body>. Read straight from the component rather than
  // querySelector-ed back out of the wrapper — the two members who migrated
  // before `ref` existed had to do that, and it is the thing `ref` was added
  // for. NEVER cleared: `trigger` is a Svelte prop, i.e. a live getter the
  // Selector reads one line AFTER calling `onclose`, so nulling it on close
  // reinstates the exact <body> defect this file just removed.
  let triggerEl = $state<HTMLElement | undefined>(undefined);

  // `Selector--Menu` moves focus into the widget on mount, which is what makes
  // its keyboard reachable at all — a popup opened with focus still on the
  // trigger has a keydown handler nobody can reach. But this popdown also opens
  // on HOVER, and a mouse passing over the header must not yank focus out of
  // whatever the operator is typing in. So autofocus tracks HOW it opened:
  // pointer/keyboard activation of the trigger focuses the first row, hover
  // does not.
  let openedByHover = $state(false);

  const HOVER_OPEN_DELAY_MS = 80;

  // Selector--Menu's row shape. `label` is its field name, so the popdown's
  // `title` becomes the label and the description is looked back up by id in
  // the snippet below. THE LOOKUP IS NOT A STYLE CHOICE: `item` is typed
  // `Snippet<[Item]>` where `Item` is the component's own row type, so a
  // snippet declaring a WIDER parameter is contravariantly unassignable and
  // svelte-check rejects it. Both members who adopted a Selector before this
  // one landed on the identical workaround. Raised as a finding, not fought.
  const rows: { id: string; label: string }[] = $derived(
    items.map((it) => ({ id: it.id, label: it.title })),
  );

  function toggle(): void {
    openedByHover = false;
    open = !open;
  }

  function onMouseEnter(): void {
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      if (open) return;
      openedByHover = true;
      open = true;
    }, HOVER_OPEN_DELAY_MS);
  }

  function onMouseLeave(): void {
    clearTimeout(hoverTimer);
  }

  function pick(id: string): void {
    open = false;
    // The row that was focused unmounts with the panel. Hand focus back before
    // the caller runs, so a caller that moves focus deliberately still wins.
    triggerEl?.focus();
    onSelect(id);
  }

  function onDocPointer(ev: PointerEvent): void {
    if (!open) return;
    if (wrapEl && !wrapEl.contains(ev.target as Node)) open = false;
  }

  // Kept, and it is not redundant with the Selector's own Escape: this one
  // covers Escape pressed while focus is still on the TRIGGER — the hover-open
  // case, where nothing inside the menu is focused and the menu's handler
  // therefore never fires. When focus IS inside the menu the Selector handles
  // Escape first (it is deeper in the tree), sets `open` false via `onclose`
  // and restores focus; this then sees `open === false` and does nothing.
  function onKey(ev: KeyboardEvent): void {
    if (ev.key === 'Escape' && open) open = false;
  }

  $effect(() => {
    document.addEventListener('pointerdown', onDocPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDocPointer);
      document.removeEventListener('keydown', onKey);
    };
  });
</script>

<!-- One popdown row. Appearance only: Selector--Menu owns the keyboard, the
     roving tabindex, the hover and the focus ring. Same split as
     ListContainer / CardRow. This is the "jumbo" half — a title stacked over a
     wrapping description, which is why the default MenuItem (one nowrap line
     plus a hint) is not used here. -->
{#snippet jumboRow(it: { id: string; label: string })}
  <span class="item-body">
    <span class="item-title">{it.label}</span>
    <span class="item-desc">{items.find((i) => i.id === it.id)?.description ?? ''}</span>
  </span>
{/snippet}

<!-- svelte-ignore a11y_no_static_element_interactions -- hover is a mouse-only
     convenience on top of the trigger button's click handler, which is
     already fully keyboard-accessible on its own. -->
<div
  class="jumbo-popdown"
  bind:this={wrapEl}
  onmouseenter={onMouseEnter}
  onmouseleave={onMouseLeave}
>
  <Button
    variant={open ? 'secondary' : 'outline'}
    size="sm"
    aria-haspopup="menu"
    aria-expanded={open}
    ref={(el) => (triggerEl = el)}
    onclick={toggle}
  >
    <span class="grid-mark" aria-hidden="true">{triggerIcon}</span>
    <span class="label">{triggerLabel}</span>
    <span class="chev" aria-hidden="true">{open ? '▴' : '▾'}</span>
  </Button>

  {#if open}
    <!-- The panel is the CONTAINER — position, surface, shadow. The widget is
         its one child, and `role="menu"` now sits on the widget rather than on
         a positioned box. Rung 0: a component never positions itself. -->
    <div class="panel">
      <SelectorMenu
        items={rows}
        label={triggerLabel}
        item={jumboRow}
        autofocus={!openedByHover}
        onselect={pick}
        onclose={() => (open = false)}
        trigger={triggerEl}
      />
    </div>
  {/if}
</div>

<style>
  .jumbo-popdown {
    position: relative;
    display: inline-flex;
    align-items: center;
  }
  .grid-mark {
    font-size: 11px;
  }
  .label {
    font-weight: 500;
    letter-spacing: 0.02em;
  }
  .chev {
    color: var(--color-text-muted);
    font-size: 10px;
  }

  /* the "jumbo" panel — content-rich, wider than a listbox row, one card
     per item with a title + description. Grows to a grid once there are
     enough items to warrant one (blueprint: responsive grid, 6-8 max). */
  .panel {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: 200;
    padding: 6px;
    min-width: 260px;
    max-width: min(28rem, 90vw);
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    box-shadow: var(--fx-card-shadow);
  }
  /* The HOLDOUT note that stood here was right, and is now redeemed. It said
     this row is a two-line card whose height is content-driven and left-aligned,
     that the shared control is inline-flex/centred/nowrap/fixed-height, and that
     adopting it would mean overriding eight properties at once — "that is a
     MenuItem organ. Raised, not forced." The organ exists. Selector--Menu's row
     brought the padding, radius, hover, focus ring and cursor, so the whole
     `.item` control recipe is gone; what is left is how THIS member's content
     stacks inside the slot. Rung 0 — nothing here overrides a property the
     component sets, so no `data-deviation`. */
  .item-body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1 1 auto;
    min-inline-size: 0;
    text-align: left;
  }
  .item-title {
    font-weight: 600;
    font-size: 12px;
    color: var(--color-text);
  }
  .item-desc {
    font-size: 11px;
    color: var(--color-text-muted);
    line-height: 1.35;
    white-space: normal;
  }
</style>
