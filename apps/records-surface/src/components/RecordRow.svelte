<script lang="ts">
  import type { Row } from '@augment-it/workspace';
  import ConnectorButton from './ConnectorButton.svelte';
  import CandidatesPanel from './CandidatesPanel.svelte';
  import EditableField from './EditableField.svelte';
  import { resolveRowName, resolveRowUrl } from '../logic/pick-url';
  import { fireConnector } from '../logic/fire';
  import { fires } from '../state/fires.svelte';
  import { records } from '../state/records.svelte';
  import type { ConnectorId } from '../types';

  // The column where accepted URLs land. An ARRAY — an entity can have
  // multiple canonical OfficialUpdate paths (e.g. Arthur M Blank Foundation
  // has both /news/ and /blogs/). Pick appends with dedup; remove pulls
  // a single URL out. Per Flow-for-Bundles-Packs spec § "What gets built"
  // step 6 — `[pick]` → row.update; refined here to array semantics.
  const TARGET_COLUMN = 'official_updates_index_urls';

  type Props = { row: Row };
  let { row }: Props = $props();

  const nameField = $derived(resolveRowName(row));
  const urlField = $derived(resolveRowUrl(row));
  const name = $derived(nameField.value);
  const url = $derived(urlField.value || undefined);

  async function saveName(next: string) {
    await records.updateRowField(row.row_id, nameField.field_name, next);
  }
  async function saveUrl(next: string) {
    await records.updateRowField(row.row_id, urlField.field_name, next);
  }
  const fireState = $derived(fires.get(row.row_id));

  // Accepted URLs — always read as an array. Backwards-tolerant: if a
  // previous v0 build wrote a string to the singular column name, surface
  // it too so prior accepts aren't lost.
  const accepted = $derived.by<string[]>(() => {
    const fields = row.fields as Record<string, unknown>;
    const fromArray = fields[TARGET_COLUMN];
    const fromLegacy = fields['official_updates_index_url'];
    const out: string[] = [];
    if (Array.isArray(fromArray)) {
      for (const v of fromArray) if (typeof v === 'string' && v.trim()) out.push(v.trim());
    }
    if (typeof fromLegacy === 'string' && fromLegacy.trim() && !out.includes(fromLegacy.trim())) {
      out.push(fromLegacy.trim());
    }
    return out;
  });

  const CONNECTORS: { id: ConnectorId; label: string }[] = [
    { id: 'firecrawl-nav-scan', label: 'Firecrawl scan' },
    { id: 'firecrawl-nav-agent', label: 'Firecrawl + agent' },
    { id: 'serpapi-site-search', label: 'SerpApi' },
  ];

  function fire(connector_id: ConnectorId) {
    if (!url) return;
    void fireConnector(row.row_id, url, connector_id);
  }

  async function pick(picked_url: string) {
    const trimmed = picked_url.trim();
    if (!trimmed) return;
    if (accepted.includes(trimmed)) {
      // Already accepted — no-op, just clear the candidates panel.
      fires.reset(row.row_id);
      return;
    }
    const next = [...accepted, trimmed];
    await records.updateRowField(row.row_id, TARGET_COLUMN, next);
    fires.reset(row.row_id);
  }

  async function remove(url_to_remove: string) {
    const next = accepted.filter((u) => u !== url_to_remove);
    await records.updateRowField(row.row_id, TARGET_COLUMN, next);
  }
</script>

<article class="record-row">
  <header class="record-row-head">
    <span class="record-row-name">
      <EditableField
        value={name}
        label="entity name"
        kind="name"
        save={saveName}
      />
    </span>
    <span class="record-row-url-cell">
      {#if urlField.source === 'helpful_links'}
        <span
          class="record-row-url-hint"
          title="This URL is currently stored in helpful_links. Save will write it to the canonical URL column."
        >recovered from helpful_links</span>
      {/if}
      <EditableField
        value={url ?? ''}
        placeholder="paste a URL"
        label="entity URL"
        kind="url"
        save={saveUrl}
      />
      {#if url}
        <a
          class="record-row-url-open"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          title="open in a new tab"
        >↗</a>
      {/if}
    </span>
  </header>

  {#if accepted.length > 0}
    <ul class="record-row-accepted-list">
      {#each accepted as a (a)}
        <li class="record-row-accepted">
          <span class="record-row-accepted-label">accepted:</span>
          <a href={a} target="_blank" rel="noopener noreferrer" class="record-row-accepted-url">{a}</a>
          <button
            class="record-row-accepted-remove"
            onclick={() => void remove(a)}
            title="Remove this URL from the accepted list"
            aria-label="Remove {a}"
          >
            ✕
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  <div class="record-row-connectors">
    {#each CONNECTORS as c (c.id)}
      <ConnectorButton
        connector_id={c.id}
        label={c.label}
        disabled={!url}
        firing={fireState.kind === 'firing' && fireState.connector_id === c.id}
        onclick={() => fire(c.id)}
      />
    {/each}
  </div>

  {#if fireState.kind === 'done'}
    <CandidatesPanel result={fireState.result} on_pick={pick} />
  {/if}
</article>

<style>
  .record-row {
    padding: 0.75rem 1rem;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    background: var(--color-bg, transparent);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .record-row-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 1rem;
  }
  .record-row-name { font-weight: 600; color: var(--color-text); flex: 1 1 auto; min-width: 0; }
  .record-row-url-cell {
    display: inline-flex;
    align-items: baseline;
    gap: 0.35rem;
    flex: 0 1 auto;
    min-width: 0;
    max-width: 50%;
  }
  .record-row-url-hint {
    font-size: 0.65rem;
    color: var(--color-accent, var(--color-text));
    background: var(--color-surface, rgba(0, 0, 0, 0.05));
    padding: 0.05rem 0.4rem;
    border-radius: 3px;
    white-space: nowrap;
  }
  .record-row-url-open {
    color: var(--color-text-muted);
    text-decoration: none;
    font-size: 0.85rem;
  }
  .record-row-url-open:hover { color: var(--color-text); }
  .record-row-accepted-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .record-row-accepted {
    padding: 0.4rem 0.6rem;
    background: var(--color-ok-bg, rgba(40, 160, 60, 0.1));
    border: 1px solid var(--color-ok-text, #2a8a3a);
    border-radius: 4px;
    font-size: 0.8rem;
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 0.5rem;
    align-items: baseline;
  }
  .record-row-accepted-label { color: var(--color-ok-text, #2a8a3a); font-weight: 600; }
  .record-row-accepted-url {
    color: var(--color-text);
    overflow-wrap: anywhere;
  }
  .record-row-accepted-remove {
    background: transparent;
    border: 0;
    color: var(--color-text-muted);
    font-size: 0.75rem;
    cursor: pointer;
    padding: 0 0.3rem;
    border-radius: 3px;
    align-self: center;
  }
  .record-row-accepted-remove:hover {
    color: var(--color-error-text);
    background: var(--color-error-bg, rgba(200, 50, 50, 0.1));
  }
  .record-row-connectors { display: flex; gap: 0.4rem; flex-wrap: wrap; }
</style>
