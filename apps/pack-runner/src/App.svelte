<script lang="ts">
  import { onMount } from 'svelte';
  import { workspace, type RecordSet, type Row } from '@augment-it/workspace';

  // Six pack identities. Source-of-truth lives in services/social-search/src/packs.ts;
  // keeping the labels here client-side avoids a round-trip just to render the UI.
  // If a pack lands or is renamed, update both.
  const PACKS: { pack_id: string; display_name: string }[] = [
    { pack_id: 'linkedin-pack', display_name: 'LinkedIn' },
    { pack_id: 'x-pack', display_name: 'X / Twitter' },
    { pack_id: 'bluesky-pack', display_name: 'BlueSky' },
    { pack_id: 'youtube-pack', display_name: 'YouTube' },
    { pack_id: 'facebook-pack', display_name: 'Facebook' },
    { pack_id: 'wikipedia-pack', display_name: 'Wikipedia' },
  ];

  const TOKEN_KEY = 'augment-it:session-token';
  const WS_URL = 'ws://localhost:3001/ws';

  let status = $state<'connecting' | 'open' | 'closed' | 'error'>('connecting');
  let recordSets = $state<RecordSet[]>([]);
  let selectedRecordSetId = $state<string | null>(null);
  let rowsForSelected = $state<Row[]>([]);
  let selectedRowIds = $state<Set<string>>(new Set());
  let entityNameField = $state<string>('');
  let enabledPackIds = $state<Set<string>>(new Set(PACKS.map((p) => p.pack_id)));
  let firing = $state(false);
  let lastResult = $state<string>('');

  const selectedSet = $derived(
    selectedRecordSetId ? recordSets.find((rs) => rs.record_set_id === selectedRecordSetId) ?? null : null,
  );
  const columns = $derived(selectedSet?.schema.fields.map((f) => f.name) ?? []);
  const enabledPackCount = $derived(enabledPackIds.size);
  const selectedRowCount = $derived(selectedRowIds.size);
  const cellsToFire = $derived(enabledPackCount * selectedRowCount);

  onMount(() => {
    workspace.connect({
      url: WS_URL,
      getToken: () => localStorage.getItem(TOKEN_KEY),
      saveToken: (t) => localStorage.setItem(TOKEN_KEY, t),
      onStatus: (s) => (status = s),
    });
    void loadRecordSets();
  });

  async function loadRecordSets() {
    try {
      const r = (await workspace.invoke('record_set.list', {})) as { record_sets: RecordSet[] };
      // Keep non-archived first; archived sets at the bottom (skipped from UI here for simplicity).
      recordSets = r.record_sets.filter((rs) => !rs.archived);
    } catch (err: unknown) {
      console.error('record_set.list', err);
    }
  }

  async function selectRecordSet(record_set_id: string) {
    selectedRecordSetId = record_set_id;
    rowsForSelected = [];
    selectedRowIds = new Set();
    try {
      const r = (await workspace.invoke('row.list', { record_set_id })) as { rows: Row[] };
      rowsForSelected = r.rows;
      // Best-guess default for the entity-name field — prefer one of these
      // commonly-named columns if present.
      const candidates = ['name', 'organization', 'org', 'company', 'foundation', 'entity'];
      const cols = (selectedSet?.schema.fields ?? []).map((f) => f.name);
      entityNameField =
        candidates.find((c) => cols.some((col) => col.toLowerCase() === c)) ??
        cols.find((c) => candidates.some((cand) => c.toLowerCase().includes(cand))) ??
        cols[0] ??
        '';
    } catch (err: unknown) {
      console.error('row.list', err);
    }
  }

  function togglePack(pack_id: string) {
    const next = new Set(enabledPackIds);
    if (next.has(pack_id)) next.delete(pack_id);
    else next.add(pack_id);
    enabledPackIds = next;
  }

  function toggleRow(row_id: string) {
    const next = new Set(selectedRowIds);
    if (next.has(row_id)) next.delete(row_id);
    else next.add(row_id);
    selectedRowIds = next;
  }

  function selectAllRows() {
    selectedRowIds = new Set(rowsForSelected.map((r) => r.row_id));
  }

  function clearAllRows() {
    selectedRowIds = new Set();
  }

  async function fire() {
    if (!selectedRecordSetId || cellsToFire === 0 || !entityNameField) return;
    firing = true;
    lastResult = '';
    try {
      const r = (await workspace.invoke('pack.fan_out', {
        pack_ids: Array.from(enabledPackIds),
        row_ids: Array.from(selectedRowIds),
        record_set_id: selectedRecordSetId,
        entity_name_field: entityNameField,
      })) as { ok: boolean; cells_fired?: number; error?: string };
      if (r.ok) {
        lastResult = `Fired ${r.cells_fired ?? cellsToFire} cells. Switch to Response Reviewer to triage.`;
      } else {
        lastResult = `fan_out failed — ${r.error ?? 'unknown error'}`;
      }
    } catch (err: unknown) {
      lastResult = `fan_out failed — ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      firing = false;
    }
  }
</script>

<div class="pr-app">
  <div class="pr-status-bar">
    consumes <code>@augment-it/workspace</code> · <code>{WS_URL}</code> ·
    <span class="status status-{status}">{status}</span>
  </div>

  <div class="pr-body">
    <div class="pr-head">
      <h2>Pack Runner</h2>
      <p class="muted">
        Fire the common-six social packs against rows of a record set.
        Results land in Response Reviewer with a confidence pill — triage
        them there.
      </p>
    </div>

    <section class="card">
      <h3>1 · Record set</h3>
      <select
        bind:value={selectedRecordSetId}
        onchange={() => selectedRecordSetId && void selectRecordSet(selectedRecordSetId)}
      >
        <option value={null}>— pick a record set —</option>
        {#each recordSets as rs (rs.record_set_id)}
          <option value={rs.record_set_id}>
            {rs.name} ({rs.row_ids.length} rows)
          </option>
        {/each}
      </select>
    </section>

    {#if selectedSet}
      <section class="card">
        <h3>2 · Entity-name column</h3>
        <p class="muted hint">
          Which column holds the name to search for? (LinkedIn for X, Wikipedia for Y, etc.)
        </p>
        <select bind:value={entityNameField}>
          {#each columns as col (col)}
            <option value={col}>{col}</option>
          {/each}
        </select>
      </section>

      <section class="card">
        <h3>3 · Rows to fire against ({selectedRowCount}/{rowsForSelected.length})</h3>
        <div class="row-actions">
          <button class="chip" onclick={selectAllRows}>all</button>
          <button class="chip" onclick={clearAllRows}>none</button>
        </div>
        <ul class="rows">
          {#each rowsForSelected as row (row.row_id)}
            <li>
              <label>
                <input
                  type="checkbox"
                  checked={selectedRowIds.has(row.row_id)}
                  onchange={() => toggleRow(row.row_id)}
                />
                <span class="row-name">
                  {(row.fields as Record<string, unknown>)[entityNameField] ?? '(no value)'}
                </span>
              </label>
            </li>
          {/each}
        </ul>
      </section>

      <section class="card">
        <h3>4 · Packs ({enabledPackCount}/{PACKS.length})</h3>
        <div class="packs">
          {#each PACKS as pack (pack.pack_id)}
            <label class="pack-chip">
              <input
                type="checkbox"
                checked={enabledPackIds.has(pack.pack_id)}
                onchange={() => togglePack(pack.pack_id)}
              />
              <span>{pack.display_name}</span>
            </label>
          {/each}
        </div>
      </section>

      <section class="card fire-card">
        <button
          class="fire"
          disabled={firing || cellsToFire === 0 || !entityNameField}
          onclick={() => void fire()}
        >
          {#if firing}firing {cellsToFire} cells…
          {:else if cellsToFire === 0}select rows and packs to fire
          {:else}Fire {cellsToFire} cells ({enabledPackCount} packs × {selectedRowCount} rows)
          {/if}
        </button>
        {#if lastResult}<p class="result muted">{lastResult}</p>{/if}
      </section>
    {/if}
  </div>
</div>
