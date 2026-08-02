<script lang="ts">
  import { onMount } from 'svelte';
  import { workspace, type RecordSet, type Row } from '@augment-it/workspace';
  import {
    BUNDLES, getBundle, packDisplayName, inferEntityNameField,
    PACK_PALETTE_META,
    type BundleConfig,
  } from './bundles';
  import ConnectorPalette from './ConnectorPalette.svelte';
  import type { PaletteConnector, PalettePack } from './ConnectorPalette.svelte';

  // Connector inventory loaded once on mount. Empty during load → palette
  // chips render with limited info; refreshes when registry replies.
  let inventory = $state<PaletteConnector[]>([]);

  // Per-(row × pack) in-flight state for the per-row palette. Keyed
  // `${row_id}::${pack_id}` — one fire per pack per row at a time.
  let rowPackBusy = $state<Set<string>>(new Set());

  // Per-row map of pack_ids that have completed at least once this session,
  // for the "found" chip state. Doesn't survive refresh; the real source of
  // truth lives in response-store, but this gives immediate feedback.
  let rowPackFired = $state<Record<string, Set<string>>>({});

  const TOKEN_KEY = 'augment-it:session-token';
  const WS_URL = 'ws://localhost:3001/ws';

  // Remember the user's last record-set + column picks so re-entry doesn't
  // require re-selecting everything. Keys keep the augment-it prefix per
  // the existing localStorage convention.
  //
  // The active record set is now stored under the workspace-canonical key
  // `augment-it:active-record-set` (Phase 5) — one write pre-selects this
  // set for any surface that reads it, including the Record Collector
  // "Augment This Set" hand-off. We still read the legacy
  // `augment-it:pack-runner:record-set` as a fallback for pre-Phase-5
  // sessions, then write canonical on every change going forward.
  const ACTIVE_RECORD_SET_KEY = 'augment-it:active-record-set';
  const LEGACY_RECORD_SET_KEY = 'augment-it:pack-runner:record-set';
  // Per-record-set override for the inferred entity-name column (spec
  // Decision §9). Keyed by record_set_id so overrides don't leak across
  // sets. The legacy global key is read once as a migration fallback when
  // no per-set override exists yet.
  const ENTITY_FIELD_KEY_PREFIX = 'augment-it:entity-name-field:';
  const LEGACY_ENTITY_FIELD_KEY = 'augment-it:pack-runner:entity-name-field';
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

  let status = $state<'connecting' | 'open' | 'closed' | 'error' | 'auth_required'>('connecting');
  let recordSets = $state<RecordSet[]>([]);
  let selectedRecordSetId = $state<string | null>(
    readStored(ACTIVE_RECORD_SET_KEY) ?? readStored(LEGACY_RECORD_SET_KEY),
  );
  let rowsForSelected = $state<Row[]>([]);
  let selectedRowIds = $state<Set<string>>(new Set());
  let entityNameField = $state<string>('');
  // Whether the user has explicitly picked a different entity-name column
  // than the inference. Drives the "we're reading entity names from X"
  // hint vs the dropdown affordance.
  let entityNameOverridden = $state<boolean>(false);
  // When the user clicks `change ›`, expose the dropdown inline.
  let entityNamePickerOpen = $state<boolean>(false);
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
  // Target columns — what gets richer when responses land + are accepted.
  // For v1 this is always 'socials' (per the 2026-05-25 pivot baked into
  // services/social-search/src/search.ts). Future bundles whose packs
  // write to other columns can declare additional targets on the bundle
  // and we'll render the union. Spec Decision §9.
  const targetColumns = $derived<string[]>(activeBundle.target_columns ?? ['socials']);
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
    void loadInventory();

    // Listen for the canonical-key change so an "Augment This Set" click
    // from Record Collector re-targets us even when we're already mounted.
    // Same pattern as the composite mode broadcast (shell/src/composites.ts).
    const onActiveRecordSetChange = (e: Event) => {
      const detail = (e as CustomEvent).detail as { record_set_id?: string } | undefined;
      const next = detail?.record_set_id;
      if (next && next !== selectedRecordSetId) {
        void selectRecordSet(next);
      }
    };
    window.addEventListener('augment-it:active-record-set-changed', onActiveRecordSetChange);
    return () => {
      window.removeEventListener('augment-it:active-record-set-changed', onActiveRecordSetChange);
    };
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
        // Stored id is stale (set was deleted/archived). Clear both keys.
        selectedRecordSetId = null;
        writeStored(ACTIVE_RECORD_SET_KEY, null);
        writeStored(LEGACY_RECORD_SET_KEY, null);
      }
    } catch (err: unknown) {
      console.error('record_set.list', err);
    }
  }

  // Connector inventory — drives the per-row palette's cost-tier / needs-env
  // affordances. Loaded once on mount, shared across every row in the list.
  async function loadInventory() {
    try {
      const r = (await workspace.invoke('connectors.inventory', {})) as {
        connectors: PaletteConnector[];
      };
      inventory = r.connectors ?? [];
    } catch (err) {
      console.warn('connectors.inventory unavailable', err);
      inventory = [];
    }
  }

  // Map registry connector_id → legacy ProviderId (the existing fan_out
  // path's provider_override field). The registry uses 'serpapi-google'
  // while the legacy ProviderId union still has 'serpapi'.
  function connectorIdToProviderId(connector_id: string): string {
    if (connector_id === 'serpapi-google') return 'serpapi';
    return connector_id;
  }

  // Fire ONE pack against ONE row, optionally through an explicit connector.
  // Mirrors the per-record runner in response-reviewer but lives here in
  // Augment so the user can iterate row-by-row without bulk fan-out.
  async function fireOneRow(row: Row, pack_id: string, connector_id?: string) {
    const key = `${row.row_id}::${pack_id}`;
    if (rowPackBusy.has(key)) return;
    rowPackBusy = new Set(rowPackBusy).add(key);
    try {
      await workspace.invoke('pack.search', {
        pack_id,
        row_id: row.row_id,
        record_set_id: selectedRecordSetId,
        entity_name_field: entityNameField,
        bundle_id: activeBundle?.bundle_id,
        provider_override: connector_id ? connectorIdToProviderId(connector_id) : undefined,
      });
      // Mark as fired so the chip flips to "found" (visual signal — actual
      // results live in response-store and surface in Response Reviewer).
      const next = { ...rowPackFired };
      if (!next[row.row_id]) next[row.row_id] = new Set();
      next[row.row_id] = new Set(next[row.row_id]).add(pack_id);
      rowPackFired = next;
    } catch (err) {
      console.error('pack.search (per-row)', err);
    } finally {
      const next = new Set(rowPackBusy);
      next.delete(key);
      rowPackBusy = next;
    }
  }

  // Which packs the per-row palette should expose. Tracks the active bundle's
  // roster, filtered by what's currently enabled in the roster overrides.
  // Empty when no bundle is selected → palette doesn't render.
  const palettePacks = $derived.by<PalettePack[]>(() => {
    if (!activeBundle) return [];
    const out: PalettePack[] = [];
    for (const member of activeBundle.members) {
      if (!enabledPackIds.has(member.pack_id)) continue;
      const meta = PACK_PALETTE_META[member.pack_id];
      if (!meta) continue;
      out.push({ pack_id: member.pack_id, ...meta });
    }
    return out;
  });

  function busyPacksForRow(row_id: string): Set<string> {
    const out = new Set<string>();
    const prefix = `${row_id}::`;
    for (const key of rowPackBusy) {
      if (key.startsWith(prefix)) out.add(key.slice(prefix.length));
    }
    return out;
  }

  function firedPacksForRow(row_id: string): Set<string> {
    return rowPackFired[row_id] ?? new Set<string>();
  }

  async function selectRecordSet(record_set_id: string) {
    selectedRecordSetId = record_set_id;
    writeStored(ACTIVE_RECORD_SET_KEY, record_set_id);
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
      // Entity-name column resolution (spec Decision §9):
      //   1. Per-record-set override (the explicit pick the user has
      //      saved for THIS set) wins. Persisted under
      //      augment-it:entity-name-field:<record_set_id>.
      //   2. Otherwise infer from the ENTITY_NAME_CANDIDATES list against
      //      the set's schema field names — first match wins.
      //   3. Migration fallback: the pre-Phase-§9 global key
      //      augment-it:pack-runner:entity-name-field is read once if no
      //      per-set override exists, in case the user had configured it
      //      manually before. Not written going forward.
      //   4. Last resort: first column, if any. Hint will say "no match;
      //      pick a column" — entityNameOverridden stays false so the
      //      change-link is visible by default.
      const setOverrideKey = ENTITY_FIELD_KEY_PREFIX + record_set_id;
      const setOverride = readStored(setOverrideKey);
      const cols = (recordSets.find((rs) => rs.record_set_id === record_set_id)?.schema.fields ?? []).map((f) => f.name);
      if (setOverride && cols.includes(setOverride)) {
        entityNameField = setOverride;
        entityNameOverridden = true;
      } else {
        const inferred = inferEntityNameField(cols);
        if (inferred) {
          entityNameField = inferred;
          entityNameOverridden = false;
        } else {
          const legacy = readStored(LEGACY_ENTITY_FIELD_KEY);
          if (legacy && cols.includes(legacy)) {
            entityNameField = legacy;
            entityNameOverridden = true;
            // Migrate the legacy global into the per-set key.
            writeStored(setOverrideKey, legacy);
          } else {
            entityNameField = cols[0] ?? '';
            entityNameOverridden = false;
          }
        }
      }
      entityNamePickerOpen = false;
    } catch (err: unknown) {
      console.error('row.list', err);
    }
  }

  // When the user explicitly overrides the inferred entity-name column,
  // persist it per-record-set (the key the loader reads on re-entry).
  function commitEntityNameOverride(field: string) {
    entityNameField = field;
    entityNameOverridden = true;
    entityNamePickerOpen = false;
    if (selectedRecordSetId) {
      writeStored(ENTITY_FIELD_KEY_PREFIX + selectedRecordSetId, field);
    }
  }

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
      <!-- Inferred entity-name column (spec Decision §9). Read-only hint
           with a change-link drop-down; no longer a full numbered step.
           Pack Runner infers the column from a small candidate list;
           override is persisted per record_set_id. -->
      <div class="entity-hint" aria-live="polite">
        {#if entityNameField}
          <span class="muted">
            Reading entity names from
            <strong class="entity-col">{entityNameField}</strong>{#if entityNameOverridden} <span class="muted">(your override)</span>{/if}
          </span>
        {:else}
          <span class="muted entity-warn">No entity-name column inferred — pick one:</span>
        {/if}
        {#if !entityNamePickerOpen}
          <button
            type="button"
            class="entity-change"
            onclick={() => (entityNamePickerOpen = true)}
          >change ›</button>
        {/if}
        {#if entityNamePickerOpen || !entityNameField}
          <select
            class="entity-select"
            value={entityNameField}
            onchange={(e) => commitEntityNameOverride((e.currentTarget as HTMLSelectElement).value)}
          >
            <option value="" disabled>— pick a column —</option>
            {#each columns as col (col)}
              <option value={col}>{col}</option>
            {/each}
          </select>
        {/if}
      </div>

      <section class="card">
        <h3>2 · Rows to fire against ({selectedRowCount}/{rowsForSelected.length})</h3>
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
            <li class="row-line">
              <label class="row-label">
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
              {#if palettePacks.length > 0}
                <span class="row-palette">
                  <ConnectorPalette
                    row_id={row.row_id}
                    packs={palettePacks}
                    {inventory}
                    accepted_pack_ids={new Set()}
                    busy_pack_ids={busyPacksForRow(row.row_id)}
                    result_counts={Object.fromEntries(
                      [...firedPacksForRow(row.row_id)].map((p) => [p, 1]),
                    )}
                    on_fire={(pack_id, connector_id) =>
                      void fireOneRow(row, pack_id, connector_id)}
                  />
                </span>
              {/if}
            </li>
          {/each}
          {#if visibleRows.length === 0}
            <li class="muted empty-row">no rows match this filter</li>
          {/if}
        </ul>
      </section>

      <section class="card">
        <h3>3 · Bundle</h3>
        <p class="muted hint">
          A bundle is a named composition of packs with a default roster.
          Pick one to set what fires; tune the roster below if you need to.
        </p>
        <select
          class="bundle-select"
          value={activeBundleId}
          onchange={(e) => selectBundle((e.currentTarget as HTMLSelectElement).value)}
          aria-label="Bundle"
        >
          {#each BUNDLES as b (b.bundle_id)}
            <option value={b.bundle_id} title={b.description}>
              {b.display_name}
            </option>
          {/each}
        </select>
        <p class="muted bundle-desc">{activeBundle.description}</p>
      </section>

      <section class="card">
        <h3>4 · Roster ({enabledPackCount}/{rosterSize})</h3>
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
        <!-- Target-column line (spec Decision §9): name what gets richer
             when responses are accepted. Always visible when there are
             rows in scope; reads "Augmenting `socials` on 67 rows" so the
             user knows the property they're improving. -->
        {#if cellsToFire > 0 || firing}
          <p class="muted fire-sub fire-target">
            Augmenting
            {#each targetColumns as col, i (col)}<code class="target-col">{col}</code>{#if i < targetColumns.length - 1}, {/if}{/each}
            on {selectedRowCount} {selectedRowCount === 1 ? 'row' : 'rows'}
          </p>
        {/if}
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
