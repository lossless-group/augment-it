<script lang="ts">
  import { onMount } from 'svelte';
  import {
    workspace,
    type PromptTemplate,
    type RecordSet,
    type ResponseRecord,
    type ResponseFlag,
    type Row,
    type HelpfulLink,
  } from '@augment-it/workspace';
  import ConfidencePill from '@augment-it/shared-ui/ConfidencePill.svelte';
  import { MOCK_PACKS_FIXTURE } from './fixtures/mock-packs';

  // Each remote owns its own workspace singleton + WebSocket — no `shared`
  // federation block (see the 2026-05-21_03 changelog).
  const TOKEN_KEY = 'augment-it:session-token';
  const WS_URL = 'ws://localhost:3001/ws';

  const FLAGS: ResponseFlag[] = ['good', 'partial', 'wrong', 'needs-rerun', 'needs-human'];

  let status = $state<'connecting' | 'open' | 'closed' | 'error'>('connecting');

  let responses = $state<ResponseRecord[]>([]);
  let promptsById = $state<Record<string, PromptTemplate>>({});
  let recordSetsById = $state<Record<string, RecordSet>>({});

  let filter = $state<'all' | 'unflagged' | ResponseFlag>('all');
  let index = $state(0);
  let editText = $state('');
  let busy = $state('');
  let refreshing = $state(false);
  let lastRefreshAt = $state<number | null>(null);
  let editSavedAt = $state<number | null>(null);
  let editDirty = $state(false);
  let savingEdit = $state(false);

  // helpful-links state — the current row's full record, fetched from row-store
  // whenever the focused response changes. Links live in row.fields.helpful_links.
  let currentRow = $state<Row | null>(null);
  let newLinkUrl = $state('');
  let newLinkNote = $state('');
  let addingLink = $state(false);
  let linkBusy = $state('');

  const helpfulLinks = $derived.by(() => {
    const raw = (currentRow?.fields as Record<string, unknown> | undefined)?.helpful_links;
    return Array.isArray(raw) ? (raw as HelpfulLink[]) : [];
  });

  // editText is reset only when the *response_id* changes, so a background
  // refresh (a flag landing, a new response) doesn't clobber an in-progress
  // edit of the same response.
  let editTextForId = '';

  const filtered = $derived(
    responses.filter((r) => {
      if (filter === 'all') return true;
      if (filter === 'unflagged') return r.flag === null;
      return r.flag === filter;
    }),
  );
  const current = $derived(filtered[index] ?? null);

  // Per-bucket counts for the filter chips, computed once per responses change.
  const counts = $derived.by(() => {
    const c: Record<string, number> = {
      all: responses.length,
      unflagged: 0,
      good: 0,
      partial: 0,
      wrong: 0,
      'needs-rerun': 0,
      'needs-human': 0,
    };
    for (const r of responses) {
      if (r.flag === null) c.unflagged += 1;
      else c[r.flag] = (c[r.flag] ?? 0) + 1;
    }
    return c;
  });

  const firedPrompt = $derived.by(() => {
    const rb = current?.request_body as { messages?: { content?: unknown }[] } | undefined;
    const content = rb?.messages?.[0]?.content;
    return typeof content === 'string' ? content : '';
  });
  const promptName = $derived(
    current ? (promptsById[current.prompt_id]?.name ?? current.prompt_id) : '',
  );
  const recordSetName = $derived(
    current ? (recordSetsById[current.record_set_id]?.name ?? current.record_set_id) : '',
  );

  // Outcome-driven rendering for pack responses. Found responses render the
  // existing editor + actions; the other four outcomes render thin rows in
  // place of the editor. The candidate card (when structured !== null) sits
  // above whatever body the outcome chose. See:
  // context-v/blueprints/Packs-and-Bundles-Pattern.md §Bundle anatomy/§5
  const isFound = $derived(current?.outcome === 'found');
  let snippetExpanded = $state(false);
  $effect(() => {
    // collapse the snippet whenever the focused response changes
    void current?.response_id;
    snippetExpanded = false;
  });

  onMount(() => {
    workspace.connect({
      url: WS_URL,
      getToken: () => localStorage.getItem(TOKEN_KEY),
      saveToken: (t) => localStorage.setItem(TOKEN_KEY, t),
      onStatus: (s) => (status = s),
    });
    void loadResponses();
    void loadPrompts();
    void loadRecordSets();

    // Belt-and-suspenders: if the user closes the tab or hard-refreshes with
    // an unsaved edit, fire one last best-effort autosave. (Browsers may not
    // wait for the promise — the onblur autosave does the real work.)
    const beforeUnload = () => { void flushEdit(); };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  });

  // refresh when a response is created, flagged, or deleted — seq-cursor dedup.
  let lastSeq = -1;
  $effect(() => {
    const ev = workspace.events[workspace.events.length - 1];
    if (!ev || ev.seq <= lastSeq) return;
    lastSeq = ev.seq;
    if (
      ev.subject === 'response.created' ||
      ev.subject === 'response.flagged' ||
      ev.subject === 'response.deleted' ||
      ev.subject === 'response.edited'
    ) {
      void loadResponses();
    }
    // Refresh the current row whenever it gets updated (helpful_links changed
    // here or elsewhere, or any other field write).
    if (ev.subject === 'row.updated') {
      const p = ev.payload as { row_id?: string };
      if (p.row_id && p.row_id === current?.row_id) void loadCurrentRow();
    }
  });

  // load the row record whenever the focused response changes
  $effect(() => {
    const c = current;
    if (!c) {
      currentRow = null;
      return;
    }
    void loadCurrentRow();
  });

  async function loadCurrentRow() {
    if (!current) return;
    try {
      const r = (await workspace.invoke('row.get', { row_id: current.row_id })) as { row: Row | null };
      currentRow = r.row;
    } catch (e) {
      console.error('row.get', e);
    }
  }

  async function addHelpfulLink() {
    if (!current) return;
    const url = newLinkUrl.trim();
    if (!url) return;
    addingLink = true;
    linkBusy = '';
    try {
      const result = (await workspace.invoke('row.helpful_links.add', {
        row_id: current.row_id,
        url,
        note: newLinkNote.trim(),
        response_id: current.response_id,
      })) as { row: Row };
      currentRow = result.row;
      newLinkUrl = '';
      newLinkNote = '';
    } catch (e) {
      linkBusy = `add failed — ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      addingLink = false;
    }
  }

  async function removeHelpfulLink(link_id: string) {
    if (!current) return;
    try {
      const result = (await workspace.invoke('row.helpful_links.remove', {
        row_id: current.row_id,
        link_id,
      })) as { row: Row };
      currentRow = result.row;
    } catch (e) {
      linkBusy = `remove failed — ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  function linkLabel(link: HelpfulLink): string {
    if (link.label) return link.label;
    try {
      return new URL(link.url).hostname.replace(/^www\./, '');
    } catch {
      return link.url;
    }
  }

  // keep the stepper index inside the filtered list
  $effect(() => {
    const len = filtered.length;
    if (index >= len) index = Math.max(0, len - 1);
  });

  // load the editable copy when the focused response changes. Critically:
  // if the OUTGOING response has unsaved edits, flush them to the server
  // before swapping in the new response's text — stepping must never lose
  // typed content.
  $effect(() => {
    const c = current;
    if (!c) {
      void flushEdit();
      editText = '';
      editTextForId = '';
      return;
    }
    if (c.response_id !== editTextForId) {
      // flush pending edits on the response we're leaving
      void flushEdit();
      editText = c.edited_text ?? c.response_text;
      editTextForId = c.response_id;
      editDirty = false;
      editSavedAt = c.edited_at ? Date.parse(c.edited_at) : null;
    }
  });

  // any non-trivial change marks the editor dirty; autosave fires on blur.
  function onEditInput() {
    if (!current) return;
    const saved = current.edited_text ?? current.response_text;
    editDirty = editText !== saved;
  }

  async function flushEdit(): Promise<void> {
    // Use editTextForId, not current.response_id — current may already be
    // pointing at the next response by the time this fires.
    const targetId = editTextForId;
    if (!targetId || !editDirty) return;
    const pending = editText;
    savingEdit = true;
    try {
      await workspace.invoke('response.set_text', {
        response_id: targetId,
        edited_text: pending,
      });
      // Only clear dirty if the editor is still on the same response;
      // if the user kept typing on it in the meantime, leave dirty=true.
      if (targetId === editTextForId && editText === pending) {
        editDirty = false;
        editSavedAt = Date.now();
      }
    } catch (e) {
      console.error('response.set_text', e);
      busy = `autosave failed — ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      savingEdit = false;
    }
  }

  // Detect `?fixture=mock-packs` once on mount. When set, prepend the mock
  // pack-shaped responses to the live list so every outcome+confidence band
  // is visible side-by-side. Mocks are NEVER persisted — clearing them is a
  // refresh away (drop the query param). Spec:
  // context-v/prompts/Response-Reviewer-Structured-Output-Extension.md
  const fixtureMode =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('fixture') === 'mock-packs';

  async function loadResponses() {
    try {
      const r = (await workspace.invoke('response.list', {})) as { responses: ResponseRecord[] };
      responses = fixtureMode ? [...MOCK_PACKS_FIXTURE, ...r.responses] : r.responses;
      lastRefreshAt = Date.now();
    } catch (e) {
      console.error('response.list', e);
    }
  }

  async function manualRefresh() {
    refreshing = true;
    try {
      await Promise.all([loadResponses(), loadPrompts(), loadRecordSets()]);
    } finally {
      refreshing = false;
    }
  }

  function formatAge(ts: number | null): string {
    if (ts === null) return 'never';
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 5) return 'just now';
    if (s < 60) return `${s}s ago`;
    return `${Math.floor(s / 60)}m ago`;
  }

  async function loadPrompts() {
    try {
      const r = (await workspace.invoke('prompt.list', {})) as { prompts: PromptTemplate[] };
      const map: Record<string, PromptTemplate> = {};
      for (const p of r.prompts) map[p.prompt_id] = p;
      promptsById = map;
    } catch (e) {
      console.error('prompt.list', e);
    }
  }

  async function loadRecordSets() {
    try {
      const r = (await workspace.invoke('record_set.list', {})) as { record_sets: RecordSet[] };
      const map: Record<string, RecordSet> = {};
      for (const rs of r.record_sets) map[rs.record_set_id] = rs;
      recordSetsById = map;
    } catch (e) {
      console.error('record_set.list', e);
    }
  }

  function step(delta: number) {
    index = Math.min(Math.max(index + delta, 0), Math.max(filtered.length - 1, 0));
  }

  async function flag(f: ResponseFlag) {
    if (!current) return;
    busy = 'flagging…';
    try {
      await workspace.invoke('response.flag', { response_id: current.response_id, flag: f });
      await loadResponses();
      busy = '';
    } catch (e) {
      busy = `flag failed — ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  async function accept() {
    if (!current) return;
    busy = 'accepting…';
    try {
      // Pass the current editor contents whenever they differ from what's
      // saved on the response; the server side picks `value` over edited_text
      // over response_text, so this always reflects the latest edit. (Also
      // flushes any pending autosave by virtue of the explicit value.)
      const savedText = current.edited_text ?? current.response_text;
      const value = editText !== savedText ? editText : undefined;
      await workspace.invoke('response.accept', {
        response_id: current.response_id,
        value,
      });
      editDirty = false;
      editSavedAt = Date.now();
      await loadResponses();
      busy = 'accepted → value written to the row cell';
    } catch (e) {
      busy = `accept failed — ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  async function deleteCurrent() {
    if (!current) return;
    if (!window.confirm(`Delete this response? (It will not affect any cell value already accepted to a row.)`)) return;
    busy = 'deleting…';
    try {
      await workspace.invoke('response.delete', { response_id: current.response_id });
      await loadResponses();
      busy = '';
    } catch (e) {
      busy = `delete failed — ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  async function clearVisible() {
    if (filtered.length === 0) return;
    const scopeLabel =
      filter === 'all' ? `all ${filtered.length} responses` : `${filtered.length} "${filter}" responses`;
    if (!window.confirm(`Clear ${scopeLabel}? This cannot be undone.`)) return;
    busy = 'clearing…';
    try {
      // The store's delete_all takes a ResponseFilter; the UI filter has an
      // extra 'unflagged' bucket that the store can't express directly, so
      // we fall back to per-id deletes in that one case. Everything else maps
      // to a single bulk call.
      if (filter === 'unflagged') {
        await Promise.all(
          filtered.map((r) => workspace.invoke('response.delete', { response_id: r.response_id })),
        );
      } else if (filter === 'all') {
        await workspace.invoke('response.delete_all', {});
      } else {
        await workspace.invoke('response.delete_all', { flag: filter });
      }
      index = 0;
      await loadResponses();
      busy = '';
    } catch (e) {
      busy = `clear failed — ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  function rerun() {
    if (!current) return;
    // hand the row back to request-reviewer (it listens for this event when
    // mounted) and flag this response so the triage list reflects it.
    window.dispatchEvent(
      new CustomEvent('augment-it:review-request', {
        detail: {
          prompt_id: current.prompt_id,
          record_set_id: current.record_set_id,
          row_id: current.row_id,
        },
      }),
    );
    void flag('needs-rerun');
  }
</script>

<div class="resp-app">
  <div class="resp-status-bar">
    consumes <code>@augment-it/workspace</code> · <code>{WS_URL}</code> ·
    <span class="status status-{status}">{status}</span>
  </div>

  <div class="resp-body">
    <div class="resp-head">
      <h2>Response Reviewer</h2>
      <div class="filters">
        {#each ['all', 'unflagged', 'good', 'partial', 'wrong', 'needs-human'] as f (f)}
          <button
            class="chip"
            class:active={filter === f}
            onclick={() => {
              filter = f as typeof filter;
              index = 0;
            }}>{f} <span class="chip-count">{counts[f] ?? 0}</span></button>
        {/each}
        <button
          class="chip refresh"
          onclick={() => void manualRefresh()}
          disabled={refreshing}
          title="Pull the latest responses from the server"
        >{refreshing ? 'refreshing…' : '↻ refresh'}</button>
        <button
          class="chip danger filter-clear"
          onclick={() => void clearVisible()}
          disabled={filtered.length === 0}
          data-tip={`Clear ${filter === 'all' ? 'all' : `"${filter}"`} responses (${filtered.length})`}
          aria-label={`Clear ${filter === 'all' ? 'all' : filter} responses, ${filtered.length} total`}
        >🧹 <span class="count">{filtered.length}</span></button>
        <span class="muted refresh-age">
          {responses.length} loaded · updated {formatAge(lastRefreshAt)}
        </span>
      </div>
    </div>

    {#if filtered.length === 0}
      <p class="muted">
        No responses{filter === 'all' ? ' yet' : ` match “${filter}”`}. Fire a
        prompt from Request Reviewer and they land here.
      </p>
    {:else if current}
      <div class="stepper">
        <button onclick={() => step(-1)} disabled={index === 0}>◀</button>
        <span>response {index + 1} / {filtered.length}</span>
        <button onclick={() => step(1)} disabled={index >= filtered.length - 1}>▶</button>
        {#if current.flag}<span class="flag flag-{current.flag}">{current.flag}</span>{/if}
        {#if current.accepted}<span class="flag accepted">accepted</span>{/if}
        {#if current.pack_id}<span class="flag pack-badge" title="response produced by pack">{current.pack_id}</span>{/if}
        {#if isFound}
          <span class="stepper-sep" aria-hidden="true"></span>
          <span class="muted stepper-label">triage:</span>
          <div class="flags inline">
            {#each FLAGS as f (f)}
              <button
                class="chip"
                class:active={current.flag === f}
                onclick={() => flag(f)}
              >{f}</button>
            {/each}
          </div>
        {:else}
          <span class="stepper-sep" aria-hidden="true"></span>
          <span class="muted stepper-label">outcome: {current.outcome}</span>
        {/if}
      </div>

      <div class="resp-layout">
        <aside class="context">
          <h3>Context</h3>
          <dl>
            <dt>Prompt</dt><dd>{promptName}</dd>
            <dt>Record set</dt><dd>{recordSetName}</dd>
            <dt>Model</dt><dd><code>{current.model}</code></dd>
            <dt>Output column</dt><dd><code>{current.output_column}</code></dd>
          </dl>
          <h3>Prompt fired</h3>
          <pre class="panel">{firedPrompt}</pre>
          <p class="muted hint">
            The full JSON request lives in Request Reviewer — this stage is
            about the response.
          </p>

          <h3>Helpful links for this record</h3>
          <p class="muted hint">
            Anything you found while researching — a foundation page, a
            LinkedIn, a related grantee — gets attached to the <em>row</em>,
            not just this response. Survives future enrichment runs.
          </p>

          <ul class="links">
            {#each helpfulLinks as link (link.link_id)}
              <li>
                <a href={link.url} target="_blank" rel="noopener noreferrer">{linkLabel(link)}</a>
                {#if link.note}<span class="link-note">{link.note}</span>{/if}
                <button
                  class="link-remove"
                  onclick={() => void removeHelpfulLink(link.link_id)}
                  aria-label="remove link"
                  title="Remove this link"
                >×</button>
              </li>
            {/each}
            {#if helpfulLinks.length === 0}
              <li class="muted empty">no links yet</li>
            {/if}
          </ul>

          <form
            class="link-form"
            onsubmit={(e) => { e.preventDefault(); void addHelpfulLink(); }}
          >
            <input
              type="url"
              bind:value={newLinkUrl}
              placeholder="https://…"
              required
              disabled={addingLink}
            />
            <input
              type="text"
              bind:value={newLinkNote}
              placeholder="optional note — why this link?"
              disabled={addingLink}
            />
            <button type="submit" disabled={addingLink || !newLinkUrl.trim()}>
              {addingLink ? 'saving…' : '+ add link'}
            </button>
          </form>
          {#if linkBusy}<p class="result muted">{linkBusy}</p>{/if}
        </aside>

        <section class="response">
          {#if current.structured}
            <!-- Candidate card — present iff a pack produced a structured payload.
                 Sits above whatever body the outcome chose. -->
            <div class="candidate-card">
              <div class="candidate-row">
                <ConfidencePill confidence={current.structured.confidence} />
                <a
                  class="candidate-url"
                  href={current.structured.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >{current.structured.url}</a>
                <span class="candidate-name">{current.structured.display_name}</span>
                {#if current.pack_id}
                  <span class="source-badge" title="produced by this pack">{current.pack_id}</span>
                {/if}
              </div>
              {#if current.structured.snippet}
                <button
                  class="snippet-toggle"
                  onclick={() => (snippetExpanded = !snippetExpanded)}
                  aria-expanded={snippetExpanded}
                >
                  {snippetExpanded ? '▾' : '▸'} snippet
                </button>
                {#if snippetExpanded}
                  <p class="candidate-snippet">{current.structured.snippet}</p>
                {/if}
              {/if}
            </div>
          {/if}

          {#if isFound}
            <h3>
              Response — editable; edits autosave when you click away or step
              <span class="save-state" class:dirty={editDirty} class:saving={savingEdit}>
                {#if savingEdit}saving…
                {:else if editDirty}unsaved
                {:else if editSavedAt}saved {formatAge(editSavedAt)}
                {/if}
              </span>
            </h3>
            <textarea
              bind:value={editText}
              rows="16"
              oninput={onEditInput}
              onblur={() => void flushEdit()}
            ></textarea>

            <div class="actions icon-row">
              <button
                class="icon accept"
                onclick={accept}
                data-tip="Accept whole response → cell"
                aria-label="Accept whole response and write to row cell"
              >✓</button>
              <button
                class="icon"
                onclick={rerun}
                data-tip="Re-run this row in Request Reviewer"
                aria-label="Re-run in Request Reviewer"
              >↻</button>
              <button
                class="icon"
                disabled
                data-tip="Distill in Highlight Collector — a future stage"
                aria-label="Distill in Highlight Collector"
              >✦</button>
              <button
                class="icon danger"
                onclick={() => void deleteCurrent()}
                data-tip="Delete this response"
                aria-label="Delete this response"
              >🗑</button>
            </div>
          {:else if current.outcome === 'not_found'}
            <div class="thin-row outcome-not-found">
              <span class="thin-row-icon">∅</span>
              <span class="thin-row-body">Source ran, zero candidates.</span>
            </div>
          {:else if current.outcome === 'error'}
            <div class="thin-row outcome-error">
              <span class="thin-row-icon">✕</span>
              <span class="thin-row-body">{current.response_text || 'unknown error'}</span>
              <button
                class="icon"
                disabled
                data-tip="Retry coming in a later feature"
                aria-label="Retry — coming in a later feature"
              >↻ retry</button>
              <button
                class="icon danger"
                onclick={() => void deleteCurrent()}
                data-tip="Delete this response"
                aria-label="Delete this response"
              >🗑</button>
            </div>
          {:else if current.outcome === 'skipped'}
            <div class="thin-row outcome-skipped">
              <span class="thin-row-icon">⤴</span>
              <span class="thin-row-body">
                Pre-populated from existing data (dedup hit). Already marked good above.
              </span>
            </div>
          {:else if current.outcome === 'pending'}
            <div class="thin-row outcome-pending">
              <span class="spinner" aria-hidden="true"></span>
              <span class="thin-row-body">Source in flight…</span>
            </div>
          {/if}
        </section>
      </div>
      {#if busy}<p class="result">{busy}</p>{/if}
    {/if}
  </div>
</div>
