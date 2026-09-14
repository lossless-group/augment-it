<script lang="ts">
  import { onMount } from 'svelte';
  import Button from '@augment-it/shared-ui/Button.svelte';
  import StatusIndicator from '@augment-it/shared-ui/StatusIndicator.svelte';
  import CardRow from '@augment-it/shared-ui/CardRow.svelte';
  import ListContainer from '@augment-it/shared-ui/ListContainer.svelte';
  import SelectWrapperClickPrimary from '@augment-it/shared-ui/SelectWrapper--ClickPrimary.svelte';
  import { workspace, type PromptTemplate, type PromptTool, resolveWsUrl } from '@augment-it/workspace';

  const TOKEN_KEY = 'augment-it:session-token';
  const WS_URL = resolveWsUrl();
  const TOKEN_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;

  let status = $state<'connecting' | 'open' | 'closed' | 'error' | 'auth_required'>('connecting');

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
      <StatusIndicator state={status} of="workspace" />
    </span>
  </div>

  <div class="ptm-layout">
    <aside>
      <!-- ListContainer. `ul.prompts` (list-style/padding/margin/display/
           flex-direction/gap) is DELETED, and the h2 + Button that were bare
           siblings of the list are now its header region — which is what made
           them a header in the first place. -->
      <ListContainer as="ul" gap="2xs" label="Prompts">
        {#snippet header()}
          <h2 class="ptm-head-title">Prompts</h2>
          <Button onclick={newPrompt}>+ new prompt</Button>
        {/snippet}
      <!-- The list surface. The wrapper <li> is GONE: the comment it carried
           said "CardRow renders a <div> and takes no `as`", and that API gap is
           closed — `as="li"` keeps real list semantics ("list, 5 items") in one
           element. selected= is passed to BOTH CardRow and SelectWrapper on
           purpose — they answer different questions. CardRow's `selected` PAINTS
           (border + tint); SelectWrapper's `selected` ANNOUNCES (aria-pressed).
           Neither can be derived from the other, and `selectedPromptId` above is
           the single source both read. See the report's selection section.

           --ClickPrimary, NOT --ClickBody. Measured 2026-09-13 in this member's
           probe: --ClickBody is `display: contents` on a <button>, which in
           Chromium 149 generates no box and is NOT FOCUSABLE — all five rows'
           select controls vanished from the tab order while still working with a
           mouse. Raised, not worked around. -->
        {#each prompts as p (p.prompt_id)}
            <CardRow
              as="li"
              density="compact"
              selected={p.prompt_id === selectedPromptId}
              class="ptm-prompt-row"
              data-deviation="CardRow ships no hover state; a row whose whole job is to be selected needs an interactivity cue, and this member's only one was li:hover"
            >
              <!-- ui-selectprimary is inline-flex and shrink-to-fit, with no
                   min-inline-size:0. Both are corrected by a member hook in
                   app.css, because SelectWrapper spreads {...rest} LAST and has
                   no `class` prop, so passing class= would DELETE its own
                   ui-selectprimary class. Raised. -->
              <SelectWrapperClickPrimary
                label="{p.name} — output column {p.output_column}{p.tools.includes('web_search') ? ', web search' : ''}"
                selected={p.prompt_id === selectedPromptId}
                onselect={() => loadIntoEditor(p)}
              >
                <span class="ptm-prompt-label">
                  <strong>{p.name}</strong>
                  <span class="muted">→ {p.output_column}{p.tools.includes('web_search') ? ' · web' : ''}</span>
                </span>
              </SelectWrapperClickPrimary>
              <!-- size="icon" refuses to render without an accessible name; the
                   aria-label this row already had satisfies it. The bare '×'
                   glyph it carried is now an <svg> — Button sizes it from
                   --icon-* and a glyph is font-dependent and unstyleable.
                   The class is a MEMBER HOOK, not a restyle: flex:0 0 auto.
                   Measured before this change: the old `li` flex row was
                   shrinking this button to 18x28 in the long-name row — under
                   the 24px WCAG 2.2 SC 2.5.8 floor. Button sets no `flex`. -->
              <Button
                size="icon"
                variant="ghost"
                class="ptm-row-action"
                data-deviation="flex:0 0 auto so the row's flex container cannot shrink this icon button under the 24px target floor — measured at 18x28 before the change"
                title="Delete this prompt"
                aria-label="delete {p.name}"
                onclick={() => void deletePromptById(p.prompt_id, p.name)}
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </Button>
            </CardRow>
        {/each}
        {#if prompts.length === 0}
          <li class="muted empty">no prompts yet</li>
        {/if}
      </ListContainer>
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
        <Button
          variant="primary"
          onclick={savePrompt}
          disabled={!isDirty || !hasRequiredContent}
          title={!hasRequiredContent
            ? 'Name, prompt body, and output column are required'
            : !isDirty
              ? 'No unsaved changes'
              : selectedPromptId
                ? 'Save changes to this prompt'
                : 'Create this prompt'}
        >{selectedPromptId ? 'save' : 'create'}</Button>
        <Button
          variant="secondary"
          onclick={applyToRequestReviewer}
          disabled={!canApply}
          title={!selectedPromptId
            ? 'Save the prompt first, then Apply'
            : isDirty
              ? 'Save your changes before applying'
              : 'Send this prompt to Request Reviewer'}
        >apply →</Button>
        {#if selectedPromptId}
          <Button variant="destructive" onclick={deletePrompt}>delete</Button>
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
</div>
