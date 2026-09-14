<script lang="ts">
  // links/streams accept surface — ResultRow/ResultsList copy-adapted from
  // search-and-add (spec D7: per-remote copies, no shared runtime; knowingly
  // more fuel for the component library, gh #22). Every row's ➕ writes via
  // organization.links.add / streams.add with the crawl's kind/name carried
  // through; added ✓ sticks (server-side dedup), errors stay on the row.

  import Button from '@augment-it/shared-ui/Button.svelte';
  import CardRow from '@augment-it/shared-ui/CardRow.svelte';
  import Chip from '@augment-it/shared-ui/Chip.svelte';
  import ListContainer from '@augment-it/shared-ui/ListContainer.svelte';
  import ExternalLink from '@augment-it/shared-ui/ExternalLink.svelte';
  import { addCrawlResult } from './lib/search-client';
  import type { ConnectorResult } from './lib/types';

  let {
    results,
    target,
    org_slug,
    client,
    onremaining,
  }: {
    results: ConnectorResult[];
    target: 'links' | 'streams';
    org_slug: string;
    client: string;
    onremaining: (n: number) => void;
  } = $props();

  type Row = { result: ConnectorResult; adding: boolean; added: boolean; error: string | null };
  // Seed-once by design — the parent fetches results once per expand.
  // svelte-ignore state_referenced_locally
  let rows = $state<Row[]>(results.map((result) => ({ result, adding: false, added: false, error: null })));

  $effect(() => {
    onremaining(rows.filter((r) => !r.added).length);
  });

  async function add(row: Row) {
    row.adding = true;
    row.error = null;
    try {
      await addCrawlResult({
        target,
        org_slug,
        url: row.result.url,
        client,
        kind: row.result.kind,
        name: row.result.name,
      });
      row.added = true;
    } catch (err) {
      row.error = err instanceof Error ? err.message : String(err);
    } finally {
      row.adding = false;
    }
  }

  // size="icon" has no text to name it, so the label is the accessible name AND
  // the tooltip — the same shape search-and-add's ResultRow landed on, because
  // this ➕ is the same organ it was copy-adapted from.
  function addLabel(row: Row): string {
    return row.added ? 'added to the entity' : `add ${row.result.url} to the entity`;
  }

  function host(u: string): string {
    try {
      return new URL(u).hostname.replace(/^www\./, '');
    } catch {
      return u;
    }
  }
</script>

{#if rows.length === 0}
  <p class="srq-empty">zero candidates — retry, or work the entity's lists directly</p>
{:else}
  <!-- The `.srq-results` recipe (list-style/margin/padding/display/gap) is
       DELETED; ListContainer owns all five. -->
  <ListContainer as="ul" gap="xs" label="Crawl results">
    {#each rows as row (row.result.url)}
      <!-- No SelectWrapper: the row's primary is an <a href> that NAVIGATES.
           Per the decision doc that is CardRow--Link, a different organ from
           selection — wrapping it in a SelectWrapper would put a navigation
           affordance inside a selection component. -->
      <CardRow as="li" density="compact">
        <div class="srq-row-main">
          <ExternalLink href={row.result.url} label={row.result.title || row.result.url} />
          <span class="srq-row-host">{host(row.result.url)}</span>
          {#if row.result.kind}<span class="srq-kind-slot"><Chip size="sm" tone="neutral">{row.result.kind}</Chip></span>{/if}
          {#if row.result.name}<span class="srq-row-name">{row.result.name}</span>{/if}
          {#if row.result.content}<p class="srq-row-snippet">{row.result.content.slice(0, 220)}</p>{/if}
          {#if row.error}<div class="srq-error">{row.error}</div>{/if}
        </div>
        <Button
          size="icon"
          disabled={row.adding || row.added}
          onclick={() => add(row)}
          aria-label={addLabel(row)}
          title={addLabel(row)}
        >
          {row.added ? '✓' : row.adding ? '…' : '+'}
        </Button>
      </CardRow>
    {/each}
  </ListContainer>
{/if}
