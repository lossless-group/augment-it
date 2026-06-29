<script lang="ts">
  import { curation } from './curation.svelte';
  import { EXTRACT_KINDS, type ExtractKind } from './types';
  import TagBar from './TagBar.svelte';

  let extractKind = $state<ExtractKind>('Quotes');
  let extractText = $state('');

  function saveExtract(): void {
    const t = extractText;
    extractText = '';
    void curation.addExtract(extractKind, t);
  }
</script>

{#if curation.focused}
  {@const s = curation.focused}
  <section class="sc-card">
    <h3>Source {curation.focusIdx + 1} of {curation.sources.length}</h3>

    <div class="sc-field">
      <span class="sc-label">Title</span>
      <div class="sc-value">{s.title || '(no title — fetch to populate)'}</div>
    </div>
    {#if s.publisher}
      <div class="sc-field"><span class="sc-label">Publisher</span><div class="sc-value">{s.publisher}</div></div>
    {/if}
    <div class="sc-field">
      <span class="sc-label">URL</span>
      <a class="sc-urllink" href={s.url} target="_blank" rel="noopener noreferrer">{s.url}</a>
    </div>
    <div class="sc-field">
      <span class="sc-label">Status</span>
      <span class="sc-status-chip">{s.status ?? 'metadata-only'}</span>
    </div>

    <button class="sc-fetch" onclick={() => curation.fetchSource(s)} disabled={s.content_pulled}>
      {s.content_pulled ? '✓ fetched' : '↓ Fetch full content (Jina / PDF)'}
    </button>

    <TagBar />
  </section>

  <section class="sc-card">
    <h3>Extracts</h3>
    <div class="sc-extract-add">
      <select bind:value={extractKind}>
        {#each EXTRACT_KINDS as k}<option value={k}>{k}</option>{/each}
      </select>
      <textarea placeholder="paste an extract…" bind:value={extractText}></textarea>
      <button class="sc-primary" onclick={saveExtract}>+ Add to {extractKind}</button>
    </div>
    <p class="sc-muted sc-mini">Extracts append to this source's body under <code>## {extractKind}</code>.</p>
  </section>
{:else}
  <p class="sc-muted sc-pad">Select a source.</p>
{/if}
