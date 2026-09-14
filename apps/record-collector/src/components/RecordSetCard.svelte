<script lang="ts">
  // One record-set card. Name, dimensions, select/delete/download actions.
  // Components are dumb; logic is passed in as callbacks.
  //
  // LIST SURFACE: this is a CardRow. The row's primary label is a
  // SelectWrapper--ClickPrimary and NOT --ClickBody, deliberately — see the
  // block comment above the <li> for the measured reasoning. The card sits
  // next to a delete that destroys the set AND every row in it, and App.svelte
  // tells the user so ("This cannot be undone").

  import Button from '@augment-it/shared-ui/Button.svelte';
  import CardRow from '@augment-it/shared-ui/CardRow.svelte';
  import SelectWrapperClickPrimary from '@augment-it/shared-ui/SelectWrapper--ClickPrimary.svelte';
  import type { RecordSet } from '@augment-it/workspace';
  import { downloadRecordSetAsCsv } from '../logic/download';

  type Props = {
    rs: RecordSet;
    selected: boolean;
    onselect: () => void;
    ondelete: () => void;
  };
  let { rs, selected, onselect, ondelete }: Props = $props();

  let downloading = $state<boolean>(false);
  let downloadError = $state<string | null>(null);

  async function download() {
    if (downloading) return;
    downloading = true;
    downloadError = null;
    try {
      await downloadRecordSetAsCsv(rs);
    } catch (err) {
      downloadError = err instanceof Error ? err.message : String(err);
    } finally {
      downloading = false;
    }
  }
</script>

<!-- RESOLVED: the API gap this comment used to describe is closed. CardRow now
     takes `as="li"`, so the wrapper <li> and its `list-style: none` are both
     gone and the row is one element. The historical note follows.

     WAS: The <li> stays, and CardRow sits INSIDE it rather than replacing it.
     CardRow renders a hard-coded <div>; the three parents that render these
     cards are <ul> elements, and <ul> permits only <li>/<script>/<template>.
     Swapping the <li> for CardRow's <div> would trade one invalid nesting for
     another, so the <li> is reduced to a bare list slot and carries no paint.
     Raised as a CardRow API gap, not worked around in packages/. -->
<CardRow as="li" density="compact" {selected}>
    <div class="rs-card-main">
      <!-- SelectWrapper--ClickPrimary, NOT --ClickBody. Measured reasons, in
           order of weight:
           1. Every sibling control in this card is position:static (Button
              never sets position), so --ClickBody's inset:0 ::after overlay
              paints above them and makes the delete unreachable by mouse.
           2. The row's name is an operator-copyable identifier
              ("investors-2026-07-01.csv"). A whole-surface click target
              destroys text selection on the one string people copy.
           3. Click-anywhere makes the cheap, reversible action (select) span
              the full card while the irreversible one (delete) stays 28x28
              inside it. One surface, two affordances, one of them unrecoverable.
           Do not "upgrade" this to --ClickBody without re-reading
           context-v/decisions/The-List-Surface-Paradigm-CardRow-ListContainer-And-Selection.md -->
      <!-- The label carries the DIMENSIONS as well as the name. aria-label
           suppresses a button's text content in the accessible-name
           computation, so "6 cols · 12 rows" would otherwise stop being
           announced the moment this gained a label it did not have before. -->
      <SelectWrapperClickPrimary
        label="select record set {rs.name}, {rs.schema.fields.length} columns, {rs.row_ids.length} rows"
        {selected}
        onselect={onselect}
      >
        <span class="rs-select-lines">
          <strong class="rs-name">{rs.name}</strong>
          <span class="rs-dims">{rs.schema.fields.length} cols · {rs.row_ids.length} rows</span>
        </span>
      </SelectWrapperClickPrimary>
      {#if downloadError}
        <p class="rs-error">download failed: {downloadError}</p>
      {/if}
    </div>
    <div class="rs-actions">
      <Button
        variant="secondary"
        size="sm"
        title="Download this record set as CSV"
        onclick={() => void download()}
        disabled={downloading}
        aria-label="download {rs.name}"
      >
        {#if downloading}…{:else}↓ CSV{/if}
      </Button>
      <Button
        variant="destructive"
        size="icon"
        title="Delete this record set and all its rows"
        onclick={ondelete}
        aria-label="delete {rs.name}"
      >×</Button>
    </div>
</CardRow>

<style>
  /* Rung 0 only. Every rule below places something; none of them re-draws a
     surface CardRow, Button or SelectWrapper already owns. The card's border,
     radius, padding, ground and selected tint all come from CardRow now. */
  /* .rs-card-item is GONE — `as="li"` on CardRow, and the layout supplies
     `list-style: none` on the rows region. */
  .rs-card-main {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
  }
  /* SelectWrapper--ClickPrimary is inline-flex with align-items: baseline, so
     the two-line label needs its own column box inside the button's slot. */
  .rs-select-lines {
    display: flex;
    flex-direction: column;
    gap: var(--space-3xs);
    min-width: 0;
  }
  .rs-name {
    color: var(--color-accent, var(--color-text));
    overflow-wrap: anywhere;
  }
  .rs-dims {
    color: var(--color-text-muted);
    font-size: var(--text-meta);
  }
  .rs-actions {
    flex: 0 0 auto;
    display: flex;
    gap: var(--space-2xs);
    align-items: center;
  }
  .rs-error {
    margin: 0;
    font-size: var(--text-label);
    color: var(--color-error-text);
  }
</style>
