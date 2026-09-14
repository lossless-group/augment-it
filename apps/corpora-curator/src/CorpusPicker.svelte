<script lang="ts">
  import Button from '@augment-it/shared-ui/Button.svelte';
  import CardRow from '@augment-it/shared-ui/CardRow.svelte';
  import Chip from '@augment-it/shared-ui/Chip.svelte';
  import SelectWrapperClickPrimary from '@augment-it/shared-ui/SelectWrapper--ClickPrimary.svelte';
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
  // A one-time snapshot here was the last visible trace of gh #88: this
  // component mounts before workspace.list resolves, so humain-vc's create form
  // offered "strategy" while every other surface had corrected itself to
  // "thesis". Track the workspace's preference until the operator overrides it;
  // once they type, their value wins and stops moving under them.
  let type = $state(curation.domainType);
  let typeEdited = $state(false);
  $effect(() => {
    const preferred = curation.domainType;
    if (!typeEdited) type = preferred;
  });
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
    // The form goes back to the workspace's preference after a create — a type
    // the operator typed for ONE corpus should not become sticky for the next.
    title = '';
    slug = '';
    slugEdited = false;
    typeEdited = false;
    type = curation.domainType;
    pendingTags = [];
    tagInput = '';
  }
</script>

<section class="cc-card">
  <h2>Corpora</h2>
  <p class="cc-muted">Pick a corpus to gather sources for, or create a new one.</p>

  {#if curation.strategies.length === 0}
    <p class="cc-muted cc-mini">No corpora yet.</p>
  {:else}
    <ul class="cc-strat-list">
      {#each curation.strategies as s (s.slug)}
        <li>
          <!-- The type rides along on the row rather than filtering the list
               (gh #88). Two corpora can share a slug across types, so the chip
               is also what makes them distinguishable.

               Was the raw <button class="cc-strat"> holdout. CardRow is a flex
               ROW and this card stacks a title over a meta line, so the stack
               moves into ONE slot — `.cc-strat-body` — which is rung 0: a
               wrapper owning its own internal layout, not a deviation.
               --ClickPrimary for the same reason as SourceList: --ClickBody is
               what this row wants and is keyboard-dead as shipped
               (`display: contents` removes its <button> from the tab order).
               See the comment in SourceList.svelte for the measurement. -->
          <CardRow density="compact">
            <span class="cc-strat-body">
              <SelectWrapperClickPrimary
                label={`${s.title} — ${s.slug}${s.type ? ` (${s.type})` : ''}`}
                onselect={() => curation.select(s.slug, s.type)}
              >
                <span class="cc-strat-title">{s.title}</span>
              </SelectWrapperClickPrimary>
              <span class="cc-strat-meta">
                <span class="cc-muted cc-mono cc-mini">{s.slug}</span>
                {#if s.type}<Chip size="sm">{s.type}</Chip>{/if}
              </span>
            </span>
          </CardRow>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<section class="cc-card">
  <h2>New corpus</h2>

  <div class="cc-field">
    <span class="cc-label">Title</span>
    <input value={title} oninput={(e) => onTitle(e.currentTarget.value)} placeholder="full corpus name…" />
  </div>

  <div class="cc-field">
    <span class="cc-label">Type <span class="cc-muted cc-mini">— any value; 'strategy' and 'thesis' are the two in use today</span></span>
    <input
      class="cc-mono"
      value={type}
      oninput={(e) => { typeEdited = true; type = e.currentTarget.value; }}
      placeholder={curation.domainType}
    />
  </div>

  <div class="cc-field">
    <span class="cc-label">Slug <span class="cc-muted cc-mini">— auto from title, editable, lowercase-kebab</span></span>
    <input class="cc-mono" value={slug} oninput={(e) => onSlug(e.currentTarget.value)} placeholder="corpus-slug" />
  </div>

  <div class="cc-field">
    <span class="cc-label">Tags <span class="cc-muted cc-mini">— Train-Case, workspace vocabulary</span></span>
    <div class="cc-tags">
      {#each pendingTags as t}
        <!-- dismissLabel names the TAG, not the action. Every × in this member
             used to announce the identical "remove tag", so a screen-reader user
             tabbing a row of five got the same five words and no way to tell
             which one they were about to delete. -->
        <Chip size="sm" dismissible dismissLabel="remove tag {t}" onDismiss={() => removeTag(t)}>{t}</Chip>
      {/each}
    </div>
    <div class="cc-tag-input">
      <input
        placeholder="add a tag…"
        bind:value={tagInput}
        onkeydown={(e) => { if (e.key === 'Enter' && tagInput.trim()) addTag(tagInput); }}
      />
      {#if tagInput.trim() && tagSuggest.length}
        <!-- Left raw: these are listbox options, not buttons. See the
             .cc-tag-suggest rule in app.css. -->
        <div class="cc-tag-suggest">
          {#each tagSuggest as sug}<button onclick={() => addTag(sug)}>{sug}</button>{/each}
        </div>
      {/if}
    </div>
  </div>

  <Button variant="primary" onclick={create} disabled={!title.trim() || !slug.trim() || !type.trim()}>
    + Create corpus → folder + index.md
  </Button>
  {#if slug.trim() && type.trim()}
    <p class="cc-muted cc-mini">
      Writes <code class="cc-mono">{domainFolder(type.trim())}/{slug}/index.md</code>
    </p>
  {/if}
</section>
