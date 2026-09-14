<script lang="ts">
  // The people reveal — spec steps 6–7. A collapsible section on the org
  // card listing every person RELATEd to this org (relevance-sorted
  // server-side by organization.affiliations), each row expanding to a
  // PersonCard, with AddPersonInline in the footer. Refetches on its own
  // writes and on any person-shaped augment-it:entity-updated (e.g. a link
  // added from the search-and-add rail).

  import { onMount } from 'svelte';
  import Button from '@augment-it/shared-ui/Button.svelte';
  import Chip from '@augment-it/shared-ui/Chip.svelte';
  import CardRow from '@augment-it/shared-ui/CardRow.svelte';
  import DisclosureRow from '@augment-it/shared-ui/DisclosureRow.svelte';
  import ListContainer from '@augment-it/shared-ui/ListContainer.svelte';
  import SelectWrapperClickBody from '@augment-it/shared-ui/SelectWrapper--ClickBody.svelte';
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
  <!-- The section header is a DISCLOSURE, and is now the shared one. What it
       replaced got three things wrong, none of them visible:
         - aria-controls="ow-people-list" was UNCONDITIONAL, while the element
           carrying that id lives inside {#if open} AND inside a further
           {#if people.length}. Collapsed — and open-but-empty — it pointed a
           screen reader at nothing.
         - the ▾ / ▸ glyph sat inside the button's text, so the accessible
           name was "▾ People 2". The component's chevron is aria-hidden.
         - no target-size floor of its own; it inherited whatever Button gave it.
       DisclosureRow owns the panel, so aria-controls can only ever name an
       element that is in the document. -->
  <DisclosureRow
    label="People"
    hint={loaded ? String(people.length) : undefined}
    {open}
    ontoggle={toggle}
  >
    {#if loading}
      <p class="ow-empty">loading people…</p>
    {:else if error}
      <div class="ow-error">{error}</div>
    {:else}
      {#if people.length === 0}
        <p class="ow-empty">no affiliated people yet</p>
      {:else}
        <ListContainer as="ul" gap="sm" label="Affiliated people">
          {#each people as p (p.person_uuid)}
            <li class="ow-person">
              <CardRow density="compact" selected={expanded === p.person_uuid}>
                <!-- RAISED, NOT CHASED — a card row that DISCLOSES has no organ.
                     This row used to pass aria-expanded into SelectWrapper--ClickBody,
                     which hard-renders aria-pressed BEFORE its {...rest}. The button
                     therefore announced a toggle-button contract AND a disclosure
                     contract at once, which is exactly the error DisclosureRow's own
                     header names. The contradiction is removed here; the organ is not
                     invented here. DisclosureRow is explicitly NOT-A-CARDROW (its
                     header: wrapping it in one negates four of CardRow's five
                     properties), and this row genuinely wants the card chrome, so
                     neither primitive fits. Reported to the VP of Eng. -->
                <SelectWrapperClickBody
                  label={p.name ?? p.person_uuid}
                  selected={expanded === p.person_uuid}
                  onselect={() => (expanded = expanded === p.person_uuid ? null : p.person_uuid)}
                >
                  <!-- rung 0: CardRow is align-items:flex-start at (0,2,0); this
                       row reads on a shared baseline, so the member owns it. -->
                  <span class="ow-person-line">
                    <span class="ow-person-name">{p.name ?? p.person_uuid}</span>
                    {#if p.role}<span class="ow-person-role">{p.role}</span>{/if}
                    {#if p.relevance}<Chip size="sm" class="ow-person-relevance">{p.relevance}</Chip>{/if}
                    <span class="ow-person-meta">
                      {p.personal_links.length} link{p.personal_links.length === 1 ? '' : 's'} ·
                      {p.personal_corpus_count} corpus
                    </span>
                  </span>
                </SelectWrapperClickBody>
              </CardRow>
              {#if expanded === p.person_uuid}
                <PersonCard person={p} {org_slug} {orgName} {client} onchanged={load} />
              {/if}
            </li>
          {/each}
        </ListContainer>
      {/if}
      <AddPersonInline {org_slug} {orgName} {client} onadded={load} />
    {/if}
  </DisclosureRow>

  <!-- rung 0 — placement is the section's job. The crawl door has to stay
       reachable while the section is collapsed, and DisclosureRow owns the whole
       header row, so the section positions this over the row's trailing edge. -->
  <span class="ow-list-actions ow-people-actions">
    <Button
      variant="outline"
      size="icon"
      aria-label="didi: crawl the web for relevant team members"
      title="didi: crawl the web for relevant team members (selection per the relevance brief) — lands in the search queue"
      onclick={crawl}
    >
      🤖
    </Button>
  </span>

  {#if queued}<p class="ow-empty">team search queued — it lands in the 🔎 search rail when done; keep working</p>{/if}
  {#if crawlError}<div class="ow-error">{crawlError}</div>{/if}
</section>
