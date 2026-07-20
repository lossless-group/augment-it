<script lang="ts">
  // PULSE-SURFACE for the person-db-resolver remote. Sibling to
  // record-db-resolver, for PEOPLE rows. Per row: map columns once per
  // record set, then match-or-create the person (skip is first-class), then
  // — independently — match-or-create their org and RELATE the affiliation
  // with a role. No opportunity concept. See
  // context-v/plans/Person-Aware-Canonical-Resolver-Extension.md.

  import { onMount } from 'svelte';
  import { workspace, type RecordSet, type Row } from '@augment-it/workspace';
  import RecordCard from './components/RecordCard.svelte';
  import ColumnMapper from './components/ColumnMapper.svelte';
  import PersonCandidateList from './components/PersonCandidateList.svelte';
  import OrgCandidateList from './components/OrgCandidateList.svelte';
  import { normalizePersonRecord, guessMapping, MAPPING_NONE } from './lib/normalize';
  import {
    fetchPersonCandidates,
    searchPersons,
    applyPerson,
    affiliatePerson,
    addPersonObservation,
    fetchPersonObservations,
    fetchOrgCandidates,
    searchOrgs,
  } from './lib/resolver-client';
  import type {
    FieldMapping,
    PersonNormRecord,
    PersonCandidate,
    PersonApplyResult,
    PersonObservationRow,
    OrgCandidate,
    OrgSuggestion,
    PersonAffiliateResult,
  } from './lib/types';

  const TOKEN_KEY = 'augment-it:session-token';
  const WS_URL = 'ws://localhost:3001/ws';
  const ACTIVE_RECORD_SET_KEY = 'augment-it:active-record-set';
  const MAPPING_KEY_PREFIX = 'augment-it:person-db-resolver:mapping:';
  // Per-record-set "where I left off" — restored on every selectRecordSet()
  // (mount, HMR remount, workspace switch, tab reopen), not just typed
  // navigation. Saved on every idx change so it's always current, not just
  // on explicit jumps.
  const IDX_KEY_PREFIX = 'augment-it:person-db-resolver:idx:';

  let status = $state<'connecting' | 'open' | 'closed' | 'error'>('connecting');
  let client = $state<string>('reach-edu');

  let recordSets = $state<RecordSet[]>([]);
  let selectedRecordSetId = $state<string | null>(
    typeof localStorage !== 'undefined' ? localStorage.getItem(ACTIVE_RECORD_SET_KEY) : null,
  );
  let rows = $state<Row[]>([]);
  let idx = $state<number>(0);

  let mapping = $state<FieldMapping | null>(null);
  let showMapper = $state(false);

  let personCandidates = $state<PersonCandidate[]>([]);
  let loadingPerson = $state(false);
  let personError = $state<string | null>(null);
  // Which action set personError — candidates/match/create all share the
  // one error slot, but a raw SurrealDB constraint message (e.g. a UNIQUE
  // index collision on create) reads very differently from a failed
  // candidate lookup. Labeled at the throw site instead of hardcoded in
  // the template.
  let personErrorLabel = $state<'candidates' | 'match' | 'create'>('candidates');
  let personResult = $state<PersonApplyResult | null>(null);
  let personBusy = $state(false);
  let personNameInput = $state('');
  // Editable mirror of the mapped Observation column — before this, the
  // event-tie text (e.g. "attendee at Aspen Institute: ...") was parsed and
  // written silently with zero operator visibility or per-row override.
  // Same "operator-edited value wins, falls back to the mapped column"
  // pattern as personNameInput.
  let personObservationInput = $state('');
  let personSearchQuery = $state('');
  let personSearchResults = $state<PersonCandidate[]>([]);
  let personSearching = $state(false);
  let personSkipped = $state(false);
  // Read-only history for the matched/created person — observations are
  // append-only, so this is what makes "editing" sane: see what's on file,
  // add a correction on top, don't blindly append with no context.
  let personObservations = $state<PersonObservationRow[]>([]);
  let personObservationsLoading = $state(false);

  let orgCandidates = $state<OrgCandidate[]>([]);
  let loadingOrg = $state(false);
  let orgError = $state<string | null>(null);
  let orgResult = $state<PersonAffiliateResult | null>(null);
  let orgBusy = $state(false);
  let orgNameInput = $state('');
  let orgSearchQuery = $state('');
  let orgSearchResults = $state<OrgSuggestion[]>([]);
  let orgSearching = $state(false);

  let obsPredicate = $state('');
  let obsValue = $state('');
  let obsBusy = $state(false);
  let obsError = $state<string | null>(null);
  let obsSaved = $state(false);

  const selectedSet = $derived(
    selectedRecordSetId ? recordSets.find((rs) => rs.record_set_id === selectedRecordSetId) ?? null : null,
  );
  const columns = $derived(selectedSet?.schema.fields.map((f) => f.name) ?? []);
  const current = $derived(idx >= 0 && idx < rows.length ? rows[idx] : null);
  const record = $derived(
    current && mapping ? normalizePersonRecord(current.fields as Record<string, unknown>, mapping) : null,
  );
  const source = $derived(selectedSet ? `record-set:${selectedSet.name}` : 'person-db-resolver');
  // The person actions (candidates/create/match) use the OPERATOR-EDITED
  // name and observation text, not the raw mapped columns — record stays
  // visible in RecordCard as "here's what the CSV said," these inputs are
  // what actually gets written. Falls back to the mapped values if cleared.
  const personRecord = $derived(
    record
      ? {
          ...record,
          name: personNameInput.trim() || record.name,
          observation: personObservationInput.trim() || record.observation,
        }
      : null,
  );

  function onActiveRecordSetChange(e: Event) {
    const detail = (e as CustomEvent).detail as { record_set_id?: string } | undefined;
    if (!detail?.record_set_id) return;
    selectedRecordSetId = detail.record_set_id;
    void loadRecordSets();
  }

  function onWorkspaceChanged(e: Event) {
    const detail = (e as CustomEvent).detail as { client_id?: string } | undefined;
    if (detail?.client_id) client = detail.client_id;
    else void loadActiveClient();
    rows = [];
    idx = 0;
    resetRowState();
    void loadRecordSets();
  }

  onMount(() => {
    workspace.connect({
      url: WS_URL,
      getToken: () => localStorage.getItem(TOKEN_KEY),
      saveToken: (t) => localStorage.setItem(TOKEN_KEY, t),
      onStatus: (s) => (status = s),
    });
    void loadActiveClient();
    void loadRecordSets();
    window.addEventListener('augment-it:workspace-changed', onWorkspaceChanged);
    window.addEventListener('augment-it:active-record-set-changed', onActiveRecordSetChange);
    return () => {
      window.removeEventListener('augment-it:workspace-changed', onWorkspaceChanged);
      window.removeEventListener('augment-it:active-record-set-changed', onActiveRecordSetChange);
    };
  });

  async function loadActiveClient() {
    try {
      const r = (await workspace.invoke('workspace.active', {})) as { active_client_id?: string };
      if (r?.active_client_id) client = r.active_client_id;
    } catch {
      /* keep default */
    }
  }

  async function loadRecordSets() {
    try {
      const r = (await workspace.invoke('record_set.list', {})) as { record_sets: RecordSet[] };
      recordSets = r.record_sets.filter((rs) => !rs.archived);
      if (selectedRecordSetId && recordSets.some((rs) => rs.record_set_id === selectedRecordSetId)) {
        await selectRecordSet(selectedRecordSetId);
      } else if (recordSets.length === 1) {
        await selectRecordSet(recordSets[0].record_set_id);
      }
    } catch (err) {
      console.error('record_set.list', err);
    }
  }

  async function selectRecordSet(record_set_id: string) {
    selectedRecordSetId = record_set_id;
    if (typeof localStorage !== 'undefined') localStorage.setItem(ACTIVE_RECORD_SET_KEY, record_set_id);
    rows = [];
    idx = 0;
    resetRowState();
    loadMapping(record_set_id);
    try {
      const r = (await workspace.invoke('row.list', { record_set_id })) as { rows: Row[] };
      rows = r.rows.filter((row) => !(row.fields as Record<string, unknown>).archived);
      // Resume where this record set was left off — mount, HMR remount,
      // workspace switch, or tab reopen all land here via the same path.
      const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(`${IDX_KEY_PREFIX}${record_set_id}`) : null;
      if (stored != null) {
        const n = Number(stored);
        if (Number.isFinite(n)) idx = Math.min(Math.max(0, n), Math.max(0, rows.length - 1));
      }
    } catch (err) {
      console.error('row.list', err);
    }
  }

  function saveIdx() {
    if (selectedRecordSetId && typeof localStorage !== 'undefined') {
      localStorage.setItem(`${IDX_KEY_PREFIX}${selectedRecordSetId}`, String(idx));
    }
  }

  // Manual "jump to row N" — accepts 1-based row numbers (matches the
  // "N / total" display), clamps to the valid range.
  function jumpTo(raw: string | number) {
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(n) || rows.length === 0) return;
    idx = Math.min(Math.max(0, Math.round(n) - 1), rows.length - 1);
    resetRowState();
    saveIdx();
  }

  function loadMapping(record_set_id: string) {
    const key = `${MAPPING_KEY_PREFIX}${record_set_id}`;
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    if (stored) {
      try {
        mapping = JSON.parse(stored) as FieldMapping;
        showMapper = false;
        return;
      } catch {
        /* fall through to re-guess */
      }
    }
    mapping = guessMapping(columns);
    showMapper = true;
  }

  function saveMapping(m: FieldMapping) {
    mapping = m;
    showMapper = false;
    if (selectedRecordSetId && typeof localStorage !== 'undefined') {
      localStorage.setItem(`${MAPPING_KEY_PREFIX}${selectedRecordSetId}`, JSON.stringify(m));
    }
  }

  function resetRowState() {
    personCandidates = [];
    personError = null;
    personResult = null;
    personSkipped = false;
    personSearchQuery = '';
    personSearchResults = [];
    personObservations = [];
    orgCandidates = [];
    orgError = null;
    orgResult = null;
    orgSearchQuery = '';
    orgSearchResults = [];
    obsPredicate = '';
    obsValue = '';
    obsError = null;
    obsSaved = false;
  }

  // Load person candidates whenever the current record changes. Also resets
  // the editable name input to the mapped column's value for the new row.
  //
  // IMPORTANT: this effect must only read `record`/`current` — NOT
  // `personRecord`/`personNameInput`, even transitively. An earlier version
  // called loadPersonCandidates() here, which synchronously read the
  // personRecord derived (itself reading personNameInput) before its first
  // await — that read got tracked as a dependency of THIS effect, so every
  // keystroke in the name field re-triggered the row-change effect, which
  // immediately reset the field back to the mapped value. Un-editable input.
  $effect(() => {
    const rid = current?.row_id;
    const rec = record;
    if (!rid || !rec || !rec.name) {
      personCandidates = [];
      return;
    }
    personNameInput = rec.name;
    personObservationInput = rec.observation ?? '';
    void loadPersonCandidatesFor(rec);
  });

  async function loadPersonCandidatesFor(rec: PersonNormRecord) {
    if (!rec.name) return;
    loadingPerson = true;
    personError = null;
    try {
      personCandidates = await fetchPersonCandidates(rec, client);
    } catch (err) {
      personErrorLabel = 'candidates';
      personError = err instanceof Error ? err.message : String(err);
      personCandidates = [];
    } finally {
      loadingPerson = false;
    }
  }

  // Called from the name input's onchange (a DOM event handler, not a
  // reactive effect) — safe to read personRecord here.
  async function loadPersonCandidates() {
    if (!personRecord) return;
    await loadPersonCandidatesFor(personRecord);
  }

  // Independent of person state — per the "independent decisions" design
  // (person and org are mutually independent OR interdependent, operator's
  // choice), the org section is always live, not gated behind personResult.
  // Same "don't transitively read the input you just wrote" rule as above.
  $effect(() => {
    const rec = record;
    if (!rec) {
      orgCandidates = [];
      return;
    }
    orgNameInput = rec.org_name ?? '';
    void loadOrgCandidatesFor(rec.org_name ?? '');
  });

  async function loadOrgCandidatesFor(name: string) {
    const trimmed = name.trim();
    if (!trimmed) {
      orgCandidates = [];
      return;
    }
    loadingOrg = true;
    orgError = null;
    try {
      orgCandidates = await fetchOrgCandidates(trimmed, client);
    } catch (err) {
      orgError = err instanceof Error ? err.message : String(err);
      orgCandidates = [];
    } finally {
      loadingOrg = false;
    }
  }

  // Called from the org-name input's onchange — safe to read orgNameInput here.
  async function loadOrgCandidates() {
    await loadOrgCandidatesFor(orgNameInput);
  }

  async function loadPersonObservations(person_uuid: string) {
    personObservationsLoading = true;
    try {
      personObservations = await fetchPersonObservations(person_uuid, client);
    } catch (err) {
      console.error('person.observations', err);
      personObservations = [];
    } finally {
      personObservationsLoading = false;
    }
  }

  async function doMatchPerson(c: PersonCandidate) {
    if (!personRecord) return;
    personBusy = true;
    personError = null;
    try {
      personResult = await applyPerson({ action: 'match', person_uuid: c.person_uuid, record: personRecord, client, source });
      void loadPersonObservations(personResult.person_uuid);
    } catch (err) {
      personErrorLabel = 'match';
      personError = err instanceof Error ? err.message : String(err);
    } finally {
      personBusy = false;
    }
  }

  async function doCreatePerson() {
    if (!personRecord || !personRecord.name) return;
    personBusy = true;
    personError = null;
    try {
      personResult = await applyPerson({ action: 'create', record: personRecord, client, source });
      void loadPersonObservations(personResult.person_uuid);
    } catch (err) {
      personErrorLabel = 'create';
      personError = err instanceof Error ? err.message : String(err);
    } finally {
      personBusy = false;
    }
  }

  function doSkipPerson() {
    personSkipped = true;
  }

  async function doPersonSearch() {
    const q = personSearchQuery.trim();
    if (q.length < 2) {
      personSearchResults = [];
      return;
    }
    personSearching = true;
    try {
      personSearchResults = await searchPersons(q, client);
    } catch {
      personSearchResults = [];
    } finally {
      personSearching = false;
    }
  }

  async function doMatchOrg(c: OrgCandidate) {
    orgBusy = true;
    orgError = null;
    try {
      orgResult = await affiliatePerson({
        person_uuid: personResult?.person_uuid,
        org_action: 'match',
        org_slug: c.slug,
        role: record?.role ?? null,
        client,
        source,
      });
    } catch (err) {
      orgError = err instanceof Error ? err.message : String(err);
    } finally {
      orgBusy = false;
    }
  }

  async function doCreateOrg() {
    const name = orgNameInput.trim();
    if (!name) return;
    orgBusy = true;
    orgError = null;
    try {
      orgResult = await affiliatePerson({
        person_uuid: personResult?.person_uuid,
        org_action: 'create',
        org_name: name,
        role: record?.role ?? null,
        client,
        source,
      });
    } catch (err) {
      orgError = err instanceof Error ? err.message : String(err);
    } finally {
      orgBusy = false;
    }
  }

  async function doOrgSearch() {
    const q = orgSearchQuery.trim();
    if (q.length < 2) {
      orgSearchResults = [];
      return;
    }
    orgSearching = true;
    try {
      orgSearchResults = await searchOrgs(q, client);
    } catch {
      orgSearchResults = [];
    } finally {
      orgSearching = false;
    }
  }

  async function doMatchOrgSlug(slug: string) {
    orgBusy = true;
    orgError = null;
    try {
      orgResult = await affiliatePerson({
        person_uuid: personResult?.person_uuid,
        org_action: 'match',
        org_slug: slug,
        role: record?.role ?? null,
        client,
        source,
      });
    } catch (err) {
      orgError = err instanceof Error ? err.message : String(err);
    } finally {
      orgBusy = false;
    }
  }

  async function doAddObservation() {
    if (!personResult) return;
    // Only the value is required — predicate defaults to a generic 'note'
    // so the button isn't dead just because the operator only typed a value.
    const predicate = obsPredicate.trim() || 'note';
    const value = obsValue.trim();
    if (!value) return;
    obsBusy = true;
    obsError = null;
    obsSaved = false;
    try {
      await addPersonObservation({ person_uuid: personResult.person_uuid, predicate, value, client, source });
      obsSaved = true;
      obsPredicate = '';
      obsValue = '';
      void loadPersonObservations(personResult.person_uuid);
    } catch (err) {
      obsError = err instanceof Error ? err.message : String(err);
    } finally {
      obsBusy = false;
    }
  }

  function advance() {
    idx = Math.min(idx + 1, rows.length);
    resetRowState();
    saveIdx();
  }
  function back() {
    idx = Math.max(0, idx - 1);
    resetRowState();
    saveIdx();
  }
  function skipRow() {
    advance();
  }
</script>

<div class="pdr-app">
  <header class="pdr-header">
    <div class="pdr-title-row">
      <h1 class="pdr-title">Person · DB Resolver</h1>
      <span class="pdr-client">client: <strong>{client}</strong></span>
      <span class="pdr-ws status-{status}">{status}</span>
    </div>
    <div class="pdr-setpick">
      <label for="pdr-set">record set</label>
      <select
        id="pdr-set"
        bind:value={selectedRecordSetId}
        onchange={() => selectedRecordSetId && void selectRecordSet(selectedRecordSetId)}
      >
        <option value={null}>— pick a record set —</option>
        {#each recordSets as rs (rs.record_set_id)}
          <option value={rs.record_set_id}>{rs.name} ({rs.row_ids.length} rows)</option>
        {/each}
      </select>
      {#if rows.length}
        <span class="pdr-progress">
          <input
            type="number"
            class="pdr-jump"
            min="1"
            max={rows.length}
            value={Math.min(idx + 1, rows.length)}
            title="jump to row"
            onchange={(e) => jumpTo(e.currentTarget.value)}
            onkeydown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          /> / {rows.length}
        </span>
        <button type="button" class="pdr-btn" onclick={() => (showMapper = true)}>edit column mapping</button>
      {/if}
    </div>
  </header>

  <main class="pdr-body">
    {#if !selectedSet}
      <div class="pdr-card pdr-muted">Pick a record set to begin resolving its records against the canonical persons + organizations store.</div>
    {:else if showMapper && mapping}
      <ColumnMapper recordSetName={selectedSet.name} {columns} {mapping} onSave={saveMapping} onCancel={() => (showMapper = false)} />
    {:else if !current}
      <div class="pdr-card">
        <h3>All done</h3>
        <p class="pdr-muted">No more records in this set. ← back to revisit.</p>
        <button type="button" class="pdr-btn" onclick={back} disabled={idx === 0}>← back</button>
      </div>
    {:else if record}
      <div class="pdr-grid">
        <RecordCard fields={current.fields as Record<string, unknown>} {record} />

        <section class="pdr-resolve">
          <div class="pdr-resolve-head">
            <span class="pdr-eyebrow">person</span>
            {#if loadingPerson}<span class="pdr-muted">finding candidates…</span>{/if}
          </div>
          {#if personError}<div class="pdr-error">{personErrorLabel}: {personError}</div>{/if}

          {#if !personResult && !personSkipped}
            <label class="pdr-org-name-row">
              <span>person name</span>
              <input type="text" bind:value={personNameInput} onchange={() => void loadPersonCandidates()} placeholder="Person name" />
            </label>
            <label class="pdr-org-name-row">
              <span>observation (event tie)</span>
              <input
                type="text"
                bind:value={personObservationInput}
                placeholder="e.g. attendee at Event Name"
                title="Written as a parsed event-tie observation on create/match. Edit or clear before resolving this row."
              />
            </label>
            <PersonCandidateList candidates={personCandidates} busy={personBusy} onMatch={doMatchPerson} />
            <div class="pdr-create">
              <button type="button" class="pdr-btn pdr-btn-create" disabled={personBusy || !personRecord?.name} onclick={doCreatePerson}>
                + create new person from this record
              </button>
              <button type="button" class="pdr-btn" disabled={personBusy} onclick={doSkipPerson}>
                skip — not worth tracking as a person
              </button>
            </div>
            <details class="pdr-search">
              <summary>search persons manually</summary>
              <div class="pdr-search-row">
                <input
                  type="text"
                  bind:value={personSearchQuery}
                  placeholder="type ≥2 chars, Enter to search"
                  onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void doPersonSearch(); } }}
                />
                <button type="button" class="pdr-btn" disabled={personSearching} onclick={() => void doPersonSearch()}>search</button>
              </div>
              {#if personSearchResults.length}
                <ul class="pdr-search-results">
                  {#each personSearchResults as s (s.person_uuid)}
                    <li>
                      <span>{s.name || '(no name)'} {#if s.headline}<span class="pdr-muted">— {s.headline}</span>{/if}</span>
                      <button type="button" class="pdr-btn pdr-btn-primary" disabled={personBusy} onclick={() => doMatchPerson(s)}>match</button>
                    </li>
                  {/each}
                </ul>
              {/if}
            </details>
          {:else if personSkipped}
            <div class="pdr-result pdr-skipped">
              <p>Person skipped for this row.</p>
              <button type="button" class="pdr-btn" onclick={() => (personSkipped = false)}>undo skip</button>
            </div>
          {:else if personResult}
            <div class="pdr-result">
              <div class="pdr-result-head">
                {personResult.created ? '✓ created' : '✓ matched'} <strong>{personResult.name}</strong>
              </div>
              <details class="pdr-search" open>
                <summary>
                  observation history{personObservationsLoading ? ' — loading…' : ` (${personObservations.length})`}
                </summary>
                {#if !personObservationsLoading && personObservations.length === 0}
                  <p class="pdr-muted">nothing on file yet.</p>
                {:else}
                  <ul class="pdr-search-results">
                    {#each personObservations as o (o.predicate + String(o.observed_at) + String(o.object))}
                      <li>
                        <span>
                          <strong>{o.predicate}</strong>: {String(o.object)}
                          <span class="pdr-muted"> — {new Date(o.observed_at).toLocaleString()} · {o.source}</span>
                        </span>
                      </li>
                    {/each}
                  </ul>
                {/if}
              </details>
              <div class="pdr-add-obs">
                <label><span>predicate (optional)</span><input type="text" bind:value={obsPredicate} placeholder="defaults to 'note'" /></label>
                <label><span>value</span><input type="text" bind:value={obsValue} placeholder="e.g. confirmed 2026-07-07" /></label>
                <button type="button" class="pdr-btn" disabled={obsBusy || !obsValue.trim()} onclick={doAddObservation}>
                  + add observation
                </button>
                {#if obsSaved}<span class="pdr-stamp-ok">✓ saved</span>{/if}
                {#if obsError}<div class="pdr-error">{obsError}</div>{/if}
              </div>
            </div>
          {/if}
        </section>

        <section class="pdr-resolve pdr-org-section">
            <div class="pdr-resolve-head">
              <span class="pdr-eyebrow">organization</span>
              {#if loadingOrg}<span class="pdr-muted">finding candidates…</span>{/if}
            </div>
            {#if orgError}<div class="pdr-error">candidates: {orgError}</div>{/if}

            {#if !orgResult}
              <label class="pdr-org-name-row">
                <span>org name</span>
                <input type="text" bind:value={orgNameInput} onchange={() => void loadOrgCandidates()} placeholder="Organization name" />
              </label>
              <OrgCandidateList candidates={orgCandidates} busy={orgBusy} onMatch={doMatchOrg} />
              <div class="pdr-create">
                <button type="button" class="pdr-btn pdr-btn-create" disabled={orgBusy || !orgNameInput.trim()} onclick={doCreateOrg}>
                  + create new org from this name
                </button>
                <span class="pdr-muted">skip — just don't act on the org for this row</span>
              </div>
              <details class="pdr-search">
                <summary>search orgs manually</summary>
                <div class="pdr-search-row">
                  <input
                    type="text"
                    bind:value={orgSearchQuery}
                    placeholder="type ≥2 chars, Enter to search"
                    onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void doOrgSearch(); } }}
                  />
                  <button type="button" class="pdr-btn" disabled={orgSearching} onclick={() => void doOrgSearch()}>search</button>
                </div>
                {#if orgSearchResults.length}
                  <ul class="pdr-search-results">
                    {#each orgSearchResults as s (s.slug)}
                      <li>
                        <span>{s.complete_name || s.slug} <code class="pdr-candidate-slug">{s.slug}</code></span>
                        <button type="button" class="pdr-btn pdr-btn-primary" disabled={orgBusy} onclick={() => void doMatchOrgSlug(s.slug)}>match</button>
                      </li>
                    {/each}
                  </ul>
                {/if}
              </details>
            {:else}
              <div class="pdr-result">
                <div class="pdr-result-head">
                  {orgResult.org_created ? '✓ created' : '✓ matched'} <code>{orgResult.org_slug}</code>
                  {#if orgResult.affiliation_created}
                    <span class="pdr-stamp-ok">↩ affiliation recorded{record.role ? ` (${record.role})` : ''}</span>
                  {:else if personResult}
                    <span class="pdr-muted">affiliation already existed</span>
                  {:else}
                    <span class="pdr-muted">no person resolved yet on this row — org saved standalone</span>
                  {/if}
                </div>
              </div>
            {/if}
        </section>
      </div>

      <div class="pdr-actions">
        <button type="button" class="pdr-btn" onclick={back} disabled={idx === 0}>← back</button>
        <span class="pdr-spacer"></span>
        {#if personResult || personSkipped}
          <button type="button" class="pdr-btn pdr-btn-primary" onclick={advance}>next →</button>
        {:else}
          <button type="button" class="pdr-btn" onclick={skipRow}>skip →</button>
        {/if}
      </div>
    {/if}
  </main>
</div>
