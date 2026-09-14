<script lang="ts">
  import Button from '@augment-it/shared-ui/Button.svelte';
  import CardRow from '@augment-it/shared-ui/CardRow.svelte';
  import Chip from '@augment-it/shared-ui/Chip.svelte';
  import SelectWrapperClickPrimary from '@augment-it/shared-ui/SelectWrapper--ClickPrimary.svelte';
  import { curation } from './curation.svelte';
  import { SOURCE_STATUS_TONE } from './types';

  let addUrl = $state('');

  function add(): void {
    const u = addUrl;
    addUrl = '';
    void curation.addSource(u);
  }
</script>

<div class="cc-list-head">
  <!-- link, not ghost: its only neighbour in this row is a full-width text
       input, so a transparent control with no underline and no boundary would
       have nothing to read as interactive against. link ships an underline and
       --color-link, which is the same affordance the old .cc-link was reaching
       for with accent text and no underline at all. -->
  <Button
    variant="link"
    size="sm"
    onclick={() => { curation.activeSlug = null; curation.activeType = null; }}>‹ corpora</Button
  >
  <input class="cc-filter" placeholder="filter sources… (coverage check)" bind:value={curation.listFilter} />
</div>

<div class="cc-add">
  <input
    placeholder="paste a URL to add…"
    bind:value={addUrl}
    onkeydown={(e) => { if (e.key === 'Enter') add(); }}
  />
  <Button variant="primary" onclick={add}>+ Add</Button>
</div>

<div class="cc-list">
  {#if curation.sources.length === 0}
    <p class="cc-muted cc-pad cc-mini">No sources yet. Paste a URL to add one.</p>
  {:else}
    {#each curation.filtered as { source, index } (source.source_uuid)}
      <!-- Was the raw <button class="cc-row"> holdout from the Button rollout,
           whose stated reason was "the organ this wants is a selectable list
           row; it does not exist yet." It exists now: CardRow draws the row and
           a SelectWrapper carries the selection.

           --ClickPrimary, and NOT the --ClickBody this surface actually wants.
           --ClickBody was written, built and measured first: click-anywhere
           worked, the overlay buried nothing (0 sibling controls on all 7 rows
           in this member), and it is still WRONG here, because
           `.ui-selectbody { display: contents }` takes the <button> out of
           Chromium's sequential focus navigation entirely. Measured three ways
           on the same page: at HEAD all four source rows and all three corpus
           rows are tab-reachable; with --ClickBody, ZERO of the seven are;
           forcing display:flex on the same element restores all seven in
           document order. tabindex="0" does not help. That is WCAG 2.1.1
           Keyboard, Level A, so --ClickBody cannot ship until the primitive is
           fixed — see the migration report.

           The cost of the fallback, stated plainly: the click target shrinks
           from the whole 346x79 row to the title line. Still over the SC 2.5.8
           floor, still keyboard-reachable, and honest. -->
      <CardRow density="compact" selected={index === curation.focusIdx}>
        <span class="cc-dot" class:err={source.verdict_error}></span>
        <span class="cc-row-body">
          <SelectWrapperClickPrimary
            label={source.title || source.url}
            selected={index === curation.focusIdx}
            onselect={() => curation.focus(index)}
          >
            <span class="cc-row-title">{source.title || source.url}</span>
          </SelectWrapperClickPrimary>
          <span class="cc-row-meta">
            {#if source.publisher}<span>{source.publisher}</span>{/if}
            <Chip size="sm" tone={SOURCE_STATUS_TONE[source.status ?? 'metadata-only']}
              >{source.status ?? 'metadata-only'}</Chip
            >
            {#each source.tags ?? [] as t}<Chip size="sm">{t}</Chip>{/each}
          </span>
        </span>
      </CardRow>
    {/each}
  {/if}
</div>
