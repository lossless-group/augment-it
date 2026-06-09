<script lang="ts">
  // ChatSurface — the visible chat conversation. Composer at the bottom,
  // transcript above. Each turn renders through ResponseModeRenderer
  // which dispatches by turn.kind.

  import { workspace, suggest, type Suggestion } from '@augment-it/workspace';
  import { chatState } from './chat-state.svelte';
  import ResponseModeRenderer from './ResponseModeRenderer.svelte';

  let inputEl = $state<HTMLTextAreaElement | undefined>();
  let composer = $state<string>('');

  // Slash-verb registry. Today `/inbox` is the only chat-side verb (per
  // [[Chat-As-Verb-Surface-Patterns]] and the 2026-06-08 milestone).
  // New verbs land here as they ship; the popover renders straight from
  // this array so the UI stays in lockstep with what's actually wired
  // up server-side.
  type ChatCommand = {
    verb: string;          // including the leading slash
    insert: string;        // what to drop into the textarea on click
    summary: string;       // one-line description for the menu
    example?: string;      // optional usage hint shown muted
  };
  const COMMANDS: ChatCommand[] = [
    {
      verb: '/inbox',
      insert: '/inbox ',
      summary: 'Save a URL to the Corpus Inbox for later triage',
      example: '/inbox https://example.com/report.pdf #policy',
    },
  ];

  let commandsOpen = $state<boolean>(false);
  let commandsContainerEl = $state<HTMLDivElement | undefined>();

  function toggleCommands(): void {
    commandsOpen = !commandsOpen;
  }

  function pickCommand(cmd: ChatCommand): void {
    // Insert at the start of the textbox so a freshly chosen verb is
    // unambiguous; if the operator was mid-sentence, the existing draft
    // is preserved after a space. Caret lands right after the verb so
    // they can type the URL immediately.
    const existing = composer.trimStart();
    if (existing.startsWith('/')) {
      // Replace any leading slash-verb word the operator already typed.
      composer = cmd.insert + existing.replace(/^\/\S*\s*/, '');
    } else if (existing.length === 0) {
      composer = cmd.insert;
    } else {
      composer = cmd.insert + existing;
    }
    commandsOpen = false;
    // Move focus + caret into the textarea after Svelte applies the
    // value, so the operator can keep typing.
    queueMicrotask(() => {
      if (!inputEl) return;
      inputEl.focus();
      const pos = cmd.insert.length;
      inputEl.setSelectionRange(pos, pos);
    });
  }

  // Close the popover on outside click / Escape so it behaves like a
  // normal menu. The container ref scopes the "outside" check.
  function handleDocPointerDown(e: MouseEvent): void {
    if (!commandsOpen) return;
    const target = e.target as Node | null;
    if (!target || !commandsContainerEl) return;
    if (!commandsContainerEl.contains(target)) commandsOpen = false;
  }
  function handleDocKey(e: KeyboardEvent): void {
    if (commandsOpen && e.key === 'Escape') {
      e.preventDefault();
      commandsOpen = false;
    }
  }
  $effect(() => {
    document.addEventListener('pointerdown', handleDocPointerDown);
    document.addEventListener('keydown', handleDocKey);
    return () => {
      document.removeEventListener('pointerdown', handleDocPointerDown);
      document.removeEventListener('keydown', handleDocKey);
    };
  });

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

  <div class="commands-bar" bind:this={commandsContainerEl}>
    <button
      type="button"
      class="commands-trigger"
      class:open={commandsOpen}
      aria-haspopup="menu"
      aria-expanded={commandsOpen}
      onclick={toggleCommands}
      title="Browse slash commands"
    >
      <span class="caret">{commandsOpen ? '▾' : '▴'}</span>
      <span>Commands</span>
      <span class="muted">({COMMANDS.length})</span>
    </button>
    {#if commandsOpen}
      <div class="commands-popover" role="menu">
        <div class="commands-popover-head">Slash commands</div>
        <ul>
          {#each COMMANDS as cmd (cmd.verb)}
            <li>
              <button
                type="button"
                class="command-row"
                role="menuitem"
                onclick={() => pickCommand(cmd)}
              >
                <div class="command-verb">{cmd.verb}</div>
                <div class="command-summary">{cmd.summary}</div>
                {#if cmd.example}
                  <div class="command-example"><code>{cmd.example}</code></div>
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>
</div>
