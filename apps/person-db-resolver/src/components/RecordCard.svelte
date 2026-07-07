<script lang="ts">
  // Read-only view of the record being resolved. Shows every raw column from
  // the uploaded CSV (not a hardcoded subset — see normalize.ts's header for
  // why that matters) plus the currently-mapped person fields, so the
  // operator can see exactly what the mapping is reading from.

  import type { PersonNormRecord } from '../lib/types';

  let {
    fields,
    record,
  }: { fields: Record<string, unknown>; record: PersonNormRecord } = $props();

  const HIDDEN_KEYS = new Set([
    'resolved_org_id', 'resolved_org_slug', 'resolved_org_name', 'resolved_at',
    'archived', 'record_uuid',
  ]);

  const rawEntries = $derived(
    Object.entries(fields ?? {}).filter(
      ([k, v]) => !HIDDEN_KEYS.has(k) && v !== null && v !== undefined && String(v).trim() !== '',
    ),
  );

  function displayValue(v: unknown): string {
    if (Array.isArray(v)) return v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(', ');
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }
</script>

<div class="pdr-record">
  <div class="pdr-record-head">
    <span class="pdr-eyebrow">record</span>
    <h2 class="pdr-record-name">{record.name || '(no name — check the mapping)'}</h2>
  </div>

  <div class="pdr-mapped">
    <span class="pdr-label">mapped for matching</span>
    <dl class="pdr-mapped-list">
      <dt>org</dt><dd>{record.org_name || '—'}</dd>
      <dt>role</dt><dd>{record.role || '—'}</dd>
      <dt>linkedin</dt><dd>{record.linkedin_url || '—'}</dd>
      <dt>observation</dt><dd>{record.observation || '—'}</dd>
    </dl>
  </div>

  {#if rawEntries.length}
    <div class="pdr-field pdr-raw-fields">
      <span class="pdr-label">every column from the uploaded record set</span>
      <dl class="pdr-raw-list">
        {#each rawEntries as [k, v] (k)}
          <dt>{k}</dt>
          <dd>{displayValue(v)}</dd>
        {/each}
      </dl>
    </div>
  {/if}
</div>
