<script lang="ts">
  // Smart org search — autocomplete over resolver.search, which (since spec D4)
  // matches names, slug, aliases, and domains. "Kinda smart": contains-matching
  // server-side, LIMIT 8; the operator picks with a click or with the keyboard.
  //
  // THE KEYBOARD, THE DEBOUNCE AND THE STALE GUARD ARE NO LONGER HERE.
  // This member declared role="listbox" with no keydown handler at all, so every
  // arrow key was a promise to a screen-reader user that nothing kept. It also
  // hand-rolled `if (term === q.trim())` — correct on the success path, and
  // absent from the catch, so a rejection for a query the operator had already
  // moved past wiped the newer query's results and painted an error over them.
  // SearchBox--Autocomplete owns all three. See
  // context-v/specs/SearchBox-LiveFilter-And-Autocomplete.md.

  import SearchBoxAutocomplete from '@augment-it/shared-ui/SearchBox--Autocomplete.svelte';
  import { searchOrgs } from './lib/org-client';
  import type { OrgSuggestion } from './lib/types';

  let {
    client,
    onpick,
    onquery,
  }: {
    client: string;
    onpick: (org: OrgSuggestion) => void;
    // Lets the parent seed the gated-create form with what was searched —
    // the no-results path usually IS the create path (issue #29 follow-up).
    onquery?: (q: string) => void;
  } = $props();

  type OrgOption = { id: string; label: string; org: OrgSuggestion };

  // The component hands back an id; this is how the row gets back to its org.
  // Rebuilt per lookup, so it can only ever hold what is currently on screen.
  let byId = new Map<string, OrgSuggestion>();

  const nameOf = (o: OrgSuggestion) => o.complete_name ?? o.conventional_name ?? o.slug;

  async function lookup(term: string): Promise<OrgOption[]> {
    const results = await searchOrgs(term, client);
    byId = new Map(results.map((o) => [o.slug, o]));
    return results.map((o) => ({ id: o.slug, label: nameOf(o), org: o }));
  }

  function onselect(id: string) {
    const org = byId.get(id);
    if (org) onpick(org);
  }

  // `onquery` CANNOT be passed to the component. SearchBox--Autocomplete spreads
  // `{...rest}` AFTER its own `{oninput}`, so a member-supplied `oninput` lands
  // on SearchBoxCore and REPLACES the debounce-and-guard driver — silently, with
  // no type error and a widget that simply stops searching. A bubbling listener
  // on the wrapper reads the same keystrokes without touching the component's
  // contract. Raised, not worked around inside packages/.
  function relayQuery(e: Event) {
    const el = e.target as HTMLInputElement | null;
    if (el?.tagName === 'INPUT') onquery?.(el.value.trim());
  }
</script>

<div class="ow-search" oninput={relayQuery}>
  <SearchBoxAutocomplete
    {lookup}
    {onselect}
    label="Search organizations"
    placeholder="Search organizations — name, alias, or domain…"
    minLength={2}
    debounceMs={300}
    spellcheck="false"
  >
    {#snippet option(o)}
      <span class="ow-search-option">
        <span class="ow-search-name">{o.label}</span>
        <span class="ow-search-slug">{o.id}</span>
      </span>
    {/snippet}
  </SearchBoxAutocomplete>
</div>
