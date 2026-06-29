<script lang="ts">
  import { curation, slugify, toTrainCase } from './curation.svelte';

  let title = $state('');
  let slug = $state('');
  let slugEdited = $state(false);
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
    const tt = toTrainCase(t);
    if (tt && !pendingTags.includes(tt)) pendingTags = [...pendingTags, tt];
    tagInput = '';
  }
  function removeTag(t: string): void {
    pendingTags = pendingTags.filter((x) => x !== t);
  }
  function create(): void {
    void curation.createStrategy({ title, slug, tags: pendingTags });
    title = '';
    slug = '';
    slugEdited = false;
    pendingTags = [];
    tagInput = '';
  }
</script>

<section class="sc-card">
  <h2>Strategies</h2>
  <p class="sc-muted">Pick a strategy to gather sources for, or create a new one.</p>

  {#if curation.strategies.length === 0}
    <p class="sc-muted sc-mini">No strategies yet.</p>
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
  <h2>New strategy</h2>

  <div class="sc-field">
    <span class="sc-label">Title</span>
    <input value={title} oninput={(e) => onTitle(e.currentTarget.value)} placeholder="full strategy name…" />
  </div>

  <div class="sc-field">
    <span class="sc-label">Slug <span class="sc-muted sc-mini">— auto from title, editable, lowercase-kebab</span></span>
    <input class="sc-mono" value={slug} oninput={(e) => onSlug(e.currentTarget.value)} placeholder="strategy-slug" />
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

  <button class="sc-primary" onclick={create} disabled={!title.trim() || !slug.trim()}>
    + Create strategy → folder + index.md
  </button>
  {#if slug.trim()}
    <p class="sc-muted sc-mini">
      Writes <code class="sc-mono">strategies/{slug}/index.md</code>
    </p>
  {/if}
</section>
