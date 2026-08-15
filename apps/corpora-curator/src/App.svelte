<script lang="ts">
  import { onMount } from 'svelte';
  import { workspace } from '@augment-it/workspace';
  import { curation } from './curation.svelte';
  import CorpusPicker from './CorpusPicker.svelte';
  import SourceList from './SourceList.svelte';
  import SourceDetail from './SourceDetail.svelte';

  const WS_URL = 'ws://localhost:3001/ws';

  onMount(() => {
    curation.init();
  });

  // Curator liveness (Build-Order Step 6): two people in the same tenant
  // see each other's domain/source edits without a refresh. Broadcasts
  // land on workspace.events (ws.ts's BROADCAST_SUBJECTS); dedup by seq
  // the same way record-collector's App.svelte does, so each event is
  // handled exactly once regardless of how many reactive deps re-fire
  // this effect. domain.retyped carries client_slugs (plural — a domain
  // can span clients); every other subject carries client_slug (singular).
  let lastProcessedSeq = -1;
  $effect(() => {
    const ev = workspace.events[workspace.events.length - 1];
    if (!ev || ev.seq <= lastProcessedSeq) return;
    lastProcessedSeq = ev.seq;

    const payload = ev.payload as {
      client_slug?: string;
      client_slugs?: string[];
      domain_slug?: string;
      type?: string;
      old_type?: string;
    };

    if (ev.subject === 'domain.created' || ev.subject === 'domain.retyped') {
      const inThisClient =
        ev.subject === 'domain.retyped'
          ? (payload.client_slugs ?? []).includes(curation.clientSlug ?? '')
          : payload.client_slug === curation.clientSlug;
      // No type check any more: the list holds every type in the workspace
      // (gh #88), so any domain created or retyped in this client is relevant.
      // The old filter also meant a retype OUT of the active type was missed
      // whenever the guessed type was wrong.
      if (inThisClient) void curation.loadStrategies();
    } else if (
      ev.subject === 'source.added' ||
      ev.subject === 'source.updated' ||
      ev.subject === 'source.removed' ||
      ev.subject === 'extract.added'
    ) {
      if (payload.client_slug === curation.clientSlug && payload.domain_slug === curation.activeSlug) {
        void curation.refreshSources();
      }
    }
  });
</script>

<div class="cc-app">
  <header class="cc-header">
    <span class="cc-brand">Corpora Curator</span>
    {#if curation.workspaces.length}
      <select
        class="cc-ws"
        value={curation.clientSlug ?? ''}
        onchange={(e) => curation.switchWorkspace(e.currentTarget.value)}
        title="Active workspace — the client whose corpus is written into"
      >
        {#each curation.workspaces as w (w.client_id)}<option value={w.client_id}>{w.client_id}</option>{/each}
      </select>
    {:else if curation.connection !== 'open'}
      <span class="cc-pill" title="Connecting to workspace-service">connecting…</span>
    {:else}
      <span class="cc-pill" title="Active workspace">{curation.clientSlug ?? '— no workspace —'}</span>
    {/if}
    <!-- The selected corpus's OWN type when there is one; otherwise this
         client's preferred vocabulary. It labels, it never filters (gh #88). -->
    <span
      class="cc-pill"
      title={curation.active ? 'Type of the selected corpus' : 'This workspace’s preferred vocabulary for new corpora'}
    >{curation.active?.type ?? curation.domainType}</span>
    {#if curation.active}
      <button
        class="cc-back"
        onclick={() => { curation.activeSlug = null; curation.activeType = null; }}
        title="Back to the corpora list / create form"
      >‹ All corpora</button>
      <span class="cc-strategy">{curation.active.title}</span>
      <span class="cc-pill">{curation.sources.length} sources</span>
    {/if}
    <span class="cc-spacer"></span>
    <span class="cc-conn status-{curation.connection}">{curation.connection}</span>
  </header>

  {#if curation.lastError}
    <div class="cc-banner" title="A capability call failed — the backend handler may not be wired yet (Increment 2).">
      {curation.lastError}
    </div>
  {/if}

  {#if !curation.active}
    <div class="cc-pickwrap"><CorpusPicker /></div>
  {:else}
    <main class="cc-main">
      <div class="cc-col cc-listcol"><SourceList /></div>
      <div class="cc-col cc-detailcol"><SourceDetail /></div>
    </main>
  {/if}

  <footer class="cc-footer">
    <code>@augment-it/corpora-curator</code> · <code>{WS_URL}</code>
    {#if curation.saveStatus}· {curation.saveStatus}{/if}
  </footer>
</div>
