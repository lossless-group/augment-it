<script lang="ts">
  // One affiliated person, expanded — the nested view of spec step 7:
  // identity links and corpus items each as a full AdditiveList (➕ →
  // person.links.add / person.corpus.add, 🔍 → person-shaped search
  // envelope). Every write dispatches augment-it:entity-updated
  // { person_uuid } so the reveal refetches.

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

  async function addCorpus(url: string, kind?: string) {
    await addPersonCorpus({ person_uuid: person.person_uuid, url, kind, client });
    bump();
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

  <AdditiveList
    title="Corpus items"
    entries={person.personal_corpus}
    kindHint="kind (auto-detected from URL)"
    onadd={addCorpus}
    onsearch={searchFor('corpus', `"${displayName}" interview OR profile`)}
  />
</div>
