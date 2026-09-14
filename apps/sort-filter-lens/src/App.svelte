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
  import Button from '@augment-it/shared-ui/Button.svelte';
  import Chip from '@augment-it/shared-ui/Chip.svelte';
  import CardRow from '@augment-it/shared-ui/CardRow.svelte';
  import ExternalLink from '@augment-it/shared-ui/ExternalLink.svelte';
  import SelectorListbox from '@augment-it/shared-ui/Selector--Listbox.svelte';
  import { workspace, type RecordSet, type Row, resolveWsUrl } from '@augment-it/workspace';
  import {
    type SortSpec,
    type SortKey,
    DERIVED_COLUMNS,
    applySort,
    loadSortSpec,
    saveSortSpec,
  } from './sort-spec';

  const TOKEN_KEY = 'augment-it:session-token';
  const WS_URL = resolveWsUrl();
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
  // Validation errors (synchronous — invalid URL syntax). Backend
  // errors live on the per-add entry in pendingByRowId instead.
  let addValidationErrByRowId = $state<Record<string, string>>({});
  // Fire-and-forget queue: per-row list of in-flight + recently-
  // completed adds. The operator can keep pasting; entries surface
  // their own status without blocking the input.
  type PendingAdd = {
    id: string;
    url: string;
    started_at: number;
    status: 'pending' | 'ok' | 'failed';
    error?: string;
  };
  let pendingByRowId = $state<Record<string, PendingAdd[]>>({});

  // Inline URL editing per row. Mirrors the pack-runner / response-
  // reviewer saveRowUrl pattern — the operator clicks the URL to
  // edit it, Enter saves via row.update.requested, refreshes the row
  // state. Without this the operator's only edit path is Content
  // Reader, which means swapping lenses + losing focus on the
  // worklist.
  let urlEditByRowId = $state<Record<string, string>>({});
  let urlEditingRowId = $state<string | null>(null);
  let urlSavingRowId = $state<string>('');
  let urlEditErrByRowId = $state<Record<string, string>>({});

  // The picker is a LISTBOX, not a menu. It picks a record set and marks the
  // current one — a thing with a selected state is a listbox even when it is
  // drawn as a popdown. It shipped as role="menu" whose children were Buttons:
  // a menu with zero menuitems.
  const recordSetOptions = $derived(
    recordSets.map((rs) => ({ id: rs.record_set_id, label: rs.name, rows: rs.row_ids.length })),
  );

  // Escape must return focus to the TRIGGER, not to <body>. Selector--Listbox
  // has no `onclose`/`trigger` pair (only Selector--Menu does), so the close
  // lives here — and Button does not forward its node either, so the trigger is
  // read back out of the wrapper. Both raised as findings; neither is fought.
  let pickerWrapEl = $state<HTMLElement | undefined>();
  const pickerTrigger = $derived(pickerWrapEl?.querySelector<HTMLElement>('button') ?? undefined);
  function closePicker(): void {
    pickerOpen = false;
    pickerTrigger?.focus();
  }
  // One picker per lens, and the lens is a singleton in its column — a literal
  // is honest here and keeps the trigger's aria-controls and the listbox's id
  // in one place where they cannot drift apart.
  const PICKER_LISTBOX_ID = 'sfl-record-set-listbox';

  function onPickerKey(e: KeyboardEvent): void {
    if (!pickerOpen || e.key !== 'Escape') return;
    e.preventDefault();
    closePicker();
  }

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
      // Auto-fall-back to the newest non-archived set when:
      //   (a) no localStorage value, OR
      //   (b) localStorage points at a now-archived set (the common
      //       case after /promote-snapshot — v9 archives when v10 lands
      //       and yesterday's localStorage hangs onto the archived id).
      const inList =
        selectedRecordSetId !== null &&
        recordSets.some((rs) => rs.record_set_id === selectedRecordSetId);
      if (!inList && recordSets.length > 0) {
        // Newest by created_at so the latest snapshot wins automatically.
        const newest = [...recordSets].sort(
          (a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''),
        )[0];
        selectedRecordSetId = newest.record_set_id;
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
      addValidationErrByRowId = { ...addValidationErrByRowId, [row_id]: '' };
    }
  }

  function newAddId(): string {
    return `add-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  }

  function updatePending(row_id: string, id: string, patch: Partial<PendingAdd>): void {
    const list = pendingByRowId[row_id] ?? [];
    const next = list.map((p) => (p.id === id ? { ...p, ...patch } : p));
    pendingByRowId = { ...pendingByRowId, [row_id]: next };
  }

  function removePending(row_id: string, id: string): void {
    const list = pendingByRowId[row_id] ?? [];
    pendingByRowId = { ...pendingByRowId, [row_id]: list.filter((p) => p.id !== id) };
  }

  function dismissPending(row_id: string, id: string): void {
    removePending(row_id, id);
  }

  // --- Inline URL edit ---

  function startUrlEdit(row: Row): void {
    urlEditingRowId = row.row_id;
    const current = urlText(row);
    // Treat 'unknown' / blank as empty so the input is editable from
    // scratch instead of showing the placeholder string.
    urlEditByRowId = {
      ...urlEditByRowId,
      [row.row_id]: current === 'unknown' ? '' : current,
    };
    urlEditErrByRowId = { ...urlEditErrByRowId, [row.row_id]: '' };
  }

  function cancelUrlEdit(): void {
    urlEditingRowId = null;
  }

  async function saveRowUrl(row: Row): Promise<void> {
    if (urlSavingRowId) return;
    const draft = (urlEditByRowId[row.row_id] ?? '').trim();
    // Empty string is allowed — clearing the URL is a legitimate edit.
    // Non-empty must parse.
    if (draft !== '') {
      try {
        new URL(draft);
      } catch {
        urlEditErrByRowId = { ...urlEditErrByRowId, [row.row_id]: 'not a valid URL' };
        return;
      }
    }
    urlSavingRowId = row.row_id;
    urlEditErrByRowId = { ...urlEditErrByRowId, [row.row_id]: '' };
    try {
      await workspace.invoke('row.update', {
        row_id: row.row_id,
        fields: { url: draft },
      });
      // Update the row in-place so the lens reflects without waiting
      // for the row.updated broadcast to round-trip.
      const idx = rows.findIndex((r) => r.row_id === row.row_id);
      if (idx >= 0) {
        const next = [...rows];
        next[idx] = { ...next[idx], fields: { ...next[idx].fields, url: draft } };
        rows = next;
      }
      urlEditingRowId = null;
    } catch (err) {
      urlEditErrByRowId = {
        ...urlEditErrByRowId,
        [row.row_id]: err instanceof Error ? err.message : String(err),
      };
    } finally {
      urlSavingRowId = '';
    }
  }

  // Synchronous submit — validate, queue a pending entry, fire the
  // backend work in the background, clear the input. The operator
  // can keep pasting immediately. Successful adds tick the chip and
  // auto-clear after a short delay; failed adds stick around with
  // the URL + reason so the operator can copy/retry/inbox.
  function submitAdd(row: Row): void {
    const url = (urlDraftByRowId[row.row_id] ?? '').trim();
    if (!url) return;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      addValidationErrByRowId = { ...addValidationErrByRowId, [row.row_id]: 'not a valid URL' };
      return;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      addValidationErrByRowId = {
        ...addValidationErrByRowId,
        [row.row_id]: `unsupported protocol: ${parsed.protocol}`,
      };
      return;
    }
    // Clear validation error + input immediately; fire the work.
    addValidationErrByRowId = { ...addValidationErrByRowId, [row.row_id]: '' };
    urlDraftByRowId = { ...urlDraftByRowId, [row.row_id]: '' };
    const id = newAddId();
    const pending: PendingAdd = { id, url, started_at: Date.now(), status: 'pending' };
    pendingByRowId = {
      ...pendingByRowId,
      [row.row_id]: [...(pendingByRowId[row.row_id] ?? []), pending],
    };
    void runAdd(row, pending);
  }

  async function runAdd(row: Row, pending: PendingAdd): Promise<void> {
    try {
      // Step 1 — preview the URL via Jina (title + synthetic response_id).
      const previewReply = (await workspace.invoke('content_ingest.preview_url', {
        record_id: row.row_id,
        url: pending.url,
      })) as {
        preview?: { response_id: string; status: string; title?: string; exact_url: string };
        ok?: false;
        error?: string;
      };
      if (previewReply.ok === false || !previewReply.preview) {
        throw new Error(previewReply.error ?? 'preview failed');
      }
      const p = previewReply.preview;
      if (p.status !== 'ready') {
        throw new Error('Jina could not fetch — try /inbox in chat as a fallback');
      }
      // Step 2 — write to clients/<client>/corpus/<funder-slug>/.
      const slug = funderSlugFor(nameOf(row), row.row_id);
      const addReply = (await workspace.invoke('corpus.add', {
        client_id: CLIENT_ID,
        record_id: row.row_id,
        response_id: p.response_id,
        title: p.title ?? pending.url,
        tags: [],
        exact_url: pending.url,
        funder_slug: slug,
        pack_id: 'manual',
      })) as { corpus_path?: string; written_at?: string; ok?: false; error?: string };
      if (addReply.ok === false) {
        throw new Error(addReply.error ?? 'corpus.add failed');
      }
      updatePending(row.row_id, pending.id, { status: 'ok' });
      void refreshCorpusForRow(row.row_id);
      // Auto-clear successful entries after a short delay so the row
      // doesn't accumulate green chips.
      setTimeout(() => removePending(row.row_id, pending.id), 4000);
    } catch (err) {
      updatePending(row.row_id, pending.id, {
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      });
      // Failed entries stick around — operator dismisses manually.
    }
  }

  // Maps this member's three pending states onto CardRow's semantic tone axis.
  // Was a style-string builder against rung 4; now a tone name, which is the
  // whole point of the axis existing.
  function pendingTone(status: string): 'info' | 'ok' | 'error' | 'neutral' {
    if (status === 'pending') return 'info';
    if (status === 'ok') return 'ok';
    if (status === 'failed') return 'error';
    return 'neutral';
  }

  function fmtElapsed(ms: number): string {
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m${s % 60}s`;
  }

  // Drive a tick state so pending elapsed-time strings refresh while
  // the row is open. Cheap: a 1s interval that touches a number.
  // `nowMs` is derived from the tick so reading it inside the template
  // tracks reactivity correctly.
  let tickN = $state(0);
  const nowMs = $derived(tickN >= 0 ? Date.now() : Date.now());
  $effect(() => {
    if (openAddRowId === null) return;
    const i = setInterval(() => (tickN += 1), 1000);
    return () => clearInterval(i);
  });

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
    // Re-fetch when the operator toggles workspaces in the shell header.
    // The lens drops its selection and re-loads the record-set list from
    // the new tenant's row-store. See [[Workspaces-as-Tenant-Primitive]].
    const onWorkspaceChange = (): void => {
      selectedRecordSetId = null;
      void loadRecordSets();
    };
    window.addEventListener('augment-it:workspace-changed', onWorkspaceChange);
    return () => {
      window.removeEventListener('augment-it:active-record-set-changed', onActiveRecordSetChange);
      window.removeEventListener('augment-it:workspace-changed', onWorkspaceChange);
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
      <!-- neutral, not accent, and the member DREW it accent. "Lens" names a
           kind of member; it is not selected, current, or in focus, which is
           what accent means. Picking tone by the colour already on screen is
           how the federation ended up rendering one status value eleven ways. -->
      <Chip size="sm">Lens</Chip>
      <h2>Sort &amp; Filter</h2>
      <span class="muted lens-sub">re-order the active record set; filter coming v0.0.0.4</span>
    </div>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- The keydown is Escape-to-close for the popdown, which the listbox
         itself does not own. It is on the WRAPPER, not on the options: one
         handler for the whole widget is the same discipline the Selector
         applies to its arrows. -->
    <div class="record-set-picker" bind:this={pickerWrapEl} onkeydown={onPickerKey}>
      <!-- NOT a DisclosureRow, deliberately. This is a POPUP trigger — the
           popover is position:absolute above the flow and what it opens is a
           listbox with a selected value, not an inline region. A row here would
           need rung-4 overrides for display, inline-size and padding, which
           negates the base recipe rather than adjusting it.

           Three things it DID share with the real disclosures, all fixed:
             - aria-expanded with no aria-haspopup, so a screen reader was told
               something expanded and never what. shell's WorkspaceSwitcher —
               the same shape — already declares aria-haspopup="listbox"; this
               was an inconsistency inside the federation.
             - no aria-controls: nothing tied the trigger to the listbox.
             - the ▴ / ▾ glyph was TEXT, so the accessible name read
               "alpha-2026-01-01.csv 0 rows · 2 cols ▾". It is decoration and is
               now aria-hidden; the state it was drawing is aria-expanded's job. -->
      {#if selectedRecordSet}
        <Button
          onclick={() => (pickerOpen = !pickerOpen)}
          title="Switch record set"
          aria-haspopup="listbox"
          aria-expanded={pickerOpen}
          aria-controls={pickerOpen ? PICKER_LISTBOX_ID : undefined}
        >
          <span class="picker-name">{selectedRecordSet.name}</span>
          <span class="picker-meta">{rows.length} rows · {selectedRecordSet.schema.fields.length} cols</span>
          <span class="picker-caret" aria-hidden="true">{pickerOpen ? '▴' : '▾'}</span>
        </Button>
      {:else}
        <Button
          onclick={() => (pickerOpen = !pickerOpen)}
          aria-haspopup="listbox"
          aria-expanded={pickerOpen}
          aria-controls={pickerOpen ? PICKER_LISTBOX_ID : undefined}
        >
          <span class="picker-name">pick a record set</span>
          <span class="picker-caret" aria-hidden="true">▾</span>
        </Button>
      {/if}
      {#if pickerOpen}
        <!-- The popover is the CONTAINER — position, surface, shadow, scroll —
             and the listbox is its one child. Rung 0: a component never
             positions itself, so none of that goes on the Selector. -->
        <div class="picker-popover">
          <SelectorListbox
            id={PICKER_LISTBOX_ID}
            options={recordSetOptions}
            label="Record set"
            value={selectedRecordSetId ?? undefined}
            option={recordSetOption}
            onselect={(id) => {
              selectRecordSet(id);
              closePicker();
            }}
          />
        </div>
      {/if}
    </div>
  </header>

  <div class="sort-toolbar" role="toolbar" aria-label="Sort">
    <span class="toolbar-label">Sort by</span>
    {#each sortSpec.sort as key, i (key.column + i)}
      <!-- TWO controls, side by side, never one inside the other.
           This shipped as a <span role="button" tabindex="0"> nested INSIDE a
           <button> — interactive content may not contain interactive content,
           which is invalid HTML outright and a documented hazard for assistive
           tech, much of which will not surface a focusable descendant of a
           button at all.

           A <Chip dismissible> is NOT the answer here and the distinction is the
           whole judgement: a Chip's body is a label and only its × acts. Both of
           these act — the body toggles sort direction, the × removes the key —
           so the shape is a Button plus a sibling Button in a wrapper. Chip
           would have turned a working toggle into a span.

           The measurable defect was never the accessible NAME, whatever the
           rollout docs say: this outer button carries an explicit aria-label, so
           its name was already the label and never absorbed the glyph. The
           defect was a 14x14 remove target against the WCAG 2.2 SC 2.5.8 floor
           of 24x24, and an inner control whose entire accessible name was "×". -->
      <div class="sfl-sort-chip">
        <Button
          variant="outline"
          size="sm"
          onclick={() => toggleDirection(i)}
          title="Click to toggle direction"
          aria-label={`Sort key ${i + 1}: ${key.column}, ${key.direction === 'asc' ? 'ascending' : 'descending'} — activate to toggle direction`}
        >
          <span class="chip-rank">{i + 1}</span>
          <span class="chip-col">{key.column}</span>
          <span class="chip-arrow">{key.direction === 'asc' ? '↑' : '↓'}</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onclick={() => removeSortKey(i)}
          title="Remove this sort key"
          aria-label={`Remove sort key ${i + 1}: ${key.column}`}
        >×</Button>
      </div>
    {/each}
    {#if sortSpec.sort.length < 3}
      <details class="add-sort">
        <summary>+ add sort key</summary>
        <div class="add-sort-popover">
          {#each ['Spine', 'Derived'] as g (g)}
            <div class="add-sort-group-label">{g}</div>
            {#each sortableColumns.filter((c) => c.group === g) as col (col.name)}
              {#if sortSpec.sort.some((k) => k.column === col.name)}
                <Button variant="ghost" disabled title="already in sort">
                  <span class="sfl-btn-content-row">{col.display}</span>
                </Button>
              {:else}
                <Button
                  variant="ghost"
                  onclick={() => addSortKey(col.name)}
                  title={`Sort by ${col.name}`}
                >
                  <span class="sfl-btn-content-row">{col.display}</span>
                </Button>
              {/if}
            {/each}
          {/each}
        </div>
      </details>
    {/if}
    {#if sortSpec.sort.length > 0}
      <div class="sfl-toolbar-end">
        <Button variant="outline" size="sm" onclick={resetSort} title="Clear sort">Reset</Button>
      </div>
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
        {@const validationErr = addValidationErrByRowId[row.row_id] ?? ''}
        {@const pendingList = pendingByRowId[row.row_id] ?? []}
        {@const pendingCount = pendingList.filter((p) => p.status === 'pending').length}
        {@const failedCount = pendingList.filter((p) => p.status === 'failed').length}
        <li class="row" class:row-expanded={expanded}>
          <div class="row-head">
            <div class="row-main">
              <span class="row-name">{nameOf(row)}</span>
              {#if urlEditingRowId === row.row_id}
                <div class="row-url-edit">
                  <input
                    class="row-url-input"
                    type="url"
                    placeholder="https://…  (blank = clear; Enter = save; Esc = cancel)"
                    bind:value={
                      () => urlEditByRowId[row.row_id] ?? '',
                      (v) => (urlEditByRowId = { ...urlEditByRowId, [row.row_id]: v })
                    }
                    onkeydown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void saveRowUrl(row);
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        cancelUrlEdit();
                      }
                    }}
                    disabled={urlSavingRowId === row.row_id}
                    autofocus
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    onclick={() => void saveRowUrl(row)}
                    disabled={urlSavingRowId === row.row_id}
                    title="Save via row.update — survives the next /promote-snapshot if v(N+1) is emitted afterwards"
                  >{urlSavingRowId === row.row_id ? 'saving…' : 'Save'}</Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="cancel URL edit"
                    onclick={cancelUrlEdit}
                    disabled={urlSavingRowId === row.row_id}
                    title="cancel (Esc)"
                  >×</Button>
                </div>
                {#if urlEditErrByRowId[row.row_id]}
                  <p class="row-url-err">{urlEditErrByRowId[row.row_id]}</p>
                {/if}
              {:else if u && u !== 'unknown'}
                <div class="row-url-row">
                  <ExternalLink href={u} />
                  <Button
                    variant="ghost"
                    size="icon"
                    onclick={() => startUrlEdit(row)}
                    title="Edit URL — saves to row-store immediately"
                    aria-label="edit URL"
                  >✎</Button>
                </div>
              {:else}
                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    onclick={() => startUrlEdit(row)}
                    title="Add a primary URL for this record (saves to row-store)"
                  >+ add URL</Button>
                </div>
              {/if}
            </div>
            <div class="row-meta">
              {#if s}<span class="row-socials">{s}</span>{/if}
              <!-- info, not warn: an add in flight is transient and nothing has
                   gone wrong yet. warn is for degraded-with-risk. -->
              {#if pendingCount > 0}
                <Chip size="sm" tone="info" title={`${pendingCount} add(s) in flight`}>⟳ {pendingCount}</Chip>
              {/if}
              {#if failedCount > 0}
                <Chip size="sm" tone="error" title={`${failedCount} failed — expand row to dismiss or retry`}>✗ {failedCount}</Chip>
              {/if}
              <!-- Three states of one label, and only the third means anything
                   beyond a count: `corpus N` says this record already has
                   coverage on disk, which is `ok`. Not-yet-loaded and genuinely
                   empty are both plain facts, so both are neutral — the text
                   ("corpus …" vs "corpus 0") is what tells them apart, never the
                   colour. The loading state also drops an `opacity: 0.5` that was
                   appearance standing in for state. -->
              {#if corpusByRowId[row.row_id] === undefined}
                <Chip size="sm" title="loading corpus count">corpus …</Chip>
              {:else if n === 0}
                <Chip size="sm" title="no corpus content for this record yet">corpus 0</Chip>
              {:else}
                <Chip size="sm" tone="ok" title={`${n} corpus ${n === 1 ? 'file' : 'files'} on disk`}>corpus {n}</Chip>
              {/if}
              <Button
                variant={expanded ? 'secondary' : 'outline'}
                size="sm"
                onclick={() => toggleAddRow(row.row_id)}
                title="Add a URL to this record's corpus"
                aria-expanded={expanded}
              >+ URL</Button>
            </div>
          </div>
          {#if expanded}
            <div class="row-add">
              <label class="row-add-label" for={`url-${row.row_id}`}>
                Paste a URL — Jina-fetches in the background, writes to
                <code>clients/&lt;client&gt;/corpus/{funderSlugFor(nameOf(row), row.row_id)}/</code>
              </label>
              <div class="row-add-input-row">
                <input
                  id={`url-${row.row_id}`}
                  class="row-add-input"
                  type="url"
                  placeholder="https://…  (Enter = submit + clear; Esc closes)"
                  bind:value={
                    () => urlDraftByRowId[row.row_id] ?? '',
                    (v) => (urlDraftByRowId = { ...urlDraftByRowId, [row.row_id]: v })
                  }
                  onkeydown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      submitAdd(row);
                    } else if (e.key === 'Escape') {
                      toggleAddRow(row.row_id);
                    }
                  }}
                />
                <Button
                  variant="primary"
                  size="sm"
                  onclick={() => submitAdd(row)}
                  disabled={!(urlDraftByRowId[row.row_id] ?? '').trim()}
                  title="Queue this URL — backend Jina-fetch + corpus.add run in background"
                >Add</Button>
              </div>
              {#if validationErr}
                <p class="row-add-err">{validationErr}</p>
              {/if}
              {#if pendingList.length > 0}
                <ul class="pending-list" aria-label="Recent adds for this record">
                  {#each pendingList as p (p.id)}
                    {@const elapsed = nowMs - p.started_at}
                    <!-- Rung 4 was spent here and is now retired twice over. `tone`
                         replaced the style= boundary colour, and `as="li"` replaced
                         the wrapper <li> this was nested inside. What is left is
                         rung 1 only: no class=, no style=, no data-deviation.
                         The three `.p-*` state classes went with them — CardRow
                         publishes `data-tone`, so the member's own descendants read
                         the state off the row instead of off a duplicate class. -->
                    <CardRow as="li" density="compact" tone={pendingTone(p.status)}>
                      <span class="pending-icon" aria-hidden="true">
                        {#if p.status === 'pending'}⟳{:else if p.status === 'ok'}✓{:else}✗{/if}
                      </span>
                      <span class="pending-url" title={p.url}>{p.url}</span>
                      {#if p.status === 'pending'}
                        <span class="pending-meta">{fmtElapsed(elapsed)}</span>
                      {:else if p.status === 'failed'}
                        <span class="pending-meta">{p.error}</span>
                      {:else}
                        <span class="pending-meta">added</span>
                      {/if}
                      <Button
                        variant="ghost"
                        size="icon"
                        onclick={() => dismissPending(row.row_id, p.id)}
                        title={p.status === 'pending' ? 'dismiss (request keeps running in background)' : 'dismiss'}
                        aria-label="dismiss"
                      >×</Button>
                    </CardRow>
                  {/each}
                </ul>
              {/if}
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<!-- One record-set option. Appearance only: Selector--Listbox owns the keyboard
     and the selected state. Same split as ListContainer / CardRow. -->
{#snippet recordSetOption(o: { id: string; label: string })}
  <span class="sfl-btn-content-row">
    <span class="picker-row-name">{o.label}</span>
    <span class="picker-row-meta">{recordSets.find((rs) => rs.record_set_id === o.id)?.row_ids.length ?? 0} rows</span>
  </span>
{/snippet}
