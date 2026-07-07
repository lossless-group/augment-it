<script lang="ts">
  // The write half of the Augment-from-Affiliations CSV round-trip. Reimport
  // a rating-edited CSV (uploaded through the existing Record Collector
  // path), map columns once, then write relevance/relevance_note onto each
  // row's `affiliations` edge via affiliation.rate. No match/create — every
  // row's person + org already exist in canonical; this only resolves the
  // lookup key (person_uuid, org_slug) and writes the rating. See
  // context-v/specs/Augment-From-Affiliations.md.

  import { onMount } from 'svelte';
  import { workspace, type RecordSet, type Row } from '@augment-it/workspace';
  import ColumnMapper from './components/ColumnMapper.svelte';
  import { normalizeRatingRecord, guessMapping, MAPPING_NONE } from './lib/normalize';
  import { rateAffiliation } from './lib/resolver-client';
  import type { RatingFieldMapping, RatingNormRecord } from './lib/types';

  const TOKEN_KEY = 'augment-it:session-token';
  const WS_URL = 'ws://localhost:3001/ws';
  const ACTIVE_RECORD_SET_KEY = 'augment-it:active-record-set';
  const MAPPING_KEY_PREFIX = 'augment-it:affiliation-rating-resolver:mapping:';

  let status = $state<'connecting' | 'open' | 'closed' | 'error'>('connecting');
  let client = $state<string>('reach-edu');

  let recordSets = $state<RecordSet[]>([]);
  let selectedRecordSetId = $state<string | null>(
    typeof localStorage !== 'undefined' ? localStorage.getItem(ACTIVE_RECORD_SET_KEY) : null,
  );
  let rows = $state<Row[]>([]);
  let idx = $state<number>(0);

  let mapping = $state<RatingFieldMapping | null>(null);
  let showMapper = $state(false);

  let rowBusy = $state(false);
  let rowError = $state<string | null>(null);
  let rowResult = $state<{ relevance: string } | null>(null);

  let bulkRunning = $state(false);
  let bulkApplied = $state(0);
  let bulkSkippedBlank = $state(0);
  let bulkFlagged = $state<{ row: number; person: string | null; error: string }[]>([]);

  const selectedSet = $derived(
    selectedRecordSetId ? recordSets.find((rs) => rs.record_set_id === selectedRecordSetId) ?? null : null,
  );
  const columns = $derived(selectedSet?.schema.fields.map((f) => f.name) ?? []);
  const current = $derived(idx >= 0 && idx < rows.length ? rows[idx] : null);
  const record = $derived<RatingNormRecord | null>(
    current && mapping ? normalizeRatingRecord(current.fields as Record<string, unknown>, mapping) : null,
  );

  function onWorkspaceChanged(e: Event) {
    const detail = (e as CustomEvent).detail as { client_id?: string } | undefined;
    if (detail?.client_id) client = detail.client_id;
    else void loadActiveClient();
    rows = [];
    idx = 0;
    resetRowState();
    void loadRecordSets();
  }

  // Fired by Record Collector (and any other remote) when the shared
  // "active record set" changes — e.g. right after an upload. Without this,
  // a remote that mounted earlier stays on whatever record_set_id was in
  // localStorage at mount time, ignoring anything uploaded after. Same fix
  // record-db-resolver already needed once (it was missing this same
  // listener) — copying it here rather than rediscovering it.
  function onActiveRecordSetChange(e: Event) {
    const detail = (e as CustomEvent).detail as { record_set_id?: string } | undefined;
    if (!detail?.record_set_id) return;
    selectedRecordSetId = detail.record_set_id;
    void loadRecordSets();
  }

  onMount(() => {
    workspace.connect({
      url: WS_URL,
      getToken: () => localStorage.getItem(TOKEN_KEY),
      saveToken: (t) => localStorage.setItem(TOKEN_KEY, t),
      onStatus: (s) => (status = s),
    });
    void loadActiveClient();
    void loadRecordSets();
    window.addEventListener('augment-it:workspace-changed', onWorkspaceChanged);
    window.addEventListener('augment-it:active-record-set-changed', onActiveRecordSetChange);
    return () => {
      window.removeEventListener('augment-it:workspace-changed', onWorkspaceChanged);
      window.removeEventListener('augment-it:active-record-set-changed', onActiveRecordSetChange);
    };
  });

  async function loadActiveClient() {
    try {
      const r = (await workspace.invoke('workspace.active', {})) as { active_client_id?: string };
      if (r?.active_client_id) client = r.active_client_id;
    } catch {
      /* keep default */
    }
  }

  async function loadRecordSets() {
    try {
      const r = (await workspace.invoke('record_set.list', {})) as { record_sets: RecordSet[] };
      recordSets = r.record_sets.filter((rs) => !rs.archived);
      if (selectedRecordSetId && recordSets.some((rs) => rs.record_set_id === selectedRecordSetId)) {
        await selectRecordSet(selectedRecordSetId);
      }
    } catch (err) {
      console.error('record_set.list', err);
    }
  }

  async function selectRecordSet(record_set_id: string) {
    selectedRecordSetId = record_set_id;
    if (typeof localStorage !== 'undefined') localStorage.setItem(ACTIVE_RECORD_SET_KEY, record_set_id);
    rows = [];
    idx = 0;
    resetRowState();
    resetBulkState();
    loadMapping(record_set_id);
    try {
      const r = (await workspace.invoke('row.list', { record_set_id })) as { rows: Row[] };
      rows = r.rows.filter((row) => !(row.fields as Record<string, unknown>).archived);
    } catch (err) {
      console.error('row.list', err);
    }
  }

  function loadMapping(record_set_id: string) {
    const key = `${MAPPING_KEY_PREFIX}${record_set_id}`;
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    if (stored) {
      try {
        mapping = JSON.parse(stored) as RatingFieldMapping;
        showMapper = false;
        return;
      } catch {
        /* fall through to re-guess */
      }
    }
    mapping = guessMapping(columns);
    showMapper = true;
  }

  function saveMapping(m: RatingFieldMapping) {
    mapping = m;
    showMapper = false;
    if (selectedRecordSetId && typeof localStorage !== 'undefined') {
      localStorage.setItem(`${MAPPING_KEY_PREFIX}${selectedRecordSetId}`, JSON.stringify(m));
    }
  }

  function resetRowState() {
    rowBusy = false;
    rowError = null;
    rowResult = null;
  }
  function resetBulkState() {
    bulkRunning = false;
    bulkApplied = 0;
    bulkSkippedBlank = 0;
    bulkFlagged = [];
  }

  async function applyCurrent() {
    if (!record || !record.relevance) return;
    rowBusy = true;
    rowError = null;
    try {
      const r = await rateAffiliation({
        person_uuid: record.person_uuid,
        org_slug: record.org_slug,
        relevance: record.relevance,
        relevance_note: record.relevance_note,
        client,
      });
      rowResult = { relevance: r.relevance };
    } catch (err) {
      rowError = err instanceof Error ? err.message : String(err);
    } finally {
      rowBusy = false;
    }
  }

  function advance() {
    idx = Math.min(idx + 1, rows.length);
    resetRowState();
  }
  function back() {
    idx = Math.max(0, idx - 1);
    resetRowState();
  }

  // Bulk pass — the operator already made every judgment call in the
  // spreadsheet; this is a mechanical write pass, not a review UI. Still
  // flags rather than swallows anything that fails (unrecognized relevance
  // value, no matching affiliation edge) — same discipline as the per-row
  // path, just run without stopping to click through 61 rows one at a time.
  async function applyAllRemaining() {
    if (!mapping) return;
    bulkRunning = true;
    bulkApplied = 0;
    bulkSkippedBlank = 0;
    bulkFlagged = [];
    for (let i = idx; i < rows.length; i += 1) {
      const rec = normalizeRatingRecord(rows[i].fields as Record<string, unknown>, mapping);
      if (!rec.relevance) {
        bulkSkippedBlank += 1;
        continue;
      }
      try {
        await rateAffiliation({
          person_uuid: rec.person_uuid,
          org_slug: rec.org_slug,
          relevance: rec.relevance,
          relevance_note: rec.relevance_note,
          client,
        });
        bulkApplied += 1;
      } catch (err) {
        bulkFlagged.push({
          row: i + 1,
          person: rec.person_name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    idx = rows.length;
    bulkRunning = false;
  }
</script>

<div class="arr-app">
  <header class="arr-header">
    <div class="arr-title-row">
      <h1 class="arr-title">Affiliation · Rating Resolver</h1>
      <span class="arr-client">client: <strong>{client}</strong></span>
      <span class="arr-ws status-{status}">{status}</span>
    </div>
    <div class="arr-setpick">
      <label for="arr-set">record set</label>
      <select
        id="arr-set"
        bind:value={selectedRecordSetId}
        onchange={() => selectedRecordSetId && void selectRecordSet(selectedRecordSetId)}
      >
        <option value={null}>— pick the reimported ratings record set —</option>
        {#each recordSets as rs (rs.record_set_id)}
          <option value={rs.record_set_id}>{rs.name} ({rs.row_ids.length} rows)</option>
        {/each}
      </select>
      {#if rows.length}
        <span class="arr-progress">{Math.min(idx + 1, rows.length)} / {rows.length}</span>
        <button type="button" class="arr-btn" onclick={() => (showMapper = true)}>edit column mapping</button>
      {/if}
    </div>
  </header>

  <main class="arr-body">
    {#if !selectedSet}
      <div class="arr-card arr-muted">
        Pick the record set created by uploading the edited ratings CSV (from
        <code>scripts/export-affiliation-ratings-csv.mjs</code>) through Record Collector.
      </div>
    {:else if showMapper && mapping}
      <ColumnMapper
        recordSetName={selectedSet.name}
        {columns}
        {mapping}
        onSave={saveMapping}
        onCancel={() => (showMapper = false)}
        onPickDifferent={() => {
          selectedRecordSetId = null;
          if (typeof localStorage !== 'undefined') localStorage.removeItem(ACTIVE_RECORD_SET_KEY);
          rows = [];
          idx = 0;
          mapping = null;
          showMapper = false;
          resetRowState();
        }}
      />
    {:else if mapping}
      <div class="arr-actions">
        <button type="button" class="arr-btn arr-btn-primary" disabled={bulkRunning} onclick={applyAllRemaining}>
          {bulkRunning ? 'applying…' : `apply all remaining ratings (from row ${idx + 1})`}
        </button>
      </div>

      {#if bulkApplied || bulkSkippedBlank || bulkFlagged.length}
        <div class="arr-card arr-bulk-summary">
          <div class="arr-summary">
            <span class="arr-summary-ok">✓ {bulkApplied} applied</span>
            <span class="arr-muted">· {bulkSkippedBlank} left blank in the CSV (untouched)</span>
            {#if bulkFlagged.length}<span class="arr-summary-flag">· {bulkFlagged.length} flagged</span>{/if}
          </div>
          {#if bulkFlagged.length}
            <ul class="arr-flag-list">
              {#each bulkFlagged as f}
                <li class="arr-error">row {f.row}{f.person ? ` (${f.person})` : ''}: {f.error}</li>
              {/each}
            </ul>
          {/if}
        </div>
      {/if}

      {#if !current}
        <div class="arr-card">
          <h3>All done</h3>
          <p class="arr-muted">No more rows in this set. ← back to revisit.</p>
          <button type="button" class="arr-btn" onclick={back} disabled={idx === 0}>← back</button>
        </div>
      {:else if record}
        <div class="arr-card">
          <div class="arr-row-head">
            <h3 class="arr-row-title">{record.person_name ?? record.person_uuid}</h3>
            <span class="arr-row-org">{record.org_name ?? record.org_slug}</span>
          </div>

          <div class="arr-field">
            <span class="arr-label">relevance (from CSV)</span>
            {#if record.relevance}
              <span class="arr-value">{record.relevance}</span>
            {:else}
              <span class="arr-muted">— left blank in the CSV, skipping this row —</span>
            {/if}
          </div>
          {#if record.relevance_note}
            <div class="arr-field">
              <span class="arr-label">note</span>
              <span class="arr-value">{record.relevance_note}</span>
            </div>
          {/if}

          {#if rowError}<div class="arr-error">{rowError}</div>{/if}

          {#if rowResult}
            <div class="arr-result">
              <div class="arr-result-head">✓ applied — <strong>{rowResult.relevance}</strong></div>
            </div>
          {:else if record.relevance}
            <button type="button" class="arr-btn arr-btn-primary" disabled={rowBusy} onclick={applyCurrent}>
              apply this rating
            </button>
          {/if}
        </div>

        <div class="arr-actions">
          <button type="button" class="arr-btn" onclick={back} disabled={idx === 0}>← back</button>
          <span class="arr-spacer"></span>
          <button type="button" class="arr-btn arr-btn-primary" onclick={advance}>next →</button>
        </div>
      {/if}
    {/if}
  </main>
</div>
