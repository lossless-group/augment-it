<script lang="ts">
  // Inline-editable field. Renders as plain text until clicked, then turns
  // into an input. Enter / blur commits via the passed save callback.
  // Escape aborts. Async save shows a small spinner.

  type Props = {
    value: string;
    placeholder?: string;
    label?: string;
    save: (next: string) => Promise<void> | void;
    // Visual size — 'name' is bigger, 'url' is monospace
    kind?: 'name' | 'url';
  };
  let { value, placeholder = '', label, save, kind = 'name' }: Props = $props();

  let editing = $state<boolean>(false);
  let draft = $state<string>('');
  let saving = $state<boolean>(false);
  let inputEl = $state<HTMLInputElement | undefined>();

  // Focus the input when entering edit mode — replaces `autofocus` which
  // Svelte's a11y lint rejects.
  $effect(() => {
    if (editing && inputEl) {
      inputEl.focus();
      inputEl.select();
    }
  });

  function start() {
    if (editing) return;
    draft = value;
    editing = true;
  }

  async function commit() {
    const next = draft.trim();
    if (next === value || next === '') {
      editing = false;
      return;
    }
    saving = true;
    try {
      await save(next);
    } finally {
      saving = false;
      editing = false;
    }
  }

  function abort() {
    editing = false;
    draft = '';
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      void commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      abort();
    }
  }
</script>

{#if editing}
  <input
    bind:this={inputEl}
    class="editable-input kind-{kind}"
    bind:value={draft}
    {placeholder}
    onkeydown={onKey}
    onblur={() => void commit()}
    aria-label={label}
    disabled={saving}
  />
{:else}
  <button
    class="editable-display kind-{kind}"
    onclick={start}
    title="click to edit"
    aria-label={label ? `Edit ${label}` : 'Edit'}
  >
    {#if value}
      {value}
    {:else}
      <span class="editable-empty">{placeholder || 'click to add'}</span>
    {/if}
  </button>
{/if}

<style>
  .editable-display {
    background: transparent;
    border: 1px dashed transparent;
    padding: 0.15rem 0.3rem;
    border-radius: 3px;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: text;
    margin: -0.15rem -0.3rem;
  }
  .editable-display:hover {
    border-color: var(--color-border);
    background: var(--color-surface, rgba(0, 0, 0, 0.03));
  }
  .editable-display.kind-name { font-weight: 600; color: var(--color-text); }
  .editable-display.kind-url {
    font-family: ui-monospace, monospace;
    font-size: 0.8rem;
    color: var(--color-text-muted);
    overflow-wrap: anywhere;
  }
  .editable-empty { color: var(--color-text-muted); font-style: italic; font-weight: normal; }
  .editable-input {
    width: 100%;
    padding: 0.2rem 0.35rem;
    background: var(--color-bg);
    color: var(--color-text);
    border: 1px solid var(--color-text);
    border-radius: 3px;
    font: inherit;
  }
  .editable-input.kind-name { font-weight: 600; }
  .editable-input.kind-url {
    font-family: ui-monospace, monospace;
    font-size: 0.8rem;
  }
  .editable-input:disabled { opacity: 0.6; }
  .editable-input:focus { outline: none; border-color: var(--color-accent, var(--color-text)); }
</style>
