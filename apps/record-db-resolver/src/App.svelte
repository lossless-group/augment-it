<script lang="ts">
  // PULSE-SURFACE for the record-db-resolver remote — the generic, DB-agnostic
  // match/create bridge. The operator works a record set one record at a time:
  // each record is normalized to its web-presence facts, the backend returns
  // candidate canonical orgs, and the operator confirms a match (→ additive
  // enrich) or creates a new org. v0 is deliberately one-by-one; no batch.
  //
  // The UI holds no DB credentials — all matching + writes go through the
  // resolver.* capabilities (record-surrealdb-resolver service). See
  // context-v/specs/Record-DB-Resolver.md.

  import { onMount } from 'svelte';
  import { workspace, type RecordSet, type Row } from '@augment-it/workspace';
  import RecordCard from './components/RecordCard.svelte';
  import CandidateList from './components/CandidateList.svelte';
  import { normalizeRecord } from './lib/normalize';
  import { fetchCandidates, searchOrgs, applyResolution } from './lib/resolver-client';
  import type { Candidate, OrgSuggestion, ApplyResult } from './lib/types';

  const TOKEN_KEY = 'augment-it:session-token';
  const WS_URL = 'ws://localhost:3001/ws';
  const ACTIVE_RECORD_SET_KEY = 'augment-it:active-record-set';

  let status = $state<'connecting' | 'open' | 'closed' | 'error'>('connecting');
  let client = $state<string>('reach-edu');

  let recordSets = $state<RecordSet[]>([]);
  let selectedRecordSetId = $state<string | null>(
    typeof localStorage !== 'undefined' ? localStorage.getItem(ACTIVE_RECORD_SET_KEY) : null,
  );
  let rows = $state<Row[]>([]);
  let idx = $state<number>(0);

  let candidates = $state<Candidate[]>([]);
  let loadingCandidates = $state(false);
  let candidatesError = $state<string | null>(null);

  let applyBusy = $state(false);
  let lastResult = $state<ApplyResult | null>(null);
  let actionError = $state<string | null>(null);

  let searchQuery = $state('');
  let searchResults = $state<OrgSuggestion[]>([]);
  let searching = $state(false);

  const selectedSet = $derived(
    selectedRecordSetId ? recordSets.find((rs) => rs.record_set_id === selectedRecordSetId) ?? null : null,
  );
  const current = $derived(idx >= 0 && idx < rows.length ? rows[idx] : null);
  const record = $derived(current ? normalizeRecord(current.fields) : null);
  const source = $derived(selectedSet ? `record-set:${selectedSet.name}` : 'record-db-resolver');

  onMount(() => {
    workspace.connect({
      url: WS_URL,
      getToken: () => localStorage.getItem(TOKEN_KEY),
      saveToken: (t) => localStorage.setItem(TOKEN_KEY, t),
      onStatus: (s) => (status = s),
    });
    void loadActiveClient();
    void loadRecordSets();
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
    resetPerRecord();
    try {
      const r = (await workspace.invoke('row.list', { record_set_id })) as { rows: Row[] };
      rows = r.rows.filter((row) => !(row.fields as Record<string, unknown>).archived);
    } catch (err) {
      console.error('row.list', err);
    }
  }

  function resetPerRecord() {
    lastResult = null;
    actionError = null;
    searchQuery = '';
    searchResults = [];
  }

  // Load candidates whenever the current record changes (and we know the client).
  $effect(() => {
    const rid = current?.row_id;
    const cl = client;
    if (!rid || !cl) {
      candidates = [];
      return;
    }
    void loadCandidates();
  });

  async function loadCandidates() {
    if (!record || !record.name) {
      candidates = [];
      candidatesError = null;
      return;
    }
    loadingCandidates = true;
    candidatesError = null;
    try {
      candidates = await fetchCandidates(record, client);
    } catch (err) {
      candidatesError = err instanceof Error ? err.message : String(err);
      candidates = [];
    } finally {
      loadingCandidates = false;
    }
  }

  async function doMatch(c: Candidate) {
    if (!record) return;
    await apply({ action: 'match', org_slug: c.slug, record, client, source });
  }
  async function doCreate() {
    if (!record) return;
    await apply({ action: 'create', record, client, source });
  }
  async function doMatchSlug(slug: string) {
    if (!record) return;
    await apply({ action: 'match', org_slug: slug, record, client, source });
  }

  async function apply(args: Parameters<typeof applyResolution>[0]) {
    applyBusy = true;
    actionError = null;
    try {
      lastResult = await applyResolution(args);
    } catch (err) {
      actionError = err instanceof Error ? err.message : String(err);
    } finally {
      applyBusy = false;
    }
  }

  async function doSearch() {
    const q = searchQuery.trim();
    if (q.length < 2) {
      searchResults = [];
      return;
    }
    searching = true;
    try {
      searchResults = await searchOrgs(q, client);
    } catch {
      searchResults = [];
    } finally {
      searching = false;
    }
  }

  function advance() {
    idx = Math.min(idx + 1, rows.length);
    resetPerRecord();
  }
  function back() {
    idx = Math.max(0, idx - 1);
    resetPerRecord();
  }
  function skip() {
    advance();
  }
</script>

<div class="rdr-app">
  <header class="rdr-header">
    <div class="rdr-title-row">
      <h1 class="rdr-title">Record · DB Resolver</h1>
      <span class="rdr-client">client: <strong>{client}</strong></span>
      <span class="rdr-ws status-{status}">{status}</span>
    </div>
    <div class="rdr-setpick">
      <label for="rdr-set">record set</label>
      <select
        id="rdr-set"
        bind:value={selectedRecordSetId}
        onchange={() => selectedRecordSetId && void selectRecordSet(selectedRecordSetId)}
      >
        <option value={null}>— pick a record set —</option>
        {#each recordSets as rs (rs.record_set_id)}
          <option value={rs.record_set_id}>{rs.name} ({rs.row_ids.length} rows)</option>
        {/each}
      </select>
      {#if rows.length}
        <span class="rdr-progress">{Math.min(idx + 1, rows.length)} / {rows.length}</span>
      {/if}
    </div>
  </header>

  <main class="rdr-body">
    {#if !selectedSet}
      <div class="rdr-card rdr-muted">Pick a record set to begin resolving its records against the canonical org store.</div>
    {:else if !current}
      <div class="rdr-card">
        <h3>All done</h3>
        <p class="rdr-muted">No more records in this set. ← back to revisit.</p>
        <button type="button" class="rdr-btn" onclick={back} disabled={idx === 0}>← back</button>
      </div>
    {:else if record}
      <div class="rdr-grid">
        <RecordCard {record} />

        <section class="rdr-resolve">
          <div class="rdr-resolve-head">
            <span class="rdr-eyebrow">canonical org</span>
            {#if loadingCandidates}<span class="rdr-muted">finding candidates…</span>{/if}
          </div>

          {#if candidatesError}
            <div class="rdr-error">candidates: {candidatesError}</div>
          {/if}

          {#if !lastResult}
            <CandidateList {candidates} busy={applyBusy} onMatch={doMatch} />

            <div class="rdr-create">
              <button type="button" class="rdr-btn rdr-btn-create" disabled={applyBusy || !record.name} onclick={doCreate}>
                + create new org from this record
              </button>
              <span class="rdr-muted rdr-create-hint">slug: {record.slug_hint || '(from name)'}</span>
            </div>

            <details class="rdr-search">
              <summary>search orgs manually</summary>
              <div class="rdr-search-row">
                <input
                  type="text"
                  bind:value={searchQuery}
                  placeholder="type ≥2 chars, Enter to search"
                  onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void doSearch(); } }}
                />
                <button type="button" class="rdr-btn" disabled={searching} onclick={() => void doSearch()}>search</button>
              </div>
              {#if searchResults.length}
                <ul class="rdr-search-results">
                  {#each searchResults as s (s.slug)}
                    <li>
                      <span>{s.complete_name || s.slug} <code class="rdr-candidate-slug">{s.slug}</code></span>
                      <button type="button" class="rdr-btn rdr-btn-primary" disabled={applyBusy} onclick={() => void doMatchSlug(s.slug)}>match</button>
                    </li>
                  {/each}
                </ul>
              {/if}
            </details>
          {:else}
            <div class="rdr-result">
              <div class="rdr-result-head">
                {lastResult.created ? '✓ created' : '✓ matched'} <code>{lastResult.slug}</code>
              </div>
              <p class="rdr-result-body">
                appended +{lastResult.appended.org_links} links · +{lastResult.appended.media_streams} streams · +{lastResult.appended.org_corpus} corpus
              </p>
            </div>
          {/if}

          {#if actionError}
            <div class="rdr-error">apply: {actionError}</div>
          {/if}
        </section>
      </div>

      <div class="rdr-actions">
        <button type="button" class="rdr-btn" onclick={back} disabled={idx === 0}>← back</button>
        <span class="rdr-spacer"></span>
        {#if lastResult}
          <button type="button" class="rdr-btn rdr-btn-primary" onclick={advance}>next →</button>
        {:else}
          <button type="button" class="rdr-btn" onclick={skip}>skip →</button>
        {/if}
      </div>
    {/if}
  </main>
</div>
