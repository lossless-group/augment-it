<script lang="ts">
  // One record-set card. Name, dimensions, select/delete/download actions.
  // Components are dumb; logic is passed in as callbacks.

  import type { RecordSet } from '@augment-it/workspace';
  import { downloadRecordSetAsCsv } from '../logic/download';

  type Props = {
    rs: RecordSet;
    selected: boolean;
    onselect: () => void;
    ondelete: () => void;
  };
  let { rs, selected, onselect, ondelete }: Props = $props();

  let downloading = $state<boolean>(false);
  let downloadError = $state<string | null>(null);

  async function download() {
    if (downloading) return;
    downloading = true;
    downloadError = null;
    try {
      await downloadRecordSetAsCsv(rs);
    } catch (err) {
      downloadError = err instanceof Error ? err.message : String(err);
    } finally {
      downloading = false;
    }
  }
</script>

<li class="rs-card" class:selected>
  <button type="button" class="rs-select" onclick={onselect}>
    <strong>{rs.name}</strong>
    <span class="rs-dims">{rs.schema.fields.length} cols · {rs.row_ids.length} rows</span>
  </button>
  <div class="rs-actions">
    <button
      type="button"
      class="rs-download"
      title="Download this record set as CSV"
      onclick={() => void download()}
      disabled={downloading}
      aria-label="download {rs.name}"
    >
      {#if downloading}…{:else}↓ CSV{/if}
    </button>
    <button
      type="button"
      class="rs-delete"
      title="Delete this record set and all its rows"
      onclick={ondelete}
      aria-label="delete {rs.name}"
    >×</button>
  </div>
  {#if downloadError}
    <p class="rs-error">download failed: {downloadError}</p>
  {/if}
</li>

<style>
  .rs-card {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.5rem;
    align-items: start;
    padding: 0.6rem 0.7rem;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background: transparent;
  }
  .rs-card.selected { border-color: var(--color-accent, var(--color-text)); background: var(--color-surface, rgba(0,0,0,0.04)); }
  .rs-select {
    background: transparent;
    border: 0;
    text-align: left;
    cursor: pointer;
    color: var(--color-text);
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    min-width: 0;
  }
  .rs-select strong { color: var(--color-accent, var(--color-text)); overflow-wrap: anywhere; }
  .rs-dims { color: var(--color-text-muted); font-size: 0.75rem; }
  .rs-actions { display: flex; gap: 0.25rem; align-items: center; }
  .rs-download {
    padding: 0.2rem 0.5rem;
    background: transparent;
    color: var(--color-text);
    border: 1px solid var(--color-border);
    border-radius: 3px;
    font-size: 0.7rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }
  .rs-download:hover:not(:disabled) { border-color: var(--color-text); background: var(--color-surface, rgba(0,0,0,0.05)); }
  .rs-download:disabled { opacity: 0.5; cursor: not-allowed; }
  .rs-delete {
    width: 1.4rem;
    height: 1.4rem;
    padding: 0;
    background: transparent;
    color: var(--color-text-muted);
    border: 0;
    border-radius: 3px;
    font-size: 0.9rem;
    cursor: pointer;
  }
  .rs-delete:hover { color: var(--color-error-text); background: var(--color-error-bg, rgba(200, 50, 50, 0.1)); }
  .rs-error {
    grid-column: 1 / -1;
    margin: 0;
    font-size: 0.7rem;
    color: var(--color-error-text);
  }
</style>
