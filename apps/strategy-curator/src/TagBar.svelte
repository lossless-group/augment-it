<script lang="ts">
  import { curation } from './curation.svelte';

  let input = $state('');
  let suggestions = $derived(curation.suggestTags(input));

  function apply(tag: string): void {
    input = '';
    void curation.applyTag(tag);
  }
</script>

<div class="sc-field">
  <span class="sc-label">Tags <span class="sc-muted sc-mini">— Train-Case, workspace vocabulary, auto-complete</span></span>

  <div class="sc-tags">
    {#each curation.focused?.tags ?? [] as t}
      <span class="sc-tag">{t}<button class="sc-tag-x" onclick={() => curation.removeTag(t)} aria-label="remove tag">×</button></span>
    {/each}
  </div>

  <div class="sc-tag-input">
    <input
      placeholder="add a tag…"
      bind:value={input}
      onkeydown={(e) => { if (e.key === 'Enter' && input.trim()) apply(input); }}
    />
    {#if input.trim() && suggestions.length}
      <div class="sc-tag-suggest">
        {#each suggestions as sug}
          <button onclick={() => apply(sug)}>{sug}</button>
        {/each}
      </div>
    {/if}
  </div>
</div>
