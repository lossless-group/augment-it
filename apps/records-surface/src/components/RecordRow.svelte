<script lang="ts">
  import type { Row } from '@augment-it/workspace';
  import Button from '@augment-it/shared-ui/Button.svelte';
  import CardRow from '@augment-it/shared-ui/CardRow.svelte';
  import ListContainer from '@augment-it/shared-ui/ListContainer.svelte';
  import ExternalLink from '@augment-it/shared-ui/ExternalLink.svelte';
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

<!-- One object in the records list. The surface — border, radius, background,
     padding, and the stacking direction — is the federal <CardRow>. A record is
     a STACK (identity head, accepted URLs, connectors, candidates), so
     direction="column". No CardRow--<Kind> wrapper was needed: the thin base
     plus one enum prop covers this row completely. -->
<CardRow direction="column">
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
        <!-- iconOnly: the component composes the accessible name IN THE DOM
             ("<the url> (opens in a new tab)") rather than via aria-label, so
             the new-tab notice survives naming — and [data-icon] restores the
             24px width floor this member could not reach from outside. -->
        <ExternalLink href={url} label={url} iconOnly>↗</ExternalLink>
      {/if}
    </span>
  </header>

  {#if accepted.length > 0}
    <ListContainer as="ul" gap="sm" label="Accepted URLs">
      {#each accepted as a (a)}
        <li class="record-row-accepted">
          <span class="record-row-accepted-label">accepted:</span>
          <ExternalLink href={a} />
          <Button
            variant="destructive"
            size="icon"
            onclick={() => void remove(a)}
            title="Remove this URL from the accepted list"
            aria-label="Remove {a}"
            class="rs-accepted-remove"
          >
            <!-- SVG, not the bare ✕ glyph the Button header bans: a glyph is
                 font-dependent, unstyleable, and screen-reader noise. -->
            <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M4 4 L12 12 M12 4 L4 12" />
            </svg>
          </Button>
        </li>
      {/each}
    </ListContainer>
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
</CardRow>

<style>
  /* The card recipe this replaced is gone in full — padding, 1px
     --color-border, radius 6px, background, AND the flex column, all six
     declarations. <CardRow direction="column"> owns every one of them, and
     draws the boundary with --color-border-strong instead of --color-border.
     Nothing about the card is declared here any more. */
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
  /* `.record-row-url-open` is GONE, not merely unused. It was the refusal the
     first pass recorded here: an icon-only link ExternalLink could not name
     without an aria-label that would suppress its own new-tab notice, and whose
     24px width floor a member class at (0,1,0) could not restore against the
     component's `min-inline-size: 0` at (0,2,0). `iconOnly` closes both — it
     composes the name in the DOM and makes the target square — so the rule has
     nothing left to hold. This glyph measured 10x20, 21% of the WCAG 2.2 SC
     2.5.8 floor; it is now 24x24 via --control-h-sm. */
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
  /* .record-row-accepted-url is GONE — ExternalLink owns the colour, and
     `overflow-wrap: anywhere` is replaced by the component's truncation, which
     keeps the full URL in `title` instead of reflowing the grid row to three
     lines. The 1fr column plus the component's `min-inline-size: 0` is what
     gives the ellipsis something to measure against. */
  /* Override-ladder rung 0 — layout only, so not a deviation. See
     CandidatesPanel for why the :global() nesting is required rather than a
     bare class rule. */
  .record-row-accepted :global(.ui-btn.rs-accepted-remove) { align-self: center; }
  .record-row-connectors { display: flex; gap: 0.4rem; flex-wrap: wrap; }
</style>
