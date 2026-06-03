<script lang="ts">
  import { records } from '../state/records.svelte';
  import RecordRow from './RecordRow.svelte';
</script>

<section class="records-list-wrap">
  <header class="records-list-head">
    <h2>Records</h2>
    {#if records.recordSets.length > 0}
      <select
        class="records-list-set-picker"
        value={records.activeRecordSetId ?? ''}
        onchange={(e) => void records.selectRecordSet((e.currentTarget as HTMLSelectElement).value)}
      >
        {#each records.recordSets as rs (rs.record_set_id)}
          <option value={rs.record_set_id}>{rs.name} ({rs.row_ids.length} rows)</option>
        {/each}
      </select>
    {/if}
  </header>

  {#if records.error}
    <p class="records-list-error">error: {records.error}</p>
  {:else if records.loading}
    <p class="records-list-muted">loading…</p>
  {:else if records.rows.length === 0}
    <p class="records-list-muted">no rows in the active record set</p>
  {:else}
    <ul class="records-list">
      {#each records.rows as row (row.row_id)}
        <li class="records-list-item">
          <RecordRow {row} />
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .records-list-wrap { display: flex; flex-direction: column; gap: 1rem; padding: 1.25rem 1.5rem; max-width: 1100px; }
  .records-list-head { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; }
  .records-list-head h2 { margin: 0; font-size: 1.1rem; color: var(--color-text); }
  .records-list-set-picker {
    padding: 0.3rem 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background: transparent;
    color: var(--color-text);
    font-size: 0.85rem;
  }
  .records-list-muted { color: var(--color-text-muted); }
  .records-list-error { color: var(--color-error-text); }
  .records-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
  .records-list-item { display: block; }
</style>
