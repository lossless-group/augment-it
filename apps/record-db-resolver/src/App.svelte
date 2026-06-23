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
  import { normalizeRecord, buildCrm } from './lib/normalize';
  import { fetchCandidates, searchOrgs, applyResolution, updateOrg, stampRow } from './lib/resolver-client';
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

  // Canonical-edit (v0.0.0.2 #2) — edit the matched/created org's name + slug.
  let editName = $state('');
  let editConventional = $state('');
  let editSlug = $state('');
  let editBusy = $state(false);
  let editError = $state<string | null>(null);
  let editSaved = $state(false);
  let showEdit = $state(false);

  let searchQuery = $state('');
  let searchResults = $state<OrgSuggestion[]>([]);
  let searching = $state(false);

  const selectedSet = $derived(
    selectedRecordSetId ? recordSets.find((rs) => rs.record_set_id === selectedRecordSetId) ?? null : null,
  );
  const current = $derived(idx >= 0 && idx < rows.length ? rows[idx] : null);
  const record = $derived(current ? normalizeRecord(current.fields) : null);
  const source = $derived(selectedSet ? `record-set:${selectedSet.name}` : 'record-db-resolver');

  // If this row was already resolved in a prior session, the bond is stamped on
  // it (round-trip write-back). Surface it so the operator knows; re-resolving is
  // safe (additive). Empty string when unresolved.
  const alreadyResolvedSlug = $derived.by(() => {
    const f = current?.fields as Record<string, unknown> | undefined;
    if (!f || !f.resolved_org_id) return '';
    return String(f.resolved_org_slug ?? f.resolved_org_id);
  });

  // Re-scope everything when the operator switches workspace. The workspace
  // singleton broadcasts this on `window` (shared across the federation), so the
  // resolver follows a switch instead of being stuck on whatever client was
  // active at mount. Record sets AND the candidate client filter are tenant-scoped,
  // so both must reload.
  function onWorkspaceChanged(e: Event) {
    const detail = (e as CustomEvent).detail as { client_id?: string } | undefined;
    if (detail?.client_id) client = detail.client_id;
    else void loadActiveClient();
    rows = [];
    idx = 0;
    candidates = [];
    resetPerRecord();
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
    return () => window.removeEventListener('augment-it:workspace-changed', onWorkspaceChanged);
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
    editName = '';
    editConventional = '';
    editSlug = '';
    editError = null;
    editSaved = false;
    showEdit = false;
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
    await apply({ action: 'match', org_slug: c.slug, record, client, source, row_id: current?.row_id });
  }
  async function doCreate() {
    if (!record) return;
    await apply({ action: 'create', record, client, source, row_id: current?.row_id });
  }
  async function doMatchSlug(slug: string) {
    if (!record) return;
    await apply({ action: 'match', org_slug: slug, record, client, source, row_id: current?.row_id });
  }

  async function apply(args: Parameters<typeof applyResolution>[0]) {
    applyBusy = true;
    actionError = null;
    try {
      // Inject the opportunity payload (v0.0.0.3) — record_uuid is the 1:1 key,
      // crm is the pipeline snapshot that lands on the opportunity, not the org.
      const f = (current?.fields ?? {}) as Record<string, unknown>;
      const res = await applyResolution({
        ...args,
        record_uuid: f.record_uuid ? String(f.record_uuid) : undefined,
        record_set_id: current?.record_set_id,
        crm: buildCrm(f),
      });
      lastResult = res;
      // Reflect the stamp in local state so the already-resolved indicator (and a
      // future ToC status) update without a refetch. row_id is unchanged, so the
      // candidate-loading effect does not refire.
      if (res.stamped && current) {
        const i = idx;
        rows[i] = {
          ...rows[i],
          fields: {
            ...rows[i].fields,
            resolved_org_id: res.org_id,
            resolved_org_slug: res.slug,
            resolved_org_name: res.complete_name ?? null,
          },
        };
      }
      // Seed the canonical-edit fields from what we just wrote.
      editName = res.complete_name ?? record?.name ?? '';
      editConventional = res.conventional_name ?? '';
      editSlug = res.slug;
      editError = null;
      editSaved = false;
      showEdit = false;
    } catch (err) {
      actionError = err instanceof Error ? err.message : String(err);
    } finally {
      applyBusy = false;
    }
  }

  // Edit the canonical org's name/slug (#2). A slug rename pushes the old slug
  // into aliases[] server-side; here we re-stamp the current row's
  // resolved_org_slug/name (the id bond never changes).
  async function saveCanonicalEdits() {
    if (!lastResult) return;
    editBusy = true;
    editError = null;
    editSaved = false;
    try {
      const next = editSlug.trim();
      const res = await updateOrg({
        org_slug: lastResult.slug,
        new_slug: next && next !== lastResult.slug ? next : undefined,
        complete_name: editName.trim() || undefined,
        conventional_name: editConventional.trim() || undefined,
        client,
      });
      lastResult = {
        ...lastResult,
        slug: res.slug,
        complete_name: res.complete_name,
        conventional_name: res.conventional_name,
      };
      editSlug = res.slug;
      // Re-stamp the bonded row's display copy (id unchanged).
      if (current) {
        try {
          await stampRow(current.row_id, {
            resolved_org_id: lastResult.org_id,
            resolved_org_slug: res.slug,
            resolved_org_name: res.complete_name ?? null,
            resolved_at: new Date().toISOString(),
          });
          const i = idx;
          rows[i] = {
            ...rows[i],
            fields: {
              ...rows[i].fields,
              resolved_org_slug: res.slug,
              resolved_org_name: res.complete_name ?? null,
            },
          };
        } catch {
          /* non-fatal — canonical edit landed; row display copy can lag */
        }
      }
      editSaved = true;
    } catch (err) {
      editError = err instanceof Error ? err.message : String(err);
    } finally {
      editBusy = false;
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

          {#if alreadyResolvedSlug && !lastResult}
            <div class="rdr-resolved-banner">
              ↩ already resolved → <code>{alreadyResolvedSlug}</code>
              <span class="rdr-muted">re-resolving is safe (additive)</span>
            </div>
          {/if}

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
                {#if lastResult.stamped}
                  <span class="rdr-stamp-ok">↩ stamped to row</span>
                {:else}
                  <span class="rdr-stamp-warn">⚠ canonical saved, row not stamped — re-apply to retry</span>
                {/if}
              </div>
              <p class="rdr-result-body">
                appended +{lastResult.appended.org_links} links · +{lastResult.appended.media_streams} streams · +{lastResult.appended.org_corpus} corpus
              </p>

              {#if lastResult.opportunity}
                <p class="rdr-opp">
                  opportunity {lastResult.opportunity.created ? 'recorded' : 'updated'} ·
                  this org now has <strong>{lastResult.opportunity.org_total}</strong>
                  opportunit{lastResult.opportunity.org_total === 1 ? 'y' : 'ies'}
                </p>
              {/if}

              {#if record && lastResult.complete_name && record.name && lastResult.complete_name !== record.name}
                <p class="rdr-divergence">
                  client keeps <strong>{record.name}</strong> · canonical is <strong>{lastResult.complete_name}</strong>
                </p>
              {/if}

              <button type="button" class="rdr-toggle" onclick={() => (showEdit = !showEdit)}>
                {showEdit ? '▾ hide canonical edits' : '▸ edit canonical name / slug'}
              </button>
              {#if showEdit}
                <div class="rdr-edit">
                  <label class="rdr-edit-row"><span>name</span>
                    <input type="text" bind:value={editName} placeholder="The Schultz Family Foundation" /></label>
                  <label class="rdr-edit-row"><span>short name</span>
                    <input type="text" bind:value={editConventional} placeholder="Schultz Family Foundation" /></label>
                  <label class="rdr-edit-row"><span>slug</span>
                    <input type="text" bind:value={editSlug} placeholder="schultz-family-foundation" /></label>
                  <div class="rdr-edit-actions">
                    <button type="button" class="rdr-btn rdr-btn-primary" disabled={editBusy} onclick={() => void saveCanonicalEdits()}>
                      {editBusy ? 'saving…' : 'save canonical edits'}
                    </button>
                    {#if editSaved}<span class="rdr-stamp-ok">✓ saved</span>{/if}
                  </div>
                  {#if editError}<div class="rdr-error">{editError}</div>{/if}
                  <p class="rdr-muted rdr-edit-hint">
                    Renaming the slug keeps the old one as an alias and re-stamps this row — the id bond never changes.
                  </p>
                </div>
              {/if}
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
