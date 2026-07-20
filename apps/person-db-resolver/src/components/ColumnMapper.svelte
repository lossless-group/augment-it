<script lang="ts">
  // Asked once per record set, not per row — "which column is the person's
  // name? their org? their role? their LinkedIn URL? the event-tie
  // observation?" Pre-filled with a best guess (normalize.ts's guessMapping),
  // the operator confirms or corrects, then it's remembered. This is the
  // fix for record-db-resolver's hardcoded-column-name bug, generalized:
  // dynamic schema in, explicit mapping, not assumed columns.

  import type { FieldMapping } from '../lib/types';
  import { MAPPING_NONE } from '../lib/normalize';

  let {
    recordSetName,
    columns,
    mapping,
    onSave,
    onCancel,
  }: {
    recordSetName: string;
    columns: string[];
    mapping: FieldMapping;
    onSave: (m: FieldMapping) => void;
    onCancel: () => void;
  } = $props();

  let draft = $state<FieldMapping>({ ...mapping });

  const FIELDS: { key: keyof FieldMapping; label: string; required: boolean }[] = [
    { key: 'name', label: 'Person name', required: true },
    { key: 'org', label: 'Organization', required: false },
    { key: 'role', label: 'Role / title', required: false },
    { key: 'linkedin_url', label: 'LinkedIn URL', required: false },
    { key: 'observation', label: 'Observation (event tie)', required: false },
    { key: 'email', label: 'Email', required: false },
    { key: 'bio', label: 'Bio', required: false },
  ];

  function save() {
    onSave(draft);
  }
</script>

<div class="pdr-card pdr-mapper">
  <h3>Map this record set's columns</h3>
  <p class="pdr-muted">
    Asked once per record set — every row in <strong>{recordSetName}</strong> reuses this.
  </p>
  <div class="pdr-mapper-rows">
    {#each FIELDS as f (f.key)}
      <label class="pdr-mapper-row">
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
  <div class="pdr-mapper-actions">
    <button type="button" class="pdr-btn pdr-btn-primary" disabled={draft.name === MAPPING_NONE} onclick={save}>
      save mapping
    </button>
    <button type="button" class="pdr-btn" onclick={onCancel}>cancel</button>
  </div>
</div>
