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
      <span class="sc-label">Title <span class="sc-muted sc-mini">— editable</span></span>
      <input
        value={s.title ?? ''}
        placeholder="(no title — fetch, retry, or just type one)"
        onchange={(e) => curation.updateSource('title', e.currentTarget.value)}
      />
    </div>
    <div class="sc-field">
      <span class="sc-label">Filename <span class="sc-muted sc-mini">— sources/<code>{s.source_slug ?? '…'}</code>.md</span></span>
      <input
        class="sc-mono"
        value={s.source_slug ?? ''}
        placeholder="(filename appears after first save/fetch)"
        disabled={!s.source_slug}
        onchange={(e) => curation.renameSource(e.currentTarget.value)}
      />
    </div>
    <div class="grid2">
      <div class="sc-field">
        <span class="sc-label">Publisher</span>
        <input value={s.publisher ?? ''} onchange={(e) => curation.updateSource('publisher', e.currentTarget.value)} />
      </div>
      <div class="sc-field">
        <span class="sc-label">Published date</span>
        <input value={s.published_date ?? ''} placeholder="YYYY-MM-DD" onchange={(e) => curation.updateSource('published_date', e.currentTarget.value)} />
      </div>
    </div>
    <div class="sc-field">
      <span class="sc-label">URL</span>
      <a class="sc-urllink" href={s.url} target="_blank" rel="noopener noreferrer">{s.url}</a>
    </div>
    <div class="sc-field">
      <span class="sc-label">Status</span>
      <span class="sc-status-chip">{s.status ?? 'metadata-only'}</span>
    </div>

    <div class="sc-field">
      <span class="sc-label">
        Report file <span class="sc-muted sc-mini">— attach a PDF you downloaded (when the URL is the profile page, not the PDF)</span>
      </span>
      <input
        type="file"
        accept=".pdf,.docx,.doc,.pptx,.xlsx,application/pdf"
        disabled={!s.source_slug}
        onchange={(e) => {
          const file = e.currentTarget.files?.[0];
          if (file) curation.attachFile(file);
          e.currentTarget.value = '';
        }}
      />
    </div>

    <div class="sc-actions">
      <button onclick={() => curation.fetchSource(s)} disabled={s.content_pulled}>
        {s.content_pulled ? '✓ fetched' : '↓ Fetch full content'}
      </button>
      <button onclick={() => curation.retrySource(s)} title="Re-fetch, bypassing Jina's cache">⟳ Retry</button>
      <button class="sc-danger" onclick={() => curation.removeSource(s)}>🗑 Remove</button>
    </div>

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
