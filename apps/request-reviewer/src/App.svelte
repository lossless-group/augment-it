<script lang="ts">
  import { onMount } from 'svelte';
  import {
    workspace,
    MODELS,
    DEFAULT_MODEL,
    DEFAULT_MAX_TOKENS,
    type PromptTemplate,
    type RecordSet,
    type Row,
    type PreviewResult,
    type Coverage,
  } from '@augment-it/workspace';

  // Each remote owns its own workspace singleton + WebSocket — no `shared`
  // federation block (see the 2026-05-21_03 changelog).
  const TOKEN_KEY = 'augment-it:session-token';
  const WS_URL = 'ws://localhost:3001/ws';

  let status = $state<'connecting' | 'open' | 'closed' | 'error'>('connecting');

  // pickers + row stepper
  let prompts = $state<PromptTemplate[]>([]);
  let recordSets = $state<RecordSet[]>([]);
  let rows = $state<Row[]>([]);
  let promptId = $state<string | null>(null);
  let recordSetId = $state<string | null>(null);
  let rowIndex = $state(0);

  // request knobs
  let model = $state<string>(DEFAULT_MODEL);
  let maxTokens = $state<number>(DEFAULT_MAX_TOKENS);
  let view = $state<'resolved' | 'json'>('resolved');

  // preview (driven by prompt.preview — no LLM call)
  let preview = $state<PreviewResult | null>(null);
  let previewError = $state('');
  let previewing = $state(false);

  // fire
  let firing = $state(false);
  let fireMessage = $state('');
  let fireProgress = $state<{ done: number; total: number } | null>(null);
  let rowLimit = $state(25);

  // coverage — derived from response-store, refreshed whenever the prompt/
  // record-set selection changes or a response event lands.
  let coverage = $state<Coverage | null>(null);
  let includeNeedsRerun = $state(false);

  const coveredSet = $derived(new Set(coverage?.covered_row_ids ?? []));
  const needsRerunSet = $derived(new Set(coverage?.needs_rerun_row_ids ?? []));

  const uncoveredRowIds = $derived(
    rows.filter((r) => !coveredSet.has(r.row_id) && !needsRerunSet.has(r.row_id)).map((r) => r.row_id),
  );
  const remainingRowIds = $derived(
    includeNeedsRerun
      ? [...uncoveredRowIds, ...(coverage?.needs_rerun_row_ids ?? []).filter((id) => rows.some((r) => r.row_id === id))]
      : uncoveredRowIds,
  );
  const coveredInSetCount = $derived(
    rows.filter((r) => coveredSet.has(r.row_id)).length,
  );
  const needsRerunInSetCount = $derived(
    rows.filter((r) => needsRerunSet.has(r.row_id)).length,
  );

  // a record-set chosen via the handoff event wants a specific row focused
  let pendingFocusRowId: string | null = null;

  const selectedRow = $derived(rows[rowIndex] ?? null);
  const previewOk = $derived(preview && preview.ok ? preview : null);
  const canFire = $derived(
    previewOk != null && previewOk.unbound_tokens.length === 0 && !firing,
  );
  const jsonText = $derived(
    previewOk ? JSON.stringify(previewOk.request_body, null, 2) : '',
  );

  onMount(() => {
    workspace.connect({
      url: WS_URL,
      getToken: () => localStorage.getItem(TOKEN_KEY),
      saveToken: (t) => localStorage.setItem(TOKEN_KEY, t),
      onStatus: (s) => (status = s),
    });
    void loadPrompts();
    void loadRecordSets();

    // Handoff — response-reviewer's "re-run" (and, later, the per-record
    // enrich control) dispatch this to preload a prompt + record + row.
    const onReview = (e: Event) => {
      const d = (e as CustomEvent).detail as {
        prompt_id?: string;
        record_set_id?: string;
        row_id?: string;
      };
      // the handoff may name a just-created prompt or record set — refresh
      // the pickers so the selection resolves to a real option.
      void loadPrompts();
      void loadRecordSets();
      if (d.prompt_id) promptId = d.prompt_id;
      if (d.record_set_id) {
        pendingFocusRowId = d.row_id ?? null;
        recordSetId = d.record_set_id;
      }
    };
    window.addEventListener('augment-it:review-request', onReview);
    return () => window.removeEventListener('augment-it:review-request', onReview);
  });

  // run-progress events — seq-cursor dedup (the record-collector lesson).
  let lastSeq = -1;
  $effect(() => {
    const ev = workspace.events[workspace.events.length - 1];
    if (!ev || ev.seq <= lastSeq) return;
    lastSeq = ev.seq;
    if (ev.subject === 'prompt.run.progress') {
      const p = ev.payload as { done: number; total: number };
      fireProgress = { done: p.done, total: p.total };
    }
    // Anything that changes the response inventory invalidates our coverage view.
    if (
      ev.subject === 'response.created' ||
      ev.subject === 'response.flagged' ||
      ev.subject === 'response.deleted' ||
      ev.subject === 'prompt.run.completed'
    ) {
      void refreshCoverage();
    }
  });

  // Pull coverage whenever the prompt + record set are both chosen.
  $effect(() => {
    const p = promptId;
    const rs = recordSetId;
    if (!p || !rs) {
      coverage = null;
      return;
    }
    void refreshCoverage();
  });

  async function refreshCoverage() {
    if (!promptId || !recordSetId) return;
    try {
      const r = (await workspace.invoke('response.coverage', {
        prompt_id: promptId,
        record_set_id: recordSetId,
      })) as Coverage;
      coverage = r;
    } catch (e) {
      console.error('response.coverage', e);
    }
  }

  // load the chosen record set's rows whenever the selection changes
  $effect(() => {
    const rs = recordSetId;
    if (!rs) {
      rows = [];
      return;
    }
    const focus = pendingFocusRowId;
    pendingFocusRowId = null;
    void loadRows(rs, focus ?? undefined);
  });

  // rebuild the preview whenever an input changes — debounced so typing in
  // the max_tokens field doesn't fire a request per keystroke.
  let previewTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const p = promptId;
    const rs = recordSetId;
    const row = selectedRow;
    const m = model;
    const mt = maxTokens;
    clearTimeout(previewTimer);
    if (!p || !rs || !row) {
      preview = null;
      previewError = '';
      return;
    }
    previewTimer = setTimeout(() => void runPreview(p, rs, row.row_id, m, mt), 250);
    return () => clearTimeout(previewTimer);
  });

  async function loadPrompts() {
    try {
      const r = (await workspace.invoke('prompt.list', {})) as { prompts: PromptTemplate[] };
      prompts = r.prompts;
    } catch (e) {
      console.error('prompt.list', e);
    }
  }

  async function loadRecordSets() {
    try {
      const r = (await workspace.invoke('record_set.list', {})) as { record_sets: RecordSet[] };
      recordSets = r.record_sets;
    } catch (e) {
      console.error('record_set.list', e);
    }
  }

  async function loadRows(rsId: string, focusRowId?: string) {
    try {
      const r = (await workspace.invoke('record_set.get', { record_set_id: rsId })) as {
        rows: Row[];
      };
      rows = r.rows;
      rowIndex = focusRowId
        ? Math.max(0, rows.findIndex((x) => x.row_id === focusRowId))
        : 0;
    } catch (e) {
      console.error('record_set.get', e);
      rows = [];
    }
  }

  function stepRow(delta: number) {
    rowIndex = Math.min(Math.max(rowIndex + delta, 0), Math.max(rows.length - 1, 0));
  }

  async function runPreview(
    prompt_id: string,
    record_set_id: string,
    row_id: string,
    m: string,
    mt: number,
  ) {
    previewing = true;
    previewError = '';
    try {
      const res = (await workspace.invoke('prompt.preview', {
        prompt_id,
        record_set_id,
        row_id,
        model: m,
        max_tokens: mt,
      })) as PreviewResult;
      if (res.ok) {
        preview = res;
      } else {
        preview = null;
        previewError = res.error;
      }
    } catch (e) {
      preview = null;
      previewError = e instanceof Error ? e.message : String(e);
    } finally {
      previewing = false;
    }
  }

  async function fire(scope: 'row' | 'set' | 'remaining') {
    if (!promptId || !recordSetId) return;
    if (scope === 'row' && !selectedRow) return;
    if (scope === 'remaining' && remainingRowIds.length === 0) return;
    firing = true;
    fireMessage = '';
    fireProgress = null;
    const args: Record<string, unknown> = {
      prompt_id: promptId,
      record_set_id: recordSetId,
      model,
      max_tokens: maxTokens,
    };
    if (scope === 'row') args.row_ids = [selectedRow!.row_id];
    else if (scope === 'remaining') args.row_ids = remainingRowIds;
    else args.row_limit = rowLimit;
    try {
      const res = (await workspace.invoke('prompt.run', args)) as
        | { ok: true; row_count: number; cancelled?: boolean }
        | { ok: false; error: string };
      if (res.ok && res.cancelled) {
        fireMessage = `cancelled — ${res.row_count} row${res.row_count === 1 ? '' : 's'} completed before stop`;
      } else if (res.ok) {
        fireMessage = `fired — ${res.row_count} row${res.row_count === 1 ? '' : 's'}; the responses are waiting in Response Reviewer`;
      } else {
        fireMessage = `run rejected — ${res.error}`;
      }
    } catch (e) {
      fireMessage = `run failed — ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      firing = false;
      fireProgress = null;
    }
  }

  async function cancelRun() {
    if (!recordSetId || !firing) return;
    try {
      await workspace.invoke('prompt.run.cancel', { record_set_id: recordSetId });
      fireMessage = 'cancellation requested — the current row will finish (or time out at 90s) then stop';
    } catch (e) {
      fireMessage = `cancel failed — ${e instanceof Error ? e.message : String(e)}`;
    }
  }
</script>

<div class="req-app">
  <div class="req-status-bar">
    consumes <code>@augment-it/workspace</code> · <code>{WS_URL}</code> ·
    <span class="status status-{status}">{status}</span>
  </div>

  <div class="req-body">
    <h2>Request Reviewer</h2>
    <p class="muted lede">
      The pre-flight surface — see exactly what is about to be sent to the
      model, pick the model, then fire it.
    </p>

    <div class="field">
      <label for="rr-prompt">Prompt</label>
      <select id="rr-prompt" bind:value={promptId}>
        <option value={null} disabled>— choose a prompt —</option>
        {#each prompts as p (p.prompt_id)}
          <option value={p.prompt_id}>{p.name} → {p.output_column}</option>
        {/each}
      </select>
    </div>

    <div class="field">
      <label for="rr-records">Record set</label>
      <select id="rr-records" bind:value={recordSetId}>
        <option value={null} disabled>— choose a record set —</option>
        {#each recordSets as rs (rs.record_set_id)}
          <option value={rs.record_set_id}>{rs.name} ({rs.row_ids.length} rows)</option>
        {/each}
      </select>
    </div>

    {#if rows.length > 0}
      <div class="stepper">
        <button onclick={() => stepRow(-1)} disabled={rowIndex === 0}>◀</button>
        <span>row {rowIndex + 1} / {rows.length}</span>
        <button onclick={() => stepRow(1)} disabled={rowIndex >= rows.length - 1}>▶</button>
      </div>

      {#if coverage && promptId}
        <div class="coverage">
          <span class="coverage-stat covered">{coveredInSetCount} / {rows.length} covered</span>
          {#if needsRerunInSetCount > 0}
            <span class="coverage-stat needs-rerun">{needsRerunInSetCount} needs-rerun</span>
          {/if}
          <span class="coverage-stat remaining">{uncoveredRowIds.length} remaining</span>
          {#if needsRerunInSetCount > 0}
            <label class="inline">
              <input type="checkbox" bind:checked={includeNeedsRerun} />
              <span class="muted">+ include needs-rerun</span>
            </label>
          {/if}
        </div>
      {/if}
    {/if}

    <div class="knobs">
      <div class="models">
        <span class="knob-label">Model</span>
        {#each MODELS as m (m.id)}
          <button
            class="chip"
            class:active={model === m.id}
            title={m.note}
            onclick={() => (model = m.id)}
          >{m.label}</button>
        {/each}
      </div>
      <label class="inline">
        max_tokens
        <input type="number" min="1" bind:value={maxTokens} />
      </label>
    </div>

    {#if previewError}
      <p class="warn">{previewError}</p>
    {/if}
    {#if previewing && !previewOk}
      <p class="muted">building preview…</p>
    {/if}

    {#if previewOk}
      <div class="view-toggle">
        <button class="chip" class:active={view === 'resolved'} onclick={() => (view = 'resolved')}
          >Resolved prompt</button>
        <button class="chip" class:active={view === 'json'} onclick={() => (view = 'json')}
          >JSON request</button>
      </div>

      {#if view === 'resolved'}
        <pre class="panel">{previewOk.filled_prompt}</pre>
      {:else}
        <pre class="panel json">{jsonText}</pre>
      {/if}

      <h3>Token binding</h3>
      <ul class="bind">
        {#each previewOk.bind as b (b.token)}
          <li class:unbound={!b.bound}>
            <code>{'{{'}{b.token}{'}}'}</code>
            {#if b.bound}
              <span class="arrow">→</span> <span class="val">{b.value}</span>
            {:else}
              <span class="nobind">no matching column in this record set</span>
            {/if}
          </li>
        {/each}
        {#if previewOk.bind.length === 0}
          <li class="muted">this prompt has no {'{{'}token{'}}'} placeholders</li>
        {/if}
      </ul>
      {#if previewOk.unbound_tokens.length > 0}
        <p class="warn">
          {previewOk.unbound_tokens.length} unbound token(s) — fix the prompt or
          choose a record set that has these columns before firing.
        </p>
      {/if}

      <h3>Fire</h3>
      <label class="inline">
        whole-set row limit
        <input type="number" min="1" bind:value={rowLimit} />
      </label>
      <div class="fire-row">
        <button onclick={() => fire('row')} disabled={!canFire}>Fire this row</button>
        <button onclick={() => fire('set')} disabled={!canFire}
          >Fire whole set · limit {rowLimit}</button>
        {#if coverage && remainingRowIds.length > 0}
          <button
            class="remaining"
            onclick={() => fire('remaining')}
            disabled={!canFire}
            title="Fire only rows that have not been processed by this prompt yet{includeNeedsRerun ? ' (plus needs-rerun)' : ''}"
          >Fire remaining ({remainingRowIds.length})</button>
        {/if}
        {#if firing}
          <button class="cancel" onclick={cancelRun}>Cancel run</button>
        {/if}
      </div>
      {#if firing}
        <p class="progress firing-now">
          <span class="spinner" aria-hidden="true"></span>
          {#if fireProgress}
            firing… {fireProgress.done} / {fireProgress.total}
          {:else}
            firing… (the first row is in flight — LLM calls can take 10–60s
            each, especially with web search)
          {/if}
        </p>
      {/if}
      {#if !firing && fireMessage}
        <p class="result">{fireMessage}</p>
      {/if}
    {/if}
  </div>
</div>
