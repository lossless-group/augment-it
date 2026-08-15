<script lang="ts">
  import { curation } from './curation.svelte';

  let addUrl = $state('');

  function add(): void {
    const u = addUrl;
    addUrl = '';
    void curation.addSource(u);
  }
</script>

<div class="cc-list-head">
  <button class="cc-link" onclick={() => { curation.activeSlug = null; curation.activeType = null; }}>‹ corpora</button>
  <input class="cc-filter" placeholder="filter sources… (coverage check)" bind:value={curation.listFilter} />
</div>

<div class="cc-add">
  <input
    placeholder="paste a URL to add…"
    bind:value={addUrl}
    onkeydown={(e) => { if (e.key === 'Enter') add(); }}
  />
  <button class="cc-primary" onclick={add}>+ Add</button>
</div>

<div class="cc-list">
  {#if curation.sources.length === 0}
    <p class="cc-muted cc-pad cc-mini">No sources yet. Paste a URL to add one.</p>
  {:else}
    {#each curation.filtered as { source, index } (source.source_uuid)}
      <button class="cc-row" class:active={index === curation.focusIdx} onclick={() => curation.focus(index)}>
        <span class="cc-dot" class:err={source.verdict_error}></span>
        <span class="cc-row-body">
          <span class="cc-row-title">{source.title || source.url}</span>
          <span class="cc-row-meta">
            {#if source.publisher}<span>{source.publisher}</span>{/if}
            <span class="cc-status-chip">{source.status ?? 'metadata-only'}</span>
            {#each source.tags ?? [] as t}<span class="cc-tag-mini">{t}</span>{/each}
          </span>
        </span>
      </button>
    {/each}
  {/if}
</div>
