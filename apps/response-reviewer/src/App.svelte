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
    type SocialProfile, resolveWsUrl } from '@augment-it/workspace';
  import ConfidencePill from '@augment-it/shared-ui/ConfidencePill.svelte';
  import Button from '@augment-it/shared-ui/Button.svelte';
  import Chip from '@augment-it/shared-ui/Chip.svelte';
  import CountBadge from '@augment-it/shared-ui/CountBadge.svelte';
  import StatusIndicator from '@augment-it/shared-ui/StatusIndicator.svelte';
  import CardRow from '@augment-it/shared-ui/CardRow.svelte';
  import ExternalLink from '@augment-it/shared-ui/ExternalLink.svelte';
  import DisclosureRow from '@augment-it/shared-ui/DisclosureRow.svelte';
  import SelectCheck from '@augment-it/shared-ui/SelectWrapper--Checkbox.svelte';
  import { MOCK_PACKS_FIXTURE } from './fixtures/mock-packs';
  import ConnectorPalette from './ConnectorPalette.svelte';
  import type { PaletteConnector, PalettePack } from './ConnectorPalette.svelte';

  // Each remote owns its own workspace singleton + WebSocket — no `shared`
  // federation block (see the 2026-05-21_03 changelog).
  const TOKEN_KEY = 'augment-it:session-token';
  const WS_URL = resolveWsUrl();

  const FLAGS: ResponseFlag[] = ['good', 'partial', 'wrong', 'needs-rerun', 'needs-human'];

  // ---------------------------------------------------------------------------
  // Chip tones. TONE IS SEMANTIC, NOT DECORATIVE — picked by what the label
  // MEANS, never by the colour this member happened to draw. Four of these
  // disagree with the old stylesheet and the meaning won; the disagreements are
  // enumerated in the Chip migration report:
  //   · 'partial' / 'needs-rerun' were drawn accent-2 / accent → they mean
  //     DEGRADED, so they are `warn`.
  //   · 'skipped' was drawn --color-confidence-high (green, i.e. "good") → it
  //     means "deliberately not run", which is informational, so `info`.
  //   · the save-state 'unsaved' was drawn --color-error-text → an unsaved edit
  //     is pending-with-risk, not a failure, so `warn`.
  //   · the warm corpus chip was drawn accent → "this record has content on
  //     disk" is a verified positive fact, so `ok`.
  // ---------------------------------------------------------------------------
  type ChipTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'error' | 'info';

  function flagTone(f: ResponseFlag | null): ChipTone {
    switch (f) {
      case 'good': return 'ok';
      case 'wrong': return 'error';
      case 'partial':
      case 'needs-rerun':
      case 'needs-human': return 'warn';
      default: return 'neutral';
    }
  }

  function outcomeTone(o: string): ChipTone {
    switch (o) {
      case 'error': return 'error';
      case 'pending': return 'warn';
      case 'skipped': return 'info';
      default: return 'neutral'; // not_found is a real result, not a failure
    }
  }

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
  type ViewMode = 'single' | 'by-record' | 'content-reader';
  const VIEW_MODE_KEY = 'augment-it:response-reviewer:view-mode';
  function readViewMode(): ViewMode {
    if (typeof localStorage === 'undefined') return 'single';
    return (localStorage.getItem(VIEW_MODE_KEY) as ViewMode) ?? 'single';
  }
  let viewMode = $state<ViewMode>(readViewMode());
  $effect(() => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(VIEW_MODE_KEY, viewMode);
  });

  let status = $state<'connecting' | 'open' | 'closed' | 'error' | 'auth_required'>('connecting');

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
      if (viewMode === 'by-record' || viewMode === 'content-reader') await loadRowsForByRecord();
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
    if (viewMode !== 'by-record' && viewMode !== 'content-reader') return;
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

  // ============================================================
  // Content Reader (view mode 'content-reader')
  // Per context-v/specs/Funder-Content-Corpus-Workflow.md.
  // Implements Rules 5-8:
  //   Rule 5: per-item curation (edit title + tags, "+ add to corpus")
  //   Rule 6: hide already-in-corpus items from preview list
  //   Rule 7: show ALL rows of the active record set, including not-fired
  //           and invalid-URL rows, with clear affordances
  //   Rule 8: scope responses to latest fire_id per (row_id, pack_id);
  //           surface "last fired" timestamp per record
  // ============================================================

  // Content-shaped packs whose responses surface as previewable content.
  // Must match services/content-ingest/src/handlers.ts CONTENT_PACK_IDS
  // and services/social-search/src/entity-pulse/packs (which packs are
  // wired to publish responses).
  const CONTENT_PACK_IDS = new Set(['official-blog-pack']);
  const CLIENT_ID = 'reach-edu';

  type PreviewResult = {
    response_id: string;
    status: 'ready' | 'failed';
    exact_url: string;
    pack_id: string | null;
    title?: string;
    excerpt?: string;
    fetched_at?: string;
    extra_metadata?: Record<string, unknown>;
    error?: string;
  };
  type CorpusEntry = {
    corpus_path: string;
    response_id: string | null;
    record_id: string | null;
    exact_url: string;
    fetched_at: string;
    title: string;
    tags: string[];
  };

  let previewsByRowId = $state<Record<string, PreviewResult[]>>({});
  let previewBusyRowId = $state<string>('');
  let previewErrorByRowId = $state<Record<string, string>>({});
  let corpusEntriesByRowId = $state<Record<string, CorpusEntry[]>>({});
  let addingResponseId = $state<string>('');
  let titleDraftsByResponseId = $state<Record<string, string>>({});
  let tagDraftsByResponseId = $state<Record<string, string>>({});

  // Active record set is what the user picked in the scope chip row.
  // Defaults to the largest non-orphan bucket (an existing $effect handles
  // this), but operator can switch.
  const activeRecordSet = $derived.by(() => {
    if (recordSetFilter === 'all' || recordSetFilter === '__orphan__') return null;
    return recordSetsById[recordSetFilter] ?? null;
  });

  // Rule 8: latest fire_id per (row_id, pack_id). fire_ids are time-prefixed
  // so lexicographic max == temporal max. Null fire_id is "older than any
  // stamped fire" — only surfaces when no stamped fire exists for the pair.
  type FireKey = string; // `${row_id}::${pack_id}`
  const latestFireIdByRowPack = $derived.by<Map<FireKey, string | null>>(() => {
    const out = new Map<FireKey, string | null>();
    for (const r of responses) {
      if (r.pack_id == null) continue;
      const key: FireKey = `${r.row_id}::${r.pack_id}`;
      const fid = (r as unknown as { fire_id?: string | null }).fire_id ?? null;
      const cur = out.get(key);
      if (cur === undefined) out.set(key, fid);
      else if (fid != null && (cur == null || fid > cur)) out.set(key, fid);
    }
    return out;
  });

  function responseFireId(r: ResponseRecord): string | null {
    return (r as unknown as { fire_id?: string | null }).fire_id ?? null;
  }

  // Rules 1+2 layered defense + Rule 8 fire scoping.
  function rowHostnameFor(row_id: string): string | null {
    const row = rowsByRowId[row_id];
    const u = (row?.fields as Record<string, unknown> | undefined)?.url;
    if (typeof u !== 'string') return null;
    try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return null; }
  }
  const NAVIGATION_PATTERNS = [
    /\/page\/\d+\/?$/i, /\/p\/\d+\/?$/i,
    /\/category\/[^/]+\/?$/i, /\/categories\/[^/]+\/?$/i,
    /\/tag\/[^/]+\/?$/i, /\/tags\/[^/]+\/?$/i,
    /\/topic\/[^/]+\/?$/i, /\/topics\/[^/]+\/?$/i,
    /\/author\/[^/]+\/?$/i, /\/contributors\/[^/]+\/?$/i,
    /\/archive\/?$/i, /\/archives\/?$/i,
    /\/feed\/?$/i, /\/rss\/?$/i, /\/atom\.xml$/i, /\/index\.html?$/i,
    /\/\d{4}\/?$/i, /\/\d{4}\/\d{1,2}\/?$/i,
  ];
  function isNavigationUrl(url: string): boolean {
    try {
      const p = new URL(url).pathname;
      for (const re of NAVIGATION_PATTERNS) if (re.test(p)) return true;
      return false;
    } catch { return true; }
  }
  function isContentResponse(r: ResponseRecord): boolean {
    if (r.pack_id == null || !CONTENT_PACK_IDS.has(r.pack_id)) return false;
    // Rule 8: scope to latest fire for this (row_id, pack_id).
    const latest = latestFireIdByRowPack.get(`${r.row_id}::${r.pack_id}`);
    if (latest !== undefined && responseFireId(r) !== latest) return false;
    const structured = r.structured as { url?: string } | null;
    const url = structured?.url;
    if (typeof url !== 'string' || url.trim().length === 0) return false;
    if (isNavigationUrl(url)) return false;
    const rowHost = rowHostnameFor(r.row_id);
    if (!rowHost) return true; // row url broken; fail open on host check
    let respHost = '';
    try { respHost = new URL(url).hostname.replace(/^www\./, ''); }
    catch { return false; }
    return respHost === rowHost ||
           respHost.endsWith('.' + rowHost) ||
           rowHost.endsWith('.' + respHost);
  }

  // Rule 7: show every row of the active record set, including rows with
  // zero responses (not yet fired) and rows whose pack returned 'error'
  // (broken url). Status drives the affordance shown per card.
  type ContentRecordStatus =
    | { kind: 'no-responses' }                     // never fired (or fire produced nothing tied to this row_id)
    | { kind: 'invalid-url'; reason: string }      // fired but row.url was invalid → outcome=error
    | { kind: 'not-found' }                         // fired, pack couldn't discover an index
    | { kind: 'has-content'; previewableCount: number; lastFiredAt: string | null };

  type ContentRecord = {
    row_id: string;
    record_set_id: string;
    entity_name: string;
    entity_field: string | null;
    status: ContentRecordStatus;
    contentResponses: ResponseRecord[];   // empty when status !== 'has-content'
  };

  const contentRecords = $derived.by<ContentRecord[]>(() => {
    const rs = activeRecordSet;
    if (!rs) return [];
    // Index responses by row_id, scoped to content packs only.
    const byRow = new Map<string, ResponseRecord[]>();
    for (const r of responses) {
      if (r.record_set_id !== rs.record_set_id) continue;
      if (r.pack_id == null || !CONTENT_PACK_IDS.has(r.pack_id)) continue;
      // Rule 8 scoping for ALL response queries on this row+pack:
      const latest = latestFireIdByRowPack.get(`${r.row_id}::${r.pack_id}`);
      if (latest !== undefined && responseFireId(r) !== latest) continue;
      const arr = byRow.get(r.row_id) ?? [];
      arr.push(r);
      byRow.set(r.row_id, arr);
    }
    const records: ContentRecord[] = [];
    for (const row_id of rs.row_ids) {
      const row = rowsByRowId[row_id];
      const ef = entityFieldFor(row);
      const blogs = byRow.get(row_id) ?? [];
      let status: ContentRecordStatus;
      if (blogs.length === 0) {
        status = { kind: 'no-responses' };
      } else {
        const error = blogs.find((r) => r.outcome === 'error');
        if (error) {
          status = { kind: 'invalid-url', reason: error.response_text };
        } else {
          const previewable = blogs.filter((r) => isContentResponse(r));
          if (previewable.length === 0) {
            status = { kind: 'not-found' };
          } else {
            const lastFiredAt = blogs.reduce<string | null>((acc, r) => {
              return !acc || r.created_at > acc ? r.created_at : acc;
            }, null);
            status = { kind: 'has-content', previewableCount: previewable.length, lastFiredAt };
          }
        }
      }
      records.push({
        row_id,
        record_set_id: rs.record_set_id,
        entity_name: ef?.value ?? '',
        entity_field: ef?.field ?? null,
        status,
        contentResponses: blogs,
      });
    }
    return records.sort((a, b) => {
      const an = a.entity_name || a.row_id;
      const bn = b.entity_name || b.row_id;
      return an.localeCompare(bn);
    });
  });

  // Aggregate counts for the header strip — helps the operator see the
  // shape of the work at a glance.
  const contentCounts = $derived.by(() => {
    const c = { total: 0, has: 0, notFound: 0, invalid: 0, none: 0 };
    for (const cr of contentRecords) {
      c.total += 1;
      if (cr.status.kind === 'has-content') c.has += 1;
      else if (cr.status.kind === 'not-found') c.notFound += 1;
      else if (cr.status.kind === 'invalid-url') c.invalid += 1;
      else c.none += 1;
    }
    return c;
  });

  function funderSlugFor(g: { entity_name: string; row_id: string }): string {
    const base = g.entity_name.trim() || g.row_id;
    return base.toLowerCase().normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  }

  function corpusUrlsForRow(row_id: string): Set<string> {
    return new Set((corpusEntriesByRowId[row_id] ?? []).map((e) => e.exact_url));
  }

  async function previewContentForRow(row_id: string) {
    if (previewBusyRowId) return;
    previewBusyRowId = row_id;
    previewErrorByRowId = { ...previewErrorByRowId, [row_id]: '' };
    try {
      const reply = (await workspace.invoke('content_ingest.preview', {
        record_id: row_id,
      })) as { previews?: PreviewResult[]; ok?: false; error?: string };
      if (reply.ok === false) {
        previewErrorByRowId = { ...previewErrorByRowId, [row_id]: reply.error ?? 'preview failed' };
        return;
      }
      const previews = reply.previews ?? [];
      previewsByRowId = { ...previewsByRowId, [row_id]: previews };
      const nextTitles = { ...titleDraftsByResponseId };
      for (const p of previews) {
        if (p.status === 'ready' && p.title && nextTitles[p.response_id] == null) {
          nextTitles[p.response_id] = p.title;
        }
      }
      titleDraftsByResponseId = nextTitles;
      await refreshCorpusForRow(row_id);
    } catch (err) {
      previewErrorByRowId = {
        ...previewErrorByRowId,
        [row_id]: err instanceof Error ? err.message : String(err),
      };
    } finally {
      previewBusyRowId = '';
    }
  }

  async function refreshCorpusForRow(row_id: string) {
    try {
      const reply = (await workspace.invoke('corpus.list_for_record', {
        client_id: CLIENT_ID,
        record_id: row_id,
      })) as { entries?: CorpusEntry[] };
      corpusEntriesByRowId = { ...corpusEntriesByRowId, [row_id]: reply.entries ?? [] };
    } catch (err) {
      console.error('corpus.list_for_record', err);
    }
  }

  function parseTags(raw: string): string[] {
    return raw.split(/[,;\n]/).map((t) => t.trim()).filter((t) => t.length > 0);
  }

  async function addToCorpus(cr: ContentRecord, preview: PreviewResult) {
    if (addingResponseId) return;
    if (preview.status !== 'ready' || !preview.exact_url || !preview.pack_id) return;
    addingResponseId = preview.response_id;
    try {
      const title =
        titleDraftsByResponseId[preview.response_id]?.trim() || preview.title || preview.exact_url;
      const tags = parseTags(tagDraftsByResponseId[preview.response_id] ?? '');
      const result = (await workspace.invoke('corpus.add', {
        client_id: CLIENT_ID,
        record_id: cr.row_id,
        response_id: preview.response_id,
        title, tags,
        exact_url: preview.exact_url,
        funder_slug: funderSlugFor(cr),
        pack_id: preview.pack_id,
      })) as { corpus_path?: string; written_at?: string; ok?: false; error?: string };
      if (result.ok === false) {
        previewErrorByRowId = {
          ...previewErrorByRowId,
          [cr.row_id]: `add failed for ${preview.exact_url}: ${result.error ?? 'unknown'}`,
        };
        return;
      }
      await refreshCorpusForRow(cr.row_id);
      const t = { ...tagDraftsByResponseId };
      delete t[preview.response_id];
      tagDraftsByResponseId = t;
    } catch (err) {
      previewErrorByRowId = {
        ...previewErrorByRowId,
        [cr.row_id]: err instanceof Error ? err.message : String(err),
      };
    } finally {
      addingResponseId = '';
    }
  }

  // Preload corpus state for visible records so "in corpus" badges and
  // counts render on first paint, no preview-click required. Fans out
  // for content-reader (the per-record content cards) and by-record
  // (Records Surface — operator needs to see corpus coverage in the
  // view that lists the spine, per the Augmentation-State-Preservation-
  // and-Snapshot-Promotion plan §Phase A).
  $effect(() => {
    if (viewMode === 'content-reader') {
      void responses.length;
      for (const cr of contentRecords) {
        if (corpusEntriesByRowId[cr.row_id] === undefined) {
          void refreshCorpusForRow(cr.row_id);
        }
      }
    } else if (viewMode === 'by-record') {
      void responses.length;
      for (const group of byRecord) {
        if (corpusEntriesByRowId[group.row_id] === undefined) {
          void refreshCorpusForRow(group.row_id);
        }
      }
    }
  });

  function formatFiredAt(iso: string | null): string {
    if (!iso) return '';
    return iso.slice(0, 16).replace('T', ' ');
  }

  // Inline canonical-URL editor — fixes the "I have to leave Content Reader
  // and find Records Surface to repair a URL" friction. Rule 4 of the goals
  // spec says the system must surface broken rows for repair; the right
  // place to surface it is the surface where the operator sees the
  // not-found / invalid-url symptom.
  let urlDraftsByRowId = $state<Record<string, string>>({});
  let urlSavingRowId = $state<string>('');
  let urlSavedAt = $state<Record<string, number>>({});

  // Manual URL add — operator pastes a URL they found via their own search.
  // Bypasses Rule 1 (same-host) per the operator's directive: Rule 5
  // (operator authority per item) trumps Rule 1 (pack-output filter) for
  // manual flows. See memory: manual-corpus-bypasses-same-host.
  let manualOpenRowId = $state<Record<string, boolean>>({});
  let manualUrlDrafts = $state<Record<string, string>>({});
  let manualPreviewByRowId = $state<Record<string, PreviewResult | null>>({});
  let manualBusyRowId = $state<string>('');
  let manualErrorByRowId = $state<Record<string, string>>({});
  // Interim "save to inbox instead" toggle on the manual-add preview
  // card. Default-off (keep the existing per-funder corpus.add flow).
  // When the operator toggles on, the add button routes to
  // corpus.inbox.add — useful for PDFs and any URL that doesn't yet
  // have a per-funder home. See plan: Download-PDFs-into-Corpus-Inbox
  // §Phase 3.
  let manualSaveToInboxByRowId = $state<Record<string, boolean>>({});

  function toggleManual(row_id: string) {
    manualOpenRowId = { ...manualOpenRowId, [row_id]: !manualOpenRowId[row_id] };
  }

  async function previewManualUrl(row_id: string) {
    const url = (manualUrlDrafts[row_id] ?? '').trim();
    if (!url || manualBusyRowId) return;
    manualBusyRowId = row_id;
    manualErrorByRowId = { ...manualErrorByRowId, [row_id]: '' };
    try {
      const reply = (await workspace.invoke('content_ingest.preview_url', {
        record_id: row_id,
        url,
      })) as { preview?: PreviewResult; ok?: false; error?: string };
      if (reply.ok === false || !reply.preview) {
        manualErrorByRowId = {
          ...manualErrorByRowId,
          [row_id]: reply.error ?? 'preview failed',
        };
        return;
      }
      const p = reply.preview;
      manualPreviewByRowId = { ...manualPreviewByRowId, [row_id]: p };
      if (p.status === 'ready' && p.title) {
        titleDraftsByResponseId = {
          ...titleDraftsByResponseId,
          [p.response_id]: p.title,
        };
      }
      // Refresh corpus list so duplicate detection works for manual adds too.
      await refreshCorpusForRow(row_id);
    } catch (err) {
      manualErrorByRowId = {
        ...manualErrorByRowId,
        [row_id]: err instanceof Error ? err.message : String(err),
      };
    } finally {
      manualBusyRowId = '';
    }
  }

  async function addManualToCorpus(cr: ContentRecord) {
    const preview = manualPreviewByRowId[cr.row_id];
    if (!preview || preview.status !== 'ready') return;
    if (manualSaveToInboxByRowId[cr.row_id]) {
      await addManualToInbox(cr, preview);
      return;
    }
    await addToCorpus(cr, preview);
    // Clear the manual draft + preview on success (corpus refresh inside
    // addToCorpus will surface the new entry in the "In corpus" chip row).
    manualUrlDrafts = { ...manualUrlDrafts, [cr.row_id]: '' };
    manualPreviewByRowId = { ...manualPreviewByRowId, [cr.row_id]: null };
  }

  // "Save to inbox instead" path. The interim inbox-UI surface from
  // Content Reader; the dedicated apps/corpus-inbox/ microfrontend will
  // be the longer-term home but this lets PDFs (and any not-yet-homed
  // URL) be inboxed from where the operator already is.
  async function addManualToInbox(cr: ContentRecord, preview: PreviewResult) {
    if (addingResponseId) return;
    if (preview.status !== 'ready' || !preview.exact_url) return;
    addingResponseId = preview.response_id;
    try {
      const tags = parseTags(tagDraftsByResponseId[preview.response_id] ?? '');
      const result = (await workspace.invoke('corpus.inbox.add', {
        client_id: CLIENT_ID,
        url: preview.exact_url,
        tags,
        captured_from: 'content-reader',
      })) as {
        corpus_path?: string;
        written_at?: string;
        binary_asset?: { filename: string | null; download_status: string } | null;
        ok?: false;
        error?: string;
      };
      if (result.ok === false) {
        manualErrorByRowId = {
          ...manualErrorByRowId,
          [cr.row_id]: `inbox add failed for ${preview.exact_url}: ${result.error ?? 'unknown'}`,
        };
        return;
      }
      manualUrlDrafts = { ...manualUrlDrafts, [cr.row_id]: '' };
      manualPreviewByRowId = { ...manualPreviewByRowId, [cr.row_id]: null };
      manualSaveToInboxByRowId = { ...manualSaveToInboxByRowId, [cr.row_id]: false };
      const t = { ...tagDraftsByResponseId };
      delete t[preview.response_id];
      tagDraftsByResponseId = t;
    } catch (err) {
      manualErrorByRowId = {
        ...manualErrorByRowId,
        [cr.row_id]: err instanceof Error ? err.message : String(err),
      };
    } finally {
      addingResponseId = '';
    }
  }

  function currentRowUrl(row_id: string): string {
    const row = rowsByRowId[row_id];
    const u = (row?.fields as Record<string, unknown> | undefined)?.url;
    return typeof u === 'string' ? u : '';
  }

  async function saveRowUrl(row_id: string) {
    if (urlSavingRowId) return;
    const draft = (urlDraftsByRowId[row_id] ?? currentRowUrl(row_id)).trim();
    if (!draft) return;
    if (draft === currentRowUrl(row_id)) return;
    urlSavingRowId = row_id;
    try {
      await workspace.invoke('row.update', { row_id, fields: { url: draft } });
      // Local mirror so the input + dependent UI re-renders without
      // waiting for the row.updated broadcast to round-trip.
      const row = rowsByRowId[row_id];
      if (row) {
        rowsByRowId = {
          ...rowsByRowId,
          [row_id]: { ...row, fields: { ...row.fields, url: draft } },
        };
      }
      urlSavedAt = { ...urlSavedAt, [row_id]: Date.now() };
    } catch (err) {
      previewErrorByRowId = {
        ...previewErrorByRowId,
        [row_id]: `URL save failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    } finally {
      urlSavingRowId = '';
    }
  }
</script>

<div class="resp-app">
  <div class="resp-status-bar">
    consumes <code>@augment-it/workspace</code> · <code>{WS_URL}</code> ·
    <StatusIndicator state={status} of="workspace" />
  </div>

  <div class="resp-body">
    <!-- View-mode toggle: By Response (single-card stepper, original UI) vs
         By Record (row-grouped triage for pack-firehose workflows). -->
    <div class="resp-view-switch" role="group" aria-label="Review mode">
      <Button
        variant={viewMode === 'single' ? 'primary' : 'secondary'}
        aria-pressed={viewMode === 'single'}
        onclick={() => (viewMode = 'single')}
      >
        By Response
      </Button>
      <Button
        variant={viewMode === 'by-record' ? 'primary' : 'secondary'}
        aria-pressed={viewMode === 'by-record'}
        onclick={() => (viewMode = 'by-record')}
        title="Group all responses for a row into one card — efficient for pack triage"
      >
        By Record
      </Button>
      <Button
        variant={viewMode === 'content-reader' ? 'primary' : 'secondary'}
        aria-pressed={viewMode === 'content-reader'}
        onclick={() => (viewMode = 'content-reader')}
        title="Per-record content preview + add to corpus (funder content corpus workflow)"
      >
        Content Reader
      </Button>
    </div>

    <!-- Record-set scope chips. Only render the tier when there's more
         than one bucket (single-set datasets stay uncluttered). -->
    {#if recordSetBuckets.length > 1}
      <div class="resp-record-set-scope" role="group" aria-label="Record-set scope">
        <Button
          variant={recordSetFilter === 'all' ? 'primary' : 'secondary'}
          aria-pressed={recordSetFilter === 'all'}
          onclick={() => setRecordSetFilter('all')}
        >all sets <CountBadge count={responses.length} label="Responses in all sets" /></Button>
        {#each recordSetBuckets as b (b.id)}
          <Button
            variant={recordSetFilter === b.id ? 'primary' : 'secondary'}
            aria-pressed={recordSetFilter === b.id}
            onclick={() => setRecordSetFilter(b.id)}
            title={b.id === '__orphan__'
              ? 'Responses whose parent record set was deleted (still in history, no rows to resolve)'
              : `Scope to record set: ${b.label}`}
          >{b.label} <CountBadge count={b.count} label={`Responses in ${b.label}`} /></Button>
        {/each}
      </div>
    {/if}

    <div class="resp-head">
      <h2>Response Reviewer</h2>
      <div class="filters">
        {#each ['all', 'unflagged', 'good', 'partial', 'wrong', 'needs-human'] as f (f)}
          <Button
            variant={filter === f ? 'primary' : 'secondary'}
            aria-pressed={filter === f}
            onclick={() => {
              filter = f as typeof filter;
              index = 0;
            }}>{f} <CountBadge count={counts[f] ?? 0} label={`${f} responses`} /></Button>
        {/each}
        <div class="refresh">
          <Button
            onclick={() => void manualRefresh()}
            disabled={refreshing}
            title="Pull the latest responses from the server"
          >{refreshing ? 'refreshing…' : '↻ refresh'}</Button>
        </div>
        <Button
          variant="destructive"
          onclick={() => void clearVisible()}
          disabled={filtered.length === 0}
          data-tip={`Clear ${filter === 'all' ? 'all' : `"${filter}"`} responses (${filtered.length})`}
          aria-label={`Clear ${filter === 'all' ? 'all' : filter} responses, ${filtered.length} total`}
        >🧹 <CountBadge count={filtered.length} label="Responses this will clear" /></Button>
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
          <!-- NOT a CardRow, and this was MEASURED rather than assumed — it was
               built as <CardRow direction="column" density="compact">, rendered
               and compared against HEAD. `direction` fixed the axis and the
               padding broke it: this card's children are deliberately FULL-BLEED
               bands — a tinted header with its own border-bottom, and
               hairline-separated response rows — and CardRow always pads. The
               children went 950px -> 926px, the header band stopped 12px short
               of the card edge on all four sides, and the result reads as a card
               inside a card. The card grew 201px -> 233px for nothing.

               The gap is `density`, not `direction`: there is no `none`. Raised,
               not chased — a negative-margin dance to cancel the component's own
               padding is fighting the component, not rung-0 layout. -->
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
              <!-- Corpus-count chip — surfaces filesystem truth (the
                   count of clients/<client>/corpus/*/*.md files whose
                   record_id frontmatter == this row's row_id) in the
                   spine view itself, so cold prospects are visually
                   obvious without leaving Records Surface. Plan:
                   [[Augmentation-State-Preservation-and-Snapshot-
                   Promotion]] §Phase A. -->
              {#if corpusEntriesByRowId[group.row_id] === undefined}
                <Chip size="sm" tone="neutral" title="Loading corpus count…">corpus …</Chip>
              {:else if (corpusEntriesByRowId[group.row_id] ?? []).length === 0}
                <Chip size="sm" tone="neutral" title="No corpus content for this record yet">corpus 0</Chip>
              {:else}
                {@const corpusN = (corpusEntriesByRowId[group.row_id] ?? []).length}
                <Chip
                  size="sm"
                  tone="ok"
                  title={`${corpusN} corpus ${corpusN === 1 ? 'file' : 'files'} on disk for this record`}
                >corpus {corpusN}</Chip>
              {/if}
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
                      <Chip size="sm" tone="neutral" title="pack response">{resp.pack_id.replace(/-pack$/, '')}</Chip>
                      {#if resp.model}
                        <Chip size="sm" tone="neutral" title="search provider that produced this result">{resp.model}</Chip>
                      {/if}
                    {:else}
                      <Chip size="sm" tone="neutral" title="prompt response">
                        {promptsById[resp.prompt_id]?.name ?? 'prompt'}
                      </Chip>
                    {/if}
                    {#if resp.outcome && resp.outcome !== 'found'}
                      <Chip size="sm" tone={outcomeTone(resp.outcome)}>{resp.outcome}</Chip>
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
                      <ExternalLink
                        class="record-url-open"
                        href={urlDrafts[resp.response_id] ?? resp.structured.url}
                        label={urlDrafts[resp.response_id] ?? resp.structured.url}
                        iconOnly
                      >↗</ExternalLink>
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
                        <ExternalLink
                          class="record-url-open"
                          href={urlDrafts[resp.response_id]}
                          label={urlDrafts[resp.response_id]}
                          iconOnly
                        >↗</ExternalLink>
                      {/if}
                    {:else if resp.response_text}
                      <span class="record-prose">{resp.response_text}</span>
                    {:else}
                      <span class="muted">—</span>
                    {/if}
                  </div>
                  <div class="record-response-actions">
                    {#if resp.accepted}
                      <Chip size="sm" tone="ok">accepted</Chip>
                    {:else}
                      <Button
                        size="sm"
                        disabled={rowBusyId === resp.response_id}
                        onclick={() => void flagInline(resp.response_id, 'good')}
                        aria-label="Mark good"
                        title="Mark good"
                      >✓</Button>
                      <Button
                        size="sm"
                        disabled={rowBusyId === resp.response_id}
                        onclick={() => void flagInline(resp.response_id, 'wrong')}
                        aria-label="Mark wrong"
                        title="Mark wrong"
                      >✗</Button>
                      <Button
                        size="sm"
                        disabled={rowBusyId === resp.response_id}
                        onclick={() => void flagInline(resp.response_id, 'partial')}
                        aria-label="Mark partial"
                        title="Mark partial"
                      >~</Button>
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={rowBusyId === resp.response_id || !resp.structured}
                        onclick={() => void acceptInline(resp.response_id)}
                        title={resp.structured ? 'Accept → write to row.socials' : 'No structured payload to accept'}
                      >→ accept</Button>
                    {/if}
                  </div>
                </li>
              {/each}
            </ul>
          </article>
        {/each}
      </div>
    {:else if viewMode === 'content-reader'}
      <!-- Content Reader — implements
           context-v/specs/Funder-Content-Corpus-Workflow.md Rules 5-8.
           Shows EVERY row of the active record set; per-card affordance
           depends on status (no-responses / invalid-url / not-found /
           has-content). Curated indexes (Rule 3) honored at pack layer;
           same-host + navigation (Rules 1+2) enforced in three layers. -->
      {#if !activeRecordSet}
        <p class="muted">
          Pick a specific record set in the scope chip row above to use
          Content Reader. (The "all sets" view mixes generations and
          isn't useful here.)
        </p>
      {:else}
        <p class="muted cr-summary">
          <strong>Client:</strong> {CLIENT_ID} ·
          <strong>{contentCounts.total}</strong> records in
          <strong>{activeRecordSet.name}</strong>:
          {contentCounts.has} with content ·
          {contentCounts.notFound} not_found ·
          {contentCounts.invalid} url-needs-repair ·
          {contentCounts.none} not yet fired
        </p>
        <div class="record-list cr-record-list">
          {#each contentRecords as cr (cr.row_id)}
            {@const corpusUrls = corpusUrlsForRow(cr.row_id)}
            {@const corpusEntries = corpusEntriesByRowId[cr.row_id] ?? []}
            {@const curUrl = currentRowUrl(cr.row_id)}
            {@const savedRecently = (urlSavedAt[cr.row_id] ?? 0) > Date.now() - 4000}
            {@const previews = previewsByRowId[cr.row_id] ?? []}
            {@const newPreviews = previews.filter((p) => !corpusUrls.has(p.exact_url))}
            {@const busy = previewBusyRowId === cr.row_id}
            {@const err = previewErrorByRowId[cr.row_id] ?? ''}
            {@const manualOpen = manualOpenRowId[cr.row_id] ?? false}
            {@const manualPreview = manualPreviewByRowId[cr.row_id]}
            {@const manualErr = manualErrorByRowId[cr.row_id] ?? ''}
            {@const manualBusy = manualBusyRowId === cr.row_id}
            <!-- `tone` + `direction`, zero override rungs. The first pass here
                 spent rung-4 `style=` on the invalid-URL boundary and a rung-0
                 `.cr-card` wrapper on the vertical stack; `tone="error"` and
                 `direction="column"` retired both. -->
            <CardRow
              direction="column"
              tone={cr.status.kind === 'invalid-url' ? 'error' : 'neutral'}
            >
              <header class="cr-header">
                <div class="cr-header-name">
                  <strong>{cr.entity_name || cr.row_id}</strong>
                  <span class="muted cr-meta">
                    {#if cr.status.kind === 'has-content'}
                      {cr.status.previewableCount} previewable
                      {#if corpusEntries.length > 0} · {corpusEntries.length} in corpus{/if}
                      {#if cr.status.lastFiredAt} · last fired {formatFiredAt(cr.status.lastFiredAt)}{/if}
                    {:else if cr.status.kind === 'invalid-url'}
                      <Chip size="sm" tone="error">url needs repair</Chip>
                    {:else if cr.status.kind === 'not-found'}
                      <Chip size="sm" tone="neutral">pack ran · no content found</Chip>
                    {:else}
                      <Chip size="sm" tone="neutral">not yet fired</Chip>
                    {/if}
                  </span>
                </div>
                {#if cr.status.kind === 'has-content'}
                  <Button
                    variant="primary"
                    onclick={() => void previewContentForRow(cr.row_id)}
                    disabled={busy || previewBusyRowId.length > 0}
                    title="Fetch markdown body for this record's content responses via Jina"
                  >
                    {#if busy}fetching…{:else}Preview content →{/if}
                  </Button>
                {/if}
              </header>

              <!-- Inline canonical-URL editor — always visible. The
                   operator should be able to repair a wrong URL from
                   here, not have to leave Content Reader for Records
                   Surface. Per Rule 4 of the goals spec. After save the
                   operator re-fires entity-blog from Pack Runner. -->
              <div class="cr-url-row">
                <label class="cr-url-label">
                  <span class="cr-url-label-text">Canonical URL</span>
                  <input
                    class="cr-url-input"
                    type="text"
                    placeholder="https://funder-domain.org"
                    bind:value={
                      () => urlDraftsByRowId[cr.row_id] ?? curUrl,
                      (v) => (urlDraftsByRowId = { ...urlDraftsByRowId, [cr.row_id]: v })
                    }
                    onkeydown={(e) => {
                      if (e.key === 'Enter') void saveRowUrl(cr.row_id);
                    }}
                  />
                </label>
                <Button
                  size="sm"
                  onclick={() => void saveRowUrl(cr.row_id)}
                  disabled={
                    urlSavingRowId === cr.row_id ||
                    (urlDraftsByRowId[cr.row_id] ?? curUrl).trim() === curUrl
                  }
                >
                  {#if urlSavingRowId === cr.row_id}
                    saving…
                  {:else if savedRecently}
                    ✓ saved
                  {:else}
                    save
                  {/if}
                </Button>
              </div>

              {#if cr.status.kind === 'invalid-url'}
                <p class="cr-fix-msg">
                  {cr.status.reason}<br />
                  Fix the <strong>Canonical URL</strong> above to the
                  funder's actual domain, then re-fire
                  <code>entity-blog</code> from Pack Runner.
                </p>
              {:else if cr.status.kind === 'not-found'}
                <p class="cr-empty-msg">
                  The pack ran but didn't find an index it could walk.
                  Try curating <code>official_updates_index_urls</code> on
                  this row via Records Surface, then re-fire.
                </p>
              {:else if cr.status.kind === 'no-responses'}
                <p class="cr-empty-msg">
                  No pack responses for this row yet. Fire
                  <code>entity-blog</code> from Pack Runner against this
                  record set to populate.
                </p>
              {/if}

              {#if err}
                <p class="cr-error">{err}</p>
              {/if}

              {#if corpusEntries.length > 0}
                <div class="cr-corpus-list" title="Items already in this record's corpus">
                  <span class="muted cr-corpus-list-label">In corpus:</span>
                  {#each corpusEntries as e (e.corpus_path)}
                    <span class="cr-corpus-chip" title={`${e.corpus_path}\n${e.exact_url}`}>
                      {e.title || e.exact_url}
                    </span>
                  {/each}
                </div>
              {/if}

              <!-- Manual URL add — operator pastes a URL they found via
                   their own search. Collapsed by default to keep cards
                   uncluttered; expands on click. Same-host (Rule 1) NOT
                   enforced for manual adds (Rule 5 / operator authority
                   trumps). See feedback memory: manual-corpus-bypasses-
                   same-host. -->
              <div class="cr-manual">
                <!-- Same shape, same two defects, and one more that only a LIST
                     surfaces: this disclosure renders once per corpus row, so a
                     hand-rolled aria-controls would have needed a per-row id to
                     stay document-unique. DisclosureRow mints one per instance,
                     which is the whole reason the id problem disappears here
                     rather than being solved N times.
                     NOTE: `title` lands on the component's wrapper div, not on
                     the button — DisclosureRow spreads {...rest} onto the outer
                     element. The tooltip still appears over the row; raised. -->
                <DisclosureRow
                  label="+ add URL manually"
                  open={manualOpen}
                  ontoggle={() => toggleManual(cr.row_id)}
                  title="Paste a URL you found via your own search — bypasses Rule 1 same-host filter"
                >
                  <div class="cr-manual-body">
                    <div class="cr-manual-input-row">
                      <input
                        class="cr-manual-input"
                        type="url"
                        placeholder="https://… (paste a URL from your own search)"
                        bind:value={
                          () => manualUrlDrafts[cr.row_id] ?? '',
                          (v) => (manualUrlDrafts = { ...manualUrlDrafts, [cr.row_id]: v })
                        }
                        onkeydown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void previewManualUrl(cr.row_id);
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        onclick={() => void previewManualUrl(cr.row_id)}
                        disabled={manualBusy || !(manualUrlDrafts[cr.row_id] ?? '').trim()}
                      >
                        {#if manualBusy}fetching…{:else}Preview ↓{/if}
                      </Button>
                    </div>
                    {#if manualErr}
                      <p class="cr-error">{manualErr}</p>
                    {/if}
                    {#if manualPreview}
                      {@const inCorpusAlready = corpusUrls.has(manualPreview.exact_url)}
                      {@const sameHost = (manualPreview.extra_metadata as { same_host?: boolean } | undefined)?.same_host}
                      {@const isPdf = (manualPreview.extra_metadata as { is_pdf?: boolean } | undefined)?.is_pdf === true}
                      {@const inboxBound = manualSaveToInboxByRowId[cr.row_id] === true}
                      <CardRow
                        density="compact"
                        direction="column"
                        tone={manualPreview.status === 'failed' ? 'error' : 'neutral'}
                      >
                        <div class="cr-preview-head">
                          <Chip size="sm" tone="neutral">manual</Chip>
                          {#if manualPreview.exact_url}
                            {@const host = (() => { try { return new URL(manualPreview.exact_url).hostname.replace(/^www\./, ''); } catch { return ''; } })()}
                            {#if host}<Chip size="sm" tone="neutral">{host}</Chip>{/if}
                          {/if}
                          {#if sameHost === false}
                            <Chip size="sm" tone="warn" title="URL is not on the funder's own domain — logged as-is per operator authority">off-domain</Chip>
                          {/if}
                          {#if isPdf}
                            <Chip size="sm" tone="info" title="The URL resolves to a PDF. If you toggle 'save to inbox' the binary will be downloaded alongside the markdown.">PDF</Chip>
                          {/if}
                          {#if manualPreview.fetched_at}
                            <span class="muted cr-fetched-at">fetched {formatFiredAt(manualPreview.fetched_at)}</span>
                          {/if}
                        </div>
                        {#if manualPreview.status === 'failed'}
                          <div class="cr-fail">
                            Jina fetch failed: {manualPreview.error ?? 'unknown error'}
                            {#if manualPreview.exact_url}
                              <ExternalLink class="cr-url" href={manualPreview.exact_url} noTruncate />
                            {/if}
                          </div>
                        {:else if inCorpusAlready}
                          <p class="muted cr-empty-msg">Already in corpus — pick a different URL.</p>
                        {:else}
                          <input
                            class="cr-title"
                            type="text"
                            bind:value={
                              () => titleDraftsByResponseId[manualPreview.response_id] ?? manualPreview.title ?? '',
                              (v) =>
                                (titleDraftsByResponseId = {
                                  ...titleDraftsByResponseId,
                                  [manualPreview.response_id]: v,
                                })
                            }
                            placeholder="Title"
                          />
                          {#if manualPreview.exact_url}
                            <ExternalLink class="cr-url" href={manualPreview.exact_url} noTruncate />
                          {/if}
                          {#if manualPreview.excerpt}
                            <p class="cr-excerpt">{manualPreview.excerpt}</p>
                          {/if}
                          <div class="cr-add-row">
                            <input
                              class="cr-tags"
                              type="text"
                              placeholder="tags, comma-separated"
                              bind:value={
                                () => tagDraftsByResponseId[manualPreview.response_id] ?? '',
                                (v) =>
                                  (tagDraftsByResponseId = {
                                    ...tagDraftsByResponseId,
                                    [manualPreview.response_id]: v,
                                  })
                              }
                            />
                            <Button
                              variant="primary"
                              size="sm"
                              onclick={() => void addManualToCorpus(cr)}
                              disabled={addingResponseId === manualPreview.response_id}
                              title={inboxBound
                                ? 'Write to clients/<client>/corpus/inbox/ for later triage' + (isPdf ? ' (PDF binary will be downloaded alongside)' : '')
                                : 'Write the Jina markdown as a corpus file'}
                            >
                              {#if addingResponseId === manualPreview.response_id}
                                adding…
                              {:else if inboxBound}
                                + send to inbox{#if isPdf} (with PDF){/if}
                              {:else}
                                + add to corpus
                              {/if}
                            </Button>
                          </div>
                          <!-- The tooltip goes through `labelProps` (the `...rest`
                               spread lands on the <input>, which would shrink the
                               hover surface to the 24px box). The wrapper survives
                               for ONE reason, measured: `.ui-selectcheck` declares
                               `font: inherit; color: inherit`, so it is designed to
                               take its type from an ANCESTOR. Move `.cr-inbox-toggle`
                               onto the component and it ties at (0,2,0) with the
                               component's own scoped rule and loses on source order —
                               the muted 12px becomes 13px body text. Only a parent
                               can say "this option is secondary". -->
                          <span class="cr-inbox-toggle">
                          <SelectCheck
                            label="Save to inbox instead of the per-funder corpus directory"
                            labelProps={{
                              title:
                                'Send to corpus/inbox/ for later triage instead of the per-funder corpus directory. Required for PDFs — only the inbox path downloads the binary today.',
                            }}
                            checked={inboxBound}
                            onchange={(v) => {
                              manualSaveToInboxByRowId = {
                                ...manualSaveToInboxByRowId,
                                [cr.row_id]: v,
                              };
                            }}
                          >
                            <span>save to inbox instead{#if isPdf} <em>(recommended for PDF — downloads the binary)</em>{/if}</span>
                          </SelectCheck>
                          </span>
                        {/if}
                      </CardRow>
                    {/if}
                  </div>
                </DisclosureRow>
              </div>

              {#if cr.status.kind === 'has-content'}
                {#if newPreviews.length > 0}
                  <ul class="cr-preview-list">
                    {#each newPreviews as p (p.response_id)}
                      <CardRow
                        as="li"
                        density="compact"
                        direction="column"
                        tone={p.status === 'failed' ? 'error' : 'neutral'}
                      >
                        <div class="cr-preview-head">
                          <Chip size="sm" tone="neutral">{p.pack_id ?? 'unknown'}</Chip>
                          {#if p.exact_url}
                            {@const host = (() => { try { return new URL(p.exact_url).hostname.replace(/^www\./, ''); } catch { return ''; } })()}
                            {#if host}<Chip size="sm" tone="neutral">{host}</Chip>{/if}
                          {/if}
                          {#if p.fetched_at}
                            <span class="muted cr-fetched-at">fetched {formatFiredAt(p.fetched_at)}</span>
                          {/if}
                        </div>
                        {#if p.status === 'failed'}
                          <div class="cr-fail">
                            Jina fetch failed: {p.error ?? 'unknown error'}
                            {#if p.exact_url}
                              <ExternalLink class="cr-url" href={p.exact_url} noTruncate />
                            {/if}
                          </div>
                        {:else}
                          <input
                            class="cr-title"
                            type="text"
                            bind:value={
                              () => titleDraftsByResponseId[p.response_id] ?? p.title ?? '',
                              (v) =>
                                (titleDraftsByResponseId = {
                                  ...titleDraftsByResponseId,
                                  [p.response_id]: v,
                                })
                            }
                            placeholder="Title"
                          />
                          {#if p.exact_url}
                            <ExternalLink class="cr-url" href={p.exact_url} noTruncate />
                          {/if}
                          {#if p.excerpt}
                            <p class="cr-excerpt">{p.excerpt}</p>
                          {/if}
                          <div class="cr-add-row">
                            <input
                              class="cr-tags"
                              type="text"
                              placeholder="tags, comma-separated"
                              bind:value={
                                () => tagDraftsByResponseId[p.response_id] ?? '',
                                (v) =>
                                  (tagDraftsByResponseId = {
                                    ...tagDraftsByResponseId,
                                    [p.response_id]: v,
                                  })
                              }
                            />
                            <Button
                              variant="primary"
                              size="sm"
                              onclick={() => void addToCorpus(cr, p)}
                              disabled={addingResponseId === p.response_id}
                              title="Write the Jina markdown as a corpus file"
                            >
                              {#if addingResponseId === p.response_id}adding…{:else}+ add to corpus{/if}
                            </Button>
                          </div>
                        {/if}
                      </CardRow>
                    {/each}
                  </ul>
                {:else if !busy && previews.length > 0}
                  <p class="muted cr-empty-msg">
                    All {previews.length} previews for this record are already
                    in the corpus.
                  </p>
                {:else if !busy}
                  <p class="muted cr-empty-msg">
                    Click <strong>Preview content</strong> to fetch the
                    body of this record's content responses.
                  </p>
                {/if}
              {/if}
            </CardRow>
          {/each}
        </div>
      {/if}
    {:else if current}
      <div class="stepper">
        <Button size="icon" aria-label="Previous response" onclick={() => step(-1)} disabled={index === 0}>◀</Button>
        <span>response {index + 1} / {filtered.length}</span>
        <Button size="icon" aria-label="Next response" onclick={() => step(1)} disabled={index >= filtered.length - 1}>▶</Button>
        {#if current.flag}<Chip size="sm" tone={flagTone(current.flag)}>{current.flag}</Chip>{/if}
        {#if current.accepted}<Chip size="sm" tone="ok">accepted</Chip>{/if}
        {#if current.pack_id}<Chip size="sm" tone="neutral" title="response produced by pack">{current.pack_id}</Chip>{/if}
        {#if isFound}
          <span class="stepper-sep" aria-hidden="true"></span>
          <span class="muted stepper-label">triage:</span>
          <div class="flags inline">
            {#each FLAGS as f (f)}
              <Button
                variant={current.flag === f ? 'primary' : 'secondary'}
                aria-pressed={current.flag === f}
                onclick={() => flag(f)}
              >{f}</Button>
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
              <!-- `as="li"` — the first pass here nested CardRow inside a bare
                   <li> because a <div> is not a legal child of <ul>. The prop
                   removes the wrapper level entirely. -->
              <CardRow as="li" density="compact">
                <ExternalLink class="link-url" href={link.url} label={linkLabel(link)} />
                {#if link.note}<span class="link-note">{link.note}</span>{/if}
                <span class="link-remove-slot">
                  <Button
                    variant="destructive"
                    size="icon"
                    onclick={() => void removeHelpfulLink(link.link_id)}
                    aria-label="remove link"
                    title="Remove this link"
                  >×</Button>
                </span>
              </CardRow>
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
            <div>
              <Button variant="primary" type="submit" disabled={addingLink || !newLinkUrl.trim()}>
                {addingLink ? 'saving…' : '+ add link'}
              </Button>
            </div>
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
                <ExternalLink class="candidate-url" href={current.structured.url} noTruncate />
                <span class="candidate-name">{current.structured.display_name}</span>
                {#if current.pack_id}
                  <Chip size="sm" tone="neutral" title="produced by this pack">{current.pack_id}</Chip>
                {/if}
              </div>
              {#if current.structured.snippet}
                <!-- The shared disclosure. What it replaced got two things wrong,
                     neither of them visible:
                       - the ▾ / ▸ was TEXT in the button, so the accessible name
                         was "▸ snippet" — a glyph a screen reader cannot
                         pronounce, encoding a second time the state that
                         aria-expanded already carries reliably.
                       - no aria-controls, and .candidate-snippet had no id, so
                         the announced state named no region.
                     DisclosureRow owns the panel, so aria-controls can only ever
                     point at an element that is in the document, and the chevron
                     is an aria-hidden SVG that rotates rather than a glyph swap. -->
                <DisclosureRow
                  label="snippet"
                  open={snippetExpanded}
                  ontoggle={(o) => (snippetExpanded = o)}
                >
                  <p class="candidate-snippet">{current.structured.snippet}</p>
                </DisclosureRow>
              {/if}
            </div>
          {/if}

          {#if isFound}
            <h3>
              Response — editable; edits autosave when you click away or step
              <!-- rung 0 — the slot carries the heading offset AND resets the
                   two inherited properties `.resp-app h3` imposes on everything
                   inside it (uppercase + letter-spacing). Chip declares neither,
                   so this adjusts nothing the component owns. The bare-element
                   h3 selector itself is raised, not fixed, here. -->
              {#if savingEdit || editDirty || editSavedAt}
                <span class="save-state-slot">
                  <Chip
                    size="sm"
                    tone={savingEdit ? 'info' : editDirty ? 'warn' : 'ok'}
                  >
                    {#if savingEdit}saving…
                    {:else if editDirty}unsaved
                    {:else}saved {formatAge(editSavedAt)}
                    {/if}
                  </Chip>
                </span>
              {/if}
            </h3>
            <textarea
              bind:value={editText}
              rows="16"
              oninput={onEditInput}
              onblur={() => void flushEdit()}
            ></textarea>

            <div class="actions icon-row">
              <Button
                variant="primary"
                size="icon"
                onclick={accept}
                data-tip="Accept whole response → cell"
                aria-label="Accept whole response and write to row cell"
              >✓</Button>
              <Button
                size="icon"
                onclick={rerun}
                data-tip="Re-run this row in Request Reviewer"
                aria-label="Re-run in Request Reviewer"
              >↻</Button>
              <Button
                size="icon"
                disabled
                data-tip="Distill in Highlight Collector — a future stage"
                aria-label="Distill in Highlight Collector"
              >✦</Button>
              <Button
                variant="destructive"
                size="icon"
                onclick={() => void deleteCurrent()}
                data-tip="Delete this response"
                aria-label="Delete this response"
              >🗑</Button>
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
              <Button
                disabled
                data-tip="Retry coming in a later feature"
                aria-label="Retry — coming in a later feature"
              >↻ retry</Button>
              <Button
                variant="destructive"
                size="icon"
                onclick={() => void deleteCurrent()}
                data-tip="Delete this response"
                aria-label="Delete this response"
              >🗑</Button>
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
