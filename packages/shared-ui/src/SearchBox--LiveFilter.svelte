<script lang="ts">
  /**
   * SearchBox--LiveFilter — narrows a list that is already in memory.
   *
   * The instant half of the family: no request, so no debounce, no stale
   * response, no loading state and no failure mode. If your options arrive from
   * a service, you want SearchBox--Autocomplete — it has four states this does
   * not, and one of them is a guard you will otherwise hand-roll.
   *
   * Spec: context-v/specs/SearchBox-LiveFilter-And-Autocomplete.md
   * Keyboard, ARIA and the input-keeps-focus rule: SearchBoxCore.
   */
  import type { Snippet } from 'svelte';
  import SearchBoxCore, { type SearchOption } from './SearchBoxCore.svelte';

  type Props = {
    options: SearchOption[];
    label: string;
    placeholder?: string;
    onselect?: (id: string) => void;
    /** Override the match. Default is case-insensitive substring on `label`. */
    match?: (option: SearchOption, query: string) => boolean;
    option?: Snippet<[SearchOption]>;
    class?: string;
    [key: string]: unknown;
  };

  let { options, label, placeholder, onselect, match, option, class: klass = '', ...rest }: Props =
    $props();

  let query = $state('');

  const defaultMatch = (o: SearchOption, q: string) =>
    o.label.toLowerCase().includes(q.toLowerCase());

  // An empty query shows everything. A member that wants "type before you see
  // anything" has an Autocomplete-shaped need, not a filter-shaped one.
  const shown = $derived(
    !query.trim() ? options : options.filter((o) => (match ?? defaultMatch)(o, query.trim())),
  );
</script>

<SearchBoxCore
  bind:value={query}
  options={shown}
  {label}
  {placeholder}
  {onselect}
  {option}
  class={klass}
  {...rest}
/>
