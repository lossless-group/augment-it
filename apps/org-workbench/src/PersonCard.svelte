<script lang="ts">
  // One affiliated person, expanded — the nested view of spec step 7:
  // identity links as a full AdditiveList (➕ → person.links.add, 🔍 →
  // person-shaped search envelope), corpus as count + ➕ + 🔍 (entries ride
  // affiliation.detail in a later pass — organization.affiliations carries
  // the count only, by Phase 1 contract). Every write dispatches
  // augment-it:entity-updated { person_uuid } so the reveal refetches.

  import AdditiveList from './AdditiveList.svelte';
  import { addPersonLink, addPersonCorpus } from './lib/org-client';
  import { requestSearch } from './lib/search-request';
  import type { AffiliatedPerson } from './lib/types';

  let {
    person,
    client,
    onchanged,
  }: {
    person: AffiliatedPerson;
    client: string;
    onchanged: () => void;
  } = $props();

  let corpusOpen = $state(false);
  let corpusUrl = $state('');
  let corpusBusy = $state(false);
  let corpusError = $state<string | null>(null);

  const displayName = $derived(person.name ?? person.person_uuid);

  function bump() {
    onchanged();
    window.dispatchEvent(
      new CustomEvent('augment-it:entity-updated', { detail: { person_uuid: person.person_uuid } }),
    );
  }

  async function addLink(url: string, kind?: string) {
    await addPersonLink({ person_uuid: person.person_uuid, url, kind, client });
    bump();
  }

  async function addCorpus(e: SubmitEvent) {
    e.preventDefault();
    const trimmed = corpusUrl.trim();
    if (!trimmed) return;
    corpusBusy = true;
    corpusError = null;
    try {
      await addPersonCorpus({ person_uuid: person.person_uuid, url: trimmed, client });
      corpusUrl = '';
      corpusOpen = false;
      bump();
    } catch (err) {
      corpusError = err instanceof Error ? err.message : String(err);
    } finally {
      corpusBusy = false;
    }
  }

  function searchFor(target: 'links' | 'corpus', seed: string) {
    return () =>
      requestSearch({
        entity: { type: 'person', person_uuid: person.person_uuid, display_name: displayName },
        target,
        seed_term: seed,
      });
  }
</script>

<div class="ow-person-card">
  {#if person.headline}<p class="ow-person-headline">{person.headline}</p>{/if}

  <AdditiveList
    title="Identity & social links"
    entries={person.personal_links}
    kindHint="kind (auto: linkedin/x/…)"
    onadd={addLink}
    onsearch={searchFor('links', `"${displayName}" LinkedIn`)}
  />

  <section class="ow-list">
    <header class="ow-list-head">
      <h3 class="ow-list-title">
        Corpus items <span class="ow-list-count">{person.personal_corpus_count}</span>
      </h3>
      <span class="ow-list-actions">
        <button
          type="button"
          class="ow-plus"
          title="Search the web for corpus items"
          onclick={searchFor('corpus', `"${displayName}" interview OR profile`)}
        >
          🔍
        </button>
        <button type="button" class="ow-plus" title="Add a corpus item" onclick={() => (corpusOpen = !corpusOpen)}>
          {corpusOpen ? '×' : '+'}
        </button>
      </span>
    </header>
    {#if corpusOpen}
      <form class="ow-add" onsubmit={addCorpus}>
        <input class="ow-add-url" type="url" placeholder="https://…" bind:value={corpusUrl} required disabled={corpusBusy} />
        <button type="submit" class="ow-add-go" disabled={corpusBusy}>{corpusBusy ? '…' : 'Add'}</button>
      </form>
      {#if corpusError}<div class="ow-error">{corpusError}</div>{/if}
    {/if}
  </section>
</div>
