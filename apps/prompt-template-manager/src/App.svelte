<script lang="ts">
  import { onMount } from 'svelte';
  import { workspace, type PromptTemplate, type PromptTool } from '@augment-it/workspace';

  const TOKEN_KEY = 'augment-it:session-token';
  const WS_URL = 'ws://localhost:3001/ws';
  const TOKEN_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;

  // Shared "which enrichment mode is selected" state, mirrored in pack-runner.
  // Persisted to localStorage + broadcast via window event so the pair
  // panels stay in sync without a transport round-trip.
  const ENRICHMENT_MODE_KEY = 'augment-it:enrichment-mode';
  const ENRICHMENT_MODE_EVENT = 'augment-it:enrichment-mode';
  type EnrichmentMode = 'prompt' | 'pack';

  function readMode(): EnrichmentMode {
    if (typeof localStorage === 'undefined') return 'prompt';
    return (localStorage.getItem(ENRICHMENT_MODE_KEY) as EnrichmentMode) ?? 'prompt';
  }
  function setMode(mode: EnrichmentMode): void {
    enrichmentMode = mode;
    if (typeof localStorage !== 'undefined') localStorage.setItem(ENRICHMENT_MODE_KEY, mode);
    window.dispatchEvent(new CustomEvent(ENRICHMENT_MODE_EVENT, { detail: { mode } }));
  }
  let enrichmentMode = $state<EnrichmentMode>(readMode());

  let status = $state<'connecting' | 'open' | 'closed' | 'error'>('connecting');

  // editor state — selectedPromptId null means "new, unsaved"
  let selectedPromptId = $state<string | null>(null);
  let editName = $state('');
  let editDescription = $state('');
  let editContent = $state('');
  let editOutputColumn = $state('');
  let editWebSearch = $state(false);
  let saveStatus = $state('');

  // Snapshot of the last-saved version of the editor fields, so we can tell
  // when the form is dirty. For an unsaved new draft this stays null.
  type EditorSnapshot = {
    name: string;
    description: string;
    content: string;
    output_column: string;
    web_search: boolean;
  };
  let savedSnapshot = $state<EditorSnapshot | null>(null);

  const prompts = $derived(Object.values(workspace.prompts) as PromptTemplate[]);

  const hasRequiredContent = $derived(
    editName.trim() !== '' && editContent.trim() !== '' && editOutputColumn.trim() !== '',
  );

  const isDirty = $derived.by(() => {
    if (savedSnapshot === null) return hasRequiredContent; // new draft is "dirty" once it has content
    return (
      editName !== savedSnapshot.name ||
      editDescription !== savedSnapshot.description ||
      editContent !== savedSnapshot.content ||
      editOutputColumn !== savedSnapshot.output_column ||
      editWebSearch !== savedSnapshot.web_search
    );
  });

  const canApply = $derived(selectedPromptId !== null && !isDirty);

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

    // Listen for mode flips from the pair panel (pack-runner).
    const onMode = (e: Event) => {
      const detail = (e as CustomEvent).detail as { mode?: EnrichmentMode } | undefined;
      if (detail?.mode) enrichmentMode = detail.mode;
    };
    window.addEventListener(ENRICHMENT_MODE_EVENT, onMode);
    return () => window.removeEventListener(ENRICHMENT_MODE_EVENT, onMode);
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

  // Handoff to the request-reviewer remote is now an explicit "Apply" action,
  // not a side-effect of selection. Authoring lives here; firing lives there;
  // crossing the boundary is a deliberate click so the user knows when it
  // happens.
  function applyToRequestReviewer() {
    if (!canApply || !selectedPromptId) return;
    window.dispatchEvent(
      new CustomEvent('augment-it:review-request', { detail: { prompt_id: selectedPromptId } }),
    );
    saveStatus = 'applied to Request Reviewer';
  }

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
    savedSnapshot = {
      name: p.name,
      description: p.description,
      content: p.content,
      output_column: p.output_column,
      web_search: editWebSearch,
    };
    saveStatus = '';
  }

  function newPrompt() {
    selectedPromptId = null;
    editName = '';
    editDescription = '';
    editContent = '';
    editOutputColumn = '';
    editWebSearch = false;
    savedSnapshot = null;
    saveStatus = '';
  }

  async function savePrompt() {
    if (!hasRequiredContent) {
      saveStatus = 'name, content and output column are all required';
      return;
    }
    if (!isDirty) return;
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
      savedSnapshot = {
        name: editName,
        description: editDescription,
        content: editContent,
        output_column: editOutputColumn,
        web_search: editWebSearch,
      };
      await refreshPrompts();
    } catch (err: unknown) {
      saveStatus = `error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  async function deletePromptById(prompt_id: string, name: string) {
    if (!window.confirm(`Delete prompt "${name}"?`)) return;
    try {
      await workspace.invoke('prompt.delete', { prompt_id });
      if (selectedPromptId === prompt_id) newPrompt();
      await refreshPrompts();
    } catch (err: unknown) {
      saveStatus = `error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  async function deletePrompt() {
    if (!selectedPromptId) return;
    await deletePromptById(selectedPromptId, editName);
  }
</script>

<div class="ptm-app">
  <div class="ptm-status-bar">
    <span class="muted">
      consumes <code>@augment-it/workspace</code> · {WS_URL} ·
      <span class="status status-{status}">{status}</span>
    </span>
  </div>

  <!-- Enrichment-mode switch — icon-with-tooltip pair (spec Decision §5,
       Phase 2b). Custom Prompt and Pre-built Pack are peer alternatives
       for enriching a record set; the small-control icon pattern is the
       shell-wide affordance for binary picks (also used by Decision §8's
       Split/Full layout toggles). Shared state via the
       augment-it:enrichment-mode window event + localStorage; the Pack
       option also dispatches augment-it:navigate so the shell opens the
       prompt-templates ⇄ pack-runner pair. -->
  <div class="ptm-mode-switch" role="tablist" aria-label="Enrichment mode">
    <button
      class="ptm-mode"
      class:active={enrichmentMode === 'prompt'}
      role="tab"
      aria-selected={enrichmentMode === 'prompt'}
      aria-label="Custom prompt — author a free-text LLM prompt"
      title="Custom prompt — author a free-text LLM prompt"
      onclick={() => setMode('prompt')}
    >
      <span aria-hidden="true">✎</span>
    </button>
    <button
      class="ptm-mode"
      class:active={enrichmentMode === 'pack'}
      role="tab"
      aria-selected={enrichmentMode === 'pack'}
      aria-label="Pre-built pack — fire a source-bound pack against the record set"
      title="Pre-built pack — fire a source-bound pack against the record set"
      onclick={() => {
        setMode('pack');
        window.dispatchEvent(
          new CustomEvent('augment-it:navigate', {
            detail: { remoteId: 'packRunner' },
          }),
        );
      }}
    >
      <span aria-hidden="true">⊞</span>
    </button>
  </div>

  {#if enrichmentMode === 'prompt'}
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
            <button
              type="button"
              class="prompt-delete"
              title="Delete this prompt"
              aria-label="delete {p.name}"
              onclick={() => void deletePromptById(p.prompt_id, p.name)}
            >×</button>
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
        <button
          class="primary"
          onclick={savePrompt}
          disabled={!isDirty || !hasRequiredContent}
          title={!hasRequiredContent
            ? 'Name, prompt body, and output column are required'
            : !isDirty
              ? 'No unsaved changes'
              : selectedPromptId
                ? 'Save changes to this prompt'
                : 'Create this prompt'}
        >{selectedPromptId ? 'save' : 'create'}</button>
        <button
          class="apply"
          onclick={applyToRequestReviewer}
          disabled={!canApply}
          title={!selectedPromptId
            ? 'Save the prompt first, then Apply'
            : isDirty
              ? 'Save your changes before applying'
              : 'Send this prompt to Request Reviewer'}
        >apply →</button>
        {#if selectedPromptId}
          <button class="danger" onclick={deletePrompt}>delete</button>
        {/if}
        <span class="muted">{saveStatus}</span>
      </div>

      {#if selectedPromptId}
        <p class="muted handoff-note">
          <strong>Save</strong> lights up only when you've changed something.
          <strong>Apply →</strong> sends this prompt to Request Reviewer, where
          you review the resolved request, pick the model, and fire.
          Authoring lives here; firing lives there.
        </p>
      {/if}
    </section>
  </div>
  {/if}
</div>
