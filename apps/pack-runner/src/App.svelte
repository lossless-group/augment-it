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
    { pack_id: 'instagram-pack', display_name: 'Instagram' },
  ];

  const TOKEN_KEY = 'augment-it:session-token';
  const WS_URL = 'ws://localhost:3001/ws';

  // Remember the user's last record-set + column picks so re-entry doesn't
  // require re-selecting everything. Keys keep the augment-it prefix per
  // the existing localStorage convention.
  const RECORD_SET_KEY = 'augment-it:pack-runner:record-set';
  const ENTITY_FIELD_KEY = 'augment-it:pack-runner:entity-name-field';

  function readStored(key: string): string | null {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  }
  function writeStored(key: string, value: string | null): void {
    if (typeof localStorage === 'undefined') return;
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  }

  let status = $state<'connecting' | 'open' | 'closed' | 'error'>('connecting');
  let recordSets = $state<RecordSet[]>([]);
  let selectedRecordSetId = $state<string | null>(readStored(RECORD_SET_KEY));
  let rowsForSelected = $state<Row[]>([]);
  let selectedRowIds = $state<Set<string>>(new Set());
  let entityNameField = $state<string>(readStored(ENTITY_FIELD_KEY) ?? '');
  let enabledPackIds = $state<Set<string>>(new Set(PACKS.map((p) => p.pack_id)));
  let firing = $state(false);
  let lastResult = $state<string>('');

  const selectedSet = $derived(
    selectedRecordSetId ? recordSets.find((rs) => rs.record_set_id === selectedRecordSetId) ?? null : null,
  );
  const columns = $derived(selectedSet?.schema.fields.map((f) => f.name) ?? []);
  const enabledPackCount = $derived(enabledPackIds.size);

  // Row filter — heuristic v1: classify each row by whether its `url` column
  // already has a real value vs being empty/'unknown'. Maps to the user's
  // "rows that did/didn't get a valid url in the last run" framing. The
  // proper version (read `triage_states` cemented at promote time) is
  // sequenced for the Run-entity work in
  // [[Run-as-First-Class-Operation]] §Part 5 — once that lands, the filter
  // chips here flip to consult the cemented state.
  type RowStatus = 'has-url' | 'no-url';
  let rowFilter = $state<'all' | RowStatus>('all');

  function classifyRow(row: Row): RowStatus {
    const raw = (row.fields as Record<string, unknown>).url;
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (value.length === 0) return 'no-url';
    if (value.toLowerCase() === 'unknown') return 'no-url';
    return 'has-url';
  }

  // The rows the picker should display, after applying the row filter.
  const visibleRows = $derived(
    rowFilter === 'all'
      ? rowsForSelected
      : rowsForSelected.filter((r) => classifyRow(r) === rowFilter),
  );

  // Per-filter counts so the chips show "(N)" — no full re-classify cost
  // since we tally in one pass.
  const filterCounts = $derived.by(() => {
    const c = { all: rowsForSelected.length, 'has-url': 0, 'no-url': 0 };
    for (const r of rowsForSelected) {
      const k = classifyRow(r);
      c[k] += 1;
    }
    return c;
  });

  // Fire operates on `selected ∩ visible` — filter naturally constrains
  // what fires without requiring the user to re-click "all visible" every
  // time they change filter. User adjusts within-visible via checkboxes or
  // the all/none buttons; rows in selectedRowIds but outside visibleRows
  // are preserved (silently waiting for filter to surface them again).
  const effectiveSelection = $derived(
    visibleRows.filter((r) => selectedRowIds.has(r.row_id)),
  );
  const selectedRowCount = $derived(effectiveSelection.length);
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
      // Auto-restore last selection if it still exists. Or — if there's a
      // single non-archived set — pick that. Either way the user doesn't
      // have to re-choose what they were already looking at.
      const restoredId =
        selectedRecordSetId && recordSets.some((rs) => rs.record_set_id === selectedRecordSetId)
          ? selectedRecordSetId
          : recordSets.length === 1
            ? recordSets[0].record_set_id
            : null;
      if (restoredId) {
        await selectRecordSet(restoredId);
      } else if (selectedRecordSetId) {
        // Stored id is stale (set was deleted/archived). Clear the persistence.
        selectedRecordSetId = null;
        writeStored(RECORD_SET_KEY, null);
      }
    } catch (err: unknown) {
      console.error('record_set.list', err);
    }
  }

  async function selectRecordSet(record_set_id: string) {
    selectedRecordSetId = record_set_id;
    writeStored(RECORD_SET_KEY, record_set_id);
    rowsForSelected = [];
    selectedRowIds = new Set();
    try {
      const r = (await workspace.invoke('row.list', { record_set_id })) as { rows: Row[] };
      rowsForSelected = r.rows;
      // Auto-select all rows by default — the user's natural intent on
      // landing in Pack Runner is "fire against this set." Filtering
      // narrows the visible/fired subset (via effectiveSelection); the
      // checkboxes refine. Avoids the "everything visible but Fire is
      // disabled" trap.
      selectedRowIds = new Set(r.rows.map((row) => row.row_id));
      // Restore last entity-name-field choice if the column still exists in
      // this set's schema; otherwise fall back to a best-guess.
      const stored = readStored(ENTITY_FIELD_KEY);
      const cols = (recordSets.find((rs) => rs.record_set_id === record_set_id)?.schema.fields ?? []).map((f) => f.name);
      if (stored && cols.includes(stored)) {
        entityNameField = stored;
      } else {
        const candidates = ['name', 'organization', 'org', 'company', 'foundation', 'entity'];
        entityNameField =
          candidates.find((c) => cols.some((col) => col.toLowerCase() === c)) ??
          cols.find((c) => candidates.some((cand) => c.toLowerCase().includes(cand))) ??
          cols[0] ??
          '';
        writeStored(ENTITY_FIELD_KEY, entityNameField || null);
      }
    } catch (err: unknown) {
      console.error('row.list', err);
    }
  }

  // Persist the entity-name column whenever the user changes the dropdown.
  $effect(() => {
    if (entityNameField) writeStored(ENTITY_FIELD_KEY, entityNameField);
  });

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

  // all/none operate on the CURRENTLY VISIBLE rows so the user can scope
  // "all" to "all rows that have a url" (or any other filter) without
  // having to per-row check.
  function selectAllRows() {
    const next = new Set(selectedRowIds);
    for (const r of visibleRows) next.add(r.row_id);
    selectedRowIds = next;
  }

  function clearAllRows() {
    const next = new Set(selectedRowIds);
    for (const r of visibleRows) next.delete(r.row_id);
    selectedRowIds = next;
  }

  async function fire() {
    if (!selectedRecordSetId || cellsToFire === 0 || !entityNameField) return;
    firing = true;
    lastResult = '';
    try {
      const r = (await workspace.invoke('pack.fan_out', {
        pack_ids: Array.from(enabledPackIds),
        // Fire against the effective selection (selected ∩ visible), not the
        // raw selectedRowIds. That way the filter the user has set acts as
        // a hard scope — narrowing to "has url" and firing won't accidentally
        // also fire the no-url rows that were selected before the filter.
        row_ids: effectiveSelection.map((r) => r.row_id),
        record_set_id: selectedRecordSetId,
        entity_name_field: entityNameField,
      })) as { ok: boolean; cells_fired?: number; error?: string };
      if (r.ok) {
        lastResult = `Fired ${r.cells_fired ?? cellsToFire} cells — all settled. Open Response Reviewer to triage.`;
      } else {
        lastResult = `fan_out failed — ${r.error ?? 'unknown error'}`;
      }
    } catch (err: unknown) {
      lastResult = `fan_out failed — ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      firing = false;
    }
  }

  // fan_out runs server-side and only replies once every cell has settled, but
  // each cell writes its result to the store as it completes — so the user can
  // hop to Response Reviewer and watch results stream in rather than waiting on
  // a blocked button. Reuses the shell's cross-remote navigate event.
  function goToResponseReviewer(): void {
    window.dispatchEvent(
      new CustomEvent('augment-it:navigate', {
        detail: { remoteId: 'responseReviewer' },
      }),
    );
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
        <div class="row-filter-chips" role="tablist" aria-label="Filter rows by status">
          <button
            class="chip"
            class:active={rowFilter === 'all'}
            onclick={() => (rowFilter = 'all')}
          >all <span class="chip-count">{filterCounts.all}</span></button>
          <button
            class="chip"
            class:active={rowFilter === 'has-url'}
            onclick={() => (rowFilter = 'has-url')}
            title="Rows whose `url` is already populated — likely candidates for further enrichment"
          >has url <span class="chip-count">{filterCounts['has-url']}</span></button>
          <button
            class="chip"
            class:active={rowFilter === 'no-url'}
            onclick={() => (rowFilter = 'no-url')}
            title="Rows whose `url` is empty or 'unknown' — likely need client clarification before pack-firing"
          >no url <span class="chip-count">{filterCounts['no-url']}</span></button>
        </div>
        <div class="row-actions">
          <button class="chip" onclick={selectAllRows}>all visible</button>
          <button class="chip" onclick={clearAllRows}>none</button>
          <span class="muted row-actions-hint">
            ({rowFilter === 'all' ? rowsForSelected.length : visibleRows.length} visible)
          </span>
        </div>
        <ul class="rows">
          {#each visibleRows as row (row.row_id)}
            {@const status = classifyRow(row)}
            <li>
              <label>
                <input
                  type="checkbox"
                  checked={selectedRowIds.has(row.row_id)}
                  onchange={() => toggleRow(row.row_id)}
                />
                <span class="row-status" data-status={status} aria-hidden="true">
                  {status === 'has-url' ? '✓' : '○'}
                </span>
                <span class="row-name">
                  {(row.fields as Record<string, unknown>)[entityNameField] ?? '(no value)'}
                </span>
              </label>
            </li>
          {/each}
          {#if visibleRows.length === 0}
            <li class="muted empty-row">no rows match this filter</li>
          {/if}
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
        <div class="fire-actions">
          <button
            class="fire"
            disabled={firing || cellsToFire === 0 || !entityNameField}
            onclick={() => void fire()}
          >
            {#if firing}
              firing on {selectedRowCount} {selectedRowCount === 1 ? 'row' : 'rows'}…
            {:else if cellsToFire === 0}
              select rows and packs to fire
            {:else}
              Fire on {selectedRowCount} {selectedRowCount === 1 ? 'row' : 'rows'}
            {/if}
          </button>
          <button class="to-reviewer" onclick={goToResponseReviewer}>
            Response Reviewer →
          </button>
        </div>
        {#if firing}
          <p class="muted fire-sub">
            Running server-side — results stream into Response Reviewer as each
            cell completes. Click <strong>Response Reviewer →</strong> to watch them land.
          </p>
        {:else if cellsToFire > 0}
          <p class="muted fire-sub">
            {enabledPackCount} {enabledPackCount === 1 ? 'pack' : 'packs'} × {selectedRowCount} {selectedRowCount === 1 ? 'row' : 'rows'}
            · {cellsToFire} {cellsToFire === 1 ? 'fetch' : 'fetches'} total
          </p>
        {/if}
        {#if lastResult}<p class="result muted">{lastResult}</p>{/if}
      </section>
    {/if}
  </div>
</div>
