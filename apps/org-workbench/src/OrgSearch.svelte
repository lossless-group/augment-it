<script lang="ts">
  // Smart org search — debounced autocomplete over resolver.search, which
  // (since spec D4) matches names, slug, aliases, and domains. "Kinda smart":
  // contains-matching server-side, LIMIT 8; the operator picks with a click.

  import { searchOrgs } from './lib/org-client';
  import type { OrgSuggestion } from './lib/types';

  let {
    client,
    onpick,
  }: {
    client: string;
    onpick: (org: OrgSuggestion) => void;
  } = $props();

  const DEBOUNCE_MS = 300;

  let q = $state('');
  let suggestions = $state<OrgSuggestion[]>([]);
  let searching = $state(false);
  let error = $state<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;

  function onInput() {
    error = null;
    if (timer) clearTimeout(timer);
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      suggestions = [];
      return;
    }
    timer = setTimeout(() => void fire(trimmed), DEBOUNCE_MS);
  }

  async function fire(term: string) {
    searching = true;
    try {
      const results = await searchOrgs(term, client);
      // A slower earlier fire must not clobber a newer term's results.
      if (term === q.trim()) suggestions = results;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      suggestions = [];
    } finally {
      searching = false;
    }
  }

  function pick(org: OrgSuggestion) {
    suggestions = [];
    q = org.complete_name ?? org.conventional_name ?? org.slug;
    onpick(org);
  }
</script>

<div class="ow-search">
  <input
    class="ow-search-input"
    type="search"
    placeholder="Search organizations — name, alias, or domain…"
    bind:value={q}
    oninput={onInput}
    autocomplete="off"
    spellcheck="false"
  />
  {#if searching}<span class="ow-search-busy">…</span>{/if}
  {#if error}<div class="ow-error">{error}</div>{/if}
  {#if suggestions.length > 0}
    <ul class="ow-search-drop" role="listbox">
      {#each suggestions as s (s.slug)}
        <li>
          <button type="button" class="ow-search-item" onclick={() => pick(s)}>
            <span class="ow-search-name">{s.complete_name ?? s.conventional_name ?? s.slug}</span>
            <span class="ow-search-slug">{s.slug}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>
