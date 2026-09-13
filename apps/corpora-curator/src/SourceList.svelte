<script lang="ts">
  import Button from '@augment-it/shared-ui/Button.svelte';
  import { curation } from './curation.svelte';

  let addUrl = $state('');

  function add(): void {
    const u = addUrl;
    addUrl = '';
    void curation.addSource(u);
  }
</script>

<div class="cc-list-head">
  <!-- link, not ghost: its only neighbour in this row is a full-width text
       input, so a transparent control with no underline and no boundary would
       have nothing to read as interactive against. link ships an underline and
       --color-link, which is the same affordance the old .cc-link was reaching
       for with accent text and no underline at all. -->
  <Button
    variant="link"
    size="sm"
    onclick={() => { curation.activeSlug = null; curation.activeType = null; }}>‹ corpora</Button
  >
  <input class="cc-filter" placeholder="filter sources… (coverage check)" bind:value={curation.listFilter} />
</div>

<div class="cc-add">
  <input
    placeholder="paste a URL to add…"
    bind:value={addUrl}
    onkeydown={(e) => { if (e.key === 'Enter') add(); }}
  />
  <Button variant="primary" onclick={add}>+ Add</Button>
</div>

<div class="cc-list">
  {#if curation.sources.length === 0}
    <p class="cc-muted cc-pad cc-mini">No sources yet. Paste a URL to add one.</p>
  {:else}
    {#each curation.filtered as { source, index } (source.source_uuid)}
      <!-- Left raw. This is the list row, not a control: full-bleed, left
           aligned, two lines with a wrapping meta line, hairline-separated and
           of variable height. See the .cc-row rule in app.css. -->
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
