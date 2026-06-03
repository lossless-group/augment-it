<script lang="ts">
  // Promote-to-next-version CTA. Renders the count of rows that have
  // accepted URLs (so the user knows what's about to be saved), the new
  // version name that will be generated, and the action button.
  //
  // Mounted at both the top AND bottom of the records list so the user
  // can save without scrolling. Same component, two mount points.

  import { records } from '../state/records.svelte';
  import { nextVersionName } from '../logic/promote';
  import type { Row } from '@augment-it/workspace';

  type Props = { position: 'top' | 'bottom' };
  let { position }: Props = $props();

  // Counts: how many rows have at least one accepted URL in the array
  // column. Mirrors the column name used by RecordRow.
  const TARGET_COLUMN = 'official_updates_index_urls';

  const stats = $derived.by(() => {
    let rowsWithUrls = 0;
    let totalUrls = 0;
    for (const r of records.rows) {
      const v = (r.fields as Record<string, unknown>)[TARGET_COLUMN];
      if (Array.isArray(v) && v.length > 0) {
        rowsWithUrls += 1;
        totalUrls += v.length;
      }
    }
    return { rowsWithUrls, totalUrls, totalRows: records.rows.length };
  });

  const activeRs = $derived(
    records.recordSets.find((rs) => rs.record_set_id === records.activeRecordSetId),
  );
  const newName = $derived(activeRs ? nextVersionName(activeRs.name) : '');

  let confirming = $state<boolean>(false);
  // After a successful promote, hold the new set id so the user can pick
  // where to go next without losing the success signal.
  let promotedTo = $state<string | null>(null);

  async function go() {
    if (records.promoting) return;
    if (!confirming) {
      confirming = true;
      return;
    }
    confirming = false;
    const result = await records.promoteActiveRecordSet();
    if (result) promotedTo = result.new_record_set_id;
  }

  // Fire the shell's cross-remote navigation event to move the user to
  // another step of the Flow with the just-promoted record set as the
  // active context. Mirrors the pattern in record-collector (Phase 5
  // hand-off): set the canonical localStorage key, broadcast the change,
  // then dispatch the navigate event with the target remote id.
  function navigateTo(remoteId: string) {
    if (!promotedTo) return;
    try {
      localStorage.setItem('augment-it:active-record-set', promotedTo);
    } catch {
      /* non-fatal */
    }
    window.dispatchEvent(
      new CustomEvent('augment-it:active-record-set-changed', {
        detail: { record_set_id: promotedTo },
      }),
    );
    window.dispatchEvent(
      new CustomEvent('augment-it:navigate', { detail: { remoteId } }),
    );
    promotedTo = null;
  }
</script>

<aside class="promote-bar" data-position={position}>
  <div class="promote-bar-summary">
    <strong>{stats.rowsWithUrls}</strong> of <strong>{stats.totalRows}</strong>
    rows have accepted URLs · <strong>{stats.totalUrls}</strong> URLs total
    {#if activeRs}
      · current: <code>{activeRs.name}</code>
    {/if}
  </div>

  {#if promotedTo}
    <!-- Post-promote: success + what next. The new record set is already
         active in this surface; the buttons hop to another remote with
         that same record set in context. -->
    <div class="promote-bar-success">
      <span class="promote-bar-success-msg">
        ✓ promoted. New version is active. What's next?
      </span>
      <div class="promote-bar-next">
        <button
          class="promote-bar-next-btn"
          onclick={() => navigateTo('enhancedRecordsList')}
          title="Step 5 — review + download the new version"
        >
          → Open Enhanced Records (download)
        </button>
        <button
          class="promote-bar-next-btn"
          onclick={() => navigateTo('augment')}
          title="Step 2 — start the next augmentation pass"
        >
          → Augment this set again
        </button>
        <button
          class="promote-bar-next-btn subtle"
          onclick={() => (promotedTo = null)}
          title="stay on Records Surface to keep iterating"
        >
          stay here
        </button>
      </div>
    </div>
  {:else}
    <div class="promote-bar-action">
      {#if records.lastPromoteError}
        <span class="promote-bar-error">error: {records.lastPromoteError}</span>
      {/if}
      {#if confirming}
        <span class="promote-bar-confirm">
          promote to <code>{newName}</code>?
        </span>
        <button class="promote-bar-cancel" onclick={() => (confirming = false)}>cancel</button>
      {/if}
      <button
        class="promote-bar-btn"
        class:confirming
        disabled={records.promoting || !activeRs}
        onclick={() => void go()}
      >
        {#if records.promoting}
          promoting…
        {:else if confirming}
          ✓ promote
        {:else}
          Go to Save · promote to next version →
        {/if}
      </button>
    </div>
  {/if}
</aside>

<style>
  .promote-bar {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    margin: 0.5rem 0;
    background: var(--color-surface, rgba(0, 0, 0, 0.04));
    border: 1px solid var(--color-border);
    border-radius: 6px;
    font-size: 0.85rem;
  }
  .promote-bar[data-position='top'] {
    border-top: 3px solid var(--color-accent, var(--color-text));
  }
  .promote-bar[data-position='bottom'] {
    border-bottom: 3px solid var(--color-accent, var(--color-text));
  }
  .promote-bar-summary { color: var(--color-text); }
  .promote-bar-summary code {
    font-family: ui-monospace, monospace;
    background: transparent;
    padding: 0;
  }
  .promote-bar-action {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .promote-bar-confirm { color: var(--color-text-muted); font-size: 0.85rem; }
  .promote-bar-confirm code { font-family: ui-monospace, monospace; }
  .promote-bar-error { color: var(--color-error-text); font-size: 0.85rem; }
  .promote-bar-btn {
    padding: 0.45rem 1rem;
    background: var(--color-accent, var(--color-text));
    color: var(--color-bg, #fff);
    border: 0;
    border-radius: 4px;
    font-weight: 600;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .promote-bar-btn:hover:not(:disabled) { opacity: 0.9; }
  .promote-bar-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .promote-bar-btn.confirming {
    background: var(--color-ok-text, #2a8a3a);
  }
  .promote-bar-cancel {
    padding: 0.4rem 0.75rem;
    background: transparent;
    color: var(--color-text-muted);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.8rem;
  }
  .promote-bar-cancel:hover { color: var(--color-text); border-color: var(--color-text); }
  .promote-bar-success {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .promote-bar-success-msg {
    color: var(--color-ok-text, #2a8a3a);
    font-weight: 600;
  }
  .promote-bar-next {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .promote-bar-next-btn {
    padding: 0.4rem 0.8rem;
    background: var(--color-accent, var(--color-text));
    color: var(--color-bg, #fff);
    border: 0;
    border-radius: 4px;
    font-weight: 600;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .promote-bar-next-btn:hover { opacity: 0.9; }
  .promote-bar-next-btn.subtle {
    background: transparent;
    color: var(--color-text-muted);
    border: 1px solid var(--color-border);
    font-weight: normal;
  }
  .promote-bar-next-btn.subtle:hover { color: var(--color-text); border-color: var(--color-text); opacity: 1; }
</style>
