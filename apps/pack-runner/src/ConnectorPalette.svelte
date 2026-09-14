<script lang="ts">
  // Per-record chip row + connector menu popover. One palette per record card
  // in the by-record view; renders one chip per Profile Builder pack, plus
  // a long-press menu showing every connector available for that chip's intent.
  //
  // Inventory is supplied as a prop — the parent loads it once via
  // workspace.invoke('connectors.inventory', {}) and shares across all
  // palettes so N rows don't trigger N inventory fetches.
  //
  // Default click fires the pack via on_fire(pack_id) with NO connector_id
  // (the backend's existing chain-walk picks the head of preferred_connectors).
  // Menu pick fires on_fire(pack_id, connector_id) with explicit override.
  //
  // Spec: context-v/specs/Connector-Inventory-and-Per-Record-Palette.md

  import Chip from '@augment-it/shared-ui/Chip.svelte';
  import SelectorMenu from '@augment-it/shared-ui/Selector--Menu.svelte';
  import ConnectorChip from './ConnectorChip.svelte';
  import type { ChipState } from './ConnectorChip.svelte';

  export type PaletteConnector = {
    id: string;
    display_name: string;
    short_label: string;
    capabilities: string[];
    cost_tier: 'free' | 'free-tier' | 'paid';
    requires_env: string[];
    status: 'available' | 'disabled' | 'rate-limited' | 'auth-failed' | 'needs-env';
  };

  // Pack roster handed in by the parent. Mirrors the shape stored in
  // services/social-search/src/packs.ts (the subset the UI cares about).
  export type PalettePack = {
    pack_id: string;
    display_name: string;
    intent: string;
    short_label: string;
    accent?: string;
    preferred_connectors: string[];
  };

  type Props = {
    row_id: string;
    packs: PalettePack[];
    inventory: PaletteConnector[];
    // Pack-ids the user has already accepted onto this row. Drives the
    // 'accepted' chip state — visible cue that this intent already has
    // ground truth (re-firing is still allowed, additive).
    accepted_pack_ids: Set<string>;
    // Pack-ids currently in flight for THIS row, regardless of which
    // connector they're firing through.
    busy_pack_ids: Set<string>;
    // Map pack_id → number of results currently associated with this row
    // (e.g. found candidate count in response-store). Optional; absent
    // means we don't render the count badge.
    result_counts?: Record<string, number>;
    on_fire: (pack_id: string, connector_id?: string) => void;
  };

  let {
    row_id,
    packs,
    inventory,
    accepted_pack_ids,
    busy_pack_ids,
    result_counts,
    on_fire,
  }: Props = $props();

  // Indexed lookups so chip-state derivation stays O(1).
  const inventoryById = $derived.by(() => {
    const m = new Map<string, PaletteConnector>();
    for (const c of inventory) m.set(c.id, c);
    return m;
  });

  function availableForIntent(intent: string): PaletteConnector[] {
    return inventory.filter((c) => c.capabilities.includes(intent));
  }

  function chainSummary(pack: PalettePack): string {
    const names = pack.preferred_connectors
      .map((id) => inventoryById.get(id)?.short_label ?? id)
      .join(' → ');
    return names || '(empty)';
  }

  // Resolve chip state for a pack. Precedence:
  //   firing > needs_env (entire chain unusable) > found(count) > accepted > idle
  function stateFor(pack: PalettePack): ChipState {
    if (busy_pack_ids.has(pack.pack_id)) return { kind: 'firing' };
    // If every connector in the preferred chain is missing env, the chip
    // is effectively unusable until the user adds a key. Surface as a
    // 'needs_env' chip with the most-prominent missing var.
    const usableInChain = pack.preferred_connectors
      .map((id) => inventoryById.get(id))
      .filter((c): c is PaletteConnector => !!c && c.status === 'available');
    if (usableInChain.length === 0) {
      const missing = new Set<string>();
      for (const id of pack.preferred_connectors) {
        const c = inventoryById.get(id);
        if (c?.status === 'needs-env') c.requires_env.forEach((e) => missing.add(e));
      }
      if (missing.size > 0) return { kind: 'needs_env', missing: [...missing] };
    }
    const count = result_counts?.[pack.pack_id] ?? 0;
    if (count > 0) return { kind: 'found', count };
    if (accepted_pack_ids.has(pack.pack_id)) return { kind: 'accepted' };
    return { kind: 'idle' };
  }

  // Menu state — only one menu open at a time per palette. Stores the
  // pack the menu is open for + the anchor element for positioning.
  let menuFor = $state<string | null>(null);
  let menuAnchor = $state<HTMLElement | null>(null);

  function openMenu(pack_id: string, event: MouseEvent | KeyboardEvent) {
    menuFor = pack_id;
    menuAnchor = (event.currentTarget ?? event.target) as HTMLElement;
  }

  function closeMenu() {
    menuFor = null;
    // `menuAnchor` is deliberately NOT cleared here, and that is not tidiness
    // debt — it is load-bearing. Selector--Menu handles Escape as
    // `onclose?.(); trigger?.focus();`, and `trigger` is a Svelte PROP, i.e. a
    // live getter read at the moment of the call. Nulling the anchor inside
    // `onclose` therefore makes the component read `trigger === undefined` one
    // line later and focus goes to <body> — the exact defect the component's
    // own header promises it prevents. Measured, not guessed: see the finding
    // raised with this migration. The anchor is inert while closed because
    // every reader of it is guarded by `menuFor`, and `openMenu` overwrites it.
  }

  function fireFromMenu(pack_id: string, connector_id: string) {
    closeMenu();
    on_fire(pack_id, connector_id);
  }

  function onWindowClick(event: MouseEvent) {
    if (!menuFor) return;
    // Close if the click is outside the menu.
    const target = event.target as Node | null;
    const menuEl = document.querySelector(`[data-palette-menu="${menuFor}"]`);
    if (target && menuEl && !menuEl.contains(target) && menuAnchor && !menuAnchor.contains(target)) {
      closeMenu();
    }
  }

  $effect(() => {
    if (typeof window !== 'undefined') {
      window.addEventListener('mousedown', onWindowClick);
      return () => window.removeEventListener('mousedown', onWindowClick);
    }
  });

  const menuPack = $derived(menuFor ? packs.find((p) => p.pack_id === menuFor) : null);
  const menuConnectors = $derived(menuPack ? availableForIntent(menuPack.intent) : []);

  // The Selector's item shape. `label` is the connector's DISPLAY NAME on
  // purpose: it is what the widget's typeahead matches, and it is what the user
  // reads. Matching on `id` would make `s` jump to `serpapi` while the row says
  // "SerpApi" — a typeahead keyed to something invisible.
  // A connector that is not `available` is `disabled`, which the Selector turns
  // into `aria-disabled` AND skips when arrowing — the state, not just the dim.
  const menuItems = $derived(
    menuConnectors.map((c) => ({
      id: c.id,
      label: c.display_name,
      disabled: c.status !== 'available',
    })),
  );

  // Focus the widget when the popup opens. Without this the menu's keyboard is
  // unreachable: the Selector's keydown handler lives on the menu, and the user
  // is still standing on the chip. Opening a popup and leaving focus behind is
  // the same defect as Escape dropping focus to <body>, run in reverse.
  $effect(() => {
    if (!menuFor) return;
    document
      .querySelector<HTMLElement>(`[data-palette-menu="${menuFor}"] [role="menuitem"][tabindex="0"]`)
      ?.focus();
  });

  function costGlyph(tier: 'free' | 'free-tier' | 'paid'): string {
    if (tier === 'free') return '🆓';
    if (tier === 'free-tier') return '💰';
    return '💰💰';
  }
</script>

<div class="palette" role="toolbar" aria-label="Connector palette for row {row_id}">
  {#each packs as pack (pack.pack_id)}
    <ConnectorChip
      intent={pack.intent}
      short_label={pack.short_label}
      display_name={pack.display_name}
      accent={pack.accent}
      state={stateFor(pack)}
      chain_summary={chainSummary(pack)}
      onclick={() => on_fire(pack.pack_id)}
      onlongpress={(e) => openMenu(pack.pack_id, e)}
    />
  {/each}
</div>

<!-- One row of the connector menu. The Selector owns the keyboard and paints the
     row (padding, hover, focus ring, cursor); this snippet owns only the
     four-column reading order — glyph / name / cost / status. Same split as
     ListContainer and CardRow, and it is why nothing here needs a rung-4
     override: the grid lives on the member's own element INSIDE the menuitem,
     not on top of one the component drew.

     The status badges are shared-ui <Chip>s, which is where this file DIVERGES
     from its response-reviewer twin (that copy still ships raw
     `.palette-menu-status` spans). The divergence predates this migration, it
     belongs to the Chip sweep rather than the Selector sweep, and it is raised
     rather than chased. -->
{#snippet connectorRow(it: { id: string; label: string; disabled?: boolean })}
  {@const c = inventoryById.get(it.id)}
  {#if c}
    <span
      class="palette-menu-item"
      data-disabled={it.disabled || undefined}
      title={it.disabled
        ? `${c.status}${c.requires_env.length ? `: ${c.requires_env.join(', ')}` : ''}`
        : `Fire through ${c.display_name}`}
    >
      <span class="palette-menu-glyph">{c.short_label}</span>
      <span class="palette-menu-name">{c.display_name}</span>
      <span class="palette-menu-cost" title="Cost tier: {c.cost_tier}">{costGlyph(c.cost_tier)}</span>
      {#if c.status === 'needs-env'}
        <Chip size="sm" tone="warn" title="Missing: {c.requires_env.join(', ')}">needs env</Chip>
      {:else if c.status === 'disabled'}
        <Chip size="sm">disabled</Chip>
      {:else if c.status === 'rate-limited'}
        <Chip size="sm" tone="warn">rate-limited</Chip>
      {:else if c.status === 'auth-failed'}
        <Chip size="sm" tone="error">auth failed</Chip>
      {/if}
    </span>
  {/if}
{/snippet}

{#if menuPack && menuConnectors.length > 0}
  <div class="palette-menu" data-palette-menu={menuPack.pack_id}>
    <div class="palette-menu-header">
      <strong>{menuPack.display_name}</strong>
      <span class="palette-menu-intent">{menuPack.intent}</span>
    </div>
    <!-- `role="menu"` used to live on the wrapper above, over a header div, a
         <ul> and a footer div — a container role whose children were not
         menuitems at all, which a screen reader announces as structurally
         broken. It now sits on the Selector, over real menuitems, and the
         header/footer stay outside the widget where they belong: they are
         labels, not actions. -->
    <SelectorMenu
      items={menuItems}
      label="Connector menu for {menuPack.display_name}"
      onselect={(id) => fireFromMenu(menuPack.pack_id, id)}
      onclose={closeMenu}
      trigger={menuAnchor ?? undefined}
      item={connectorRow}
    />
    <div class="palette-menu-footer">
      Default click walks the chain · Pick one to override
    </div>
  </div>
{/if}

<style>
  .palette {
    display: inline-flex;
    gap: 0.35rem;
    flex-wrap: wrap;
    align-items: center;
    padding: 0.25rem 0;
  }
  .palette-menu {
    position: absolute;
    z-index: 50;
    min-width: 240px;
    margin-top: 0.4rem;
    padding: 0.45rem;
    background: var(--color-bg, #fff);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    box-shadow: var(--fx-popover-shadow);
    font-size: 0.85rem;
  }
  .palette-menu-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 0.15rem 0.35rem 0.45rem;
    border-bottom: 1px solid var(--color-border);
    margin-bottom: 0.35rem;
  }
  .palette-menu-intent {
    font-family: ui-monospace, monospace;
    font-size: 0.7rem;
    color: var(--color-text-muted);
  }
  /* The HOLDOUT note that stood here since 2026-09-13 was right and is now
     redeemed: it said this row is the `Selector` organ of decision-doc D4, not
     CardRow, and that adopting CardRow would cost background + border +
     border-radius + padding on the first try. The Selector organ exists, and
     this is what is left after adopting it. Selector--Menu brought the list box
     (column flex), the row (padding, min-height, radius, hover, focus ring,
     cursor, not-allowed) and every keyboard behaviour, so `.palette-menu-list`
     is gone entirely and this rule keeps only what is genuinely THIS member's:
     the four-column reading order of a connector row. Nothing here overrides a
     property the component sets — no rung-4, no `data-deviation`. */
  .palette-menu-item {
    display: grid;
    grid-template-columns: 1.75rem 1fr auto auto;
    gap: 0.5rem;
    align-items: center;
    width: 100%;
    text-align: left;
  }
  /* `aria-disabled` on the menuitem carries the STATE; this carries the look.
     Before the refactor the look was all there was. */
  .palette-menu-item[data-disabled] {
    opacity: 0.5;
  }
  .palette-menu-glyph {
    font-family: ui-monospace, monospace;
    font-weight: 700;
    text-align: center;
    color: var(--color-text);
  }
  .palette-menu-name { color: var(--color-text); }
  .palette-menu-cost { font-size: 0.85rem; }
  .palette-menu-footer {
    margin-top: 0.45rem;
    padding-top: 0.35rem;
    border-top: 1px solid var(--color-border);
    font-size: 0.7rem;
    color: var(--color-text-muted);
    text-align: center;
  }
</style>
