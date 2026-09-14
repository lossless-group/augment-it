<script lang="ts">
  import Chip from '@augment-it/shared-ui/Chip.svelte';
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
      <!-- One Chip replaces a span wrapping a Button. The span was never
           interactive so this was not the nested-interactive bug, but the
           accessible name was still wrong: five tags, five identical "remove
           tag" buttons.

           NO revealOnHover, and that is a decision rather than an omission.
           This member has no reveal discipline to preserve: checked the whole of
           app.css at HEAD and there is not one `opacity: 0`, `visibility:
           hidden` or hover-reveal rule in it — every × here has always rested
           visible. Passing revealOnHover would have INTRODUCED a hover-only
           affordance, which does not exist on a touch device. -->
      <Chip size="sm" dismissible dismissLabel="remove tag {t}" onDismiss={() => curation.removeTag(t)}>{t}</Chip>
    {/each}
  </div>

  <div class="cc-tag-input">
    <input
      placeholder="add a tag…"
      bind:value={input}
      onkeydown={(e) => { if (e.key === 'Enter' && input.trim()) apply(input); }}
    />
    {#if input.trim() && suggestions.length}
      <!-- Left raw: listbox options, not buttons. See .cc-tag-suggest in app.css. -->
      <div class="cc-tag-suggest">
        {#each suggestions as sug}
          <button onclick={() => apply(sug)}>{sug}</button>
        {/each}
      </div>
    {/if}
  </div>
</div>
