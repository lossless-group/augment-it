<script lang="ts">
  import { onMount } from 'svelte';
  import {
    workspace,
    type PromptTemplate,
    type PromptTool,
    type RecordSet,
  } from '@augment-it/workspace';

  const TOKEN_KEY = 'augment-it:session-token';
  const WS_URL = 'ws://localhost:3001/ws';
  const TOKEN_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;

  let status = $state<'connecting' | 'open' | 'closed' | 'error'>('connecting');

  // editor state — selectedPromptId null means "new, unsaved"
  let selectedPromptId = $state<string | null>(null);
  let editName = $state('');
  let editDescription = $state('');
  let editContent = $state('');
  let editOutputColumn = $state('');
  let editWebSearch = $state(false);
  let saveStatus = $state('');

  // run control state
  let runRecordSetId = $state<string | null>(null);
  let runRowLimit = $state(3);
  let runStatus = $state('');
  let runProgress = $state<{ done: number; total: number } | null>(null);
  let runResultId = $state<string | null>(null);

  const prompts = $derived(Object.values(workspace.prompts) as PromptTemplate[]);
  const recordSets = $derived(Object.values(workspace.record_sets) as RecordSet[]);

  // {{tokens}} referenced by the editor body, distinct, first-seen order
  const tokens = $derived.by(() => {
    const seen = new Set<string>();
    for (const m of editContent.matchAll(TOKEN_RE)) seen.add(m[1].trim());
    return [...seen];
  });

  const runRecordSet = $derived(
    runRecordSetId ? workspace.record_sets[runRecordSetId] : null,
  );

  // bind check: which {{tokens}} match a column in the chosen record set
  const binding = $derived.by(() => {
    if (!runRecordSet) return null;
    const cols = new Set(runRecordSet.schema.fields.map((f) => f.name));
    return tokens.map((t) => ({ token: t, bound: cols.has(t) }));
  });
  const allBound = $derived(binding != null && binding.every((b) => b.bound));

  onMount(() => {
    workspace.connect({
      url: WS_URL,
      getToken: () => localStorage.getItem(TOKEN_KEY),
      saveToken: (t) => localStorage.setItem(TOKEN_KEY, t),
      onStatus: (s) => (status = s),
    });
    void refreshPrompts();
    void refreshRecordSets();
  });

  // run-progress events — seq-cursor dedup so a stale event re-fire on any
  // reactive change doesn't re-process (the record-collector lesson).
  let lastProcessedSeq = -1;
  $effect(() => {
    const ev = workspace.events[workspace.events.length - 1];
    if (!ev || ev.seq <= lastProcessedSeq) return;
    lastProcessedSeq = ev.seq;
    if (ev.subject === 'prompt.run.progress') {
      const p = ev.payload as { done: number; total: number };
      runProgress = { done: p.done, total: p.total };
    } else if (ev.subject === 'prompt.created' || ev.subject === 'prompt.updated' || ev.subject === 'prompt.deleted') {
      void refreshPrompts();
    }
  });

  async function refreshPrompts() {
    try {
      const result = (await workspace.invoke('prompt.list', {})) as { prompts: PromptTemplate[] };
      const next: Record<string, PromptTemplate> = {};
      for (const p of result.prompts) next[p.prompt_id] = p;
      workspace.prompts = next;
    } catch (err: unknown) {
      console.error('prompt.list', err);
    }
  }

  async function refreshRecordSets() {
    try {
      const result = (await workspace.invoke('record_set.list', {})) as { record_sets: RecordSet[] };
      const next: Record<string, RecordSet> = {};
      for (const rs of result.record_sets) next[rs.record_set_id] = rs;
      workspace.record_sets = next;
    } catch (err: unknown) {
      console.error('record_set.list', err);
    }
  }

  function loadIntoEditor(p: PromptTemplate) {
    selectedPromptId = p.prompt_id;
    editName = p.name;
    editDescription = p.description;
    editContent = p.content;
    editOutputColumn = p.output_column;
    editWebSearch = p.tools.includes('web_search');
    saveStatus = '';
    runStatus = '';
    runResultId = null;
  }

  function newPrompt() {
    selectedPromptId = null;
    editName = '';
    editDescription = '';
    editContent = '';
    editOutputColumn = '';
    editWebSearch = false;
    saveStatus = '';
    runStatus = '';
    runResultId = null;
  }

  async function savePrompt() {
    if (!editName.trim() || !editContent.trim() || !editOutputColumn.trim()) {
      saveStatus = 'name, content and output column are all required';
      return;
    }
    const tools: PromptTool[] = editWebSearch ? ['web_search'] : [];
    try {
      if (selectedPromptId) {
        await workspace.invoke('prompt.update', {
          prompt_id: selectedPromptId,
          patch: {
            name: editName,
            description: editDescription,
            content: editContent,
            output_column: editOutputColumn,
            tools,
          },
        });
        saveStatus = 'saved';
      } else {
        const result = (await workspace.invoke('prompt.create', {
          name: editName,
          description: editDescription,
          content: editContent,
          output_column: editOutputColumn,
          tools,
        })) as { prompt: PromptTemplate };
        selectedPromptId = result.prompt.prompt_id;
        saveStatus = 'created';
      }
      await refreshPrompts();
    } catch (err: unknown) {
      saveStatus = `error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  async function deletePrompt() {
    if (!selectedPromptId) return;
    if (!window.confirm(`Delete prompt "${editName}"?`)) return;
    try {
      await workspace.invoke('prompt.delete', { prompt_id: selectedPromptId });
      await refreshPrompts();
      newPrompt();
    } catch (err: unknown) {
      saveStatus = `error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  async function runPrompt() {
    if (!selectedPromptId) {
      runStatus = 'save the prompt before running it';
      return;
    }
    if (!runRecordSetId) {
      runStatus = 'pick a record set to run against';
      return;
    }
    runStatus = 'running…';
    runProgress = null;
    runResultId = null;
    try {
      const result = (await workspace.invoke('prompt.run', {
        prompt_id: selectedPromptId,
        record_set_id: runRecordSetId,
        row_limit: runRowLimit,
      })) as
        | { ok: true; record_set: RecordSet; row_count: number }
        | { ok: false; error: string };
      if (result.ok) {
        runStatus = `done — ${result.row_count} rows enriched`;
        runResultId = result.record_set.record_set_id;
      } else {
        runStatus = `rejected: ${result.error}`;
      }
    } catch (err: unknown) {
      runStatus = `error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
</script>

<div class="ptm-app">
  <div class="ptm-status-bar">
    <span class="muted">
      consumes <code>@augment-it/workspace</code> · {WS_URL} ·
      <span class="status status-{status}">{status}</span>
    </span>
  </div>

  <div class="ptm-layout">
    <aside>
      <h2>Prompts</h2>
      <button onclick={newPrompt}>+ new prompt</button>
      <ul class="prompts">
        {#each prompts as p (p.prompt_id)}
          <li
            class:selected={p.prompt_id === selectedPromptId}
            onclick={() => loadIntoEditor(p)}
            onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); loadIntoEditor(p); } }}
            role="button"
            tabindex="0"
          >
            <strong>{p.name}</strong>
            <span class="muted">→ {p.output_column}{p.tools.includes('web_search') ? ' · web' : ''}</span>
          </li>
        {/each}
        {#if prompts.length === 0}
          <li class="muted empty">no prompts yet</li>
        {/if}
      </ul>
    </aside>

    <section>
      <h2>{selectedPromptId ? 'Edit prompt' : 'New prompt'}</h2>

      <label>Name
        <input type="text" bind:value={editName} placeholder="Find Organisation URL" />
      </label>
      <label>Description
        <input type="text" bind:value={editDescription} placeholder="what this prompt does" />
      </label>
      <label>Prompt body — use <code>{'{{Column Name}}'}</code> to insert a record's column value
        <textarea bind:value={editContent} rows="7" placeholder={'Find the website for {{Prospect / Organization}}. Respond with only the URL.'}></textarea>
      </label>
      <label>Output column — the column name the response populates
        <input type="text" bind:value={editOutputColumn} placeholder="url" />
      </label>
      <label class="checkbox">
        <input type="checkbox" bind:checked={editWebSearch} />
        Enable web search for this prompt
      </label>

      <div class="tokens">
        <span class="muted">tokens in body:</span>
        {#if tokens.length === 0}
          <span class="muted">none</span>
        {:else}
          {#each tokens as t (t)}<code class="token">{t}</code>{/each}
        {/if}
      </div>

      <div class="row">
        <button onclick={savePrompt}>{selectedPromptId ? 'save' : 'create'}</button>
        {#if selectedPromptId}
          <button class="danger" onclick={deletePrompt}>delete</button>
        {/if}
        <span class="muted">{saveStatus}</span>
      </div>

      <h2>Run</h2>
      <label>Record set
        <select bind:value={runRecordSetId}>
          <option value={null}>— pick a record set —</option>
          {#each recordSets as rs (rs.record_set_id)}
            <option value={rs.record_set_id}>{rs.name} ({rs.row_ids.length} rows)</option>
          {/each}
        </select>
      </label>

      {#if binding}
        <div class="bindcheck">
          <span class="muted">bind check:</span>
          {#if binding.length === 0}
            <span class="muted">prompt has no tokens</span>
          {:else}
            {#each binding as b (b.token)}
              <code class="token {b.bound ? 'bound' : 'unbound'}">{b.token}</code>
            {/each}
          {/if}
          {#if !allBound}
            <div class="warn">Unbound tokens aren't columns in this record set — run an enrichment that adds them first.</div>
          {/if}
        </div>
      {/if}

      <label class="inline">Row limit
        <input type="number" min="1" max="500" bind:value={runRowLimit} />
      </label>

      <div class="row">
        <button onclick={runPrompt} disabled={!selectedPromptId || !runRecordSetId || (binding != null && !allBound)}>
          run prompt
        </button>
        <span class="muted">{runStatus}</span>
      </div>

      {#if runProgress}
        <div class="progress">enriching… {runProgress.done} / {runProgress.total}</div>
      {/if}
      {#if runResultId}
        <div class="result">
          derived record set created: <code>{runResultId}</code>
          <span class="muted">— open it in Record Collector</span>
        </div>
      {/if}
    </section>
  </div>
</div>
