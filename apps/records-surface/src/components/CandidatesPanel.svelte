<script lang="ts">
  import type { FireResult } from '../types';

  type Props = {
    result: FireResult;
    on_pick: (url: string) => void;
  };
  let { result, on_pick }: Props = $props();

  // Custom URL input — for when the right URL isn't quite one of the
  // returned candidates (e.g. the candidate is a story but the user wants
  // the /stories/ index). Pre-fills empty; the user can paste, trim, type.
  let customUrl = $state<string>('');

  function pickCustom() {
    const trimmed = customUrl.trim();
    if (trimmed.length === 0) return;
    on_pick(trimmed);
    customUrl = '';
  }

  function onCustomKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      pickCustom();
    }
  }

  // Copy a candidate's URL into the custom input so the user can trim it
  // (e.g. drop the trailing slug) before picking. One-click "edit this".
  function copyToCustom(url: string) {
    customUrl = url;
  }
</script>

<div class="candidates-panel">
  <div class="candidates-header">
    <strong>{result.connector_id}</strong>
    {#if result.error}
      <span class="candidates-error">error: {result.error}</span>
    {:else}
      <span class="candidates-count">{result.candidates.length} candidate{result.candidates.length === 1 ? '' : 's'}</span>
    {/if}
  </div>
  {#if result.error}
    <p class="candidates-error-body">{result.error}</p>
  {:else if result.candidates.length === 0}
    <p class="candidates-empty">No URLs returned.</p>
  {:else}
    <ul class="candidates-list">
      {#each result.candidates as c (c.url)}
        <li class="candidate-item">
          <button class="candidate-pick" onclick={() => on_pick(c.url)} title="Save this URL to the row">
            pick
          </button>
          <a href={c.url} target="_blank" rel="noopener noreferrer" class="candidate-url">
            {c.url}
          </a>
          <button
            class="candidate-edit"
            onclick={() => copyToCustom(c.url)}
            title="Copy into the edit input below — trim it, then pick"
          >
            edit
          </button>
          {#if c.title}
            <span class="candidate-title">{c.title}</span>
          {:else if c.anchor_text}
            <span class="candidate-title">"{c.anchor_text}"</span>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  <div class="candidates-custom">
    <span class="candidates-custom-label">paste / edit URL:</span>
    <input
      class="candidates-custom-input"
      type="url"
      placeholder="https://example.org/stories/"
      bind:value={customUrl}
      onkeydown={onCustomKey}
    />
    <button
      class="candidate-pick"
      disabled={customUrl.trim().length === 0}
      onclick={pickCustom}
      title="Save the URL above to the row"
    >
      pick
    </button>
  </div>
</div>

<style>
  .candidates-panel {
    margin-top: 0.5rem;
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background: var(--color-surface, rgba(0, 0, 0, 0.025));
  }
  .candidates-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-size: 0.8rem;
    margin-bottom: 0.4rem;
  }
  .candidates-error,
  .candidates-error-body {
    color: var(--color-error-text);
  }
  .candidates-count,
  .candidates-empty {
    color: var(--color-text-muted);
  }
  .candidates-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.25rem; }
  .candidate-item {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: baseline;
    gap: 0.5rem;
    padding: 0.25rem 0;
    font-size: 0.85rem;
  }
  .candidate-pick {
    padding: 0.15rem 0.5rem;
    background: var(--color-accent, var(--color-text));
    color: var(--color-bg, #fff);
    border: 0;
    border-radius: 3px;
    font-size: 0.7rem;
    font-weight: 600;
    cursor: pointer;
  }
  .candidate-pick:hover { opacity: 0.85; }
  .candidate-url {
    color: var(--color-text);
    text-decoration: none;
    overflow-wrap: anywhere;
  }
  .candidate-url:hover { text-decoration: underline; }
  .candidate-title { grid-column: 2; color: var(--color-text-muted); font-size: 0.75rem; }
  .candidate-edit {
    padding: 0.1rem 0.4rem;
    background: transparent;
    color: var(--color-text-muted);
    border: 1px solid var(--color-border);
    border-radius: 3px;
    font-size: 0.65rem;
    cursor: pointer;
    justify-self: end;
  }
  .candidate-edit:hover { color: var(--color-text); border-color: var(--color-text); }
  .candidates-custom {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.6rem;
    padding-top: 0.5rem;
    border-top: 1px dashed var(--color-border);
  }
  .candidates-custom-label {
    font-size: 0.7rem;
    color: var(--color-text-muted);
    white-space: nowrap;
  }
  .candidates-custom-input {
    flex: 1;
    padding: 0.3rem 0.45rem;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 3px;
    color: var(--color-text);
    font-size: 0.8rem;
    font-family: ui-monospace, monospace;
  }
  .candidates-custom-input:focus { border-color: var(--color-text); outline: none; }
  .candidate-pick:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
