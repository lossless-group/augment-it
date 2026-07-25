<script lang="ts">
  // The people reveal — spec steps 6–7. A collapsible section on the org
  // card listing every person RELATEd to this org (relevance-sorted
  // server-side by organization.affiliations), each row expanding to a
  // PersonCard, with AddPersonInline in the footer. Refetches on its own
  // writes and on any person-shaped augment-it:entity-updated (e.g. a link
  // added from the search-and-add rail).

  import { onMount } from 'svelte';
  import PersonCard from './PersonCard.svelte';
  import AddPersonInline from './AddPersonInline.svelte';
  import { fetchOrgAffiliations } from './lib/org-client';
  import { submitCrawl } from './lib/search-queue';
  import type { AffiliatedPerson } from './lib/types';

  let {
    org_slug,
    orgName,
    client,
  }: {
    org_slug: string;
    orgName: string;
    client: string;
  } = $props();

  let open = $state(false);
  let people = $state<AffiliatedPerson[]>([]);
  let loaded = $state(false);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let expanded = $state<string | null>(null); // person_uuid

  // didi's team crawl — enqueued as an async job; candidates land as a card
  // in the search-results rail (staging + accept gates live there now, per
  // the Search-Results-Queue-Remote spec). The transient note is the only
  // local feedback the door needs.
  let queued = $state(false);
  let crawlError = $state<string | null>(null);

  async function crawl() {
    crawlError = null;
    try {
      await submitCrawl({ org_slug, display_name: orgName, target: 'team', client });
      queued = true;
      setTimeout(() => (queued = false), 5_000);
    } catch (err) {
      crawlError = err instanceof Error ? err.message : String(err);
    }
  }

  async function load() {
    loading = true;
    error = null;
    try {
      people = await fetchOrgAffiliations(org_slug, client);
      loaded = true;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  }

  function toggle() {
    open = !open;
    if (open && !loaded) void load();
  }

  function onEntityUpdated(e: Event) {
    const detail = (e as CustomEvent).detail as { person_uuid?: string; org_slug?: string } | undefined;
    if (!loaded) return;
    if (detail?.person_uuid && people.some((p) => p.person_uuid === detail.person_uuid)) {
      void load();
      return;
    }
    // Org-shaped events cover the search rail's team accepts (TeamAccept
    // writes person + affiliation, then broadcasts with the org_slug).
    if (detail?.org_slug && detail.org_slug === org_slug) void load();
  }

  // A new org card means fresh people — reset and lazy-load on next reveal.
  $effect(() => {
    void org_slug;
    people = [];
    loaded = false;
    expanded = null;
    crawlError = null;
    if (open) void load();
  });

  onMount(() => {
    window.addEventListener('augment-it:entity-updated', onEntityUpdated);
    return () => window.removeEventListener('augment-it:entity-updated', onEntityUpdated);
  });
</script>

<section class="ow-people">
  <header class="ow-list-head">
    <h3 class="ow-list-title">
      <button type="button" class="ow-people-toggle" onclick={toggle}>
        {open ? '▾' : '▸'} People{#if loaded}&nbsp;<span class="ow-list-count">{people.length}</span>{/if}
      </button>
    </h3>
    <span class="ow-list-actions">
      <button
        type="button"
        class="ow-plus"
        title="didi: crawl the web for relevant team members (selection per the relevance brief) — lands in the search queue"
        onclick={crawl}
      >
        🤖
      </button>
    </span>
  </header>
  {#if queued}<p class="ow-empty">team search queued — it lands in the 🔎 search rail when done; keep working</p>{/if}
  {#if crawlError}<div class="ow-error">{crawlError}</div>{/if}

  {#if open}
    {#if loading}
      <p class="ow-empty">loading people…</p>
    {:else if error}
      <div class="ow-error">{error}</div>
    {:else}
      {#if people.length === 0}
        <p class="ow-empty">no affiliated people yet</p>
      {:else}
        <ul class="ow-people-list">
          {#each people as p (p.person_uuid)}
            <li class="ow-person">
              <button
                type="button"
                class="ow-person-row"
                onclick={() => (expanded = expanded === p.person_uuid ? null : p.person_uuid)}
              >
                <span class="ow-person-name">{p.name ?? p.person_uuid}</span>
                {#if p.role}<span class="ow-person-role">{p.role}</span>{/if}
                {#if p.relevance}<span class="ow-person-relevance">{p.relevance}</span>{/if}
                <span class="ow-person-meta">
                  {p.personal_links.length} link{p.personal_links.length === 1 ? '' : 's'} ·
                  {p.personal_corpus_count} corpus
                </span>
              </button>
              {#if expanded === p.person_uuid}
                <PersonCard person={p} {org_slug} {orgName} {client} onchanged={load} />
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
      <AddPersonInline {org_slug} {orgName} {client} onadded={load} />
    {/if}
  {/if}
</section>
