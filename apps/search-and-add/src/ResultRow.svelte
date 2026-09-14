<script lang="ts">
  // One search result — title, host, snippet, date, and THE one-click ➕
  // that adds this URL to the launching entity's list. Add state is
  // per-row: "added ✓" sticks (re-adding is server-side dedup'd anyway),
  // errors stay localized to the row.

  import Button from '@augment-it/shared-ui/Button.svelte';
  import Chip from '@augment-it/shared-ui/Chip.svelte';
  import ExternalLink from '@augment-it/shared-ui/ExternalLink.svelte';
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

  // Scan mode: the corpus already holds this URL — badge it, park the ➕.
  const known = $derived(result.known === true);

  // size="icon" has no text to name it, so the label is the accessible name
  // AND the tooltip. Before the migration this string existed only as title=,
  // which no screen reader announces as a name.
  const label = $derived(
    known ? 'already in the corpus' : added ? 'added to the entity' : `add ${result.url} to the entity`,
  );

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
    <ExternalLink href={result.url} label={result.title} />
    <span class="saa-row-host">{host(result.url)}</span>
    {#if known}<span class="saa-known-slot"><Chip size="sm" tone="ok">in corpus</Chip></span>{/if}
    {#if result.published_date}<span class="saa-row-date">{result.published_date.slice(0, 10)}</span>{/if}
    {#if result.content}<p class="saa-row-snippet">{result.content.slice(0, 220)}</p>{/if}
    {#if error}<div class="saa-error">{error}</div>{/if}
  </div>
  <Button
    size="icon"
    disabled={adding || added || known}
    onclick={add}
    aria-label={label}
    title={label}
  >
    {added || known ? '✓' : adding ? '…' : '+'}
  </Button>
</li>
