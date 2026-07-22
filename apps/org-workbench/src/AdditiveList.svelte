<script lang="ts">
  // Generic additive list — the org card's repeated organ. Renders shaped
  // entries (kind badge · host · date) with an inline ➕ form that hands the
  // URL (+ optional kind) to a caller-supplied add function. Additive only:
  // no edit, no delete — canonical writes are append + dedup server-side.
  // Busy/error states are localized to this list; a failed add never
  // disturbs the sibling lists.

  import type { ShapedLink } from './lib/types';

  let {
    title,
    entries,
    kindHint = 'auto-detected from URL',
    onadd,
    onsearch,
  }: {
    title: string;
    entries: ShapedLink[];
    kindHint?: string;
    onadd: (url: string, kind?: string) => Promise<void>;
    // Optional 🔍 — launches search-and-add pre-scoped to this list (Phase 3).
    onsearch?: () => void;
  } = $props();

  let adding = $state(false);
  let open = $state(false);
  let url = $state('');
  let kind = $state('');
  let error = $state<string | null>(null);
  let justAdded = $state(false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    adding = true;
    error = null;
    try {
      await onadd(trimmed, kind.trim() || undefined);
      url = '';
      kind = '';
      open = false;
      justAdded = true;
      setTimeout(() => (justAdded = false), 2000);
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

<section class="ow-list">
  <header class="ow-list-head">
    <h3 class="ow-list-title">{title} <span class="ow-list-count">{entries.length}</span></h3>
    <span class="ow-list-actions">
      {#if justAdded}<span class="ow-added">added ✓</span>{/if}
      {#if onsearch}
        <button type="button" class="ow-plus" title="Search the web for {title}" onclick={onsearch}>
          🔍
        </button>
      {/if}
      <button type="button" class="ow-plus" title="Add to {title}" onclick={() => (open = !open)}>
        {open ? '×' : '+'}
      </button>
    </span>
  </header>

  {#if open}
    <form class="ow-add" onsubmit={submit}>
      <input
        class="ow-add-url"
        type="url"
        placeholder="https://…"
        bind:value={url}
        required
        disabled={adding}
      />
      <input
        class="ow-add-kind"
        type="text"
        placeholder={kindHint}
        bind:value={kind}
        disabled={adding}
      />
      <button type="submit" class="ow-add-go" disabled={adding}>{adding ? '…' : 'Add'}</button>
    </form>
    {#if error}<div class="ow-error">{error}</div>{/if}
  {/if}

  {#if entries.length === 0}
    <p class="ow-empty">none yet</p>
  {:else}
    <ul class="ow-entries">
      {#each entries as e (e.url + e.added_at)}
        <li class="ow-entry">
          <span class="ow-kind">{e.kind}</span>
          <a class="ow-url" href={e.url} target="_blank" rel="noreferrer">{host(e.url)}</a>
          <span class="ow-date">{(e.added_at ?? '').slice(0, 10)}</span>
        </li>
      {/each}
    </ul>
  {/if}
</section>
