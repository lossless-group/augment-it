<script lang="ts">
  // Asked once per record set, not per row — same pattern as
  // person-db-resolver's ColumnMapper. Pre-filled by guessMapping (matches
  // export-affiliation-ratings-csv.mjs's own column names on the first
  // pass), the operator confirms or corrects, then it's remembered.

  import type { RatingFieldMapping } from '../lib/types';
  import { MAPPING_NONE } from '../lib/normalize';

  let {
    recordSetName,
    columns,
    mapping,
    onSave,
    onCancel,
    onPickDifferent,
  }: {
    recordSetName: string;
    columns: string[];
    mapping: RatingFieldMapping;
    onSave: (m: RatingFieldMapping) => void;
    onCancel: () => void;
    onPickDifferent: () => void;
  } = $props();

  let draft = $state<RatingFieldMapping>({ ...mapping });

  const FIELDS: { key: keyof RatingFieldMapping; label: string; required: boolean }[] = [
    { key: 'person_uuid', label: 'person_uuid (reimport key)', required: true },
    { key: 'org_slug', label: 'org_slug (reimport key)', required: true },
    { key: 'relevance', label: 'Relevance', required: true },
    { key: 'relevance_note', label: 'Relevance note', required: false },
    { key: 'person_name', label: 'Person name (display only)', required: false },
    { key: 'org_name', label: 'Org name (display only)', required: false },
  ];

  // Loud, specific warning when the required reimport-key columns aren't in
  // this file at all — the single most common way an operator ends up here
  // confused: they're on the wrong record set (e.g. the raw speakers CSV,
  // not the ratings export), not actually facing a hard mapping choice.
  const looksWrong = $derived(!columns.includes('person_uuid') && !columns.includes('org_slug'));

  function save() {
    onSave(draft);
  }
</script>

<div class="arr-card arr-mapper">
  <button type="button" class="arr-btn arr-pick-different" onclick={onPickDifferent}>
    ← wrong file? pick a different record set
  </button>
  <h3>Map this record set's columns</h3>
  <p class="arr-muted">
    Asked once per record set — every row in <strong>{recordSetName}</strong> reuses this.
    <code>person_uuid</code> / <code>org_slug</code> are the reimport key — don't map them to a
    column the operator hand-edited.
  </p>
  {#if looksWrong}
    <div class="arr-error">
      This file has no <code>person_uuid</code> or <code>org_slug</code> column at all — it's
      almost certainly not the ratings CSV from
      <code>scripts/export-affiliation-ratings-csv.mjs</code>. Click "← wrong file?" above and
      pick the correct record set instead of mapping these columns.
    </div>
  {/if}
  <div class="arr-mapper-rows">
    {#each FIELDS as f (f.key)}
      <label class="arr-mapper-row">
        <span>{f.label}{f.required ? ' *' : ''}</span>
        <select bind:value={draft[f.key]}>
          <option value={MAPPING_NONE}>{MAPPING_NONE}</option>
          {#each columns as c (c)}
            <option value={c}>{c}</option>
          {/each}
        </select>
      </label>
    {/each}
  </div>
  <div class="arr-mapper-actions">
    <button
      type="button"
      class="arr-btn arr-btn-primary"
      disabled={draft.person_uuid === MAPPING_NONE || draft.org_slug === MAPPING_NONE || draft.relevance === MAPPING_NONE}
      onclick={save}
    >
      save mapping
    </button>
    <button type="button" class="arr-btn" onclick={onCancel}>cancel</button>
  </div>
</div>
