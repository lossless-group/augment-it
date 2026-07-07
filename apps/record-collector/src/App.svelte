<script lang="ts">
  import { onMount } from 'svelte';
  import { workspace, type RecordSet, type Row } from '@augment-it/workspace';
  import RecordSetsList from './components/RecordSetsList.svelte';
  import { formatFieldValue } from './logic/format';

  const TOKEN_KEY = 'augment-it:session-token';
  const WS_URL = 'ws://localhost:3001/ws';

  let status = $state<'connecting' | 'open' | 'closed' | 'error'>('connecting');
  let selectedId = $state<string | null>(null);
  let rowsForSelected = $state<Row[]>([]);
  let ingestStatus = $state<string>('Pick a CSV or XLSX and upload.');
  let fileInput: HTMLInputElement;

  // Variant-family suggestion state. After ingest, we ask the workspace
  // for a heuristic match; if one comes back AND the user hasn't
  // dismissed this stem before (sticky per-stem in localStorage), we
  // surface a non-blocking prompt offering link / dismiss. See
  // context-v/specs/Record-Set-Family-Grouping.md §Variant detection.
  type VfSuggestion = {
    record_set_id: string;
    variant_family_id?: string;
    stem: string;
    record_set_ids: string[];
    suggested_label: string;
  };
  let suggestion = $state<VfSuggestion | null>(null);
  const DISMISSED_STEMS_KEY = 'augment-it:record-collector:dismissed-stems';

  function isDismissed(stem: string): boolean {
    try {
      const raw = localStorage.getItem(DISMISSED_STEMS_KEY);
      if (!raw) return false;
      const arr = JSON.parse(raw);
      return Array.isArray(arr) && arr.includes(stem);
    } catch {
      return false;
    }
  }

  function dismissStem(stem: string): void {
    try {
      const raw = localStorage.getItem(DISMISSED_STEMS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      const next = Array.isArray(arr) ? arr : [];
      if (!next.includes(stem)) next.push(stem);
      localStorage.setItem(DISMISSED_STEMS_KEY, JSON.stringify(next));
    } catch {
      // localStorage unavailable — dismissal won't persist; the
      // suggestion simply re-fires on the next ingest of the same stem.
    }
  }

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
    // Re-fetch when the operator toggles workspaces in the shell header.
    // The workspace singleton clears its cached record_sets/rows before
    // this fires; row-store's NATS subscriber has already swapped to the
    // new tenant's file by the time the browser reaches this point.
    const onWorkspaceChange = () => {
      selectedId = null;
      void refreshList();
    };
    window.addEventListener('augment-it:workspace-changed', onWorkspaceChange);
    return () => {
      window.removeEventListener('augment-it:workspace-changed', onWorkspaceChange);
    };
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

  // Process each broadcast event EXACTLY ONCE. Naive $effects that read
  // `workspace.events[...]` AND write to `workspace.record_sets` / `rows`
  // re-fire on every reactive dependency change (including selectedId),
  // re-processing stale events and clobbering local state. Seq-based dedup
  // with a plain (non-reactive) cursor variable means each event's handler
  // runs the first time we see it and the effect bails on every re-fire
  // until a genuinely-new event arrives.
  let lastProcessedSeq = -1;
  $effect(() => {
    const ev = workspace.events[workspace.events.length - 1];
    if (!ev || ev.seq <= lastProcessedSeq) return;
    lastProcessedSeq = ev.seq;

    if (ev.subject === 'row.updated') {
      if (!selectedId) return;
      const payload = ev.payload as { row_id: string; record_set_id: string; fields: Record<string, unknown> };
      if (payload.record_set_id !== selectedId) return;
      const existing = workspace.rows[payload.row_id];
      if (!existing) return;
      const merged: Row = { ...existing, fields: { ...existing.fields, ...payload.fields } };
      workspace.rows = { ...workspace.rows, [payload.row_id]: merged };
      rowsForSelected = rowsForSelected.map((r) => (r.row_id === merged.row_id ? merged : r));
    } else if (ev.subject === 'record_set.created') {
      void refreshList();
    } else if (ev.subject === 'record_set.deleted') {
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
    }
  });

  // Single-record enrichment: dispatch a window event the shell hears.
  // The shell opens the co-existence split (record-collector + prompt-
  // template-manager side by side). Wiring the chosen record THROUGH to
  // the prompt panel is the record-instance-model work; this just opens
  // the layout.
  function enrichRecord(row: Row) {
    window.dispatchEvent(
      new CustomEvent('augment-it:enrich-record', {
        detail: { record_set_id: row.record_set_id, row_id: row.row_id },
      }),
    );
  }

  // Set-level enrichment — spec Decision §4. The user's mental model on
  // landing here is "I picked this record set; now augment it." The
  // single-record `enrich ›` button is at the wrong grain for that
  // intent. The two buttons below let the user pick the divergence at
  // the record-collector surface instead of post-navigation in-slot:
  // a prompt run (PTM) or a pack/bundle run (Pack Runner).
  //
  // Mechanic per click:
  //   1. Write the canonical 'augment-it:active-record-set' key (Phase 5).
  //      Both Pack Runner and PTM read it.
  //   2. Broadcast 'augment-it:active-record-set-changed' so any already-
  //      mounted consumer re-targets without remounting.
  //   3. Dispatch augment-it:navigate with the specific composite member
  //      id; shell.setCompositeMember switches the in-slot active member
  //      before focusing the slot. No "default and toggle later" needed.
  const ACTIVE_RECORD_SET_KEY = 'augment-it:active-record-set';
  type AugmentTarget = 'promptTemplateManager' | 'packRunner' | 'recordDbResolver' | 'personDbResolver';
  function augmentThisSet(rs: RecordSet, target: AugmentTarget) {
    try {
      localStorage.setItem(ACTIVE_RECORD_SET_KEY, rs.record_set_id);
    } catch {
      // localStorage unavailable — the navigate still works, the
      // downstream surface just won't have the record set pre-selected.
    }
    window.dispatchEvent(
      new CustomEvent('augment-it:active-record-set-changed', {
        detail: { record_set_id: rs.record_set_id },
      }),
    );
    window.dispatchEvent(
      new CustomEvent('augment-it:navigate', {
        detail: { remoteId: target },
      }),
    );
  }

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
      let result: { record_set: RecordSet; rows: Row[] };
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
        result = (await workspace.invoke('record_set.ingest.xlsx', {
          filename: file.name,
          xlsx_b64,
        })) as { record_set: RecordSet; rows: Row[] };
      } else {
        const csv = await file.text();
        result = (await workspace.invoke('record_set.ingest', {
          filename: file.name,
          csv,
        })) as { record_set: RecordSet; rows: Row[] };
      }
      ingestStatus = `ingested ${result.record_set.record_set_id} — ${result.rows.length} rows, ${result.record_set.schema.fields.length} cols`;
      await refreshList();
      // After the set lands, ask for a variant-family suggestion. The
      // result is presented as a non-blocking prompt the user can accept
      // or dismiss; auto-link is rejected per spec Decision 2.
      void suggestForSet(result.record_set.record_set_id);
    } catch (err: unknown) {
      ingestStatus = `error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  async function suggestForSet(record_set_id: string): Promise<void> {
    try {
      const res = (await workspace.invoke('record_set.suggest_variant_family', {
        record_set_id,
      })) as { match?: { variant_family_id?: string; stem: string; record_set_ids: string[]; suggested_label: string } };
      if (!res.match) return;
      if (isDismissed(res.match.stem)) return;
      suggestion = { record_set_id, ...res.match };
    } catch (err: unknown) {
      console.error('suggest_variant_family', err);
    }
  }

  async function acceptSuggestion(): Promise<void> {
    if (!suggestion) return;
    const s = suggestion;
    try {
      if (s.variant_family_id) {
        // Join the existing family — add THIS set; the matching peers
        // are already members.
        await workspace.invoke('variant_family.add', {
          variant_family_id: s.variant_family_id,
          record_set_id: s.record_set_id,
        });
      } else {
        // Create a new family with all matched peers + this set.
        await workspace.invoke('variant_family.create', {
          label: s.suggested_label,
          record_set_ids: s.record_set_ids,
          stem: s.stem,
        });
      }
      suggestion = null;
      await refreshList();
    } catch (err: unknown) {
      console.error('accept_suggestion', err);
      ingestStatus = `link failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  function dismissSuggestion(): void {
    if (!suggestion) return;
    dismissStem(suggestion.stem);
    suggestion = null;
  }

  async function renameFamily(variant_family_id: string, currentLabel: string): Promise<void> {
    const next = window.prompt('Rename family:', currentLabel);
    if (next == null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === currentLabel) return;
    try {
      await workspace.invoke('variant_family.update', {
        variant_family_id,
        label: trimmed,
      });
      await refreshList();
    } catch (err: unknown) {
      console.error('variant_family.update', err);
    }
  }

  async function dissolveFamily(variant_family_id: string, label: string): Promise<void> {
    const confirmed = window.confirm(
      `Dissolve "${label}"?\n\nThe member record sets stay; the grouping goes away.`,
    );
    if (!confirmed) return;
    try {
      await workspace.invoke('variant_family.dissolve', { variant_family_id });
      await refreshList();
    } catch (err: unknown) {
      console.error('variant_family.dissolve', err);
    }
  }

  // Trim a URL to a compact "hostname/path" display string for the
  // url_list rendering. Strips the scheme + leading www., keeps the
  // path, and clips at a max length so long Substack / Wikipedia URLs
  // don't blow the column width. Full URL stays in title= for hover.
  const URL_DISPLAY_MAX = 60;
  function displayUrl(url: string): string {
    let s = url.trim();
    s = s.replace(/^https?:\/\//i, '').replace(/^\/\//, '');
    s = s.replace(/^www\./i, '');
    if (s.length > URL_DISPLAY_MAX) {
      s = s.slice(0, URL_DISPLAY_MAX - 1) + '…';
    }
    return s;
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
    <RecordSetsList
      {recordSets}
      {selectedId}
      onselect={(id) => selectRs(id)}
      ondelete={(rs) => { void deleteRecordSet(rs); }}
      onrefresh={refreshList}
      onRenameFamily={(id, label) => { void renameFamily(id, label); }}
      onDissolveFamily={(id, label) => { void dissolveFamily(id, label); }}
    />

    <h2>Ingest</h2>
    <input type="file" accept=".csv,.xlsx,text/csv" bind:this={fileInput} />
    <button onclick={uploadFile}>upload</button>
    <pre class="muted">{ingestStatus}</pre>
    {#if suggestion}
      <!-- Variant-family suggestion. Non-blocking — the user can ignore
           it and continue working; accepting links the family, dismissing
           sticks per-stem so the same suggestion won't re-fire. -->
      <div class="vf-suggestion" role="status">
        <p class="vf-suggestion-title">
          Looks like a variant of
          <strong>{suggestion.suggested_label}</strong>
          ({suggestion.record_set_ids.length - 1}
          existing set{suggestion.record_set_ids.length - 1 === 1 ? '' : 's'}) —
          link as family?
        </p>
        <div class="vf-suggestion-actions">
          <button class="vf-link" onclick={() => void acceptSuggestion()}>
            {suggestion.variant_family_id ? 'Join family' : 'Link'}
          </button>
          <button class="vf-dismiss" onclick={dismissSuggestion}>Dismiss</button>
        </div>
      </div>
    {/if}
  </aside>

  <section>
    <h2>Rows</h2>
    {#if !selectedRs}
      <p class="muted">(pick a record set)</p>
    {:else}
      <div class="set-header">
        <h3>{selectedRs.name}</h3>
        <div class="augment-this-set-panel" role="group" aria-label="Augment this Set">
          <div class="augment-this-set-heading">Augment this Set</div>
          <div class="augment-this-set-actions">
            <button
              class="augment-this-set"
              title="Send the whole set to Prompt Templates — author or run a prompt against every row"
              onclick={() => augmentThisSet(selectedRs, 'promptTemplateManager')}
            >Run a Prompt →</button>
            <button
              class="augment-this-set"
              title="Send the whole set to Pack Runner — run a bundle / packs against every row"
              onclick={() => augmentThisSet(selectedRs, 'packRunner')}
            >Run a Bundle / Packs →</button>
            <button
              class="augment-this-set"
              title="Send the whole set to DB Resolver — match or create canonical organizations for every row (use for orgs — sponsors, exhibitors, funders)"
              onclick={() => augmentThisSet(selectedRs, 'recordDbResolver')}
            >Resolve Orgs to Canonical DB →</button>
            <button
              class="augment-this-set"
              title="Send the whole set to Person DB Resolver — match or create canonical persons + their org/role for every row (use for people — speakers, attendees)"
              onclick={() => augmentThisSet(selectedRs, 'personDbResolver')}
            >Resolve People to Canonical DB →</button>
          </div>
        </div>
      </div>
      <div class="rows-list">
        {#each rowsForSelected as row (row.row_id)}
          {@const orderedFields = selectedRs.schema.fields
            .slice()
            .sort((a, b) => a.order - b.order)}
          {@const socialsRaw = row.fields.socials}
          {@const socials = Array.isArray(socialsRaw)
            ? (socialsRaw as Array<{ socials_id: string; pack_id: string; url: string; display_name: string; confidence: number }>)
            : []}
          <article class="row-card">
            <div class="row-card-top">
              <span class="row-id">{row.row_id}</span>
              <!-- single-record enrichment: tells the shell to open the
                   co-existence split (record-collector + prompt-template-
                   manager side by side) for this one record. -->
              <button
                class="enrich-one"
                title="Enrich just this record — open the prompt panel beside it"
                onclick={() => enrichRecord(row)}
              >enrich ›</button>
            </div>
            {#if socials.length > 0}
              <!-- Socials chip row — accepted pack profiles. One badge per
                   pack_id; replace-by-pack_id semantics mean each platform
                   appears at most once. See
                   context-v/blueprints/Packs-and-Bundles-Pattern.md §Row write-back -->
              <div class="socials">
                {#each socials as s (s.socials_id)}
                  <a
                    class="social-chip"
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`${s.display_name} · ${s.confidence}/100 · ${s.url}`}
                  >
                    <span class="social-pack">{s.pack_id.replace(/-pack$/, '')}</span>
                    <span class="social-confidence" data-band={s.confidence >= 70 ? 'high' : s.confidence >= 40 ? 'med' : 'low'}>{s.confidence}</span>
                  </a>
                {/each}
              </div>
            {/if}
            <div class="fields">
              {#each orderedFields as f (f.name)}
                {@const value = row.fields[f.name]}
                {@const formatted = formatFieldValue(value)}
                {@const shape = formatted.shape}
                <div class="field-name" title={f.name}>{f.name}</div>
                {#if shape.kind === 'url_list'}
                  <!-- List of URLs surfaced as clickable links. Drops the
                       auxiliary metadata (display_name, confidence,
                       source_metadata, response_id, accepted_at, ...) from
                       the rendered view — that data is preserved on the row
                       and round-trips through CSV export, it just doesn't
                       compete for visual attention here. Read-only by
                       design; the per-entry remove affordance lives in a
                       sibling plan, not this one. See
                       context-v/plans/URL-Auto-Detector-and-Clickable-Rendering-for-List-Fields.md. -->
                  <div class="field-value field-value-urls">
                    <!-- Unkeyed each: same URL can appear twice in a
                         single field (helpful_links across sessions,
                         socials whose pack_ids resolve to the same
                         profile URL). Keying by entry.url would throw
                         "Cannot have duplicate keys" and crash the
                         parent {#each rowsForSelected}. Read-only
                         render — no reordering — so positional
                         iteration is fine. -->
                    {#each shape.entries as entry}
                      <div class="field-value-url">
                        {#if entry.chip}
                          <span class="field-value-url-chip">{entry.chip}</span>
                        {/if}
                        {#if entry.label}
                          <span class="field-value-url-label">{entry.label}</span>
                        {/if}
                        <a
                          class="field-value-url-link"
                          href={entry.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={entry.url}
                        >{displayUrl(entry.url)}</a>
                      </div>
                    {/each}
                  </div>
                {:else if shape.kind === 'json'}
                  <!-- Generic structured value — JSON-stringified and
                       read-only. Same data-loss-vector rationale as before:
                       inline editing of arbitrary JSON in a contenteditable
                       is too easy to corrupt. Empty arrays / objects render
                       a muted placeholder. -->
                  <div
                    class="field-value field-value-json"
                    class:field-value-empty={formatted.isEmpty}
                    title={formatted.isEmpty ? 'structured value — empty' : 'structured value (read-only here)'}
                  >{formatted.isEmpty ? `(empty ${formatted.text})` : formatted.text}</div>
                {:else}
                  <!-- Scalar (string/number/boolean) or empty — editable in
                       place. scalar_url currently routes through this branch
                       too, preserving edit-on-click behavior; a future
                       follow-up may add an icon-button affordance to open
                       the URL alongside editing. -->
                  <div
                    class="field-value"
                    class:field-value-empty={formatted.isEmpty}
                    contenteditable="true"
                    role="textbox"
                    tabindex="0"
                    data-placeholder="(empty)"
                    onblur={(e) =>
                      commitEdit(row, f.name, (e.currentTarget as HTMLDivElement).textContent ?? '')}
                    onkeydown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        (e.currentTarget as HTMLDivElement).blur();
                      }
                    }}
                  >{formatted.text}</div>
                {/if}
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

