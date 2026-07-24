<script lang="ts">
  // The coverage column — the front of the workbench flow. Every org the
  // workspace client can see, filterable by name/slug, sorted by corpus
  // count (fewest first by default — the operator's job here is to find
  // orgs that could and should have more corpus content). Zero-corpus rows
  // wear a red badge. Clicking a row opens the org card; writes elsewhere
  // in the workbench refresh the counts via augment-it:entity-updated.
  // Per gh #32 (layer 2 of the corpus-coverage issue).

  import { fetchOrgRoster } from './lib/org-client';
  import type { OrgRosterRow } from './lib/types';

  let {
    client,
    activeSlug,
    onpick,
  }: {
    client: string;
    activeSlug: string | null;
    onpick: (org_slug: string) => void;
  } = $props();

  let rows = $state<OrgRosterRow[]>([]);
  let filter = $state('');
  let fewestFirst = $state(true);
  let loading = $state(false);
  let error = $state<string | null>(null);

  async function load(c: string) {
    loading = true;
    error = null;
    try {
      rows = await fetchOrgRoster(c);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      rows = [];
    } finally {
      loading = false;
    }
  }

  // Reload whenever the workspace client changes (the default filter IS the
  // workspace: client_access CONTAINS <active client>).
  $effect(() => {
    void load(client);
  });

  // Any write anywhere in the workbench may have changed a count.
  $effect(() => {
    const refresh = () => void load(client);
    window.addEventListener('augment-it:entity-updated', refresh);
    return () => window.removeEventListener('augment-it:entity-updated', refresh);
  });

  const visible = $derived.by(() => {
    const q = filter.trim().toLowerCase();
    const filtered = q
      ? rows.filter((r) =>
          `${r.complete_name ?? ''} ${r.conventional_name ?? ''} ${r.slug}`
            .toLowerCase()
            .includes(q),
        )
      : rows;
    return [...filtered].sort((a, b) =>
      fewestFirst ? a.corpus_count - b.corpus_count : b.corpus_count - a.corpus_count,
    );
  });

  function displayName(r: OrgRosterRow): string {
    return r.complete_name ?? r.conventional_name ?? r.slug;
  }
</script>

<aside class="ow-roster">
  <div class="ow-roster-head">
    <input
      class="ow-roster-filter"
      type="search"
      placeholder="Filter {rows.length} orgs…"
      bind:value={filter}
    />
    <button
      type="button"
      class="ow-roster-sort"
      title="Sort by corpus count"
      onclick={() => (fewestFirst = !fewestFirst)}
    >
      corpus {fewestFirst ? '↑' : '↓'}
    </button>
  </div>

  {#if loading && rows.length === 0}
    <p class="ow-roster-note">loading roster…</p>
  {:else if error}
    <div class="ow-error">{error}</div>
  {:else if visible.length === 0}
    <p class="ow-roster-note">no orgs match</p>
  {:else}
    <ul class="ow-roster-list">
      {#each visible as r (r.slug)}
        <li>
          <button
            type="button"
            class="ow-roster-row"
            class:active={r.slug === activeSlug}
            onclick={() => onpick(r.slug)}
          >
            <span class="ow-roster-name">{displayName(r)}</span>
            <span class="ow-roster-counts">
              <span class="ow-roster-corpus" class:zero={r.corpus_count === 0}>
                {r.corpus_count} corpus
              </span>
              · {r.link_count} links · {r.stream_count} streams · {r.people_count} people
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</aside>
