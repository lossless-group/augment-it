<script lang="ts">
  import ResultRow from './ResultRow.svelte';
  import type { ConnectorResult } from './lib/types';

  let {
    results,
    provider,
    onadd,
  }: {
    results: ConnectorResult[];
    provider: string | null;
    onadd: (url: string) => Promise<void>;
  } = $props();
</script>

{#if provider}
  <p class="saa-provider-note">
    {results.length} result{results.length === 1 ? '' : 's'} via <strong>{provider}</strong>
  </p>
{/if}
{#if results.length > 0}
  <ul class="saa-results">
    {#each results as r (r.url)}
      <ResultRow result={r} {onadd} />
    {/each}
  </ul>
{:else if provider}
  <p class="saa-empty">zero results — edit the term or swap the provider and re-fire</p>
{/if}
