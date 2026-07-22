<script lang="ts">
  // Provider chips from connectors.inventory — short_label + cost tier,
  // needs-env/disabled rendered dark and unclickable (the palette shows
  // what COULD fire, not just what can). 'auto' = let the registry resolve
  // free-tier-first for the intent (search.fire with no provider arg).
  // Borrowed shape: apps/pack-runner's ConnectorPalette/ConnectorChip.

  import type { ConnectorInfo } from './lib/types';

  let {
    connectors,
    selected = $bindable(),
  }: {
    connectors: ConnectorInfo[];
    selected: string | null; // null = auto (registry default)
  } = $props();

  // Search-shaped connectors only — a palette chip must be able to serve
  // search.fire's default intent.
  const searchable = $derived(
    connectors.filter((c) => c.capabilities.some((cap) => cap.startsWith('search.'))),
  );

  function pick(id: string | null) {
    selected = id;
  }
</script>

<div class="saa-palette" role="radiogroup" aria-label="Search provider">
  <button
    type="button"
    class="saa-chip"
    class:active={selected === null}
    onclick={() => pick(null)}
    title="Let the registry pick — free tier first"
  >
    auto
  </button>
  {#each searchable as c (c.id)}
    <button
      type="button"
      class="saa-chip tier-{c.cost_tier}"
      class:active={selected === c.id}
      class:dark={c.status !== 'available'}
      disabled={c.status !== 'available'}
      onclick={() => pick(c.id)}
      title="{c.display_name} · {c.cost_tier}{c.status !== 'available' ? ` · ${c.status}` : ''}"
    >
      {c.short_label}
    </button>
  {/each}
</div>
