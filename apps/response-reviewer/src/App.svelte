<script lang="ts">
  import { onMount } from 'svelte';
  import {
    workspace,
    type PromptTemplate,
    type RecordSet,
    type ResponseRecord,
    type ResponseFlag,
  } from '@augment-it/workspace';

  // Each remote owns its own workspace singleton + WebSocket — no `shared`
  // federation block (see the 2026-05-21_03 changelog).
  const TOKEN_KEY = 'augment-it:session-token';
  const WS_URL = 'ws://localhost:3001/ws';

  const FLAGS: ResponseFlag[] = ['good', 'partial', 'wrong', 'needs-rerun'];

  let status = $state<'connecting' | 'open' | 'closed' | 'error'>('connecting');

  let responses = $state<ResponseRecord[]>([]);
  let promptsById = $state<Record<string, PromptTemplate>>({});
  let recordSetsById = $state<Record<string, RecordSet>>({});

  let filter = $state<'all' | 'unflagged' | ResponseFlag>('all');
  let index = $state(0);
  let editText = $state('');
  let busy = $state('');

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
  });

  // refresh when a response is created or flagged — seq-cursor dedup.
  let lastSeq = -1;
  $effect(() => {
    const ev = workspace.events[workspace.events.length - 1];
    if (!ev || ev.seq <= lastSeq) return;
    lastSeq = ev.seq;
    if (ev.subject === 'response.created' || ev.subject === 'response.flagged') {
      void loadResponses();
    }
  });

  // keep the stepper index inside the filtered list
  $effect(() => {
    const len = filtered.length;
    if (index >= len) index = Math.max(0, len - 1);
  });

  // load the editable copy when the focused response changes
  $effect(() => {
    const c = current;
    if (!c) {
      editText = '';
      editTextForId = '';
      return;
    }
    if (c.response_id !== editTextForId) {
      editText = c.response_text;
      editTextForId = c.response_id;
    }
  });

  async function loadResponses() {
    try {
      const r = (await workspace.invoke('response.list', {})) as { responses: ResponseRecord[] };
      responses = r.responses;
    } catch (e) {
      console.error('response.list', e);
    }
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
      // pass the edited text only when it actually differs from the original
      const value = editText !== current.response_text ? editText : undefined;
      await workspace.invoke('response.accept', {
        response_id: current.response_id,
        value,
      });
      await loadResponses();
      busy = 'accepted → value written to the row cell';
    } catch (e) {
      busy = `accept failed — ${e instanceof Error ? e.message : String(e)}`;
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
        {#each ['all', 'unflagged', 'good', 'partial', 'wrong'] as f (f)}
          <button
            class="chip"
            class:active={filter === f}
            onclick={() => {
              filter = f as typeof filter;
              index = 0;
            }}>{f}</button>
        {/each}
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
        </aside>

        <section class="response">
          <h3>Response — editable; your edits are what “accept” writes</h3>
          <textarea bind:value={editText} rows="16"></textarea>
        </section>
      </div>

      <h3>Triage</h3>
      <div class="flags">
        {#each FLAGS as f (f)}
          <button class="chip" class:active={current.flag === f} onclick={() => flag(f)}>{f}</button>
        {/each}
      </div>

      <div class="actions">
        <button onclick={accept}>Accept whole response → cell</button>
        <button class="chip" onclick={rerun}>Re-run in Request Reviewer</button>
        <button class="chip" disabled title="highlight-collector — a future stage"
          >Distill in Highlight Collector</button>
      </div>
      {#if busy}<p class="result">{busy}</p>{/if}
    {/if}
  </div>
</div>
