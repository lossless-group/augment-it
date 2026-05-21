<script lang="ts">
  import { onMount } from 'svelte';
  import { workspace, type RecordSet, type Row } from '@augment-it/workspace';

  const TOKEN_KEY = 'augment-it:session-token';
  const WS_URL = 'ws://localhost:3001/ws';

  let status = $state<'connecting' | 'open' | 'closed' | 'error'>('connecting');
  let selectedId = $state<string | null>(null);
  let rowsForSelected = $state<Row[]>([]);
  let ingestStatus = $state<string>('Pick a CSV or XLSX and upload.');
  let fileInput: HTMLInputElement;

  const recordSets = $derived(Object.values(workspace.record_sets) as RecordSet[]);
  const selectedRs = $derived(selectedId ? workspace.record_sets[selectedId] : null);

  onMount(() => {
    workspace.connect({
      url: WS_URL,
      getToken: () => localStorage.getItem(TOKEN_KEY),
      saveToken: (t) => localStorage.setItem(TOKEN_KEY, t),
      onStatus: (s) => (status = s),
    });
    void refreshList();
  });

  async function refreshList() {
    try {
      const result = (await workspace.invoke('record_set.list', {})) as {
        record_sets: RecordSet[];
      };
      const next: Record<string, RecordSet> = {};
      for (const rs of result.record_sets) next[rs.record_set_id] = rs;
      workspace.record_sets = next;
    } catch (err: unknown) {
      console.error('refreshList', err);
    }
  }

  async function selectRs(record_set_id: string) {
    selectedId = record_set_id;
    rowsForSelected = [];
    try {
      const result = (await workspace.invoke('row.list', { record_set_id })) as {
        rows: Row[];
      };
      const next: Record<string, Row> = { ...workspace.rows };
      for (const r of result.rows) next[r.row_id] = r;
      workspace.rows = next;
      rowsForSelected = result.rows;
    } catch (err: unknown) {
      console.error('selectRs', err);
    }
  }

  $effect(() => {
    if (!selectedId) return;
    const ev = workspace.events[workspace.events.length - 1];
    if (!ev) return;
    if (ev.subject === 'row.updated') {
      const payload = ev.payload as { row_id: string; record_set_id: string; fields: Record<string, unknown> };
      if (payload.record_set_id !== selectedId) return;
      const existing = workspace.rows[payload.row_id];
      if (!existing) return;
      const merged: Row = { ...existing, fields: { ...existing.fields, ...payload.fields } };
      workspace.rows = { ...workspace.rows, [payload.row_id]: merged };
      rowsForSelected = rowsForSelected.map((r) => (r.row_id === merged.row_id ? merged : r));
    } else if (ev.subject === 'record_set.created') {
      void refreshList();
    }
  });

  async function commitEdit(row: Row, fieldName: string, newValue: string) {
    const before = String(row.fields[fieldName] ?? '');
    if (before === newValue) return;
    try {
      await workspace.invoke('row.update', {
        row_id: row.row_id,
        fields: { [fieldName]: newValue },
      });
    } catch (err: unknown) {
      console.error('row.update', err);
    }
  }

  async function uploadFile() {
    const file = fileInput.files?.[0];
    if (!file) return;
    const isXlsx = file.name.toLowerCase().endsWith('.xlsx');
    ingestStatus = `uploading ${file.name} (${file.size} bytes)…`;
    try {
      if (isXlsx) {
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);
        // base64 in chunks to avoid stack overflow on large files
        let binary = '';
        const CHUNK = 0x8000;
        for (let i = 0; i < bytes.length; i += CHUNK) {
          binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
        }
        const xlsx_b64 = btoa(binary);
        const result = (await workspace.invoke('record_set.ingest.xlsx', {
          filename: file.name,
          xlsx_b64,
        })) as { record_set: RecordSet; rows: Row[] };
        ingestStatus = `ingested ${result.record_set.record_set_id} — ${result.rows.length} rows, ${result.record_set.schema.fields.length} cols`;
      } else {
        const csv = await file.text();
        const result = (await workspace.invoke('record_set.ingest', {
          filename: file.name,
          csv,
        })) as { record_set: RecordSet; rows: Row[] };
        ingestStatus = `ingested ${result.record_set.record_set_id} — ${result.rows.length} rows, ${result.record_set.schema.fields.length} cols`;
      }
      await refreshList();
    } catch (err: unknown) {
      ingestStatus = `error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
</script>

<header>
  <h1>augment-it · record-collector</h1>
  <p class="muted">
    Svelte 5 + Rsbuild · consumes <code>@augment-it/workspace</code> directly · talks to
    <code>{WS_URL}</code> · status:
    <span class="status status-{status}">{status}</span>
  </p>
</header>

<main>
  <aside>
    <h2>Record sets</h2>
    <button class="secondary" onclick={refreshList}>refresh</button>
    <ul class="records">
      {#each recordSets as rs (rs.record_set_id)}
        <li
          class:selected={rs.record_set_id === selectedId}
          onclick={() => selectRs(rs.record_set_id)}
          onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectRs(rs.record_set_id); } }}
          role="button"
          tabindex="0"
        >
          <strong>{rs.name}</strong>
          <span class="muted">{rs.schema.fields.length} cols · {rs.row_ids.length} rows</span>
        </li>
      {/each}
      {#if recordSets.length === 0}
        <li class="muted empty">no record sets yet — upload below</li>
      {/if}
    </ul>

    <h2>Ingest</h2>
    <input type="file" accept=".csv,.xlsx,text/csv" bind:this={fileInput} />
    <button onclick={uploadFile}>upload</button>
    <pre class="muted">{ingestStatus}</pre>
  </aside>

  <section>
    <h2>Rows</h2>
    {#if !selectedRs}
      <p class="muted">(pick a record set)</p>
    {:else}
      <h3>{selectedRs.name}</h3>
      <div class="rows-list">
        {#each rowsForSelected as row (row.row_id)}
          {@const orderedFields = selectedRs.schema.fields
            .slice()
            .sort((a, b) => a.order - b.order)}
          <article class="row-card">
            <div class="row-id">{row.row_id}</div>
            <div class="fields">
              {#each orderedFields as f (f.name)}
                <div class="field-name" title={f.name}>{f.name}</div>
                <div
                  class="field-value"
                  contenteditable="true"
                  role="textbox"
                  tabindex="0"
                  onblur={(e) =>
                    commitEdit(row, f.name, (e.currentTarget as HTMLDivElement).textContent ?? '')}
                  onkeydown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      (e.currentTarget as HTMLDivElement).blur();
                    }
                  }}
                >{row.fields[f.name] ?? ''}</div>
              {/each}
            </div>
          </article>
        {/each}
        {#if rowsForSelected.length === 0}
          <p class="muted">no rows</p>
        {/if}
      </div>
    {/if}
  </section>
</main>

<style>
  :global(body) {
    margin: 0;
    background: #0f1115;
    color: #e8eaf0;
    font: 13px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  header {
    padding: 1.25rem 2rem;
    border-bottom: 1px solid #232634;
  }
  h1 { font-size: 1.05rem; margin: 0 0 0.25rem; }
  h2 { font-size: 0.85rem; margin: 1.25rem 0 0.5rem; color: #c75bfb; text-transform: uppercase; letter-spacing: 0.05em; }
  h3 { font-size: 0.95rem; margin: 0 0 0.5rem; color: #5bbcfb; }
  .muted { color: #8a8f9b; }
  code { background: #16181f; padding: 1px 5px; border-radius: 3px; }
  .status { padding: 1px 7px; border-radius: 3px; background: #232634; }
  .status-open { background: #1b3d2f; color: #a4e3b5; }
  .status-closed, .status-error { background: #3d1b1b; color: #f29a9a; }

  main {
    display: grid;
    grid-template-columns: 340px 1fr;
    gap: 1.25rem;
    padding: 1.25rem 2rem;
  }

  aside, section {
    border: 1px solid #232634;
    border-radius: 6px;
    padding: 1rem;
    min-width: 0;
  }

  button {
    background: #c75bfb;
    color: #0f1115;
    border: 0;
    padding: 5px 10px;
    border-radius: 4px;
    font: inherit;
    cursor: pointer;
    margin-right: 0.5rem;
  }
  button.secondary {
    background: transparent;
    color: #c75bfb;
    border: 1px solid #c75bfb;
  }

  input[type=file] {
    color: #e8eaf0;
    margin: 0.5rem 0;
    width: 100%;
  }

  pre { white-space: pre-wrap; word-break: break-word; padding: 0.6rem; background: #16181f; border-radius: 4px; margin: 0.5rem 0 0; font-size: 11px; }

  ul.records { list-style: none; padding: 0; margin: 0.5rem 0; }
  ul.records li {
    padding: 0.5rem;
    border: 1px solid #232634;
    border-radius: 4px;
    margin-bottom: 0.25rem;
    cursor: pointer;
  }
  ul.records li:hover { border-color: #c75bfb; }
  ul.records li.selected { border-color: #c75bfb; background: rgba(199, 91, 251, 0.06); }
  ul.records li.empty { cursor: default; }
  ul.records li strong { display: block; color: #c75bfb; margin-bottom: 0.15rem; }

  .rows-list { display: flex; flex-direction: column; gap: 0.5rem; max-height: 70vh; overflow: auto; }
  .row-card {
    border: 1px solid #232634;
    border-radius: 5px;
    padding: 0.55rem 0.7rem;
    background: rgba(255,255,255,0.01);
  }
  .row-id { color: #8a8f9b; font-size: 10px; margin-bottom: 0.35rem; }
  .fields {
    display: grid;
    grid-template-columns: minmax(140px, 220px) 1fr;
    gap: 4px 12px;
    align-items: baseline;
  }
  .field-name {
    color: #8a8f9b;
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .field-value {
    background: #16181f;
    padding: 3px 6px;
    border-radius: 3px;
    word-break: break-word;
    cursor: text;
    outline: none;
  }
  .field-value:focus { outline: 1px solid #5bbcfb; background: #1a1d27; }
</style>
