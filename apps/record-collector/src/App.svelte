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

  // React to the latest broadcast event. Three $effects, one per subject,
  // so an early-return for the row-specific handler can't swallow the
  // record-set-level handlers.
  $effect(() => {
    const ev = workspace.events[workspace.events.length - 1];
    if (!ev) return;
    if (ev.subject !== 'row.updated') return;
    if (!selectedId) return;
    const payload = ev.payload as { row_id: string; record_set_id: string; fields: Record<string, unknown> };
    if (payload.record_set_id !== selectedId) return;
    const existing = workspace.rows[payload.row_id];
    if (!existing) return;
    const merged: Row = { ...existing, fields: { ...existing.fields, ...payload.fields } };
    workspace.rows = { ...workspace.rows, [payload.row_id]: merged };
    rowsForSelected = rowsForSelected.map((r) => (r.row_id === merged.row_id ? merged : r));
  });

  $effect(() => {
    const ev = workspace.events[workspace.events.length - 1];
    if (!ev) return;
    if (ev.subject !== 'record_set.created') return;
    void refreshList();
  });

  $effect(() => {
    const ev = workspace.events[workspace.events.length - 1];
    if (!ev) return;
    if (ev.subject !== 'record_set.deleted') return;
    const payload = ev.payload as { record_set_id: string };
    const next = { ...workspace.record_sets };
    const removedRows = next[payload.record_set_id]?.row_ids ?? [];
    delete next[payload.record_set_id];
    workspace.record_sets = next;
    if (removedRows.length > 0) {
      const nextRows = { ...workspace.rows };
      for (const id of removedRows) delete nextRows[id];
      workspace.rows = nextRows;
    }
    if (selectedId === payload.record_set_id) {
      selectedId = null;
      rowsForSelected = [];
    }
  });

  async function deleteRecordSet(rs: RecordSet) {
    const confirmed = window.confirm(
      `Delete "${rs.name}" and its ${rs.row_ids.length} row${rs.row_ids.length === 1 ? '' : 's'}? This cannot be undone.`,
    );
    if (!confirmed) return;
    try {
      await workspace.invoke('record_set.delete', { record_set_id: rs.record_set_id });
      // The record_set.deleted broadcast handler above will remove from state.
    } catch (err: unknown) {
      console.error('record_set.delete', err);
    }
  }

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

<div class="rc-app">
<div class="rc-status-bar">
  <span class="muted">
    consumes <code>@augment-it/workspace</code> · {WS_URL} ·
    <span class="status status-{status}">{status}</span>
  </span>
</div>

<div class="rc-layout">
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
          <div class="rs-row-top">
            <strong>{rs.name}</strong>
            <button
              class="rs-delete"
              title="Delete this record set and all its rows"
              onclick={(e) => { e.stopPropagation(); void deleteRecordSet(rs); }}
              aria-label="delete {rs.name}"
            >×</button>
          </div>
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
</div>
</div>

<!-- Styles live in ./app.css and are imported as a module side effect
     from both index.ts (standalone) and mount.ts (federation). This
     bypasses Svelte's append_styles runtime which doesn't fire reliably
     across Module Federation chunk boundaries. -->

