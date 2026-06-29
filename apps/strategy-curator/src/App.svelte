<script lang="ts">
  import { onMount } from 'svelte';
  import { curation } from './curation.svelte';
  import StrategyPicker from './StrategyPicker.svelte';
  import SourceList from './SourceList.svelte';
  import SourceDetail from './SourceDetail.svelte';

  const WS_URL = 'ws://localhost:3001/ws';

  onMount(() => {
    curation.init();
  });
</script>

<div class="sc-app">
  <header class="sc-header">
    <span class="sc-brand">Strategy Curator</span>
    {#if curation.workspaces.length}
      <select
        class="sc-ws"
        value={curation.clientSlug ?? ''}
        onchange={(e) => curation.switchWorkspace(e.currentTarget.value)}
        title="Active workspace — the client whose corpus strategies are written into"
      >
        {#each curation.workspaces as w (w.client_id)}<option value={w.client_id}>{w.client_id}</option>{/each}
      </select>
    {:else}
      <span class="sc-pill" title="Active workspace">{curation.clientSlug ?? '— no workspace —'}</span>
    {/if}
    {#if curation.active}
      <span class="sc-strategy">{curation.active.title}</span>
      <span class="sc-pill">{curation.sources.length} sources</span>
    {/if}
    <span class="sc-spacer"></span>
    <span class="sc-conn status-{curation.connection}">{curation.connection}</span>
  </header>

  {#if curation.lastError}
    <div class="sc-banner" title="A capability call failed — the backend handler may not be wired yet (Increment 2).">
      {curation.lastError}
    </div>
  {/if}

  {#if !curation.active}
    <div class="sc-pickwrap"><StrategyPicker /></div>
  {:else}
    <main class="sc-main">
      <div class="sc-col sc-listcol"><SourceList /></div>
      <div class="sc-col sc-detailcol"><SourceDetail /></div>
    </main>
  {/if}

  <footer class="sc-footer">
    <code>@augment-it/strategy-curator</code> · <code>{WS_URL}</code>
    {#if curation.saveStatus}· {curation.saveStatus}{/if}
  </footer>
</div>
