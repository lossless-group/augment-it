<script lang="ts">
  /**
   * SearchBox--Autocomplete — options come from a service.
   *
   * Everything here exists because a request can be slow, fail, or come back out
   * of order. Two members hand-rolled the same sequence guard before this
   * existed:
   *
   *   if (seq === lookupSeq) { suggestions = r; }
   *
   * Without it a slow response for "aa" lands after a fast one for "aardvark"
   * and replaces correct suggestions with stale ones — invisible in testing,
   * common in use. There is a test for exactly that.
   *
   * FOUR STATES --LiveFilter DOES NOT HAVE: loading, error, empty-after-search,
   * and below-minimum. The last is the one members get wrong: "no results" and
   * "you have not typed enough yet" look identical if you only track an array's
   * length, so a user who typed one character is told there is nothing to find.
   *
   * Spec: context-v/specs/SearchBox-LiveFilter-And-Autocomplete.md
   */
  import type { Snippet } from 'svelte';
  import SearchBoxCore, { type SearchOption } from './SearchBoxCore.svelte';

  type Props = {
    /** Queries the service. Rejections become the error state, never a silent empty. */
    lookup: (query: string) => Promise<SearchOption[]>;
    label: string;
    /**
     * The text in the box. BINDABLE, and it has to be.
     *
     * Three things break without it, all of them measured at real call sites:
     * a member whose field ARRIVES POPULATED renders empty and silently drops a
     * value the operator was shown; a member cannot read what was typed, which
     * is how you seed a create-this-instead form; and picking cannot write the
     * chosen label back, which is standard autocomplete behaviour.
     *
     * The core always had `bind:value`. The variant just failed to pass it
     * through, which blocked one adoption outright.
     */
    value?: string;
    placeholder?: string;
    onselect?: (id: string) => void;
    /** Do not query below this length. Two members independently chose 2. */
    minLength?: number;
    debounceMs?: number;
    /** Classes for the INPUT itself — see the core. `class` lands on the wrapper. */
    inputClass?: string;
    option?: Snippet<[SearchOption]>;
    class?: string;
    [key: string]: unknown;
  };

  let {
    lookup,
    label,
    value = $bindable(''),
    placeholder,
    onselect,
    minLength = 2,
    debounceMs = 180,
    inputClass = '',
    option,
    class: klass = '',
    ...rest
  }: Props = $props();

  let results = $state<SearchOption[]>([]);
  // `phase`, not `state` — a variable called `state` SHADOWS the $state rune and
  // the component stops compiling with an error that names the rune rather than
  // the variable. Cheap to hit, confusing to read.
  let phase = $state<'idle' | 'loading' | 'ready' | 'empty' | 'error'>('idle');

  // THE GUARD. Every request takes a ticket; only the latest ticket may write.
  let seq = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function oninput(text: string) {
    value = text;
    clearTimeout(timer);

    if (text.trim().length < minLength) {
      // Below the minimum is IDLE, not empty. Telling a user who typed one
      // character that there are no results is a lie about the data.
      seq++;
      results = [];
      phase = 'idle';
      return;
    }

    phase = 'loading';
    timer = setTimeout(async () => {
      const ticket = ++seq;
      try {
        const r = await lookup(text.trim());
        if (ticket !== seq) return;      // a newer query has already been asked
        results = r;
        phase = r.length ? 'ready' : 'empty';
      } catch {
        if (ticket !== seq) return;
        results = [];
        phase = 'error';
      }
    }, debounceMs);
  }
</script>

<SearchBoxCore
  {...rest}
  bind:value
  options={results}
  {label}
  {placeholder}
  {onselect}
  {oninput}
  {option}
  suppressed={phase === 'idle'}
  class={klass}
>
  {#snippet status()}
    {#if phase === 'loading'}
      <div class="ui-searchbox__status" data-state="loading" role="status">searching…</div>
    {:else if phase === 'empty'}
      <div class="ui-searchbox__status" data-state="empty" role="status">no matches</div>
    {:else if phase === 'error'}
      <div class="ui-searchbox__status" data-state="error" role="status">
        could not search — try again
      </div>
    {/if}
  {/snippet}
</SearchBoxCore>

<style>
  .ui-searchbox__status {
    padding: var(--space-2xs) var(--space-md);
    color: var(--color-text-muted);
    font-family: var(--font-sans);
    font-size: var(--text-label);
  }
  .ui-searchbox__status[data-state='error'] { color: var(--color-error-fg); }
</style>
