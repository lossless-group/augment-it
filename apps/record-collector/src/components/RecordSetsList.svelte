<script lang="ts">
  // The list of record sets, sorted most-recent first. Each item renders
  // through RecordSetCard. Parent owns the data + handlers; this
  // component is a sorted + presentational shell.

  import type { RecordSet } from '@augment-it/workspace';
  import RecordSetCard from './RecordSetCard.svelte';

  type Props = {
    recordSets: RecordSet[];
    selectedId: string | null;
    onselect: (id: string) => void;
    ondelete: (rs: RecordSet) => void;
    onrefresh: () => void;
  };
  let { recordSets, selectedId, onselect, ondelete, onrefresh }: Props = $props();

  // Sort descending by created_at — most-recent uploads and most-recent
  // promotions surface at the top. Stable tie-break by record_set_id.
  const sorted = $derived.by(() => {
    return [...recordSets].sort((a, b) => {
      const ac = a.created_at ?? '';
      const bc = b.created_at ?? '';
      if (ac === bc) return a.record_set_id.localeCompare(b.record_set_id);
      return ac > bc ? -1 : 1;
    });
  });
</script>

<div class="rs-list-wrap">
  <header class="rs-list-head">
    <h2>Record sets</h2>
    <button type="button" class="rs-refresh" onclick={onrefresh}>refresh</button>
  </header>

  <ul class="rs-list">
    {#each sorted as rs (rs.record_set_id)}
      <RecordSetCard
        {rs}
        selected={rs.record_set_id === selectedId}
        onselect={() => onselect(rs.record_set_id)}
        ondelete={() => ondelete(rs)}
      />
    {/each}
    {#if sorted.length === 0}
      <li class="rs-list-empty">no record sets yet — upload below</li>
    {/if}
  </ul>
</div>

<style>
  .rs-list-wrap { display: flex; flex-direction: column; gap: 0.5rem; }
  .rs-list-head { display: flex; justify-content: space-between; align-items: baseline; gap: 0.5rem; }
  .rs-list-head h2 { margin: 0; }
  .rs-refresh {
    padding: 0.2rem 0.6rem;
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: 3px;
    color: var(--color-text);
    font-size: 0.75rem;
    cursor: pointer;
  }
  .rs-refresh:hover { border-color: var(--color-text); }
  .rs-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .rs-list-empty {
    color: var(--color-text-muted);
    font-style: italic;
    padding: 0.4rem 0.6rem;
  }
</style>
