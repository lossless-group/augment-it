<script lang="ts">
  import { onMount } from 'svelte';
  import { workspace, type RecordSet, type Row } from '@augment-it/workspace';
  import { BUNDLES, getBundle, packDisplayName, type BundleConfig } from './bundles';

  const TOKEN_KEY = 'augment-it:session-token';
  const WS_URL = 'ws://localhost:3001/ws';

  // Remember the user's last record-set + column picks so re-entry doesn't
  // require re-selecting everything. Keys keep the augment-it prefix per
  // the existing localStorage convention.
  const RECORD_SET_KEY = 'augment-it:pack-runner:record-set';
  const ENTITY_FIELD_KEY = 'augment-it:pack-runner:entity-name-field';
  // Bundle-aware persistence (Phase 3): the active bundle id, plus per-bundle
  // roster-override sets so swapping bundles doesn't lose user tuning per bundle.
  const BUNDLE_ID_KEY = 'augment-it:pack-runner:bundle-id';
  const ROSTER_OVERRIDES_KEY_PREFIX = 'augment-it:pack-runner:roster-overrides:';

  function readStored(key: string): string | null {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  }
  function writeStored(key: string, value: string | null): void {
    if (typeof localStorage === 'undefined') return;
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  }

  // Bundle-aware roster reads. A bundle's "effective roster" = its
  // default-true members, unless the user has saved an override set for
  // that bundle id (in which case the override IS the roster).
  function defaultRoster(bundle: BundleConfig): Set<string> {
    return new Set(bundle.members.filter((m) => m.default).map((m) => m.pack_id));
  }
  function readRoster(bundle_id: string): Set<string> | null {
    const raw = readStored(ROSTER_OVERRIDES_KEY_PREFIX + bundle_id);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as string[];
      return Array.isArray(parsed) ? new Set(parsed) : null;
    } catch {
      return null;
    }
  }
  function writeRoster(bundle_id: string, roster: Set<string>): void {
    writeStored(ROSTER_OVERRIDES_KEY_PREFIX + bundle_id, JSON.stringify([...roster]));
  }

  // Active bundle — defaults to the first registered bundle if no preference
  // is stored. We auto-write the chosen bundle's roster on first load so
  // every persisted roster is explicit (no implicit "use defaults").
  const initialBundleId = readStored(BUNDLE_ID_KEY) ?? BUNDLES[0].bundle_id;
  const initialBundle = getBundle(initialBundleId) ?? BUNDLES[0];

  let status = $state<'connecting' | 'open' | 'closed' | 'error'>('connecting');
  let recordSets = $state<RecordSet[]>([]);
  let selectedRecordSetId = $state<string | null>(readStored(RECORD_SET_KEY));
  let rowsForSelected = $state<Row[]>([]);
  let selectedRowIds = $state<Set<string>>(new Set());
  let entityNameField = $state<string>(readStored(ENTITY_FIELD_KEY) ?? '');
  let activeBundleId = $state<string>(initialBundle.bundle_id);
  let enabledPackIds = $state<Set<string>>(
    readRoster(initialBundle.bundle_id) ?? defaultRoster(initialBundle),
  );
  let firing = $state(false);
  let lastResult = $state<string>('');

  const selectedSet = $derived(
    selectedRecordSetId ? recordSets.find((rs) => rs.record_set_id === selectedRecordSetId) ?? null : null,
  );
  const columns = $derived(selectedSet?.schema.fields.map((f) => f.name) ?? []);
  const activeBundle = $derived(getBundle(activeBundleId) ?? BUNDLES[0]);
  const enabledPackCount = $derived(enabledPackIds.size);
  const rosterSize = $derived(activeBundle.members.length);

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

  // Roster operations — all persist the override under the active bundle's
  // key. They mutate the *current bundle's* roster only; switching bundles
  // restores that bundle's own override (or its defaults).
  function togglePack(pack_id: string) {
    const next = new Set(enabledPackIds);
    if (next.has(pack_id)) next.delete(pack_id);
    else next.add(pack_id);
    enabledPackIds = next;
    writeRoster(activeBundleId, next);
  }

  function rosterAll() {
    const next = new Set(activeBundle.members.map((m) => m.pack_id));
    enabledPackIds = next;
    writeRoster(activeBundleId, next);
  }
  function rosterNone() {
    const next = new Set<string>();
    enabledPackIds = next;
    writeRoster(activeBundleId, next);
  }
  function rosterSolo(pack_id: string) {
    const next = new Set<string>([pack_id]);
    enabledPackIds = next;
    writeRoster(activeBundleId, next);
  }
  function rosterDefaults() {
    const next = defaultRoster(activeBundle);
    enabledPackIds = next;
    writeRoster(activeBundleId, next);
  }

  function selectBundle(bundle_id: string) {
    if (bundle_id === activeBundleId) return;
    const b = getBundle(bundle_id);
    if (!b) return;
    activeBundleId = bundle_id;
    writeStored(BUNDLE_ID_KEY, bundle_id);
    // Restore that bundle's own override, or its defaults.
    enabledPackIds = readRoster(bundle_id) ?? defaultRoster(b);
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
        // The bundle this fan-out belongs to — rides on every ResponseRecord
        // so Response Reviewer can group results by bundle. New in Phase 3.
        bundle_id: activeBundleId,
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
        Pick a bundle, scope it to the rows you want, fire it. Results land
        in Response Reviewer with a confidence pill — triage them there.
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
        <h3>4 · Bundle</h3>
        <p class="muted hint">
          A bundle is a named composition of packs with a default roster.
          Pick one to set what fires; tune the roster below if you need to.
        </p>
        <div class="bundle-picker" role="tablist" aria-label="Bundle">
          {#each BUNDLES as b (b.bundle_id)}
            <button
              class="bundle-chip"
              class:active={b.bundle_id === activeBundleId}
              role="tab"
              aria-selected={b.bundle_id === activeBundleId}
              title={b.description}
              onclick={() => selectBundle(b.bundle_id)}
            >
              {b.display_name}
            </button>
          {/each}
        </div>
        <p class="muted bundle-desc">{activeBundle.description}</p>
      </section>

      <section class="card">
        <h3>5 · Roster ({enabledPackCount}/{rosterSize})</h3>
        <p class="muted hint">
          The bundle's packs — defaults are checked. Toggle to override; use
          <strong>solo</strong> next to a pack to fire just that one.
        </p>
        <div class="row-actions">
          <button class="chip" onclick={rosterAll}>all</button>
          <button class="chip" onclick={rosterNone}>none</button>
          <button class="chip" onclick={rosterDefaults}>defaults</button>
        </div>
        <div class="packs">
          {#each activeBundle.members as m (m.pack_id)}
            <div class="pack-row">
              <label class="pack-chip">
                <input
                  type="checkbox"
                  checked={enabledPackIds.has(m.pack_id)}
                  onchange={() => togglePack(m.pack_id)}
                />
                <span>{packDisplayName(m.pack_id)}</span>
                {#if !m.default}<span class="muted pack-optin">opt-in</span>{/if}
              </label>
              <button
                type="button"
                class="solo"
                title="Fire only {packDisplayName(m.pack_id)} for this bundle"
                onclick={() => rosterSolo(m.pack_id)}
              >solo</button>
            </div>
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
              firing {activeBundle.display_name} on {selectedRowCount} {selectedRowCount === 1 ? 'row' : 'rows'}…
            {:else if cellsToFire === 0}
              select rows and roster to fire
            {:else}
              Fire {activeBundle.display_name} on {selectedRowCount} {selectedRowCount === 1 ? 'row' : 'rows'}
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
