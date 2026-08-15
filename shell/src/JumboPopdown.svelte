<script lang="ts">
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
  // First use: the shell's flow-navigation popdown (see
  // context-v/explorations/Augment-It-Has-Outgrown-One-Flow-The-Choose-A-Flow-Front-Door.md)
  // — one "Build Corpora" item that navigates to corporaCurator. Generic
  // on purpose so a second flow-entry is just another item, not a new
  // component.

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

  const HOVER_OPEN_DELAY_MS = 80;

  function toggle(): void {
    open = !open;
  }

  function onMouseEnter(): void {
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      open = true;
    }, HOVER_OPEN_DELAY_MS);
  }

  function onMouseLeave(): void {
    clearTimeout(hoverTimer);
  }

  function pick(id: string): void {
    open = false;
    onSelect(id);
  }

  function onDocPointer(ev: PointerEvent): void {
    if (!open) return;
    if (wrapEl && !wrapEl.contains(ev.target as Node)) open = false;
  }

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

<!-- svelte-ignore a11y_no_static_element_interactions -- hover is a mouse-only
     convenience on top of the trigger button's click handler, which is
     already fully keyboard-accessible on its own. -->
<div
  class="jumbo-popdown"
  bind:this={wrapEl}
  onmouseenter={onMouseEnter}
  onmouseleave={onMouseLeave}
>
  <button
    type="button"
    class="trigger"
    class:open
    aria-haspopup="menu"
    aria-expanded={open}
    onclick={toggle}
  >
    <span class="grid-mark" aria-hidden="true">{triggerIcon}</span>
    <span class="label">{triggerLabel}</span>
    <span class="chev" aria-hidden="true">{open ? '▴' : '▾'}</span>
  </button>

  {#if open}
    <div class="panel" role="menu" aria-label={triggerLabel}>
      {#each items as item (item.id)}
        <button
          type="button"
          class="item"
          role="menuitem"
          onclick={() => pick(item.id)}
        >
          <span class="item-title">{item.title}</span>
          <span class="item-desc">{item.description}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .jumbo-popdown {
    position: relative;
    display: inline-flex;
    align-items: center;
  }
  .trigger {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    background: transparent;
    color: var(--color-text);
    border: 1px solid var(--color-border);
    padding: 4px 10px;
    border-radius: 4px;
    font: inherit;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.12s ease;
  }
  .trigger:hover {
    border-color: var(--color-accent);
    color: var(--color-accent);
  }
  .trigger.open {
    border-color: var(--color-accent);
    color: var(--color-accent);
    background: var(--color-selected-tint);
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
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px;
    min-width: 260px;
    max-width: min(28rem, 90vw);
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    box-shadow: var(--fx-card-shadow);
  }
  .item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
    background: transparent;
    color: var(--color-text);
    border: 0;
    border-radius: 6px;
    padding: 8px 10px;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .item:hover,
  .item:focus-visible {
    background: var(--color-selected-tint);
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
  }

  @media (prefers-reduced-motion: reduce) {
    .trigger,
    .item {
      transition: none;
    }
  }
</style>
