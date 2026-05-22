<script lang="ts">
  import { onMount } from 'svelte';
  import { workspace, type PromptTemplate, type PromptTool } from '@augment-it/workspace';

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

  const prompts = $derived(Object.values(workspace.prompts) as PromptTemplate[]);

  // {{tokens}} referenced by the editor body, distinct, first-seen order
  const tokens = $derived.by(() => {
    const seen = new Set<string>();
    for (const m of editContent.matchAll(TOKEN_RE)) seen.add(m[1].trim());
    return [...seen];
  });

  onMount(() => {
    workspace.connect({
      url: WS_URL,
      getToken: () => localStorage.getItem(TOKEN_KEY),
      saveToken: (t) => localStorage.setItem(TOKEN_KEY, t),
      onStatus: (s) => (status = s),
    });
    void refreshPrompts();
  });

  // prompt CRUD events — seq-cursor dedup so a stale event re-fire on any
  // reactive change doesn't re-process (the record-collector lesson).
  let lastProcessedSeq = -1;
  $effect(() => {
    const ev = workspace.events[workspace.events.length - 1];
    if (!ev || ev.seq <= lastProcessedSeq) return;
    lastProcessedSeq = ev.seq;
    if (
      ev.subject === 'prompt.created' ||
      ev.subject === 'prompt.updated' ||
      ev.subject === 'prompt.deleted'
    ) {
      void refreshPrompts();
    }
  });

  // Carry the selected prompt over to the request-reviewer remote — choosing
  // a saved prompt here auto-selects it there. RUNNING a prompt is
  // request-reviewer's job, not this remote's: this remote authors prompts,
  // request-reviewer reviews and fires the request. The two are separate
  // federated remotes coordinating by window event.
  $effect(() => {
    const prompt_id = selectedPromptId;
    if (!prompt_id) return;
    window.dispatchEvent(
      new CustomEvent('augment-it:review-request', { detail: { prompt_id } }),
    );
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

  function loadIntoEditor(p: PromptTemplate) {
    selectedPromptId = p.prompt_id;
    editName = p.name;
    editDescription = p.description;
    editContent = p.content;
    editOutputColumn = p.output_column;
    editWebSearch = p.tools.includes('web_search');
    saveStatus = '';
  }

  function newPrompt() {
    selectedPromptId = null;
    editName = '';
    editDescription = '';
    editContent = '';
    editOutputColumn = '';
    editWebSearch = false;
    saveStatus = '';
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
          <li class:selected={p.prompt_id === selectedPromptId}>
            <button type="button" class="prompt-select" onclick={() => loadIntoEditor(p)}>
              <strong>{p.name}</strong>
              <span class="muted">→ {p.output_column}{p.tools.includes('web_search') ? ' · web' : ''}</span>
            </button>
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

      {#if selectedPromptId}
        <p class="muted handoff-note">
          To run this prompt — review the resolved request, pick the model,
          fire — open <strong>Request Reviewer</strong>. It already has this
          prompt selected. Authoring lives here; firing lives there.
        </p>
      {/if}
    </section>
  </div>
</div>
