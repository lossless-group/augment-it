<script lang="ts">
  import { onMount } from 'svelte';
  import {
    workspace,
    type PromptTemplate,
    type RecordSet,
    type ResponseRecord,
    type ResponseFlag,
    type Row,
    type HelpfulLink,
    type SocialProfile,
  } from '@augment-it/workspace';
  import ConfidencePill from '@augment-it/shared-ui/ConfidencePill.svelte';
  import { MOCK_PACKS_FIXTURE } from './fixtures/mock-packs';
  import ConnectorPalette from './ConnectorPalette.svelte';
  import type { PaletteConnector, PalettePack } from './ConnectorPalette.svelte';

  // Each remote owns its own workspace singleton + WebSocket — no `shared`
  // federation block (see the 2026-05-21_03 changelog).
  const TOKEN_KEY = 'augment-it:session-token';
  const WS_URL = 'ws://localhost:3001/ws';

  const FLAGS: ResponseFlag[] = ['good', 'partial', 'wrong', 'needs-rerun', 'needs-human'];

  // Per-record palette pack roster — one chip per intent, default click walks
  // the pack's preferred_connectors chain; long-press opens a connector menu.
  // Source of truth for pack identity is services/social-search/src/packs.ts;
  // short_label + accent live here so the UI renders without a round-trip.
  // Migrated from the legacy two-row provider × pack grid 2026-06-03 per
  // context-v/specs/Connector-Inventory-and-Per-Record-Palette.md.
  const PACKS_META: PalettePack[] = [
    { pack_id: 'linkedin-pack',  display_name: 'LinkedIn',     intent: 'search.social.linkedin',  short_label: 'in', accent: '#0a66c2', preferred_connectors: ['searxng', 'tavily', 'serpapi-google'] },
    { pack_id: 'x-pack',         display_name: 'X / Twitter',  intent: 'search.social.x',         short_label: 'x',  accent: '#1d9bf0', preferred_connectors: ['searxng', 'tavily', 'serpapi-google'] },
    { pack_id: 'bluesky-pack',   display_name: 'Bluesky',      intent: 'search.social.bluesky',   short_label: 'bs', accent: '#1185fe', preferred_connectors: ['searxng', 'tavily', 'serpapi-google'] },
    { pack_id: 'youtube-pack',   display_name: 'YouTube',      intent: 'search.social.youtube',   short_label: 'yt', accent: '#ff0000', preferred_connectors: ['searxng', 'tavily', 'serpapi-google'] },
    { pack_id: 'facebook-pack',  display_name: 'Facebook',     intent: 'search.social.facebook',  short_label: 'f',  accent: '#1877f2', preferred_connectors: ['searxng', 'tavily', 'serpapi-google'] },
    { pack_id: 'wikipedia-pack', display_name: 'Wikipedia',    intent: 'fetch.wikipedia',         short_label: 'wp', accent: '#888a8c', preferred_connectors: ['searxng', 'serpapi-google'] },
    { pack_id: 'instagram-pack', display_name: 'Instagram',    intent: 'search.social.instagram', short_label: 'ig', accent: '#e1306c', preferred_connectors: ['searxng', 'tavily', 'serpapi-google'] },
  ];

  // Inventory loaded once via connectors.inventory capability. Shared across
  // every palette in the by-record view so N rows don't trigger N fetches.
  // Empty during load; palette degrades to "no connectors available" cleanly.
  let inventory = $state<PaletteConnector[]>([]);

  // View modes — single-response stepper (the original UI, best for prompt
  // responses where each row has one verbose response to read) OR by-record
  // (groups all responses for a row into one card, best for pack responses
  // where each row has N parallel results to triage quickly). Per the user's
  // feedback in the 2026-05-25 pack smoke: stepping through 402 unflagged
  // pack responses one-by-one was untenable; per-record collapses the same
  // data into ~67 row-cards. Persisted so refresh sticks.
  type ViewMode = 'single' | 'by-record';
  const VIEW_MODE_KEY = 'augment-it:response-reviewer:view-mode';
  function readViewMode(): ViewMode {
    if (typeof localStorage === 'undefined') return 'single';
    return (localStorage.getItem(VIEW_MODE_KEY) as ViewMode) ?? 'single';
  }
  let viewMode = $state<ViewMode>(readViewMode());
  $effect(() => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(VIEW_MODE_KEY, viewMode);
  });

  let status = $state<'connecting' | 'open' | 'closed' | 'error'>('connecting');

  let responses = $state<ResponseRecord[]>([]);
  let promptsById = $state<Record<string, PromptTemplate>>({});
  let recordSetsById = $state<Record<string, RecordSet>>({});

  // By-record view needs to know each row's entity name (and other fields).
  // Loaded lazily when entering by-record mode — see `loadRowsForByRecord`.
  let rowsByRowId = $state<Record<string, Row>>({});
  let rowBusyId = $state<string>(''); // shows the spinner on per-row triage clicks

  let filter = $state<'all' | 'unflagged' | ResponseFlag>('all');

  // Record-set scope filter — narrows the response list to one record set.
  // Surfaced after the 2026-05-26 by-record diagnosis: response-store
  // outlives row-store (responses survive when their parent record set
  // is deleted), so without scoping the by-record view shows orphan
  // responses with row_id headers (no entity name resolvable).
  //
  // Two-state model: a value + an isExplicit flag. isExplicit=false means
  // "the user hasn't picked yet — feel free to auto-default." Only the
  // click handlers (via setRecordSetFilter) mark it explicit + persist.
  // The auto-default effect picks the largest non-orphan bucket once
  // responses load, so a returning user sees their active dataset first
  // and orphans drop out.
  // v2 key — bumped 2026-05-26 when the storage semantics changed: the v1
  // key was written on every reactive change (including the initial 'all'
  // default), so it can't be used to distinguish "user picked all" from
  // "code never ran auto-default." v2 is only written by explicit click
  // handlers via setRecordSetFilter.
  const RECORD_SET_FILTER_KEY = 'augment-it:response-reviewer:record-set-filter-v2';
  const initialStoredRSF =
    typeof localStorage !== 'undefined' ? localStorage.getItem(RECORD_SET_FILTER_KEY) : null;
  let recordSetFilter = $state<string>(initialStoredRSF ?? 'all');
  let recordSetFilterIsExplicit = $state<boolean>(initialStoredRSF !== null);

  function setRecordSetFilter(value: string): void {
    recordSetFilter = value;
    recordSetFilterIsExplicit = true;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(RECORD_SET_FILTER_KEY, value);
    }
  }
  let index = $state(0);
  let editText = $state('');
  let busy = $state('');
  let refreshing = $state(false);
  let lastRefreshAt = $state<number | null>(null);
  let editSavedAt = $state<number | null>(null);
  let editDirty = $state(false);
  let savingEdit = $state(false);

  // helpful-links state — the current row's full record, fetched from row-store
  // whenever the focused response changes. Links live in row.fields.helpful_links.
  let currentRow = $state<Row | null>(null);
  let newLinkUrl = $state('');
  let newLinkNote = $state('');
  let addingLink = $state(false);
  let linkBusy = $state('');

  const helpfulLinks = $derived.by(() => {
    const raw = (currentRow?.fields as Record<string, unknown> | undefined)?.helpful_links;
    return Array.isArray(raw) ? (raw as HelpfulLink[]) : [];
  });

  // editText is reset only when the *response_id* changes, so a background
  // refresh (a flag landing, a new response) doesn't clobber an in-progress
  // edit of the same response.
  let editTextForId = '';

  // Apply the record-set scope BEFORE the flag filter so flag-counts
  // reflect what the user is currently focused on. '__orphan__' is the
  // synthetic bucket for responses whose parent record set was deleted.
  const scopedByRecordSet = $derived.by(() => {
    if (recordSetFilter === 'all') return responses;
    if (recordSetFilter === '__orphan__') {
      return responses.filter((r) => !recordSetsById[r.record_set_id]);
    }
    return responses.filter((r) => r.record_set_id === recordSetFilter);
  });
  const filtered = $derived(
    scopedByRecordSet.filter((r) => {
      if (filter === 'all') return true;
      if (filter === 'unflagged') return r.flag === null;
      return r.flag === filter;
    }),
  );
  const current = $derived(filtered[index] ?? null);

  // Per-bucket counts for the FLAG chips — scoped to the active record set
  // so the counts match what the user actually sees.
  const counts = $derived.by(() => {
    const c: Record<string, number> = {
      all: scopedByRecordSet.length,
      unflagged: 0,
      good: 0,
      partial: 0,
      wrong: 0,
      'needs-rerun': 0,
      'needs-human': 0,
    };
    for (const r of scopedByRecordSet) {
      if (r.flag === null) c.unflagged += 1;
      else c[r.flag] = (c[r.flag] ?? 0) + 1;
    }
    return c;
  });

  // Per-record-set counts for the new record-set chip tier. Includes an
  // 'orphan' bucket for responses whose record_set_id doesn't resolve to
  // a known record set (parent set was deleted / archived after the
  // response was recorded).
  type RecordSetBucket = {
    id: string;          // record_set_id or '__orphan__'
    label: string;       // display label
    count: number;
  };
  // Auto-default the record-set filter to the largest non-orphan bucket the
  // first time responses load. Marks isExplicit=false so the user's later
  // click on "all sets" or "(orphan)" sticks. Skips when the user has
  // already picked something (recordSetFilterIsExplicit).
  $effect(() => {
    if (recordSetFilterIsExplicit) return;
    if (responses.length === 0) return;
    const tallies: Record<string, number> = {};
    for (const r of responses) tallies[r.record_set_id] = (tallies[r.record_set_id] ?? 0) + 1;
    let best: { id: string; count: number } | null = null;
    for (const [id, n] of Object.entries(tallies)) {
      if (!recordSetsById[id]) continue; // orphan — skip
      if (!best || n > best.count) best = { id, count: n };
    }
    if (best && best.id !== recordSetFilter) recordSetFilter = best.id;
  });

  const recordSetBuckets = $derived.by<RecordSetBucket[]>(() => {
    const counts: Record<string, number> = {};
    for (const r of responses) counts[r.record_set_id] = (counts[r.record_set_id] ?? 0) + 1;
    const buckets: RecordSetBucket[] = [];
    let orphanCount = 0;
    for (const [setId, n] of Object.entries(counts)) {
      const rs = recordSetsById[setId];
      if (rs) {
        buckets.push({ id: setId, label: rs.name, count: n });
      } else {
        orphanCount += n;
      }
    }
    buckets.sort((a, b) => b.count - a.count);
    if (orphanCount > 0) {
      buckets.push({ id: '__orphan__', label: 'orphan (parent set gone)', count: orphanCount });
    }
    return buckets;
  });

  const firedPrompt = $derived.by(() => {
    const rb = current?.request_body as { messages?: { content?: unknown }[] } | undefined;
    const content = rb?.messages?.[0]?.content;
    return typeof content === 'string' ? content : '';
  });
  const promptName = $derived(
    current ? (promptsById[current.prompt_id]?.name ?? current.prompt_id) : '',
  );
  const recordSetName = $derived(
    current ? (recordSetsById[current.record_set_id]?.name ?? current.record_set_id) : '',
  );

  // Outcome-driven rendering for pack responses. Found responses render the
  // existing editor + actions; the other four outcomes render thin rows in
  // place of the editor. The candidate card (when structured !== null) sits
  // above whatever body the outcome chose. See:
  // context-v/blueprints/Packs-and-Bundles-Pattern.md §Bundle anatomy/§5
  const isFound = $derived(current?.outcome === 'found');
  let snippetExpanded = $state(false);
  $effect(() => {
    // collapse the snippet whenever the focused response changes
    void current?.response_id;
    snippetExpanded = false;
  });

  onMount(() => {
    workspace.connect({
      url: WS_URL,
      getToken: () => localStorage.getItem(TOKEN_KEY),
      saveToken: (t) => localStorage.setItem(TOKEN_KEY, t),
      onStatus: (s) => (status = s),
    });
    void loadResponses();
    void loadPrompts();
    void loadRecordSets();
    void loadInventory();

    // Belt-and-suspenders: if the user closes the tab or hard-refreshes with
    // an unsaved edit, fire one last best-effort autosave. (Browsers may not
    // wait for the promise — the onblur autosave does the real work.)
    const beforeUnload = () => { void flushEdit(); };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  });

  // refresh when a response is created, flagged, or deleted — seq-cursor dedup.
  let lastSeq = -1;
  $effect(() => {
    const ev = workspace.events[workspace.events.length - 1];
    if (!ev || ev.seq <= lastSeq) return;
    lastSeq = ev.seq;
    if (
      ev.subject === 'response.created' ||
      ev.subject === 'response.flagged' ||
      ev.subject === 'response.deleted' ||
      ev.subject === 'response.edited'
    ) {
      void loadResponses();
    }
    // Refresh the current row whenever it gets updated (helpful_links changed
    // here or elsewhere, or any other field write).
    if (ev.subject === 'row.updated') {
      const p = ev.payload as { row_id?: string };
      if (p.row_id && p.row_id === current?.row_id) void loadCurrentRow();
    }
  });

  // load the row record whenever the focused response changes
  $effect(() => {
    const c = current;
    if (!c) {
      currentRow = null;
      return;
    }
    void loadCurrentRow();
  });

  async function loadCurrentRow() {
    if (!current) return;
    try {
      const r = (await workspace.invoke('row.get', { row_id: current.row_id })) as { row: Row | null };
      currentRow = r.row;
    } catch (e) {
      console.error('row.get', e);
    }
  }

  async function addHelpfulLink() {
    if (!current) return;
    const url = newLinkUrl.trim();
    if (!url) return;
    addingLink = true;
    linkBusy = '';
    try {
      const result = (await workspace.invoke('row.helpful_links.add', {
        row_id: current.row_id,
        url,
        note: newLinkNote.trim(),
        response_id: current.response_id,
      })) as { row: Row };
      currentRow = result.row;
      newLinkUrl = '';
      newLinkNote = '';
    } catch (e) {
      linkBusy = `add failed — ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      addingLink = false;
    }
  }

  async function removeHelpfulLink(link_id: string) {
    if (!current) return;
    try {
      const result = (await workspace.invoke('row.helpful_links.remove', {
        row_id: current.row_id,
        link_id,
      })) as { row: Row };
      currentRow = result.row;
    } catch (e) {
      linkBusy = `remove failed — ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  function linkLabel(link: HelpfulLink): string {
    if (link.label) return link.label;
    try {
      return new URL(link.url).hostname.replace(/^www\./, '');
    } catch {
      return link.url;
    }
  }

  // keep the stepper index inside the filtered list
  $effect(() => {
    const len = filtered.length;
    if (index >= len) index = Math.max(0, len - 1);
  });

  // load the editable copy when the focused response changes. Critically:
  // if the OUTGOING response has unsaved edits, flush them to the server
  // before swapping in the new response's text — stepping must never lose
  // typed content.
  $effect(() => {
    const c = current;
    if (!c) {
      void flushEdit();
      editText = '';
      editTextForId = '';
      return;
    }
    if (c.response_id !== editTextForId) {
      // flush pending edits on the response we're leaving
      void flushEdit();
      editText = c.edited_text ?? c.response_text;
      editTextForId = c.response_id;
      editDirty = false;
      editSavedAt = c.edited_at ? Date.parse(c.edited_at) : null;
    }
  });

  // any non-trivial change marks the editor dirty; autosave fires on blur.
  function onEditInput() {
    if (!current) return;
    const saved = current.edited_text ?? current.response_text;
    editDirty = editText !== saved;
  }

  async function flushEdit(): Promise<void> {
    // Use editTextForId, not current.response_id — current may already be
    // pointing at the next response by the time this fires.
    const targetId = editTextForId;
    if (!targetId || !editDirty) return;
    const pending = editText;
    savingEdit = true;
    try {
      await workspace.invoke('response.set_text', {
        response_id: targetId,
        edited_text: pending,
      });
      // Only clear dirty if the editor is still on the same response;
      // if the user kept typing on it in the meantime, leave dirty=true.
      if (targetId === editTextForId && editText === pending) {
        editDirty = false;
        editSavedAt = Date.now();
      }
    } catch (e) {
      console.error('response.set_text', e);
      busy = `autosave failed — ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      savingEdit = false;
    }
  }

  // Detect `?fixture=mock-packs` once on mount. When set, prepend the mock
  // pack-shaped responses to the live list so every outcome+confidence band
  // is visible side-by-side. Mocks are NEVER persisted — clearing them is a
  // refresh away (drop the query param). Spec:
  // context-v/prompts/Response-Reviewer-Structured-Output-Extension.md
  const fixtureMode =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('fixture') === 'mock-packs';

  async function loadResponses() {
    try {
      const r = (await workspace.invoke('response.list', {})) as { responses: ResponseRecord[] };
      responses = fixtureMode ? [...MOCK_PACKS_FIXTURE, ...r.responses] : r.responses;
      lastRefreshAt = Date.now();
    } catch (e) {
      console.error('response.list', e);
    }
  }

  async function manualRefresh() {
    refreshing = true;
    try {
      await Promise.all([loadResponses(), loadPrompts(), loadRecordSets()]);
      if (viewMode === 'by-record') await loadRowsForByRecord();
    } finally {
      refreshing = false;
    }
  }

  // By-record view: load every row referenced by the currently-filtered
  // responses so we can show the entity name + use row.fields for
  // disambiguation. Batches per record_set_id via the existing row.list
  // capability. Cheap enough for the foundation-dataset scale.
  //
  // Effect-cycle note: when this is invoked from a $effect, only the
  // SYNCHRONOUS portion (up to the first `await`) participates in Svelte
  // 5's reactive read-tracking. We therefore avoid reading `rowsByRowId`
  // synchronously — otherwise the effect would (a) read rowsByRowId,
  // (b) write rowsByRowId, and (c) re-fire on every write, infinite loop.
  // The spread + assignment live after the first await, outside the
  // tracking window.
  async function loadRowsForByRecord() {
    const setIds = new Set<string>();
    for (const r of filtered) setIds.add(r.record_set_id);
    if (setIds.size === 0) return;
    const fresh: Record<string, Row> = {};
    for (const record_set_id of setIds) {
      try {
        const r = (await workspace.invoke('row.list', { record_set_id })) as { rows: Row[] };
        for (const row of r.rows) fresh[row.row_id] = row;
      } catch (e) {
        console.error('row.list (by-record)', record_set_id, e);
      }
    }
    // Past the first await — outside the effect's sync tracking window.
    // Reading rowsByRowId here does NOT register as a dep of the effect
    // that called us, so writing it doesn't re-fire that effect.
    rowsByRowId = { ...rowsByRowId, ...fresh };
  }

  // The columns we look in to find an entity's display name. In order — the
  // user's foundation dataset puts the org in "Prospect / Organization";
  // fallbacks cover common shapes seen across CSVs.
  const NAME_COLUMNS = ['Prospect / Organization', 'name', 'organization', 'org', 'company', 'foundation', 'entity'];
  // Returns BOTH the resolved column name + value so the by-record header
  // can edit the same column we're displaying. When researching, the user
  // often needs to correct the entity's name (e.g. "Accelerate the Future
  // (ACH, GW Match)" → "Accelerate the Future") to make subsequent searches
  // work — that edit writes back to the CSV-derived column via row.update.
  function entityFieldFor(
    row: Row | undefined,
  ): { field: string; value: string } | null {
    if (!row) return null;
    const fields = row.fields as Record<string, unknown>;
    for (const c of NAME_COLUMNS) {
      const v = fields[c];
      if (typeof v === 'string' && v.trim().length > 0) {
        return { field: c, value: v.trim() };
      }
    }
    // Case-insensitive fallback — match the first field that smells like a
    // name column. Avoids re-hunting on CSVs with different casing.
    for (const k of Object.keys(fields)) {
      if (NAME_COLUMNS.some((c) => k.toLowerCase() === c.toLowerCase())) {
        const v = fields[k];
        if (typeof v === 'string' && v.trim().length > 0) {
          return { field: k, value: v.trim() };
        }
      }
    }
    return null;
  }

  // By-record grouping. Groups filtered responses by row_id, preserves
  // recency order (newest response first), and ranks rows by entity name
  // (alphabetical) so the user steps through "A → Z" rather than a random
  // response-id order. `entity_field` is the row column the name came from
  // — null when no candidate matched, in which case the header falls back
  // to row_id and the name is read-only.
  type RowGroup = {
    row_id: string;
    record_set_id: string;
    entity_field: string | null;
    entity_name: string;
    responses: ResponseRecord[];
  };
  const byRecord = $derived.by<RowGroup[]>(() => {
    const groups: Record<string, RowGroup> = {};
    for (const r of filtered) {
      if (!groups[r.row_id]) {
        const ef = entityFieldFor(rowsByRowId[r.row_id]);
        groups[r.row_id] = {
          row_id: r.row_id,
          record_set_id: r.record_set_id,
          entity_field: ef?.field ?? null,
          entity_name: ef?.value ?? '',
          responses: [],
        };
      }
      groups[r.row_id].responses.push(r);
    }
    return Object.values(groups).sort((a, b) => {
      const an = a.entity_name || a.row_id;
      const bn = b.entity_name || b.row_id;
      return an.localeCompare(bn);
    });
  });

  // Lazy-load rows whenever entering by-record mode and the response set
  // grows (manual refresh refreshes too — see manualRefresh).
  $effect(() => {
    if (viewMode !== 'by-record') return;
    // Touch the response list size so this re-fires when new responses
    // arrive via the broadcast.
    void responses.length;
    void loadRowsForByRecord();
  });

  // In-flight URL drafts for the by-record view's inline URL inputs.
  // Keyed by response_id. Falls back to structured.url for display when no
  // local draft exists. Persisted to response-store on blur via
  // response.set_structured. Cleared after a successful save so the
  // refreshed response value takes over.
  let urlDrafts = $state<Record<string, string>>({});
  // Same shape for the display_name input — separate so the two fields
  // can be edited independently and save independently.
  let nameDrafts = $state<Record<string, string>>({});
  // Per-row drafts for the entity-name column edit in the by-record header.
  // Keyed by row_id (one entity-name per row, not per response).
  let rowNameDrafts = $state<Record<string, string>>({});

  async function saveUrlEdit(resp: ResponseRecord) {
    // Two valid paths: a pack response with existing structured (edit
    // correction) OR a pack response with structured: null (human supply
    // for not_found/error/etc.). Non-pack responses don't have the
    // structured surface at all, so skip.
    if (!resp.pack_id) return;
    const draft = urlDrafts[resp.response_id];
    if (draft === undefined) return; // never edited
    const next = draft.trim();
    // Empty draft is a no-op — don't fire set_structured with an empty URL
    // since the backend rejects (you'd just generate noise).
    if (next.length === 0) return;
    if (resp.structured && next === resp.structured.url) {
      // No actual change — drop the draft so the input falls back to source.
      delete urlDrafts[resp.response_id];
      urlDrafts = { ...urlDrafts };
      return;
    }
    try {
      await workspace.invoke('response.set_structured', {
        response_id: resp.response_id,
        patch: { url: next },
      });
      // Refresh so the local response list picks up structured.url = draft.
      // Then clear the draft so the input renders from the canonical source.
      await loadResponses();
      delete urlDrafts[resp.response_id];
      urlDrafts = { ...urlDrafts };
    } catch (e) {
      console.error('response.set_structured', e);
    }
  }

  // Save an edit to the row's entity-name CSV column (e.g. "Prospect /
  // Organization"). When researching, the user often needs to correct the
  // name to make subsequent searches work — that edit writes back to the
  // row via row.update. After save we re-pull rows so the by-record header
  // re-renders with the canonical value and every group's entity_name
  // re-sorts alphabetically.
  async function saveRowNameEdit(group: { row_id: string; record_set_id: string; entity_field: string | null; entity_name: string }) {
    if (!group.entity_field) return;
    const draft = rowNameDrafts[group.row_id];
    if (draft === undefined) return;
    const next = draft.trim();
    if (next === group.entity_name) {
      delete rowNameDrafts[group.row_id];
      rowNameDrafts = { ...rowNameDrafts };
      return;
    }
    if (next.length === 0) return; // refuse to blank the name
    try {
      await workspace.invoke('row.update', {
        row_id: group.row_id,
        fields: { [group.entity_field]: next },
      });
      // Re-fetch the row so rowsByRowId reflects the new value; the byRecord
      // derived recomputes from there.
      await loadRowsForByRecord();
      delete rowNameDrafts[group.row_id];
      rowNameDrafts = { ...rowNameDrafts };
    } catch (e) {
      console.error('row.update (entity-name)', e);
    }
  }

  async function saveNameEdit(resp: ResponseRecord) {
    if (!resp.pack_id || !resp.structured) return;
    const draft = nameDrafts[resp.response_id];
    if (draft === undefined) return;
    const next = draft.trim();
    if (next === resp.structured.display_name) {
      delete nameDrafts[resp.response_id];
      nameDrafts = { ...nameDrafts };
      return;
    }
    try {
      await workspace.invoke('response.set_structured', {
        response_id: resp.response_id,
        patch: { display_name: next },
      });
      await loadResponses();
      delete nameDrafts[resp.response_id];
      nameDrafts = { ...nameDrafts };
    } catch (e) {
      console.error('response.set_structured (display_name)', e);
    }
  }

  // Per-(row × pack) in-flight state for the per-record palette chips. Keyed
  // `${row_id}::${pack_id}` — one fire per pack per row at a time (a second
  // click is a no-op until the first settles, by design — the user should
  // wait for the result before re-firing through a different connector).
  let packBusy = $state<Set<string>>(new Set());
  const packBusyKey = (row_id: string, pack_id: string) =>
    `${row_id}::${pack_id}`;

  // Which packs already have a result accepted onto this record — from accepted
  // responses in the group AND from profiles already written to row.socials
  // (the latter survives across promotes/record sets). Drives the ✓ badge so
  // the user can tell at a glance what's "not already accepted" and worth
  // re-running. Re-running an accepted pack stays allowed — it's additive.
  function acceptedPackIds(group: RowGroup): Set<string> {
    const ids = new Set<string>();
    for (const r of group.responses) {
      if (r.accepted && r.pack_id) ids.add(r.pack_id);
    }
    const socials = (rowsByRowId[group.row_id]?.fields as Record<string, unknown> | undefined)?.socials;
    if (Array.isArray(socials)) {
      for (const s of socials as SocialProfile[]) if (s?.pack_id) ids.add(s.pack_id);
    }
    return ids;
  }

  // Run ONE pack against ONE record from the per-record palette. When
  // `connector_id` is omitted (default click on a chip) the backend's
  // existing chain-walk picks the head of the pack's preferred_connectors.
  // When provided (chosen from the long-press connector menu), the
  // explicit connector overrides the chain. Strictly ADDITIVE — produces
  // a new candidate response for triage and NEVER writes to row.fields;
  // only a human accept does that, so accepted data is never overridden.
  //
  // NOTE on the provider_override seam: the underlying pack.search.requested
  // subject's args still use `provider_override: ProviderId`. We pass the
  // chosen connector_id through that field — the legacy ProviderId union
  // ('searxng' | 'tavily' | 'serpapi' | 'gdelt' | 'google-news-rss') now
  // matches the new connector_ids 1:1 except for SerpApi (registry id
  // 'serpapi-google' vs legacy 'serpapi'). We map at the boundary.
  function connectorIdToProviderId(connector_id: string): string {
    if (connector_id === 'serpapi-google') return 'serpapi';
    return connector_id;
  }

  async function runPackOnRecord(group: RowGroup, pack_id: string, connector_id?: string) {
    const entity_name = group.entity_name.trim();
    if (entity_name.length === 0) return; // nothing to search on
    const key = packBusyKey(group.row_id, pack_id);
    if (packBusy.has(key)) return;
    packBusy = new Set(packBusy).add(key);
    try {
      await workspace.invoke('pack.search', {
        pack_id,
        row_id: group.row_id,
        record_set_id: group.record_set_id,
        entity_name,
        entity_name_field: group.entity_field ?? undefined,
        provider_override: connector_id ? connectorIdToProviderId(connector_id) : undefined,
      });
      await loadResponses();
      if (viewMode === 'by-record') await loadRowsForByRecord();
    } catch (e) {
      console.error('pack.search (by-record)', e);
    } finally {
      const next = new Set(packBusy);
      next.delete(key);
      packBusy = next;
    }
  }

  // Per-row Set of busy pack_ids — derived from packBusy by stripping the
  // row_id prefix. The palette consumes this for chip 'firing' state.
  function busyForRow(row_id: string): Set<string> {
    const out = new Set<string>();
    const prefix = `${row_id}::`;
    for (const key of packBusy) {
      if (key.startsWith(prefix)) out.add(key.slice(prefix.length));
    }
    return out;
  }

  // Inline triage in by-record mode — bypass the per-cell editText
  // machinery. Just flips the flag (and writes to row.socials on accept
  // via the existing response.accept fork).
  async function flagInline(response_id: string, f: ResponseFlag) {
    rowBusyId = response_id;
    try {
      await workspace.invoke('response.flag', { response_id, flag: f });
      await loadResponses();
    } catch (e) {
      console.error('response.flag (inline)', e);
    } finally {
      rowBusyId = '';
    }
  }

  async function acceptInline(response_id: string) {
    rowBusyId = response_id;
    try {
      await workspace.invoke('response.accept', { response_id });
      await loadResponses();
    } catch (e) {
      console.error('response.accept (inline)', e);
    } finally {
      rowBusyId = '';
    }
  }

  function formatAge(ts: number | null): string {
    if (ts === null) return 'never';
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 5) return 'just now';
    if (s < 60) return `${s}s ago`;
    return `${Math.floor(s / 60)}m ago`;
  }

  async function loadPrompts() {
    try {
      const r = (await workspace.invoke('prompt.list', {})) as { prompts: PromptTemplate[] };
      const map: Record<string, PromptTemplate> = {};
      for (const p of r.prompts) map[p.prompt_id] = p;
      promptsById = map;
    } catch (e) {
      console.error('prompt.list', e);
    }
  }

  // Connector inventory — loaded once on mount, fed into every ConnectorPalette
  // so the per-record chips can resolve cost tiers, missing env vars, and
  // available-for-this-intent connector lists without a fetch per row.
  async function loadInventory() {
    try {
      const r = (await workspace.invoke('connectors.inventory', {})) as {
        connectors: PaletteConnector[];
      };
      inventory = r.connectors ?? [];
    } catch (e) {
      // Non-fatal — palette degrades to "no connectors" / chips show needs-env
      // for everything when the registry is unavailable.
      console.warn('connectors.inventory unavailable', e);
      inventory = [];
    }
  }

  async function loadRecordSets() {
    try {
      const r = (await workspace.invoke('record_set.list', {})) as { record_sets: RecordSet[] };
      const map: Record<string, RecordSet> = {};
      for (const rs of r.record_sets) map[rs.record_set_id] = rs;
      recordSetsById = map;
    } catch (e) {
      console.error('record_set.list', e);
    }
  }

  function step(delta: number) {
    index = Math.min(Math.max(index + delta, 0), Math.max(filtered.length - 1, 0));
  }

  async function flag(f: ResponseFlag) {
    if (!current) return;
    busy = 'flagging…';
    try {
      await workspace.invoke('response.flag', { response_id: current.response_id, flag: f });
      await loadResponses();
      busy = '';
    } catch (e) {
      busy = `flag failed — ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  async function accept() {
    if (!current) return;
    busy = 'accepting…';
    try {
      // Pass the current editor contents whenever they differ from what's
      // saved on the response; the server side picks `value` over edited_text
      // over response_text, so this always reflects the latest edit. (Also
      // flushes any pending autosave by virtue of the explicit value.)
      const savedText = current.edited_text ?? current.response_text;
      const value = editText !== savedText ? editText : undefined;
      await workspace.invoke('response.accept', {
        response_id: current.response_id,
        value,
      });
      editDirty = false;
      editSavedAt = Date.now();
      await loadResponses();
      busy = 'accepted → value written to the row cell';
    } catch (e) {
      busy = `accept failed — ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  async function deleteCurrent() {
    if (!current) return;
    if (!window.confirm(`Delete this response? (It will not affect any cell value already accepted to a row.)`)) return;
    busy = 'deleting…';
    try {
      await workspace.invoke('response.delete', { response_id: current.response_id });
      await loadResponses();
      busy = '';
    } catch (e) {
      busy = `delete failed — ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  async function clearVisible() {
    if (filtered.length === 0) return;
    const scopeLabel =
      filter === 'all' ? `all ${filtered.length} responses` : `${filtered.length} "${filter}" responses`;
    if (!window.confirm(`Clear ${scopeLabel}? This cannot be undone.`)) return;
    busy = 'clearing…';
    try {
      // The store's delete_all takes a ResponseFilter; the UI filter has an
      // extra 'unflagged' bucket that the store can't express directly, so
      // we fall back to per-id deletes in that one case. Everything else maps
      // to a single bulk call.
      if (filter === 'unflagged') {
        await Promise.all(
          filtered.map((r) => workspace.invoke('response.delete', { response_id: r.response_id })),
        );
      } else if (filter === 'all') {
        await workspace.invoke('response.delete_all', {});
      } else {
        await workspace.invoke('response.delete_all', { flag: filter });
      }
      index = 0;
      await loadResponses();
      busy = '';
    } catch (e) {
      busy = `clear failed — ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  function rerun() {
    if (!current) return;
    // hand the row back to request-reviewer (it listens for this event when
    // mounted) and flag this response so the triage list reflects it.
    window.dispatchEvent(
      new CustomEvent('augment-it:review-request', {
        detail: {
          prompt_id: current.prompt_id,
          record_set_id: current.record_set_id,
          row_id: current.row_id,
        },
      }),
    );
    void flag('needs-rerun');
  }
</script>

<div class="resp-app">
  <div class="resp-status-bar">
    consumes <code>@augment-it/workspace</code> · <code>{WS_URL}</code> ·
    <span class="status status-{status}">{status}</span>
  </div>

  <div class="resp-body">
    <!-- View-mode toggle: By Response (single-card stepper, original UI) vs
         By Record (row-grouped triage for pack-firehose workflows). -->
    <div class="resp-view-switch" role="tablist" aria-label="Review mode">
      <button
        class="resp-view"
        class:active={viewMode === 'single'}
        role="tab"
        aria-selected={viewMode === 'single'}
        onclick={() => (viewMode = 'single')}
      >
        By Response
      </button>
      <button
        class="resp-view"
        class:active={viewMode === 'by-record'}
        role="tab"
        aria-selected={viewMode === 'by-record'}
        onclick={() => (viewMode = 'by-record')}
        title="Group all responses for a row into one card — efficient for pack triage"
      >
        By Record
      </button>
    </div>

    <!-- Record-set scope chips. Only render the tier when there's more
         than one bucket (single-set datasets stay uncluttered). -->
    {#if recordSetBuckets.length > 1}
      <div class="resp-record-set-scope" role="tablist" aria-label="Record-set scope">
        <button
          class="chip"
          class:active={recordSetFilter === 'all'}
          onclick={() => setRecordSetFilter('all')}
        >all sets <span class="chip-count">{responses.length}</span></button>
        {#each recordSetBuckets as b (b.id)}
          <button
            class="chip"
            class:active={recordSetFilter === b.id}
            class:orphan-chip={b.id === '__orphan__'}
            onclick={() => setRecordSetFilter(b.id)}
            title={b.id === '__orphan__'
              ? 'Responses whose parent record set was deleted (still in history, no rows to resolve)'
              : `Scope to record set: ${b.label}`}
          >{b.label} <span class="chip-count">{b.count}</span></button>
        {/each}
      </div>
    {/if}

    <div class="resp-head">
      <h2>Response Reviewer</h2>
      <div class="filters">
        {#each ['all', 'unflagged', 'good', 'partial', 'wrong', 'needs-human'] as f (f)}
          <button
            class="chip"
            class:active={filter === f}
            onclick={() => {
              filter = f as typeof filter;
              index = 0;
            }}>{f} <span class="chip-count">{counts[f] ?? 0}</span></button>
        {/each}
        <button
          class="chip refresh"
          onclick={() => void manualRefresh()}
          disabled={refreshing}
          title="Pull the latest responses from the server"
        >{refreshing ? 'refreshing…' : '↻ refresh'}</button>
        <button
          class="chip danger filter-clear"
          onclick={() => void clearVisible()}
          disabled={filtered.length === 0}
          data-tip={`Clear ${filter === 'all' ? 'all' : `"${filter}"`} responses (${filtered.length})`}
          aria-label={`Clear ${filter === 'all' ? 'all' : filter} responses, ${filtered.length} total`}
        >🧹 <span class="count">{filtered.length}</span></button>
        <span class="muted refresh-age">
          {responses.length} loaded · updated {formatAge(lastRefreshAt)}
        </span>
      </div>
    </div>

    {#if filtered.length === 0}
      <p class="muted">
        No responses{filter === 'all' ? ' yet' : ` match “${filter}”`}. Fire a
        prompt from Request Reviewer and they land here.
      </p>
    {:else if viewMode === 'by-record'}
      <!-- By-record view: one card per row, all responses for that row
           grouped inside. Designed for pack-firehose triage where the user
           wants to verify N parallel candidates for the same entity at once
           rather than stepping through them individually. -->
      <p class="muted by-record-hint">
        {byRecord.length} {byRecord.length === 1 ? 'record' : 'records'} ·
        {filtered.length} {filtered.length === 1 ? 'response' : 'responses'}
        in scope · click ✓/✗ inline to triage · each record has a
        <strong>connector palette</strong> — click a chip to fire that intent
        through its preferred connector chain, long-press / right-click for
        the connector menu (cost tiers + needs-env) · ✓ = already accepted
      </p>
      <div class="record-list">
        {#each byRecord as group (group.row_id)}
          {@const accepted = acceptedPackIds(group)}
          {@const canRun = group.entity_name.trim().length > 0}
          <article class="record-card">
            <header class="record-card-header">
              {#if group.entity_field}
                <!-- Editable entity-name input. Looks like a heading until you
                     hover/focus; saves on Enter/blur via row.update. Lets the
                     researcher clean up names like "Accelerate the Future
                     (ACH, GW Match)" before the next search wave. -->
                <input
                  class="record-card-name-input"
                  type="text"
                  value={rowNameDrafts[group.row_id] ?? group.entity_name}
                  oninput={(e) =>
                    (rowNameDrafts[group.row_id] = (e.currentTarget as HTMLInputElement).value)}
                  onblur={() => void saveRowNameEdit(group)}
                  onkeydown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      (e.currentTarget as HTMLInputElement).blur();
                    }
                  }}
                  title={`Edit ${group.entity_field} — Enter or click away to save back to the row`}
                />
              {:else}
                <h3>{group.entity_name || group.row_id}</h3>
              {/if}
              <span class="muted record-card-count">{group.responses.length} {group.responses.length === 1 ? 'response' : 'responses'}</span>
            </header>

            <!-- Per-record connector palette. One chip per intent; default
                 click walks the pack's preferred_connectors chain; long-press
                 (or right-click) opens the connector menu with cost tiers +
                 needs-env affordances. Strictly additive — fires produce
                 candidate responses for triage and never overwrite accepted
                 row data. Spec: context-v/specs/Connector-Inventory-and-
                 Per-Record-Palette.md §"UI seam — the per-record palette". -->
            {#if !canRun}
              <p class="muted record-palette-disabled">
                No name column resolved for this record — palette disabled.
              </p>
            {:else}
              <ConnectorPalette
                row_id={group.row_id}
                packs={PACKS_META}
                {inventory}
                accepted_pack_ids={accepted}
                busy_pack_ids={busyForRow(group.row_id)}
                on_fire={(pack_id, connector_id) =>
                  void runPackOnRecord(group, pack_id, connector_id)}
              />
            {/if}

            <ul class="record-responses">
              {#each group.responses as resp (resp.response_id)}
                <li
                  class="record-response"
                  class:flag-good={resp.flag === 'good'}
                  class:flag-partial={resp.flag === 'partial'}
                  class:flag-wrong={resp.flag === 'wrong'}
                  class:flag-needs-human={resp.flag === 'needs-human'}
                  class:flag-needs-rerun={resp.flag === 'needs-rerun'}
                >
                  <div class="record-response-source">
                    {#if resp.pack_id}
                      <span class="source-badge" title="pack response">{resp.pack_id.replace(/-pack$/, '')}</span>
                      {#if resp.model}
                        <span class="provider-badge provider-{resp.model}" title="search provider that produced this result">{resp.model}</span>
                      {/if}
                    {:else}
                      <span class="source-badge prompt-badge" title="prompt response">
                        {promptsById[resp.prompt_id]?.name ?? 'prompt'}
                      </span>
                    {/if}
                    {#if resp.outcome && resp.outcome !== 'found'}
                      <span class="outcome-badge outcome-{resp.outcome}">{resp.outcome}</span>
                    {/if}
                  </div>
                  <div class="record-response-body">
                    {#if resp.structured}
                      <ConfidencePill confidence={resp.structured.confidence} />
                      <input
                        class="record-url-input"
                        type="url"
                        value={urlDrafts[resp.response_id] ?? resp.structured.url}
                        oninput={(e) =>
                          (urlDrafts[resp.response_id] = (e.currentTarget as HTMLInputElement).value)}
                        onblur={() => void saveUrlEdit(resp)}
                        onkeydown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            (e.currentTarget as HTMLInputElement).blur();
                          }
                        }}
                        title="Edit the URL — Enter or click away to save"
                      />
                      <a
                        class="record-url-open"
                        href={urlDrafts[resp.response_id] ?? resp.structured.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open in new tab"
                      >↗</a>
                      <input
                        class="record-display-name-input"
                        type="text"
                        value={nameDrafts[resp.response_id] ?? resp.structured.display_name}
                        oninput={(e) =>
                          (nameDrafts[resp.response_id] = (e.currentTarget as HTMLInputElement).value)}
                        onblur={() => void saveNameEdit(resp)}
                        onkeydown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            (e.currentTarget as HTMLInputElement).blur();
                          }
                        }}
                        placeholder="display name"
                        title="Edit the display name — Enter or click away to save"
                      />
                    {:else if resp.pack_id}
                      <!-- Pack response with no structured payload yet
                           (not_found / error / pending / skipped). Empty
                           URL input lets the user supply it manually —
                           backend mints a Candidate + flips outcome to
                           'found' when they save a URL. -->
                      <input
                        class="record-url-input record-url-input-empty"
                        type="url"
                        placeholder={resp.outcome === 'not_found'
                          ? 'no result — type a URL to supply one'
                          : resp.outcome === 'error'
                            ? 'source errored — type a URL to override'
                            : 'type a URL to supply manually'}
                        value={urlDrafts[resp.response_id] ?? ''}
                        oninput={(e) =>
                          (urlDrafts[resp.response_id] = (e.currentTarget as HTMLInputElement).value)}
                        onblur={() => void saveUrlEdit(resp)}
                        onkeydown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            (e.currentTarget as HTMLInputElement).blur();
                          }
                        }}
                        title="Type a URL — Enter or click away to save; promotes the response from {resp.outcome} → found"
                      />
                      {#if urlDrafts[resp.response_id]}
                        <a
                          class="record-url-open"
                          href={urlDrafts[resp.response_id]}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open the URL you're typing in a new tab"
                        >↗</a>
                      {/if}
                    {:else if resp.response_text}
                      <span class="record-prose">{resp.response_text}</span>
                    {:else}
                      <span class="muted">—</span>
                    {/if}
                  </div>
                  <div class="record-response-actions">
                    {#if resp.accepted}
                      <span class="flag accepted">accepted</span>
                    {:else}
                      <button
                        class="inline-btn good"
                        disabled={rowBusyId === resp.response_id}
                        onclick={() => void flagInline(resp.response_id, 'good')}
                        title="Mark good"
                      >✓</button>
                      <button
                        class="inline-btn wrong"
                        disabled={rowBusyId === resp.response_id}
                        onclick={() => void flagInline(resp.response_id, 'wrong')}
                        title="Mark wrong"
                      >✗</button>
                      <button
                        class="inline-btn partial"
                        disabled={rowBusyId === resp.response_id}
                        onclick={() => void flagInline(resp.response_id, 'partial')}
                        title="Mark partial"
                      >~</button>
                      <button
                        class="inline-btn accept"
                        disabled={rowBusyId === resp.response_id || !resp.structured}
                        onclick={() => void acceptInline(resp.response_id)}
                        title={resp.structured ? 'Accept → write to row.socials' : 'No structured payload to accept'}
                      >→ accept</button>
                    {/if}
                  </div>
                </li>
              {/each}
            </ul>
          </article>
        {/each}
      </div>
    {:else if current}
      <div class="stepper">
        <button onclick={() => step(-1)} disabled={index === 0}>◀</button>
        <span>response {index + 1} / {filtered.length}</span>
        <button onclick={() => step(1)} disabled={index >= filtered.length - 1}>▶</button>
        {#if current.flag}<span class="flag flag-{current.flag}">{current.flag}</span>{/if}
        {#if current.accepted}<span class="flag accepted">accepted</span>{/if}
        {#if current.pack_id}<span class="flag pack-badge" title="response produced by pack">{current.pack_id}</span>{/if}
        {#if isFound}
          <span class="stepper-sep" aria-hidden="true"></span>
          <span class="muted stepper-label">triage:</span>
          <div class="flags inline">
            {#each FLAGS as f (f)}
              <button
                class="chip"
                class:active={current.flag === f}
                onclick={() => flag(f)}
              >{f}</button>
            {/each}
          </div>
        {:else}
          <span class="stepper-sep" aria-hidden="true"></span>
          <span class="muted stepper-label">outcome: {current.outcome}</span>
        {/if}
      </div>

      <div class="resp-layout">
        <aside class="context">
          <h3>Context</h3>
          <dl>
            <dt>Prompt</dt><dd>{promptName}</dd>
            <dt>Record set</dt><dd>{recordSetName}</dd>
            <dt>Model</dt><dd><code>{current.model}</code></dd>
            <dt>Output column</dt><dd><code>{current.output_column}</code></dd>
          </dl>
          <h3>Prompt fired</h3>
          <pre class="panel">{firedPrompt}</pre>
          <p class="muted hint">
            The full JSON request lives in Request Reviewer — this stage is
            about the response.
          </p>

          <h3>Helpful links for this record</h3>
          <p class="muted hint">
            Anything you found while researching — a foundation page, a
            LinkedIn, a related grantee — gets attached to the <em>row</em>,
            not just this response. Survives future enrichment runs.
          </p>

          <ul class="links">
            {#each helpfulLinks as link (link.link_id)}
              <li>
                <a href={link.url} target="_blank" rel="noopener noreferrer">{linkLabel(link)}</a>
                {#if link.note}<span class="link-note">{link.note}</span>{/if}
                <button
                  class="link-remove"
                  onclick={() => void removeHelpfulLink(link.link_id)}
                  aria-label="remove link"
                  title="Remove this link"
                >×</button>
              </li>
            {/each}
            {#if helpfulLinks.length === 0}
              <li class="muted empty">no links yet</li>
            {/if}
          </ul>

          <form
            class="link-form"
            onsubmit={(e) => { e.preventDefault(); void addHelpfulLink(); }}
          >
            <input
              type="url"
              bind:value={newLinkUrl}
              placeholder="https://…"
              required
              disabled={addingLink}
            />
            <input
              type="text"
              bind:value={newLinkNote}
              placeholder="optional note — why this link?"
              disabled={addingLink}
            />
            <button type="submit" disabled={addingLink || !newLinkUrl.trim()}>
              {addingLink ? 'saving…' : '+ add link'}
            </button>
          </form>
          {#if linkBusy}<p class="result muted">{linkBusy}</p>{/if}
        </aside>

        <section class="response">
          {#if current.structured}
            <!-- Candidate card — present iff a pack produced a structured payload.
                 Sits above whatever body the outcome chose. -->
            <div class="candidate-card">
              <div class="candidate-row">
                <ConfidencePill confidence={current.structured.confidence} />
                <a
                  class="candidate-url"
                  href={current.structured.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >{current.structured.url}</a>
                <span class="candidate-name">{current.structured.display_name}</span>
                {#if current.pack_id}
                  <span class="source-badge" title="produced by this pack">{current.pack_id}</span>
                {/if}
              </div>
              {#if current.structured.snippet}
                <button
                  class="snippet-toggle"
                  onclick={() => (snippetExpanded = !snippetExpanded)}
                  aria-expanded={snippetExpanded}
                >
                  {snippetExpanded ? '▾' : '▸'} snippet
                </button>
                {#if snippetExpanded}
                  <p class="candidate-snippet">{current.structured.snippet}</p>
                {/if}
              {/if}
            </div>
          {/if}

          {#if isFound}
            <h3>
              Response — editable; edits autosave when you click away or step
              <span class="save-state" class:dirty={editDirty} class:saving={savingEdit}>
                {#if savingEdit}saving…
                {:else if editDirty}unsaved
                {:else if editSavedAt}saved {formatAge(editSavedAt)}
                {/if}
              </span>
            </h3>
            <textarea
              bind:value={editText}
              rows="16"
              oninput={onEditInput}
              onblur={() => void flushEdit()}
            ></textarea>

            <div class="actions icon-row">
              <button
                class="icon accept"
                onclick={accept}
                data-tip="Accept whole response → cell"
                aria-label="Accept whole response and write to row cell"
              >✓</button>
              <button
                class="icon"
                onclick={rerun}
                data-tip="Re-run this row in Request Reviewer"
                aria-label="Re-run in Request Reviewer"
              >↻</button>
              <button
                class="icon"
                disabled
                data-tip="Distill in Highlight Collector — a future stage"
                aria-label="Distill in Highlight Collector"
              >✦</button>
              <button
                class="icon danger"
                onclick={() => void deleteCurrent()}
                data-tip="Delete this response"
                aria-label="Delete this response"
              >🗑</button>
            </div>
          {:else if current.outcome === 'not_found'}
            <div class="thin-row outcome-not-found">
              <span class="thin-row-icon">∅</span>
              <span class="thin-row-body">Source ran, zero candidates.</span>
            </div>
          {:else if current.outcome === 'error'}
            <div class="thin-row outcome-error">
              <span class="thin-row-icon">✕</span>
              <span class="thin-row-body">{current.response_text || 'unknown error'}</span>
              <button
                class="icon"
                disabled
                data-tip="Retry coming in a later feature"
                aria-label="Retry — coming in a later feature"
              >↻ retry</button>
              <button
                class="icon danger"
                onclick={() => void deleteCurrent()}
                data-tip="Delete this response"
                aria-label="Delete this response"
              >🗑</button>
            </div>
          {:else if current.outcome === 'skipped'}
            <div class="thin-row outcome-skipped">
              <span class="thin-row-icon">⤴</span>
              <span class="thin-row-body">
                Pre-populated from existing data (dedup hit). Already marked good above.
              </span>
            </div>
          {:else if current.outcome === 'pending'}
            <div class="thin-row outcome-pending">
              <span class="spinner" aria-hidden="true"></span>
              <span class="thin-row-body">Source in flight…</span>
            </div>
          {/if}
        </section>
      </div>
      {#if busy}<p class="result">{busy}</p>{/if}
    {/if}
  </div>
</div>
