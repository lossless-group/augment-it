<script lang="ts">
  import Button from '@augment-it/shared-ui/Button.svelte';
  import CardRow from '@augment-it/shared-ui/CardRow.svelte';
  import ListContainer from '@augment-it/shared-ui/ListContainer.svelte';
  import SelectWrapperClickPrimary from '@augment-it/shared-ui/SelectWrapper--ClickPrimary.svelte';
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
    <ListContainer as="ul" gap="sm" label="Candidate URLs from {result.connector_id}">
      {#each result.candidates as c (c.url)}
        <li>
          <!-- The candidate row is the member's selection surface: a connector
               returns a set, the operator picks one. SelectWrapper--ClickPrimary,
               NOT --ClickBody: picking WRITES to live client data, and the row
               also carries an external link and an `edit` control, so a
               click-anywhere overlay would put an accidental write one stray
               click from the "open this in a new tab" affordance. The primary
               label — the URL itself — is the control. -->
          <CardRow density="compact">
            <div class="candidate-main">
              <SelectWrapperClickPrimary
                label="Pick {c.url}"
                onselect={() => on_pick(c.url)}
                title="Save this URL to the row"
              >
                <span class="candidate-url">{c.url}</span>
              </SelectWrapperClickPrimary>
              {#if c.title}
                <span class="candidate-title">{c.title}</span>
              {:else if c.anchor_text}
                <span class="candidate-title">"{c.anchor_text}"</span>
              {/if}
            </div>
            <a
              class="candidate-open"
              href={c.url}
              target="_blank"
              rel="noopener noreferrer"
              title="open in a new tab"
            >↗</a>
            <Button
              variant="outline"
              size="sm"
              onclick={() => copyToCustom(c.url)}
              title="Copy into the edit input below — trim it, then pick"
            >
              edit
            </Button>
          </CardRow>
        </li>
      {/each}
    </ListContainer>
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
    <Button
      variant="primary"
      size="sm"
      disabled={customUrl.trim().length === 0}
      onclick={pickCustom}
      title="Save the URL above to the row"
    >
      pick
    </Button>
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
  /* `.candidate-item` is gone: the two-column grid, the padding and the
     baseline alignment are all <CardRow>. So is `.rs-candidate-edit` — the
     `edit` Button no longer needs justify-self:end, because CardRow's flex row
     plus `.candidate-main { flex: 1 1 auto }` pushes the trailing controls to
     the end on their own. One rung-0 override deleted rather than ported. */
  .candidate-main {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  .candidate-url {
    color: var(--color-text);
    overflow-wrap: anywhere;
    font-size: 0.85rem;
  }
  /* WCAG 2.2 SC 2.5.8. The ↗ glyph is 10x20 at its natural size — 21% of the
     24x24 floor — which is what the probe measured on this member's existing
     `.record-row-url-open`. That one is pre-existing and raised, not chased;
     this one is new, so it clears the floor on arrival rather than copying the
     defect. --control-h-sm IS 24px. */
  .candidate-open {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-inline-size: var(--control-h-sm);
    min-block-size: var(--control-h-sm);
    color: var(--color-text-muted);
    text-decoration: none;
    font-size: 0.85rem;
  }
  .candidate-open:hover { color: var(--color-text); }
  .candidate-title { color: var(--color-text-muted); font-size: 0.75rem; }
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
</style>
