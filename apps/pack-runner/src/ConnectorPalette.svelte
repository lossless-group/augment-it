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
    menuAnchor = null;
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

{#if menuPack && menuConnectors.length > 0}
  <div class="palette-menu" data-palette-menu={menuPack.pack_id} role="menu" aria-label="Connector menu for {menuPack.display_name}">
    <div class="palette-menu-header">
      <strong>{menuPack.display_name}</strong>
      <span class="palette-menu-intent">{menuPack.intent}</span>
    </div>
    <ul class="palette-menu-list">
      {#each menuConnectors as c (c.id)}
        {@const disabled = c.status !== 'available'}
        <li>
          <button
            class="palette-menu-item"
            class:disabled
            disabled={disabled}
            onclick={() => fireFromMenu(menuPack.pack_id, c.id)}
            title={disabled ? `${c.status}${c.requires_env.length ? `: ${c.requires_env.join(', ')}` : ''}` : `Fire through ${c.display_name}`}
          >
            <span class="palette-menu-glyph">{c.short_label}</span>
            <span class="palette-menu-name">{c.display_name}</span>
            <span class="palette-menu-cost" title="Cost tier: {c.cost_tier}">{costGlyph(c.cost_tier)}</span>
            {#if c.status === 'needs-env'}
              <span class="palette-menu-status" title="Missing: {c.requires_env.join(', ')}">needs env</span>
            {:else if c.status === 'disabled'}
              <span class="palette-menu-status">disabled</span>
            {:else if c.status === 'rate-limited'}
              <span class="palette-menu-status">rate-limited</span>
            {:else if c.status === 'auth-failed'}
              <span class="palette-menu-status">auth failed</span>
            {/if}
          </button>
        </li>
      {/each}
    </ul>
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
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.18);
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
  .palette-menu-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  .palette-menu-item {
    display: grid;
    grid-template-columns: 1.75rem 1fr auto auto;
    gap: 0.5rem;
    align-items: center;
    width: 100%;
    padding: 0.35rem 0.4rem;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    text-align: left;
    cursor: pointer;
  }
  .palette-menu-item:hover:not(:disabled) {
    background: var(--color-surface, rgba(0, 0, 0, 0.04));
    border-color: var(--color-border);
  }
  .palette-menu-item.disabled,
  .palette-menu-item:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .palette-menu-glyph {
    font-family: ui-monospace, monospace;
    font-weight: 700;
    text-align: center;
    color: var(--color-text);
  }
  .palette-menu-name { color: var(--color-text); }
  .palette-menu-cost { font-size: 0.85rem; }
  .palette-menu-status {
    font-size: 0.7rem;
    color: var(--color-text-muted);
    background: var(--color-border);
    padding: 1px 6px;
    border-radius: 3px;
  }
  .palette-menu-footer {
    margin-top: 0.45rem;
    padding-top: 0.35rem;
    border-top: 1px solid var(--color-border);
    font-size: 0.7rem;
    color: var(--color-text-muted);
    text-align: center;
  }
</style>
