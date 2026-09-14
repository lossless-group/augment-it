<script lang="ts">
  /**
   * SearchBoxCore — the input, the popup, and the keyboard. NOT EXPORTED.
   *
   * Deliberately absent from package.json exports. Members see only
   * SearchBox--LiveFilter and SearchBox--Autocomplete, so there is no third thing
   * to choose between and the organ census still reads cleanly. This is one
   * private file, not an abstraction layer.
   *
   * It exists because the two variants differ in exactly one thing — where
   * options come from — and nesting them into each other does not work in either
   * direction. Autocomplete wrapping LiveFilter would filter twice, discarding
   * the fuzzy matches and aliases a server deliberately returned; LiveFilter
   * wrapping Autocomplete inverts the dependency. See
   * context-v/specs/SearchBox-LiveFilter-And-Autocomplete.md.
   *
   * THE INPUT KEEPS FOCUS. This is the only selection organ here that does not
   * move focus to the thing being chosen. Selector--Listbox and Selector--Menu
   * use a roving tabindex — focus lands on the active option and the screen
   * reader announces it because it is focused. A SearchBox cannot: the user is
   * still typing, and moving focus would take the caret out of the input.
   *
   * So the active option is named by `aria-activedescendant` on the input, and
   * NO OPTION IS EVER tabindex="0". Getting that backwards produces a widget
   * that looks right, reads right in a screenshot, and drops the caret on the
   * first arrow key.
   */
  import type { Snippet } from 'svelte';

  export type SearchOption = { id: string; label: string; [key: string]: unknown };

  type Props = {
    options: SearchOption[];
    label: string;
    value?: string;
    placeholder?: string;
    /** Popup is suppressed while true — Autocomplete uses it below minLength. */
    suppressed?: boolean;
    /**
     * Empty the input after a pick. OFF by default.
     *
     * Five of six members SEARCH — you picked "Acme Corp", the box should still
     * say "acme". One PICKS: adding a tag leaves the fragment behind and the next
     * tag is typed onto the end of it. That member worked around it by remounting
     * the whole widget behind {#key} and re-focusing on tick(), six lines in two
     * files, for want of this.
     */
    clearOnSelect?: boolean;
    oninput?: (text: string) => void;
    onselect?: (id: string) => void;
    /**
     * Classes for the INPUT itself, not the wrapper.
     *
     * `class` lands on the wrapper and `rest.class` is overridden, so a member
     * had no way to put a per-field state cue on the field — an invalid ring, a
     * dirty marker, a save flash. One adoption lost a 1.2s save-confirmation
     * pulse that its two sibling fields still have.
     */
    inputClass?: string;
    /** Rendered inside the popup instead of options — loading, empty, error. */
    status?: Snippet;
    option?: Snippet<[SearchOption]>;
    class?: string;
    [key: string]: unknown;
  };

  let {
    options,
    label,
    value = $bindable(''),
    placeholder,
    suppressed = false,
    clearOnSelect = false,
    inputClass = '',
    oninput,
    onselect,
    status,
    option,
    class: klass = '',
    ...rest
  }: Props = $props();

  // A member passing `onkeydown` — the obvious spelling for "and also handle my
  // Enter" — used to REPLACE the entire keyboard contract, because `{...rest}`
  // was spread after the component's own handlers and a later attribute wins. No
  // error, and it rendered identically. Same silent-clobber shape as the `class`
  // bug in Button and both SelectWrappers.
  //
  // `rest` now spreads FIRST, so the contract always wins, and the three keys
  // that would have fought it are refused out loud.
  const RESERVED = ['onkeydown', 'oninput', 'value'] as const;
  $effect(() => {
    const taken = RESERVED.filter((k) => k in rest);
    if (taken.length) {
      console.error(
        `[@augment-it/shared-ui] <SearchBox> ignoring ${taken.join(', ')} — these ` +
          `belong to the widget's keyboard contract. To add your own Enter, listen ` +
          `on a wrapper and read e.defaultPrevented, which is set iff the widget picked.`,
      );
    }
  });

  // The delegation recipe tells a member to listen on a wrapper. A wrapper sees
  // DOM events — so when the widget writes `value` itself (Escape-to-clear, or
  // clearOnSelect) it has to dispatch one, or the member's listener never learns
  // the box emptied and keeps state pointing at something no longer shown.
  let inputEl: HTMLInputElement | undefined;
  function writeValue(next: string) {
    value = next;
    oninput?.(next);
    queueMicrotask(() => inputEl?.dispatchEvent(new Event('input', { bubbles: true })));
  }

  const uid = `ui-searchbox-${Math.random().toString(36).slice(2, 10)}`;
  const listId = `${uid}-list`;
  const optId = (i: number) => `${uid}-opt-${i}`;

  let open = $state(false);
  let active = $state(-1);

  // Never point at an option that is not there. An aria-activedescendant naming a
  // missing id is the same defect class as an aria-controls naming a missing
  // panel, and just as invisible.
  const activeIndex = $derived(active >= 0 && active < options.length ? active : -1);
  const isOpen = $derived(open && !suppressed && (options.length > 0 || !!status));

  function pick(i: number) {
    const o = options[i];
    if (!o) return;
    open = false;
    active = -1;
    if (clearOnSelect) writeValue('');
    onselect?.(o.id);
  }

  function onkeydown(e: KeyboardEvent) {
    const k = e.key;
    if (k === 'ArrowDown') {
      e.preventDefault();          // or the caret jumps to the end of the input
      if (!isOpen) { open = true; return; }
      active = options.length ? (activeIndex + 1) % options.length : -1;
    } else if (k === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) { open = true; return; }
      active = options.length ? (activeIndex - 1 + options.length) % options.length : -1;
    } else if (k === 'Enter') {
      // With nothing active this is the MEMBER's submit, not ours. Do not
      // preventDefault, and do not guess at a pick.
      if (isOpen && activeIndex >= 0) {
        e.preventDefault();
        pick(activeIndex);
      }
    } else if (k === 'Escape') {
      e.preventDefault();
      if (isOpen) { open = false; active = -1; }
      else if (value) writeValue('');
      // No focus to return — it never left.
    }
  }

  function handleInput(e: Event) {
    value = (e.currentTarget as HTMLInputElement).value;
    open = true;
    active = -1;
    oninput?.(value);
  }
</script>

<div class="ui-searchbox {klass}">
  <input
    {...rest}
    type="text"
    role="combobox"
    aria-label={label}
    aria-expanded={isOpen}
    aria-controls={isOpen ? listId : undefined}
    aria-activedescendant={isOpen && activeIndex >= 0 ? optId(activeIndex) : undefined}
    aria-autocomplete="list"
    autocomplete="off"
    {placeholder}
    {value}
    oninput={handleInput}
    {onkeydown}
    onblur={() => queueMicrotask(() => { open = false; })}
    class="ui-searchbox__input {inputClass}"
    bind:this={inputEl}
  />

  {#if isOpen}
    <div id={listId} role="listbox" aria-label={label} class="ui-searchbox__list">
      {#if status}{@render status()}{/if}
      {#each options as o, i (o.id)}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_interactive_supports_focus -->
        <!-- BOTH suppressions are the combobox pattern, not laziness.
             The keyboard lives on the INPUT, so there is no per-option keydown.
             And the linter's "role=option must have a tabindex" is the rule for a
             STANDALONE listbox, where focus moves into the list. In a combobox
             focus never leaves the input — the active option is named by
             aria-activedescendant — so making an option focusable is the precise
             thing this pattern forbids. A tabindex here would be the defect the
             lint rule is trying to prevent, inverted. -->
        <div
          id={optId(i)}
          role="option"
          aria-selected={i === activeIndex}
          data-active={i === activeIndex || undefined}
          class="ui-searchbox__option"
          onmousedown={(e) => e.preventDefault()}
          onclick={() => pick(i)}
        >
          {#if option}{@render option(o)}{:else}{o.label}{/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .ui-searchbox { position: relative; display: flex; flex-direction: column; min-inline-size: 0; }

  .ui-searchbox__input {
    min-block-size: var(--control-h-md);
    padding: var(--space-2xs) var(--space-md);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-md);
    background: var(--color-surface-2);
    color: var(--color-text);
    font-family: var(--font-sans);
    font-size: var(--text-body);
  }
  .ui-searchbox__input:focus-visible { box-shadow: var(--focus-ring); outline: none; }

  .ui-searchbox__list {
    position: absolute;
    inset-block-start: calc(100% + var(--space-3xs));
    inset-inline: 0;
    z-index: var(--z-remote-overlay);
    display: flex;
    flex-direction: column;
    max-block-size: 40vh;
    overflow-y: auto;
    padding: var(--space-3xs);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }

  .ui-searchbox__option {
    display: flex;
    align-items: center;
    min-block-size: var(--control-h-md);
    padding: var(--space-2xs) var(--space-md);
    border-radius: var(--radius-sm);
    color: var(--color-text);
    font-family: var(--font-sans);
    font-size: var(--text-body);
    cursor: pointer;
  }
  .ui-searchbox__option[data-active],
  .ui-searchbox__option:hover {
    background: color-mix(in srgb, var(--color-text) 10%, transparent);
  }
</style>
