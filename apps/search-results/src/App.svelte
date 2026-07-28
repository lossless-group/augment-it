<script lang="ts">
  // search-results — the queue where every agent search lands (spec D4): a
  // persistent right rail rendering the workspace service's search registry
  // as cards. Collapsed while running (status · elapsed vs typical), signal
  // on arrival, expand to act, dismiss when dealt with. No polling — the
  // rail refetches on search.updated WS events (+ once on mount, spec D3).
  // See context-v/specs/Search-Results-Queue-Remote.md.

  import { onMount } from 'svelte';
  import { workspace } from '@augment-it/workspace';
  import SearchCard from './SearchCard.svelte';
  import { dismissSearch, listSearches } from './lib/search-client';
  import type { SearchCard as SearchCardT } from './lib/types';

  const TOKEN_KEY = 'augment-it:session-token';
  const WS_URL = 'ws://localhost:3001/ws';

  let status = $state<'connecting' | 'open' | 'closed' | 'error' | 'auth_required'>('connecting');
  let client = $state<string>('reach-edu');

  let cards = $state<SearchCardT[]>([]);
  let loadError = $state<string | null>(null);
  let loaded = $state(false);

  const doneCount = $derived(cards.filter((c) => c.status === 'done').length);
  const runningCount = $derived(cards.filter((c) => c.status === 'queued' || c.status === 'running').length);

  // A 1s tick drives the elapsed readouts while anything is in flight —
  // display-only; registry truth still arrives exclusively via events.
  let now = $state(Date.now());
  onMount(() => {
    const tick = setInterval(() => {
      if (runningCount > 0) now = Date.now();
    }, 1_000);
    return () => clearInterval(tick);
  });

  async function load() {
    try {
      cards = await listSearches(client);
      loadError = null;
      loaded = true;
    } catch (err) {
      loadError = err instanceof Error ? err.message : String(err);
    }
  }

  // Registry liveness — search.updated broadcasts land on workspace.events;
  // dedup by seq (the strategy-curator / record-collector pattern) and
  // refetch. Cheap: the list is card-shaped, no results ride it.
  let lastProcessedSeq = -1;
  $effect(() => {
    const ev = workspace.events[workspace.events.length - 1];
    if (!ev || ev.seq <= lastProcessedSeq) return;
    lastProcessedSeq = ev.seq;
    if (ev.subject !== 'search.updated') return;
    const payload = ev.payload as { client?: string };
    if (payload.client && payload.client !== client) return;
    void load();
  });

  async function dismiss(card: SearchCardT) {
    try {
      await dismissSearch(card.search_id);
      cards = cards.filter((c) => c.search_id !== card.search_id);
    } catch (err) {
      loadError = err instanceof Error ? err.message : String(err);
    }
  }

  function clearDone() {
    for (const c of cards.filter((c) => c.status === 'done')) void dismiss(c);
  }

  async function loadActiveClient() {
    try {
      const r = (await workspace.invoke('workspace.active', {})) as { active_client_id?: string };
      if (r?.active_client_id) client = r.active_client_id;
    } catch {
      /* keep default */
    }
  }

  function onWorkspaceChanged(e: Event) {
    const detail = (e as CustomEvent).detail as { client_id?: string } | undefined;
    if (detail?.client_id) client = detail.client_id;
    else void loadActiveClient();
  }

  // A different tenant sees a different queue slice — refetch on switch.
  $effect(() => {
    void client;
    if (status === 'open') void load();
  });

  let bootstrapped = $state(false);
  $effect(() => {
    if (status === 'open' && !bootstrapped) {
      bootstrapped = true;
      void (async () => {
        await loadActiveClient();
        await load();
      })();
    }
  });

  onMount(() => {
    workspace.connect({
      url: WS_URL,
      getToken: () => localStorage.getItem(TOKEN_KEY),
      saveToken: (t) => localStorage.setItem(TOKEN_KEY, t),
      onStatus: (s) => (status = s),
    });
    window.addEventListener('augment-it:workspace-changed', onWorkspaceChanged);
    return () => {
      window.removeEventListener('augment-it:workspace-changed', onWorkspaceChanged);
    };
  });
</script>

<div class="srq-app">
  <header class="srq-header">
    <h1 class="srq-title">🔎 Search queue</h1>
    {#if doneCount > 0}
      <span class="srq-badge" title="{doneCount} finished search{doneCount === 1 ? '' : 'es'} waiting for triage">{doneCount}</span>
    {/if}
    {#if runningCount > 0}
      <span class="srq-running-note">{runningCount} in flight</span>
    {/if}
    <span class="srq-right">
      {#if doneCount > 1}
        <button type="button" class="srq-clear" title="Dismiss every done card" onclick={clearDone}>clear done</button>
      {/if}
      <span class="srq-ws status-{status}">{status}</span>
    </span>
  </header>

  {#if loadError}<div class="srq-error">{loadError}</div>{/if}

  {#if cards.length === 0 && loaded}
    <p class="srq-empty">
      No searches in the queue. Fire a 🤖 on any org card — links, streams, or
      team — and the search lands here while you keep working.
    </p>
  {/if}

  <ul class="srq-list">
    {#each cards as card (card.search_id)}
      <SearchCard {card} {client} {now} ondismiss={() => dismiss(card)} />
    {/each}
  </ul>
</div>
