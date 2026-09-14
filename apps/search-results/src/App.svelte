<script lang="ts">
  // search-results — the queue where every agent search lands (spec D4): a
  // persistent right rail rendering the workspace service's search registry
  // as cards. Collapsed while running (status · elapsed vs typical), signal
  // on arrival, expand to act, dismiss when dealt with. No polling — the
  // rail refetches on search.updated WS events (+ once on mount, spec D3).
  // See context-v/specs/Search-Results-Queue-Remote.md.

  import { onMount } from 'svelte';
  import { workspace, resolveWsUrl } from '@augment-it/workspace';
  import Button from '@augment-it/shared-ui/Button.svelte';
  import Chip from '@augment-it/shared-ui/Chip.svelte';
  import SearchCard from './SearchCard.svelte';
  import { dismissSearch, listSearches } from './lib/search-client';
  import type { SearchCard as SearchCardT } from './lib/types';

  const TOKEN_KEY = 'augment-it:session-token';
  const WS_URL = resolveWsUrl();

  let status = $state<'connecting' | 'open' | 'closed' | 'error' | 'auth_required'>('connecting');

  // Chip tone is SEMANTIC, not decorative. The old `.srq-ws` stylesheet painted
  // only `open` (ok) and `closed`/`error` (error) and let `connecting` and
  // `auth_required` fall through to an undifferentiated grey — so two of the
  // five socket states were readable only by their text. Tone now follows the
  // meaning of every state. This chip is a near-byte-identical twin of
  // search-and-add's `.saa-ws`; the duplication is raised, not fixed here.
  type ChipTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'error' | 'info';
  function statusTone(s: typeof status): ChipTone {
    switch (s) {
      case 'open': return 'ok';
      case 'connecting': return 'info';
      case 'auth_required': return 'warn'; // recoverable — the operator can sign in
      default: return 'error';             // closed | error — no traffic is flowing
    }
  }
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
  // dedup by seq (the corpora-curator / record-collector pattern) and
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
      <Chip size="sm" tone="accent" title="{doneCount} finished search{doneCount === 1 ? '' : 'es'} waiting for triage">{doneCount}</Chip>
    {/if}
    {#if runningCount > 0}
      <span class="srq-running-note">{runningCount} in flight</span>
    {/if}
    <span class="srq-right">
      {#if doneCount > 1}
        <Button variant="secondary" size="sm" title="Dismiss every done card" onclick={clearDone}>
          clear done
        </Button>
      {/if}
      <Chip size="sm" tone={statusTone(status)}>{status}</Chip>
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
