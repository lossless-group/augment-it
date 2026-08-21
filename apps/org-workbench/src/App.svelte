<script lang="ts">
  // org-workbench — the first surface of the "Augment from DB" flow. Start
  // from a canonical SurrealDB organization: smart-search to it, then work
  // its card (identity/social links, pulse streams, corpus items) with an
  // additive ➕ on every list. Credential-free (spec D1) — everything rides
  // workspace.invoke. Client-derivation + workspace-changed handling copied
  // from person-db-resolver. See context-v/specs/Augment-From-DB-Flow.md.

  import { onMount } from 'svelte';
  import { workspace, resolveWsUrl } from '@augment-it/workspace';
  import OrgSearch from './OrgSearch.svelte';
  import OrgCard from './OrgCard.svelte';
  import OrgCreateInline from './OrgCreateInline.svelte';
  import OrgRoster from './OrgRoster.svelte';
  import BriefPanel from './BriefPanel.svelte';
  import { fetchOrgDetail } from './lib/org-client';
  import type { OrgDetail, OrgSuggestion } from './lib/types';

  const TOKEN_KEY = 'augment-it:session-token';
  const WS_URL = resolveWsUrl();
  // Restore the last-worked org on remount (HMR, flow switch, tab reopen).
  const ACTIVE_ORG_KEY = 'augment-it:org-workbench:active-org';
  // Cross-remote focused-entity broadcast — the chat rail includes it in
  // every chat_turn so didi knows what "this org" means. Event + localStorage
  // (the search-envelope race-hardening pattern, spec D2).
  const ACTIVE_ENTITY_KEY = 'augment-it:active-entity';

  function broadcastActiveEntity(
    detail: { type: 'organization'; org_slug: string; display_name?: string } | null,
  ) {
    if (typeof localStorage !== 'undefined') {
      if (detail) localStorage.setItem(ACTIVE_ENTITY_KEY, JSON.stringify(detail));
      else localStorage.removeItem(ACTIVE_ENTITY_KEY);
    }
    window.dispatchEvent(new CustomEvent('augment-it:active-entity', { detail }));
  }

  let status = $state<'connecting' | 'open' | 'closed' | 'error' | 'auth_required'>('connecting');
  let client = $state<string>('reach-edu');

  let org = $state<OrgDetail | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);

  async function loadOrg(org_slug: string) {
    loading = true;
    error = null;
    try {
      org = await fetchOrgDetail(org_slug, client);
      if (typeof localStorage !== 'undefined') localStorage.setItem(ACTIVE_ORG_KEY, org_slug);
      broadcastActiveEntity({
        type: 'organization',
        org_slug: org.slug,
        display_name: org.complete_name ?? org.conventional_name ?? org.slug,
      });
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      org = null;
      broadcastActiveEntity(null);
    } finally {
      loading = false;
    }
  }

  function onPick(s: OrgSuggestion) {
    void loadOrg(s.slug);
  }

  // Gated org creation (issue #29) — the ➕ opens OrgCreateInline; both a
  // picked candidate and a fresh create land in the same loadOrg. The form
  // seeds from whatever was searched — no-results is the create path.
  let creating = $state(false);
  let searchQuery = $state('');

  // Roster responsiveness (gh #38): in a narrow tiling pane the roster's
  // 300px is unaffordable — auto-hide below the threshold, with a manual
  // ◀/▶ toggle that overrides the auto behavior in either direction.
  const ROSTER_AUTO_HIDE_PX = 860;
  let columnsWidth = $state(0);
  let rosterManual = $state<boolean | null>(null);
  const rosterVisible = $derived(
    rosterManual ?? !(columnsWidth > 0 && columnsWidth < ROSTER_AUTO_HIDE_PX),
  );

  function onCreateOpen(org_slug: string) {
    creating = false;
    void loadOrg(org_slug);
  }

  function refetch() {
    if (org) void loadOrg(org.slug);
  }

  function onEntityUpdated(e: Event) {
    const detail = (e as CustomEvent).detail as { org_slug?: string } | undefined;
    if (detail?.org_slug && org && detail.org_slug === org.slug) refetch();
  }

  function onWorkspaceChanged(e: Event) {
    const detail = (e as CustomEvent).detail as { client_id?: string } | undefined;
    if (detail?.client_id) client = detail.client_id;
    else void loadActiveClient();
    // A different client sees a different slice of the canonical layer —
    // drop the card rather than show rows the new client may not access.
    org = null;
    broadcastActiveEntity(null);
  }

  async function loadActiveClient() {
    try {
      const r = (await workspace.invoke('workspace.active', {})) as { active_client_id?: string };
      if (r?.active_client_id) client = r.active_client_id;
    } catch {
      /* keep default */
    }
  }

  onMount(() => {
    workspace.connect({
      url: WS_URL,
      getToken: () => localStorage.getItem(TOKEN_KEY),
      saveToken: (t) => localStorage.setItem(TOKEN_KEY, t),
      onStatus: (s) => (status = s),
    });
    void (async () => {
      await loadActiveClient();
      const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(ACTIVE_ORG_KEY) : null;
      if (stored) void loadOrg(stored);
    })();
    window.addEventListener('augment-it:workspace-changed', onWorkspaceChanged);
    window.addEventListener('augment-it:entity-updated', onEntityUpdated);
    return () => {
      window.removeEventListener('augment-it:workspace-changed', onWorkspaceChanged);
      window.removeEventListener('augment-it:entity-updated', onEntityUpdated);
    };
  });
</script>

<div class="ow-app">
  <header class="ow-header">
    <div class="ow-title-row">
      <h1 class="ow-title">Org Workbench</h1>
      <span class="ow-source">SurrealDB · Organizations</span>
      <span class="ow-client">client: <strong>{client}</strong></span>
      <span class="ow-ws status-{status}">{status}</span>
    </div>
    <div class="ow-search-row">
      <button
        type="button"
        class="ow-add-go"
        title={rosterVisible ? 'Hide the org roster' : 'Show the org roster'}
        onclick={() => (rosterManual = !rosterVisible)}
      >
        {rosterVisible ? '◀ orgs' : '▶ orgs'}
      </button>
      <OrgSearch {client} onpick={onPick} onquery={(q) => (searchQuery = q)} />
      <button
        type="button"
        class="ow-add-go"
        title="Create an organization (gated — existing matches shown first)"
        onclick={() => (creating = !creating)}
      >
        {creating ? '×' : '+ New organization'}
      </button>
      <BriefPanel {client} />
    </div>
    {#if creating}
      <OrgCreateInline
        {client}
        initialName={searchQuery}
        onopen={onCreateOpen}
        oncancel={() => (creating = false)}
      />
    {/if}
  </header>

  <div class="ow-columns" bind:clientWidth={columnsWidth}>
    {#if status === 'open' && rosterVisible}
      <OrgRoster {client} activeSlug={org?.slug ?? null} onpick={(slug) => void loadOrg(slug)} />
    {/if}
    <main class="ow-body">
      {#if loading}
        <p class="ow-loading">loading…</p>
      {:else if error}
        <div class="ow-error">{error}</div>
      {:else if org}
        <OrgCard {org} {client} onchanged={refetch} onopen={(slug) => void loadOrg(slug)} />
      {:else}
        <p class="ow-empty-state">
          Pick an organization from the coverage roster on the left (fewest corpus items first),
          or search above — the card shows links, pulse streams, corpus items, and people.
        </p>
      {/if}
    </main>
  </div>
</div>
