<script lang="ts">
  import Button from '@augment-it/shared-ui/Button.svelte';
  import CardRow from '@augment-it/shared-ui/CardRow.svelte';
  import Chip from '@augment-it/shared-ui/Chip.svelte';
  import ListContainer from '@augment-it/shared-ui/ListContainer.svelte';
  import SelectWrapperClickBody from '@augment-it/shared-ui/SelectWrapper--ClickBody.svelte';
  import { curation } from './curation.svelte';
  import { SOURCE_STATUS_TONE } from './types';

  let addUrl = $state('');

  function add(): void {
    const u = addUrl;
    addUrl = '';
    void curation.addSource(u);
  }
</script>

<!-- ListContainer. Three recipes came out of app.css for this one region:
     `.cc-list-head` and `.cc-add` (display/align-items/gap/padding each) are the
     header, and `.cc-list` (flex/overflow/display/flex-direction/gap/padding) is
     the rows region. The two control rows merged into ONE wrapping header,
     which is what the layout's `flex-wrap` is for — a toolbar that cannot wrap
     clips its own controls. -->
<ListContainer as="ul" gap="2xs" label="Sources">
  {#snippet header()}
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
    <input
      class="cc-addurl"
      placeholder="paste a URL to add…"
      bind:value={addUrl}
      onkeydown={(e) => { if (e.key === 'Enter') add(); }}
    />
    <Button variant="primary" onclick={add}>+ Add</Button>

  {/snippet}

  <!-- The layout's `empty` slot: rendered OUTSIDE the rows element, which is
       what makes a <p> legal under `as="ul"`. -->
  {#snippet empty()}
    {#if curation.sources.length === 0}
      <p class="cc-muted cc-mini">No sources yet. Paste a URL to add one.</p>
    {/if}
  {/snippet}

    {#each curation.filtered as { source, index } (source.source_uuid)}
      <!-- Was the raw <button class="cc-row"> holdout from the Button rollout,
           whose stated reason was "the organ this wants is a selectable list
           row; it does not exist yet." It exists now: CardRow draws the row,
           SelectWrapper--ClickBody makes the whole surface select it.

           --ClickBody and not --ClickPrimary: the row ALREADY selected on a
           click anywhere, and --ClickPrimary shrinks that hit area from the
           whole 346x79 row to the title line — measured at exactly 302x24, the
           SC 2.5.8 floor, in the pass that used it. The overlay is safe here
           because the row's only descendants are <span>s: the meta line's Chips
           are non-dismissible, so there is no sibling control to bury, and the
           component's hit-test guard confirms it (0 buried on all 7 rows).

           This member rejected --ClickBody once, on measurement: its button was
           `display: contents`, which Chromium gives no box, so Tab skipped every
           row — WCAG 2.1.1 Level A. That is fixed in the primitive and the
           tab-order walk is re-measured against HEAD. -->
      <CardRow as="li" density="compact" selected={index === curation.focusIdx}>
        <SelectWrapperClickBody
          label={source.title || source.url}
          selected={index === curation.focusIdx}
          onselect={() => curation.focus(index)}
        >
          <span class="cc-dot" class:err={source.verdict_error}></span>
          <span class="cc-row-body">
            <span class="cc-row-title">{source.title || source.url}</span>
            <span class="cc-row-meta">
              {#if source.publisher}<span>{source.publisher}</span>{/if}
              <Chip size="sm" tone={SOURCE_STATUS_TONE[source.status ?? 'metadata-only']}
                >{source.status ?? 'metadata-only'}</Chip
              >
              {#each source.tags ?? [] as t}<Chip size="sm">{t}</Chip>{/each}
            </span>
          </span>
        </SelectWrapperClickBody>
      </CardRow>
    {/each}
</ListContainer>
