<script lang="ts">
  import { curation, slugify, splitTags } from './curation.svelte';

  // Mirrors content-ingest's DOMAIN_FOLDERS (services/content-ingest/src/
  // corpus.ts) so the "writes to" preview below matches the actual folder
  // the backend will create. Irregular plurals only; fallback +s.
  const DOMAIN_FOLDERS: Record<string, string> = {
    strategy: 'strategies',
    topic: 'topics',
    thesis: 'theses',
    category: 'categories',
    'market-segment': 'market-segments',
  };
  function domainFolder(t: string): string {
    return DOMAIN_FOLDERS[t] ?? `${t}s`;
  }

  let title = $state('');
  let slug = $state('');
  let slugEdited = $state(false);
  let type = $state(curation.domainType);
  let tagInput = $state('');
  let pendingTags = $state<string[]>([]);
  let tagSuggest = $derived(curation.suggestTags(tagInput));

  function onTitle(v: string): void {
    title = v;
    if (!slugEdited) slug = slugify(v);
  }
  function onSlug(v: string): void {
    slugEdited = true;
    slug = slugify(v);
  }
  function addTag(t: string): void {
    // Commas split into multiple tags; append each new one, deduped.
    for (const tt of splitTags(t)) {
      if (!pendingTags.includes(tt)) pendingTags = [...pendingTags, tt];
    }
    tagInput = '';
  }
  function removeTag(t: string): void {
    pendingTags = pendingTags.filter((x) => x !== t);
  }
  async function create(): Promise<void> {
    await curation.createStrategy({ title, slug, tags: pendingTags, type });
    // Read domainType back AFTER the await — createStrategy only updates it
    // (via setDomainType) once the server confirms a type change, so
    // resetting eagerly here would just re-read the pre-create value.
    title = '';
    slug = '';
    slugEdited = false;
    type = curation.domainType;
    pendingTags = [];
    tagInput = '';
  }
</script>

<section class="sc-card">
  <h2>Corpora</h2>
  <p class="sc-muted">Pick a corpus to gather sources for, or create a new one.</p>

  {#if curation.strategies.length === 0}
    <p class="sc-muted sc-mini">No corpora yet.</p>
  {:else}
    <ul class="sc-strat-list">
      {#each curation.strategies as s (s.slug)}
        <li>
          <button class="sc-strat" onclick={() => curation.select(s.slug)}>
            <span class="sc-strat-title">{s.title}</span>
            <span class="sc-muted sc-mono sc-mini">{s.slug}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<section class="sc-card">
  <h2>New corpus</h2>

  <div class="sc-field">
    <span class="sc-label">Title</span>
    <input value={title} oninput={(e) => onTitle(e.currentTarget.value)} placeholder="full corpus name…" />
  </div>

  <div class="sc-field">
    <span class="sc-label">Type <span class="sc-muted sc-mini">— any value; 'strategy' and 'thesis' are the two in use today</span></span>
    <input class="sc-mono" bind:value={type} placeholder="strategy" />
  </div>

  <div class="sc-field">
    <span class="sc-label">Slug <span class="sc-muted sc-mini">— auto from title, editable, lowercase-kebab</span></span>
    <input class="sc-mono" value={slug} oninput={(e) => onSlug(e.currentTarget.value)} placeholder="corpus-slug" />
  </div>

  <div class="sc-field">
    <span class="sc-label">Tags <span class="sc-muted sc-mini">— Train-Case, workspace vocabulary</span></span>
    <div class="sc-tags">
      {#each pendingTags as t}
        <span class="sc-tag">{t}<button class="sc-tag-x" onclick={() => removeTag(t)} aria-label="remove tag">×</button></span>
      {/each}
    </div>
    <div class="sc-tag-input">
      <input
        placeholder="add a tag…"
        bind:value={tagInput}
        onkeydown={(e) => { if (e.key === 'Enter' && tagInput.trim()) addTag(tagInput); }}
      />
      {#if tagInput.trim() && tagSuggest.length}
        <div class="sc-tag-suggest">
          {#each tagSuggest as sug}<button onclick={() => addTag(sug)}>{sug}</button>{/each}
        </div>
      {/if}
    </div>
  </div>

  <button class="sc-primary" onclick={create} disabled={!title.trim() || !slug.trim() || !type.trim()}>
    + Create corpus → folder + index.md
  </button>
  {#if slug.trim() && type.trim()}
    <p class="sc-muted sc-mini">
      Writes <code class="sc-mono">{domainFolder(type.trim())}/{slug}/index.md</code>
    </p>
  {/if}
</section>
