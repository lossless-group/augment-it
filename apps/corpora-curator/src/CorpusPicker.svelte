<script lang="ts">
  import Button from '@augment-it/shared-ui/Button.svelte';
  import CardRow from '@augment-it/shared-ui/CardRow.svelte';
  import Chip from '@augment-it/shared-ui/Chip.svelte';
  import ListContainer from '@augment-it/shared-ui/ListContainer.svelte';
  import SearchBoxLiveFilter from '@augment-it/shared-ui/SearchBox--LiveFilter.svelte';
  import SelectWrapperClickBody from '@augment-it/shared-ui/SelectWrapper--ClickBody.svelte';
  import { tick } from 'svelte';
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
  // The same organ, the same variant, the same reasoning as TagBar: the options
  // were a synchronous filter over `curation.tagVocab`, so --LiveFilter. The one
  // thing this surface does that TagBar does not is accept a COMMA-SEPARATED
  // entry ("Rural-Access, Employer-Partnerships"), and that stays in `addTag`
  // where it has always been — the widget picks one option at a time and the
  // member decides what a picked string means.
  let tagInput = $state('');
  let pendingTags = $state<string[]>([]);
  const tagOptions = $derived(curation.tagVocab.map((t) => ({ id: t, label: t })));
  // See TagBar for why this remount exists. Same missing prop, same deviation.
  let tagResetToken = $state(0);
  let tagWrapEl = $state<HTMLElement | null>(null);

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
    tagResetToken += 1;
    void tick().then(() => tagWrapEl?.querySelector('input')?.focus());
  }
  // See TagBar for why the member's Enter listens one level up and reads
  // `defaultPrevented` rather than passing `onkeydown` to the component.
  function onTagEnter(e: KeyboardEvent): void {
    if (e.key !== 'Enter' || e.defaultPrevented) return;
    // Guard BEFORE preventDefault — see TagBar.
    if (!tagInput.trim()) return;
    e.preventDefault();
    addTag(tagInput);
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
    tagResetToken += 1;
  }
</script>

<section class="cc-card">
  <h2>Corpora</h2>
  <p class="cc-muted">Pick a corpus to gather sources for, or create a new one.</p>

  {#if curation.strategies.length === 0}
    <p class="cc-muted cc-mini">No corpora yet.</p>
  {:else}
    <!-- `.cc-strat-list` DELETED — list-style, margin, padding, display,
         flex-direction and gap are the whole of ListContainer's rows region.
         No header slot: the h2/p above are prose, not controls, and the layout
         is deliberately not asked to own them. -->
    <ListContainer as="ul" gap="2xs" label="Corpora">
      {#each curation.strategies as s (s.slug)}
        <!-- The type rides along on the row rather than filtering the list
             (gh #88). Two corpora can share a slug across types, so the chip
             is also what makes them distinguishable.

             Was the raw <button class="cc-strat"> holdout. Three props carry
             what its thirteen declarations used to: `as="li"` (the first pass
             nested CardRow in a bare <li>, because a <div> is illegal in a
             <ul>), `direction="column"` for the title-over-meta stack (the
             first pass spent a rung-0 `.cc-strat-body` wrapper on it), and
             `density="compact"`. Zero override rungs.

             --ClickBody: the whole row was always the click target, and the
             meta line's Chip is a <span>, so there is nothing under the
             overlay. -->
        <CardRow as="li" density="compact" direction="column">
          <SelectWrapperClickBody
            label={`${s.title} — ${s.slug}${s.type ? ` (${s.type})` : ''}`}
            onselect={() => curation.select(s.slug, s.type)}
          >
            <span class="cc-strat-title">{s.title}</span>
          </SelectWrapperClickBody>
          <span class="cc-strat-meta">
            <span class="cc-muted cc-mono cc-mini">{s.slug}</span>
            {#if s.type}<Chip size="sm">{s.type}</Chip>{/if}
          </span>
        </CardRow>
      {/each}
    </ListContainer>
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
    <!-- Rung 0: the wrapper catches the bubbled Enter, because a tag that
         matches nothing is still a valid tag here, and holds the handle used to
         re-focus after the remount. See the long note in TagBar. -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- The rule is right about the shape and wrong about this case. The wrapper
       is not an interactive element — it never takes focus, has no role, and
       handles nothing of its own. It is a DELEGATION point: the Enter that
       reaches it was dispatched at the combobox input inside, and bubbled.
       Giving this div a role to satisfy the lint would invent a second widget
       around the one that already exists. -->
  <div bind:this={tagWrapEl} onkeydown={onTagEnter}>
      {#key tagResetToken}
        <SearchBoxLiveFilter
          options={tagOptions}
          label="add a tag"
          placeholder="add a tag…"
          oninput={(t: string) => (tagInput = t)}
          onselect={(id: string) => addTag(id)}
        />
      {/key}
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
