<script lang="ts">
  // links/streams accept surface — ResultRow/ResultsList copy-adapted from
  // search-and-add (spec D7: per-remote copies, no shared runtime; knowingly
  // more fuel for the component library, gh #22). Every row's ➕ writes via
  // organization.links.add / streams.add with the crawl's kind/name carried
  // through; added ✓ sticks (server-side dedup), errors stay on the row.

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
  <ul class="srq-results">
    {#each rows as row (row.result.url)}
      <li class="srq-row">
        <div class="srq-row-main">
          <a class="srq-row-title" href={row.result.url} target="_blank" rel="noreferrer">
            {row.result.title || row.result.url}
          </a>
          <span class="srq-row-host">{host(row.result.url)}</span>
          {#if row.result.kind}<span class="srq-kind">{row.result.kind}</span>{/if}
          {#if row.result.name}<span class="srq-row-name">{row.result.name}</span>{/if}
          {#if row.result.content}<p class="srq-row-snippet">{row.result.content.slice(0, 220)}</p>{/if}
          {#if row.error}<div class="srq-error">{row.error}</div>{/if}
        </div>
        <button
          type="button"
          class="srq-add"
          class:added={row.added}
          disabled={row.adding || row.added}
          onclick={() => add(row)}
          title={row.added ? 'added to the entity' : 'add to the entity'}
        >
          {row.added ? '✓' : row.adding ? '…' : '+'}
        </button>
      </li>
    {/each}
  </ul>
{/if}
