<script lang="ts">
  // Enhanced Records List — the checkpoint surface between enrichment passes.
  //
  // v0.0.1 reality (per recon 2026-05-23):
  //   - record_uuid is not yet on rows; we group by parent-row position
  //   - triage_states is not yet cemented; we read flag from latest response
  //   - The Promote button is a placeholder — the consolidation script
  //     (a one-time backfill that produces the canonical set) is the
  //     actual implementation. Spec'd separately.
  //
  // What v0.0.1 ships: the table view — every record across the parent +
  // its derivations, latest-non-null-wins, sortable, with a filter row
  // and the helpful_links count. The promotion mechanic lands in v0.0.2.

  import { onMount } from 'svelte';
  import { workspace } from '@augment-it/workspace';
  import {
    enhancedState,
    buildEnhancedRecords,
    gatherDerivedSets,
    type EnhancedRecord,
  } from './state.svelte';

  let connectionStatus = $state<'connecting' | 'open' | 'closed' | 'error'>('connecting');
  let loadedOnce = $state<boolean>(false);

  // ---- Connect + bootstrap data load ----
  onMount(() => {
    const TOKEN_KEY = 'augment_it_session_token';
    workspace.connect({
      url: 'ws://localhost:3001/ws',
      getToken: () => localStorage.getItem(TOKEN_KEY),
      saveToken: (t) => localStorage.setItem(TOKEN_KEY, t),
      onStatus: (s) => {
        connectionStatus = s;
        if (s === 'open' && !loadedOnce) {
          void primeData();
        }
      },
    });
  });

  async function primeData(): Promise<void> {
    loadedOnce = true;
    try {
      // Fire and forget — workspace ingests broadcasts.
      const sets = (await workspace.invoke('record_set.list', {})) as {
        record_sets?: { record_set_id: string; [k: string]: unknown }[];
      };
      const rows = (await workspace.invoke('row.list', {})) as {
        rows?: { row_id: string; [k: string]: unknown }[];
      };
      // Push into workspace state — workspace's transport doesn't
      // populate these on its own (broadcasts only). Done locally so the
      // $derived below has data to fold.
      if (sets.record_sets) {
        for (const rs of sets.record_sets) {
          // @ts-expect-error — workspace.record_sets is a typed map; capability returns same shape
          workspace.record_sets[rs.record_set_id] = rs;
        }
      }
      if (rows.rows) {
        for (const r of rows.rows) {
          // @ts-expect-error — workspace.rows is a typed map
          workspace.rows[r.row_id] = r;
        }
      }
      enhancedState.autoPickParent();
    } catch (err) {
      console.error('enhanced-records-list: bootstrap failed', err);
    }
  }

  // ---- Derived: the unified records list ----
  const records = $derived.by<EnhancedRecord[]>(() => {
    const pid = enhancedState.active_parent_id;
    if (!pid) return [];
    const parent = workspace.record_sets[pid];
    if (!parent) return [];
    const derivedSets = gatherDerivedSets(pid, workspace.record_sets);
    return buildEnhancedRecords(parent, derivedSets, workspace.rows);
  });

  const parentSet = $derived(
    enhancedState.active_parent_id ? workspace.record_sets[enhancedState.active_parent_id] : null,
  );

  // ---- Available parent sets to choose from ----
  // Both raw CSV uploads AND promoted canonicals can be parents — a
  // promoted set becomes the starting point for the NEXT round of
  // enrichment. Archived sets are excluded from the default picker.
  const candidateParents = $derived(
    Object.values(workspace.record_sets).filter((rs) => {
      if (rs.archived) return false;
      const src = rs.schema?.source as { kind?: string } | undefined;
      return src?.kind === 'csv' || src?.kind === 'promotion';
    }),
  );

  // ---- The enrichment column names ----
  // Every key present in any record's fields that isn't already a parent
  // CSV column becomes a visible column. NO hardcoded field-name filters.
  // The invariant: ALL content in store/state must end up visible — the
  // surface doesn't decide what's "internal" vs "user data". Whatever the
  // upstream stores have, the user sees.
  const enrichmentColumns = $derived.by<string[]>(() => {
    if (!parentSet) return [];
    const parentCols = new Set(parentSet.schema.fields.map((f) => f.name));
    const seen = new Set<string>();
    for (const r of records) {
      for (const k of Object.keys(r.latest_fields)) {
        if (parentCols.has(k)) continue;
        seen.add(k);
      }
    }
    return [...seen];
  });

  // Generic cell formatter — type-based, NOT field-name-based. Whatever's
  // in row.fields gets rendered the same way regardless of key:
  //   - null / undefined / '' → empty cell
  //   - object or array → JSON-stringified (the user reads JSON; no special UI)
  //   - everything else → toString
  function formatCell(value: unknown): string {
    if (value === null || value === undefined || value === '') return '';
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    return String(value);
  }

  function originBadge(rec: EnhancedRecord): string {
    if (rec.underlying_row_ids.length <= 1) return 'parent only';
    return `+${rec.underlying_row_ids.length - 1} derivation${rec.underlying_row_ids.length > 2 ? 's' : ''}`;
  }

  // ---- Promotion ----
  let promoting = $state<boolean>(false);
  let promoteError = $state<string | null>(null);
  // Set on a successful promote. Drives the success banner that takes
  // over the surface until the user dismisses it — the silent state-flip
  // we shipped first felt like the app died.
  type PromoteSuccess = {
    canonicalName: string;
    canonicalId: string;
    rowCount: number;
    colCount: number;
    archivedCount: number;
  };
  let promoteSuccess = $state<PromoteSuccess | null>(null);

  async function promote(): Promise<void> {
    const pid = enhancedState.active_parent_id;
    if (!pid || promoting) return;
    const parentName = workspace.record_sets[pid]?.name ?? 'this set';
    const confirmed = window.confirm(
      `Promote ${records.length} records from "${parentName}" into a new canonical set?\n\n` +
        `This folds every derivation's columns + values into a single snapshot, mints record_uuid where missing, ` +
        `and archives the source + all its derivations.`,
    );
    if (!confirmed) return;
    promoting = true;
    promoteError = null;
    promoteSuccess = null;
    try {
      const result = (await workspace.invoke('record_set.promote', {
        source_record_set_id: pid,
      })) as {
        record_set?: {
          record_set_id: string;
          name: string;
          row_ids: string[];
          schema: { fields: { name: string; order: number }[]; source: unknown };
          archived?: boolean;
          [k: string]: unknown;
        };
        rows?: { row_id: string; record_set_id: string; fields: Record<string, unknown> }[];
        archived?: number;
        ok?: boolean;
        error?: string;
      };
      if (result.error || !result.record_set) {
        promoteError = result.error ?? 'unknown error';
        return;
      }
      // Refresh the full set list — the promote handler archived the
      // predecessors server-side; we want our local view to reflect that.
      await primeData();
      // Push the new canonical + its rows into local state explicitly so
      // the user doesn't have to wait for the broadcast/race to settle.
      const canonical = result.record_set;
      // @ts-expect-error — workspace.record_sets is a typed map
      workspace.record_sets[canonical.record_set_id] = canonical;
      if (result.rows) {
        for (const r of result.rows) {
          workspace.rows[r.row_id] = r;
        }
      }
      enhancedState.active_parent_id = canonical.record_set_id;
      promoteSuccess = {
        canonicalName: canonical.name,
        canonicalId: canonical.record_set_id,
        rowCount: canonical.row_ids.length,
        colCount: canonical.schema.fields.length,
        archivedCount: result.archived ?? 0,
      };
    } catch (err: unknown) {
      promoteError = err instanceof Error ? err.message : String(err);
    } finally {
      promoting = false;
    }
  }

  function dismissSuccess(): void {
    promoteSuccess = null;
  }

  // "Do another round" starts the next enrichment pass: send the user to
  // Prompt Templates via the shell's cross-remote navigate event (shell
  // defaults the mode to 'full'), then clear the banner.
  function anotherRound(): void {
    window.dispatchEvent(
      new CustomEvent('augment-it:navigate', {
        detail: { remoteId: 'promptTemplateManager' },
      }),
    );
    promoteSuccess = null;
  }

  const canPromote = $derived(records.length > 0 && !promoting && connectionStatus === 'open');
</script>

<div class="erl-app">
  <div class="erl-status" class:open={connectionStatus === 'open'}>
    enhanced-records-list · {connectionStatus}
    {#if parentSet}
      · {records.length} records · source: <strong>{parentSet.name}</strong>
    {/if}
  </div>

  {#if candidateParents.length > 1}
    <div class="erl-parent-picker">
      <label for="parent">Parent set:</label>
      <select id="parent" bind:value={enhancedState.active_parent_id}>
        {#each candidateParents as p (p.record_set_id)}
          <option value={p.record_set_id}>{p.name} ({p.row_ids.length} rows)</option>
        {/each}
      </select>
    </div>
  {/if}

  <!-- Filter row stubbed. v0.0.1 ships sortable table; filters land in v0.0.2. -->
  <div class="erl-filters">
    <span class="filter-chip active">all {records.length}</span>
    <span class="filter-chip disabled">unflagged 0</span>
    <span class="filter-chip disabled">good 0</span>
    <span class="filter-chip disabled">needs-human 0</span>
    <span class="filter-chip disabled">has-edits 0</span>
    <span class="filter-chip disabled">has-links 0</span>
    <span class="filter-row-note">filter chips wire to triage_states in v0.0.2</span>
  </div>

  {#if promoteSuccess}
    <div class="erl-success-banner">
      <div class="success-icon" aria-hidden="true">✓</div>
      <div class="success-body">
        <div class="success-title">Promoted to a new canonical set</div>
        <div class="success-name">{promoteSuccess.canonicalName}</div>
        <div class="success-meta">
          <strong>{promoteSuccess.rowCount}</strong> records ·
          <strong>{promoteSuccess.colCount}</strong> columns ·
          archived <strong>{promoteSuccess.archivedCount}</strong> predecessor set{promoteSuccess.archivedCount === 1 ? '' : 's'}
        </div>
        <div class="success-actions">
          <button class="success-primary" onclick={anotherRound}>
            Do another round of enhancements →
          </button>
          <button class="success-secondary" onclick={dismissSuccess}>
            Continue working with this canonical
          </button>
        </div>
        <div class="success-howto">
          Next: open <strong>Prompt Templates</strong>, author a new prompt, then click
          <strong>Apply →</strong> and pick this canonical as the target. Each round adds new columns + values
          to the next canonical.
        </div>
      </div>
    </div>
  {/if}

  <div class="erl-table-wrap">
    {#if records.length === 0}
      <div class="erl-empty">
        {#if connectionStatus !== 'open'}
          connecting to workspace…
        {:else if !parentSet}
          no parent record set selected
        {:else}
          no records in {parentSet.name}
        {/if}
      </div>
    {:else}
      <table class="erl-table">
        <thead>
          <tr>
            <th class="col-check"><input type="checkbox" disabled /></th>
            <th class="col-identity">identity</th>
            {#each enrichmentColumns as col (col)}
              <th class="col-enriched">{col}</th>
            {/each}
            <th class="col-origin">origin</th>
          </tr>
        </thead>
        <tbody>
          {#each records as rec (rec.key)}
            {@const formatted = (col: string) => formatCell(rec.latest_fields[col])}
            <tr>
              <td class="col-check"><input type="checkbox" disabled /></td>
              <td class="col-identity">{rec.identity}</td>
              {#each enrichmentColumns as col (col)}
                <td class="col-enriched" title={formatted(col)}>{formatted(col)}</td>
              {/each}
              <td class="col-origin">{originBadge(rec)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>

  <div class="erl-action-bar">
    <button
      class="promote-btn"
      disabled={!canPromote}
      onclick={() => promote()}
      title={canPromote ? 'Snapshot every record into a new canonical set; archive the source' : 'Loading…'}
    >
      {promoting ? '…promoting' : `✓ Promote ${records.length} records to new canonical set`}
    </button>
    {#if promoteError}
      <span class="erl-error">promote failed: {promoteError}</span>
    {:else}
      <span class="erl-note">
        Promote snapshots the current state, mints record_uuids where missing, and archives the source.
        Triage-state cementing + per-record archive in v0.0.2.
      </span>
    {/if}
  </div>
</div>
