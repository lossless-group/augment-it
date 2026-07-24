<script lang="ts">
  // org-workbench — the first surface of the "Augment from DB" flow. Start
  // from a canonical SurrealDB organization: smart-search to it, then work
  // its card (identity/social links, pulse streams, corpus items) with an
  // additive ➕ on every list. Credential-free (spec D1) — everything rides
  // workspace.invoke. Client-derivation + workspace-changed handling copied
  // from person-db-resolver. See context-v/specs/Augment-From-DB-Flow.md.

  import { onMount } from 'svelte';
  import { workspace } from '@augment-it/workspace';
  import OrgSearch from './OrgSearch.svelte';
  import OrgCard from './OrgCard.svelte';
  import OrgCreateInline from './OrgCreateInline.svelte';
  import { fetchOrgDetail } from './lib/org-client';
  import type { OrgDetail, OrgSuggestion } from './lib/types';

  const TOKEN_KEY = 'augment-it:session-token';
  const WS_URL = 'ws://localhost:3001/ws';
  // Restore the last-worked org on remount (HMR, flow switch, tab reopen).
  const ACTIVE_ORG_KEY = 'augment-it:org-workbench:active-org';

  let status = $state<'connecting' | 'open' | 'closed' | 'error'>('connecting');
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
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      org = null;
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
      <OrgSearch {client} onpick={onPick} onquery={(q) => (searchQuery = q)} />
      <button
        type="button"
        class="ow-add-go"
        title="Create an organization (gated — existing matches shown first)"
        onclick={() => (creating = !creating)}
      >
        {creating ? '×' : '+ New organization'}
      </button>
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

  <main class="ow-body">
    {#if loading}
      <p class="ow-loading">loading…</p>
    {:else if error}
      <div class="ow-error">{error}</div>
    {:else if org}
      <OrgCard {org} {client} onchanged={refetch} />
    {:else}
      <p class="ow-empty-state">
        Search for an organization above to open its card — links, pulse streams, corpus items,
        and (soon) its people.
      </p>
    {/if}
  </main>
</div>
