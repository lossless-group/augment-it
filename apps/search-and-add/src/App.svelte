<script lang="ts">
  // search-and-add — the "Augment from DB" flow's provider-pluggable search
  // surface. Launched from any 🔍 on an entity card (spec D2): the envelope
  // arrives via localStorage + live CustomEvent, the seed term lands in the
  // always-editable TermBar, results fire through search.fire (SearXNG free
  // default, palette to swap), and every row's ➕ adds to the launching
  // entity's list then broadcasts augment-it:entity-updated so the card
  // refetches. Auto-fires once per fresh envelope — searches are reads; the
  // gating thesis governs writes, and every write here is one operator click.
  // See context-v/specs/Augment-From-DB-Flow.md §Phase 3.

  import { onMount } from 'svelte';
  import { workspace } from '@augment-it/workspace';
  import TermBar from './TermBar.svelte';
  import ProviderPalette from './ProviderPalette.svelte';
  import ResultsList from './ResultsList.svelte';
  import { searchContext } from './lib/search-context.svelte';
  import { fireSearch, fetchConnectors, addResult, verbFor, scanStream } from './lib/search-client';
  import type { ConnectorInfo, ConnectorResult } from './lib/types';

  const TOKEN_KEY = 'augment-it:session-token';
  const WS_URL = 'ws://localhost:3001/ws';

  let status = $state<'connecting' | 'open' | 'closed' | 'error'>('connecting');
  let client = $state<string>('reach-edu');

  let connectors = $state<ConnectorInfo[]>([]);
  let selectedProvider = $state<string | null>(null); // null = auto → SearXNG

  let term = $state('');
  let firing = $state(false);
  let fireError = $state<string | null>(null);
  let results = $state<ConnectorResult[]>([]);
  let firedVia = $state<string | null>(null);

  let firedArrival = -1;

  const req = $derived(searchContext.request);
  // Phase 5 — scan mode: the envelope carries a stream. No term, no palette;
  // the stream URL is the query and organization.stream.scan is the fire.
  const scanMode = $derived(Boolean(req?.stream?.url && req?.entity.type === 'organization'));
  // (The v1.2 crawl mode is retired — didi's crawls enqueue via search.submit
  // and land in the search-results rail, per Search-Results-Queue-Remote.)
  const entityLabel = $derived(
    req
      ? req.entity.display_name ??
          (req.entity.type === 'organization' ? req.entity.org_slug : req.entity.person_uuid)
      : null,
  );
  const addVerb = $derived.by(() => {
    if (!req) return null;
    try {
      return verbFor(req);
    } catch {
      return null;
    }
  });

  async function fire() {
    if (scanMode) return void scan();
    if (!term.trim()) return;
    firing = true;
    fireError = null;
    try {
      const r = await fireSearch({
        query: term.trim(),
        intent: req?.intent,
        provider: selectedProvider ?? undefined,
      });
      results = r.results;
      firedVia = r.provider;
    } catch (err) {
      fireError = err instanceof Error ? err.message : String(err);
      results = [];
      firedVia = null;
    } finally {
      firing = false;
    }
  }

  async function scan() {
    if (!req?.stream?.url || req.entity.type !== 'organization') return;
    firing = true;
    fireError = null;
    try {
      const r = await scanStream({
        org_slug: req.entity.org_slug,
        stream_url: req.stream.url,
        stream_kind: req.stream.kind,
        client,
      });
      results = r.results;
      firedVia = `stream scan (${r.already_known} already in corpus)`;
    } catch (err) {
      fireError = err instanceof Error ? err.message : String(err);
      results = [];
      firedVia = null;
    } finally {
      firing = false;
    }
  }

  // A fresh envelope (mount-time localStorage read counts, via arrival 0 vs
  // firedArrival -1) seeds the term and auto-fires exactly once. Later
  // operator edits + re-fires never re-trigger this. When the envelope
  // arrives at mount time the WS may still be connecting — invoke() would
  // reject with "workspace not connected" — so the auto-fire waits for the
  // socket via pendingAutoFire instead of racing it.
  let pendingAutoFire = $state(false);

  function autoFire() {
    void (scanMode ? scan() : fire());
  }

  $effect(() => {
    if (searchContext.arrival !== firedArrival || (firedArrival === -1 && req)) {
      firedArrival = searchContext.arrival;
      if (req) {
        term = req.seed_term;
        results = [];
        firedVia = null;
        fireError = null;
        if (status === 'open') autoFire();
        else pendingAutoFire = true;
      }
    }
  });

  $effect(() => {
    if (status === 'open' && pendingAutoFire) {
      pendingAutoFire = false;
      autoFire();
    }
  });

  async function onAdd(url: string) {
    if (!req) throw new Error('no launch context — open a 🔍 from an entity card');
    await addResult(req, url, client);
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

  onMount(() => {
    workspace.connect({
      url: WS_URL,
      getToken: () => localStorage.getItem(TOKEN_KEY),
      saveToken: (t) => localStorage.setItem(TOKEN_KEY, t),
      onStatus: (s) => (status = s),
    });
    void loadActiveClient();
    void fetchConnectors().then((c) => (connectors = c)).catch(() => {});
    const unlisten = searchContext.listen();
    window.addEventListener('augment-it:workspace-changed', onWorkspaceChanged);
    return () => {
      unlisten();
      window.removeEventListener('augment-it:workspace-changed', onWorkspaceChanged);
    };
  });
</script>

<div class="saa-app">
  <header class="saa-header">
    <div class="saa-title-row">
      <h1 class="saa-title">Search &amp; Add</h1>
      {#if req}
        <span class="saa-context">
          adding to <strong>{entityLabel}</strong> · {req.target}
          {#if !addVerb}<em class="saa-context-warn">(no add verb for this combination)</em>{/if}
        </span>
      {:else}
        <span class="saa-context saa-context-none">no launch context — open a 🔍 from an entity card</span>
      {/if}
      <span class="saa-ws status-{status}">{status}</span>
    </div>
    {#if scanMode && req?.stream}
      <div class="saa-scanbar">
        <span class="saa-scan-label">scanning stream</span>
        <a class="saa-scan-url" href={req.stream.url} target="_blank" rel="noreferrer">{req.stream.url}</a>
        {#if req.stream.kind}<span class="saa-scan-kind">{req.stream.kind}</span>{/if}
        <button type="button" class="saa-fire" disabled={firing} onclick={scan}>
          {firing ? 'scanning…' : 'Re-scan'}
        </button>
      </div>
    {:else}
      <TermBar bind:term {firing} onfire={fire} />
      <ProviderPalette {connectors} bind:selected={selectedProvider} />
    {/if}
    {#if fireError}<div class="saa-error saa-fire-error">{fireError}</div>{/if}
  </header>

  <main class="saa-body">
    <ResultsList {results} provider={firedVia} onadd={onAdd} />
  </main>
</div>
