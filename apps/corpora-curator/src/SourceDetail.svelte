<script lang="ts">
  import Button from '@augment-it/shared-ui/Button.svelte';
  import Chip from '@augment-it/shared-ui/Chip.svelte';
  import ExternalLink from '@augment-it/shared-ui/ExternalLink.svelte';
  import { curation } from './curation.svelte';
  import { EXTRACT_KINDS, SOURCE_STATUS_TONE, type ExtractKind } from './types';
  import TagBar from './TagBar.svelte';

  let extractKind = $state<ExtractKind>('Quotes');
  let extractText = $state('');

  function saveExtract(): void {
    const t = extractText;
    extractText = '';
    void curation.addExtract(extractKind, t);
  }

  // Pulse the border green to confirm a save, then fade back (see .cc-saved).
  function flash(node: HTMLElement): void {
    node.classList.remove('cc-saved');
    void node.offsetWidth; // reflow → restart the animation on rapid repeats
    node.classList.add('cc-saved');
    window.setTimeout(() => node.classList.remove('cc-saved'), 1600);
  }

  // Action: commit on Enter (blur) or change, then flash on success.
  function commitOnEdit(node: HTMLInputElement, run: (value: string) => unknown) {
    let current = run;
    const onChange = async (): Promise<void> => {
      await current(node.value);
      if (!curation.lastError) flash(node);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Enter') {
        e.preventDefault();
        node.blur(); // triggers change → save + flash
      }
    };
    node.addEventListener('change', onChange);
    node.addEventListener('keydown', onKey);
    return {
      update(next: (value: string) => unknown) {
        current = next;
      },
      destroy() {
        node.removeEventListener('change', onChange);
        node.removeEventListener('keydown', onKey);
      },
    };
  }
</script>

{#if curation.focused}
  {@const s = curation.focused}
  <section class="cc-card">
    <h3>Source {curation.focusIdx + 1} of {curation.sources.length}</h3>

    <div class="cc-field">
      <span class="cc-label">Title <span class="cc-muted cc-mini">— editable</span></span>
      <input
        value={s.title ?? ''}
        placeholder="(no title — fetch, retry, or just type one)"
        use:commitOnEdit={(v) => curation.updateSource('title', v)}
      />
    </div>
    <div class="cc-field">
      <span class="cc-label">Filename <span class="cc-muted cc-mini">— sources/<code>{s.source_slug ?? '…'}</code>.md</span></span>
      <input
        class="cc-mono"
        value={s.source_slug ?? ''}
        placeholder="(filename appears after first save/fetch)"
        disabled={!s.source_slug}
        use:commitOnEdit={(v) => curation.renameSource(v)}
      />
    </div>
    <div class="cc-field">
      <span class="cc-label">Author(s) <span class="cc-muted cc-mini">— comma-separated</span></span>
      <input value={(s.authors ?? []).join(', ')} placeholder="(auto-filled on fetch)" use:commitOnEdit={(v) => curation.updateAuthors(v)} />
    </div>
    <div class="grid2">
      <div class="cc-field">
        <span class="cc-label">Publisher</span>
        <input value={s.publisher ?? ''} placeholder="(auto-filled on fetch)" use:commitOnEdit={(v) => curation.updateSource('publisher', v)} />
      </div>
      <div class="cc-field">
        <span class="cc-label">Published date</span>
        <input value={s.published_date ?? ''} placeholder="YYYY-MM-DD" use:commitOnEdit={(v) => curation.updateSource('published_date', v)} />
      </div>
    </div>
    <div class="cc-field">
      <span class="cc-label">URL</span>
      <ExternalLink href={s.url} />
    </div>
    <div class="cc-field">
      <span class="cc-label">Status</span>
      <span class="cc-chip-slot"
        ><Chip size="sm" tone={SOURCE_STATUS_TONE[s.status ?? 'metadata-only']}>{s.status ?? 'metadata-only'}</Chip></span
      >
    </div>

    <div class="cc-field">
      <span class="cc-label">
        Report file <span class="cc-muted cc-mini">— attach a PDF you downloaded (when the URL is the profile page, not the PDF)</span>
      </span>
      {#if s.binary_filename}
        <div class="cc-attached" title="A file is attached to this source">
          <span class="cc-attached-dot">✓</span>
          <span class="cc-attached-name cc-mono">{s.binary_filename}</span>
          {#if s.binary_bytes}<span class="cc-muted cc-mini">({(s.binary_bytes / 1e6).toFixed(1)} MB)</span>{/if}
        </div>
      {/if}
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
      {#if s.binary_filename}<span class="cc-muted cc-mini">Choosing a file replaces the attached one.</span>{/if}
    </div>

    <!-- The curation triad, mapped by role rather than by the greys the member
         drew it in. Fetch is the affirmative action of this card and the one
         the operator is meant to press, so primary. Retry is the alternate path
         to the same end, so secondary — NOT ghost: it would sit between a
         filled primary and a filled destructive with no boundary of its own and
         read as a label rather than a control. Remove is destructive, which is
         the first time this member has drawn deletion as anything other than
         error-coloured text on the same surface as its two neighbours. -->
    <div class="cc-actions">
      <Button variant="primary" onclick={() => curation.fetchSource(s)} disabled={s.content_pulled}>
        {s.content_pulled ? '✓ fetched' : '↓ Fetch full content'}
      </Button>
      <Button variant="secondary" onclick={() => curation.retrySource(s)} title="Re-fetch, bypassing Jina's cache"
        >⟳ Retry</Button
      >
      <Button variant="destructive" onclick={() => curation.removeSource(s)}>🗑 Remove</Button>
    </div>

    <TagBar />
  </section>

  <section class="cc-card">
    <h3>Extracts</h3>
    <div class="cc-extract-add">
      <select bind:value={extractKind}>
        {#each EXTRACT_KINDS as k}<option value={k}>{k}</option>{/each}
      </select>
      <textarea placeholder="paste an extract…" bind:value={extractText}></textarea>
      <Button variant="primary" onclick={saveExtract}>+ Add to {extractKind}</Button>
    </div>
    <p class="cc-muted cc-mini">Extracts append to this source's body under <code>## {extractKind}</code>.</p>
  </section>
{:else}
  <p class="cc-muted cc-pad">Select a source.</p>
{/if}
