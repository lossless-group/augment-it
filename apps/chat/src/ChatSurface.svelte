<script lang="ts">
  // ChatSurface — the visible chat conversation. Composer at the bottom,
  // transcript above. Each turn renders through ResponseModeRenderer
  // which dispatches by turn.kind.

  import { workspace, suggest, type Suggestion } from '@augment-it/workspace';
  import { chatState } from './chat-state.svelte';
  import ResponseModeRenderer from './ResponseModeRenderer.svelte';

  let inputEl = $state<HTMLTextAreaElement | undefined>();
  let composer = $state<string>('');

  // Anticipation lookup — sub-millisecond, no LLM call. Surfaces 0-3
  // suggested next capabilities under the composer. Empty when there's
  // nothing to suggest.
  const suggestions = $derived<Suggestion[]>(
    suggest(workspace.activeView, workspace.last_capability),
  );

  // Send context — what the user is looking at right now. The server
  // inlines this in the prompt so the model can pick a record_set_id
  // for prompt.draft without asking.
  const sendContext = $derived(
    workspace.activeView.kind === 'record_set'
      ? { record_set_id: workspace.activeView.record_set_id }
      : undefined,
  );

  async function send(): Promise<void> {
    const message = composer.trim();
    if (!message || chatState.sending) return;
    composer = '';
    await chatState.sendMessage(message, sendContext);
    inputEl?.focus();
  }

  function handleKey(e: KeyboardEvent): void {
    // cmd-enter / ctrl-enter to send; plain enter inserts newline
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void send();
    }
  }

  async function quickSuggest(s: Suggestion): Promise<void> {
    // Clicking a suggestion sends "do {capability}" as the message,
    // which biases the model toward chat_propose with the named verb.
    composer = `Help me with ${s.capability} — ${s.hint}`;
    await send();
  }
</script>

<div class="surface">
  <div class="transcript">
    {#if chatState.turns.length === 0}
      <div class="empty-hint">
        Tell me what column you'd like to add to your records, and I'll draft a prompt
        for it. Try: <em>"For each company, find the founder's LinkedIn URL."</em>
      </div>
    {/if}
    {#each chatState.turns as turn (turn.id)}
      <ResponseModeRenderer {turn} />
    {/each}
    {#if chatState.sending}
      <div class="thinking">…thinking</div>
    {/if}
  </div>

  {#if suggestions.length > 0}
    <div class="suggestions">
      {#each suggestions as s, i (i)}
        <button class="suggest-pill" onclick={() => quickSuggest(s)}>
          <span class="verb">{s.capability}</span>
          <span class="hint">{s.hint}</span>
        </button>
      {/each}
    </div>
  {/if}

  <div class="composer">
    <textarea
      bind:this={inputEl}
      bind:value={composer}
      placeholder="What column do you want to add? (⌘+Enter to send)"
      rows="3"
      onkeydown={handleKey}
      disabled={chatState.sending}
    ></textarea>
    <button class="send" onclick={() => send()} disabled={chatState.sending || !composer.trim()}>
      Send
    </button>
  </div>
</div>
