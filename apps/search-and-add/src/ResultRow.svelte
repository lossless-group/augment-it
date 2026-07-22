<script lang="ts">
  // One search result — title, host, snippet, date, and THE one-click ➕
  // that adds this URL to the launching entity's list. Add state is
  // per-row: "added ✓" sticks (re-adding is server-side dedup'd anyway),
  // errors stay localized to the row.

  import type { ConnectorResult } from './lib/types';

  let {
    result,
    onadd,
  }: {
    result: ConnectorResult;
    onadd: (url: string) => Promise<void>;
  } = $props();

  let adding = $state(false);
  let added = $state(false);
  let error = $state<string | null>(null);

  async function add() {
    adding = true;
    error = null;
    try {
      await onadd(result.url);
      added = true;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      adding = false;
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

<li class="saa-row">
  <div class="saa-row-main">
    <a class="saa-row-title" href={result.url} target="_blank" rel="noreferrer">{result.title}</a>
    <span class="saa-row-host">{host(result.url)}</span>
    {#if result.published_date}<span class="saa-row-date">{result.published_date.slice(0, 10)}</span>{/if}
    {#if result.content}<p class="saa-row-snippet">{result.content.slice(0, 220)}</p>{/if}
    {#if error}<div class="saa-error">{error}</div>{/if}
  </div>
  <button
    type="button"
    class="saa-add"
    class:added
    disabled={adding || added}
    onclick={add}
    title={added ? 'added to the entity' : 'add to the entity'}
  >
    {added ? '✓' : adding ? '…' : '+'}
  </button>
</li>
