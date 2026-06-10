<script lang="ts">
  // Sort & Filter Lens — the first Lens to ship in augment-it. Member of
  // the AUGMENT composite alongside promptTemplateManager and packRunner.
  // Renders the active record set as a sorted list so the operator can
  // build their tier-2 worklist (records with URL + socials + thin
  // corpus, sorted by corpus_count ascending) before swapping back to
  // Pack Firing to act on it. Filter affordances land in v0.0.0.4 of the
  // spec — this v0.0.0.3 ships sort only.
  //
  // Spec: ../../../context-v/specs/Records-Surface-Sort-Step-and-UI.md

  import { onMount } from 'svelte';
  import { workspace, type RecordSet, type Row } from '@augment-it/workspace';
  import {
    type SortSpec,
    type SortKey,
    DERIVED_COLUMNS,
    applySort,
    loadSortSpec,
    saveSortSpec,
  } from './sort-spec';

  const TOKEN_KEY = 'augment-it:session-token';
  const WS_URL = 'ws://localhost:3001/ws';
  const ACTIVE_RECORD_SET_KEY = 'augment-it:active-record-set';
  const CLIENT_ID = 'reach-edu';

  let recordSets = $state<RecordSet[]>([]);
  let selectedRecordSetId = $state<string | null>(
    typeof localStorage !== 'undefined' ? localStorage.getItem(ACTIVE_RECORD_SET_KEY) : null,
  );
  let rows = $state<Row[]>([]);
  let sortSpec = $state<SortSpec>({ sort: [] });
  let corpusByRowId = $state<Record<string, number>>({});
  let loading = $state(false);
  let error = $state('');
  let pickerOpen = $state(false);

  // Per-row corpus-add state. Open row = the one with its add-area
  // expanded; one at a time keeps the list scannable.
  let openAddRowId = $state<string | null>(null);
  let urlDraftByRowId = $state<Record<string, string>>({});
  let addBusyRowId = $state<string>('');
  let addErrorByRowId = $state<Record<string, string>>({});
  let addJustDoneByRowId = $state<Record<string, string>>({});  // row_id → ISO timestamp of last successful add

  const selectedRecordSet = $derived(
    selectedRecordSetId
      ? recordSets.find((rs) => rs.record_set_id === selectedRecordSetId) ?? null
      : null,
  );

  // Spine columns from the active record set's schema, plus the system
  // columns the snapshot promoter appends, plus the derived virtual
  // columns the sort-spec resolver knows how to compute.
  const sortableColumns = $derived.by(() => {
    const out: { group: string; name: string; display: string }[] = [];
    if (selectedRecordSet) {
      for (const f of selectedRecordSet.schema.fields) {
        out.push({ group: 'Spine', name: f.name, display: f.name });
      }
    }
    for (const d of DERIVED_COLUMNS) {
      out.push({ group: 'Derived', name: d, display: d.replace(/_/g, ' ') });
    }
    return out;
  });

  const sortedRows = $derived.by(() => {
    if (!rows.length) return rows;
    return applySort(rows, sortSpec, (rid) => corpusByRowId[rid] ?? 0);
  });

  function corpusCountFor(rid: string): number {
    return corpusByRowId[rid] ?? 0;
  }

  function urlText(row: Row): string {
    const u = row.fields.url;
    return typeof u === 'string' ? u : '';
  }

  function socialsSummary(row: Row): string {
    const s = row.fields.socials;
    if (Array.isArray(s)) return `${s.length} social`;
    if (s && typeof s === 'object') return `${Object.keys(s).length} social`;
    if (typeof s === 'string' && s.trim().length > 0 && s.trim() !== 'unknown') {
      try {
        const p = JSON.parse(s);
        if (Array.isArray(p)) return `${p.length} social`;
        if (p && typeof p === 'object') return `${Object.keys(p).length} social`;
      } catch {
        return '— socials';
      }
    }
    return '';
  }

  function nameOf(row: Row): string {
    // Try the first schema field; for the pipeline tracker that's
    // "Prospect / Organization".
    const first = selectedRecordSet?.schema.fields[0]?.name;
    if (first) {
      const v = row.fields[first];
      if (typeof v === 'string' && v.trim()) return v;
    }
    return row.row_id;
  }

  // --- Sort manipulation ---

  function addSortKey(column: string): void {
    if (sortSpec.sort.length >= 3) return;     // v1 surface cap (spec §sort-spec)
    if (sortSpec.sort.some((k) => k.column === column)) return;
    const next = [...sortSpec.sort, { column, direction: 'asc' as const, empty_position: 'last' as const }];
    sortSpec = { sort: next };
    persist();
  }

  function toggleDirection(idx: number): void {
    const next = sortSpec.sort.map((k, i) => (i === idx ? { ...k, direction: k.direction === 'asc' ? 'desc' as const : 'asc' as const } : k));
    sortSpec = { sort: next };
    persist();
  }

  function removeSortKey(idx: number): void {
    sortSpec = { sort: sortSpec.sort.filter((_, i) => i !== idx) };
    persist();
  }

  function resetSort(): void {
    sortSpec = { sort: [] };
    persist();
  }

  function persist(): void {
    if (selectedRecordSetId) saveSortSpec(selectedRecordSetId, sortSpec);
  }

  // --- Boot + data ---

  async function loadRecordSets(): Promise<void> {
    try {
      const r = (await workspace.invoke('record_set.list', {})) as { record_sets: RecordSet[] };
      recordSets = r.record_sets.filter((rs) => !rs.archived);
      if (!selectedRecordSetId && recordSets.length > 0) {
        selectedRecordSetId = recordSets[0].record_set_id;
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(ACTIVE_RECORD_SET_KEY, selectedRecordSetId);
        }
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  async function loadRows(record_set_id: string): Promise<void> {
    loading = true;
    error = '';
    try {
      const r = (await workspace.invoke('row.list', { record_set_id })) as { rows: Row[] };
      rows = r.rows;
      sortSpec = loadSortSpec(record_set_id);
      // Fan out corpus counts (one per row). Don't await sequentially —
      // these can race; the UI updates as each lands.
      corpusByRowId = {};
      for (const row of r.rows) {
        void refreshCorpusForRow(row.row_id);
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  }

  async function refreshCorpusForRow(row_id: string): Promise<void> {
    try {
      const reply = (await workspace.invoke('corpus.list_for_record', {
        client_id: CLIENT_ID,
        record_id: row_id,
      })) as { entries?: unknown[] };
      const count = Array.isArray(reply.entries) ? reply.entries.length : 0;
      corpusByRowId = { ...corpusByRowId, [row_id]: count };
    } catch {
      // soft-fail — chip shows 0
    }
  }

  function selectRecordSet(id: string): void {
    selectedRecordSetId = id;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(ACTIVE_RECORD_SET_KEY, id);
    }
    void loadRows(id);
  }

  // --- Per-row corpus add (the hand-search rhythm) ---

  // Match the content-reader / backend slugify rule so a row that
  // already has a corpus directory keeps writing into the same folder.
  function funderSlugFor(name: string, fallback: string): string {
    const base = (name || fallback).trim();
    return base
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
      .replace(/-+$/g, '');
  }

  function toggleAddRow(row_id: string): void {
    openAddRowId = openAddRowId === row_id ? null : row_id;
    if (openAddRowId === row_id) {
      addErrorByRowId = { ...addErrorByRowId, [row_id]: '' };
    }
  }

  async function addUrlToCorpus(row: Row): Promise<void> {
    const url = (urlDraftByRowId[row.row_id] ?? '').trim();
    if (!url) return;
    if (addBusyRowId) return;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      addErrorByRowId = { ...addErrorByRowId, [row.row_id]: 'not a valid URL' };
      return;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      addErrorByRowId = { ...addErrorByRowId, [row.row_id]: `unsupported protocol: ${parsed.protocol}` };
      return;
    }
    addBusyRowId = row.row_id;
    addErrorByRowId = { ...addErrorByRowId, [row.row_id]: '' };
    try {
      // Step 1 — preview the URL via Jina to get a real title + a
      // synthetic response_id corpus.add can hang the response onto.
      const previewReply = (await workspace.invoke('content_ingest.preview_url', {
        record_id: row.row_id,
        url,
      })) as {
        preview?: {
          response_id: string;
          status: string;
          title?: string;
          exact_url: string;
        };
        ok?: false;
        error?: string;
      };
      if (previewReply.ok === false || !previewReply.preview) {
        throw new Error(previewReply.error ?? 'preview failed');
      }
      const p = previewReply.preview;
      if (p.status !== 'ready') {
        throw new Error('Jina could not fetch the URL — paste a different one or save to inbox via /inbox in chat');
      }
      // Step 2 — write to corpus/<funder-slug>/. funder_slug derives
      // from the prospect name; pack_id is 'manual' so these are
      // distinguishable from pack-fired captures in the by_pack roll-up.
      const slug = funderSlugFor(nameOf(row), row.row_id);
      const addReply = (await workspace.invoke('corpus.add', {
        client_id: CLIENT_ID,
        record_id: row.row_id,
        response_id: p.response_id,
        title: p.title ?? url,
        tags: [],
        exact_url: url,
        funder_slug: slug,
        pack_id: 'manual',
      })) as { corpus_path?: string; written_at?: string; ok?: false; error?: string };
      if (addReply.ok === false) {
        throw new Error(addReply.error ?? 'corpus.add failed');
      }
      // Step 3 — tick up the corpus chip and clear the input. Keep the
      // row expanded so the operator can paste the next URL in their
      // search results immediately (paste-paste-paste rhythm).
      void refreshCorpusForRow(row.row_id);
      urlDraftByRowId = { ...urlDraftByRowId, [row.row_id]: '' };
      addJustDoneByRowId = { ...addJustDoneByRowId, [row.row_id]: new Date().toISOString() };
    } catch (err) {
      addErrorByRowId = {
        ...addErrorByRowId,
        [row.row_id]: err instanceof Error ? err.message : String(err),
      };
    } finally {
      addBusyRowId = '';
    }
  }

  onMount(() => {
    workspace.connect({
      url: WS_URL,
      getToken: () => localStorage.getItem(TOKEN_KEY),
      saveToken: (t) => localStorage.setItem(TOKEN_KEY, t),
    });
    void loadRecordSets();

    const onActiveRecordSetChange = (e: Event): void => {
      const detail = (e as CustomEvent).detail as { record_set_id?: string } | undefined;
      const next = detail?.record_set_id;
      if (next && next !== selectedRecordSetId) {
        selectRecordSet(next);
      }
    };
    window.addEventListener('augment-it:active-record-set-changed', onActiveRecordSetChange);
    return () => {
      window.removeEventListener('augment-it:active-record-set-changed', onActiveRecordSetChange);
    };
  });

  // Reload rows whenever the selected record set changes.
  $effect(() => {
    if (selectedRecordSetId) void loadRows(selectedRecordSetId);
  });
</script>

<div class="sort-filter-lens">
  <header class="lens-header">
    <div class="lens-title">
      <span class="lens-badge">Lens</span>
      <h2>Sort &amp; Filter</h2>
      <span class="muted lens-sub">re-order the active record set; filter coming v0.0.0.4</span>
    </div>
    <div class="record-set-picker">
      {#if selectedRecordSet}
        <button class="picker-btn" onclick={() => (pickerOpen = !pickerOpen)} title="Switch record set">
          <span class="picker-name">{selectedRecordSet.name}</span>
          <span class="picker-meta">{rows.length} rows · {selectedRecordSet.schema.fields.length} cols</span>
          <span class="picker-caret">{pickerOpen ? '▴' : '▾'}</span>
        </button>
      {:else}
        <button class="picker-btn" onclick={() => (pickerOpen = !pickerOpen)}>
          <span class="picker-name">pick a record set</span>
          <span class="picker-caret">▾</span>
        </button>
      {/if}
      {#if pickerOpen}
        <div class="picker-popover" role="menu">
          {#each recordSets as rs (rs.record_set_id)}
            <button
              type="button"
              class="picker-row"
              class:active={rs.record_set_id === selectedRecordSetId}
              onclick={() => { selectRecordSet(rs.record_set_id); pickerOpen = false; }}
            >
              <span class="picker-row-name">{rs.name}</span>
              <span class="picker-row-meta">{rs.row_ids.length} rows</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </header>

  <div class="sort-toolbar" role="toolbar" aria-label="Sort">
    <span class="toolbar-label">Sort by</span>
    {#each sortSpec.sort as key, i (key.column + i)}
      <button
        type="button"
        class="sort-chip active"
        onclick={() => toggleDirection(i)}
        title="Click to toggle direction"
      >
        <span class="chip-rank">{i + 1}</span>
        <span class="chip-col">{key.column}</span>
        <span class="chip-arrow">{key.direction === 'asc' ? '↑' : '↓'}</span>
        <span
          class="chip-x"
          role="button"
          tabindex="0"
          onclick={(e) => { e.stopPropagation(); removeSortKey(i); }}
          onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); removeSortKey(i); } }}
          title="Remove this sort key"
        >×</span>
      </button>
    {/each}
    {#if sortSpec.sort.length < 3}
      <details class="add-sort">
        <summary>+ add sort key</summary>
        <div class="add-sort-popover">
          {#each ['Spine', 'Derived'] as g (g)}
            <div class="add-sort-group-label">{g}</div>
            {#each sortableColumns.filter((c) => c.group === g) as col (col.name)}
              {#if sortSpec.sort.some((k) => k.column === col.name)}
                <button type="button" class="add-sort-col" disabled title="already in sort">{col.display}</button>
              {:else}
                <button
                  type="button"
                  class="add-sort-col"
                  onclick={() => addSortKey(col.name)}
                  title={`Sort by ${col.name}`}
                >{col.display}</button>
              {/if}
            {/each}
          {/each}
        </div>
      </details>
    {/if}
    {#if sortSpec.sort.length > 0}
      <button type="button" class="reset-btn" onclick={resetSort} title="Clear sort">Reset</button>
    {/if}
  </div>

  {#if error}
    <p class="error">{error}</p>
  {/if}

  {#if loading && rows.length === 0}
    <p class="muted loading">Loading rows…</p>
  {:else if rows.length === 0}
    <p class="muted empty">No rows in this record set.</p>
  {:else}
    <ul class="row-list" aria-label="Records">
      {#each sortedRows as row (row.row_id)}
        {@const n = corpusCountFor(row.row_id)}
        {@const u = urlText(row)}
        {@const s = socialsSummary(row)}
        {@const expanded = openAddRowId === row.row_id}
        {@const busy = addBusyRowId === row.row_id}
        {@const err = addErrorByRowId[row.row_id] ?? ''}
        {@const justDone = addJustDoneByRowId[row.row_id]}
        <li class="row" class:row-expanded={expanded}>
          <div class="row-head">
            <div class="row-main">
              <span class="row-name">{nameOf(row)}</span>
              {#if u}<a class="row-url" href={u} target="_blank" rel="noopener noreferrer">{u}</a>{/if}
            </div>
            <div class="row-meta">
              {#if s}<span class="row-socials">{s}</span>{/if}
              {#if corpusByRowId[row.row_id] === undefined}
                <span class="corpus-chip loading" title="loading corpus count">corpus …</span>
              {:else if n === 0}
                <span class="corpus-chip cold" title="no corpus content for this record yet">corpus 0</span>
              {:else}
                <span class="corpus-chip warm" title={`${n} corpus ${n === 1 ? 'file' : 'files'} on disk`}>corpus {n}</span>
              {/if}
              <button
                type="button"
                class="add-trigger"
                class:open={expanded}
                onclick={() => toggleAddRow(row.row_id)}
                title="Add a URL to this record's corpus"
                aria-expanded={expanded}
              >+ URL</button>
            </div>
          </div>
          {#if expanded}
            <div class="row-add">
              <label class="row-add-label" for={`url-${row.row_id}`}>
                Paste a URL — Jina-fetches and writes to
                <code>clients/&lt;client&gt;/corpus/{funderSlugFor(nameOf(row), row.row_id)}/</code>
              </label>
              <div class="row-add-input-row">
                <input
                  id={`url-${row.row_id}`}
                  class="row-add-input"
                  type="url"
                  placeholder="https://…"
                  bind:value={
                    () => urlDraftByRowId[row.row_id] ?? '',
                    (v) => (urlDraftByRowId = { ...urlDraftByRowId, [row.row_id]: v })
                  }
                  onkeydown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void addUrlToCorpus(row);
                    } else if (e.key === 'Escape') {
                      toggleAddRow(row.row_id);
                    }
                  }}
                  disabled={busy}
                />
                <button
                  type="button"
                  class="row-add-btn"
                  onclick={() => void addUrlToCorpus(row)}
                  disabled={busy || !(urlDraftByRowId[row.row_id] ?? '').trim()}
                  title="Jina-fetch + write to per-funder corpus"
                >{busy ? 'adding…' : 'Add'}</button>
              </div>
              {#if err}
                <p class="row-add-err">{err}</p>
              {:else if justDone}
                <p class="row-add-ok">✓ added — paste another or press Esc to close</p>
              {/if}
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>
