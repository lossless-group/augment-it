<script lang="ts">
  import { curation } from './curation.svelte';

  let addUrl = $state('');

  function add(): void {
    const u = addUrl;
    addUrl = '';
    void curation.addSource(u);
  }
</script>

<div class="sc-list-head">
  <button class="sc-link" onclick={() => (curation.activeSlug = null)}>‹ strategies</button>
  <input class="sc-filter" placeholder="filter sources… (coverage check)" bind:value={curation.listFilter} />
</div>

<div class="sc-add">
  <input
    placeholder="paste a URL to add…"
    bind:value={addUrl}
    onkeydown={(e) => { if (e.key === 'Enter') add(); }}
  />
  <button class="sc-primary" onclick={add}>+ Add</button>
</div>

<div class="sc-list">
  {#if curation.sources.length === 0}
    <p class="sc-muted sc-pad sc-mini">No sources yet. Paste a URL to add one.</p>
  {:else}
    {#each curation.filtered as { source, index } (source.source_uuid)}
      <button class="sc-row" class:active={index === curation.focusIdx} onclick={() => curation.focus(index)}>
        <span class="sc-dot" class:err={source.verdict_error}></span>
        <span class="sc-row-body">
          <span class="sc-row-title">{source.title || source.url}</span>
          <span class="sc-row-meta">
            {#if source.publisher}<span>{source.publisher}</span>{/if}
            <span class="sc-status-chip">{source.status ?? 'metadata-only'}</span>
            {#each source.tags ?? [] as t}<span class="sc-tag-mini">{t}</span>{/each}
          </span>
        </span>
      </button>
    {/each}
  {/if}
</div>
