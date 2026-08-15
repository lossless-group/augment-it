<script lang="ts">
  import { curation } from './curation.svelte';

  let input = $state('');
  let suggestions = $derived(curation.suggestTags(input));

  function apply(tag: string): void {
    input = '';
    void curation.applyTag(tag);
  }
</script>

<div class="cc-field">
  <span class="cc-label">Tags <span class="cc-muted cc-mini">— Train-Case, workspace vocabulary, auto-complete</span></span>

  <div class="cc-tags">
    {#each curation.focused?.tags ?? [] as t}
      <span class="cc-tag">{t}<button class="cc-tag-x" onclick={() => curation.removeTag(t)} aria-label="remove tag">×</button></span>
    {/each}
  </div>

  <div class="cc-tag-input">
    <input
      placeholder="add a tag…"
      bind:value={input}
      onkeydown={(e) => { if (e.key === 'Enter' && input.trim()) apply(input); }}
    />
    {#if input.trim() && suggestions.length}
      <div class="cc-tag-suggest">
        {#each suggestions as sug}
          <button onclick={() => apply(sug)}>{sug}</button>
        {/each}
      </div>
    {/if}
  </div>
</div>
