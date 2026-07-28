<script lang="ts">
  // One affiliated person, expanded — the nested view of spec step 7:
  // identity links and corpus items each as a full AdditiveList (➕ →
  // person.links.add / person.corpus.add, 🔍 → person-shaped search
  // envelope). Every write dispatches augment-it:entity-updated
  // { person_uuid } so the reveal refetches.

  import AdditiveList from './AdditiveList.svelte';
  import AddAffiliationInline from './AddAffiliationInline.svelte';
  import {
    addPersonLink,
    addPersonCorpus,
    removePersonLink,
    removePersonCorpus,
    unaffiliatePerson,
  } from './lib/org-client';
  import { requestSearch } from './lib/search-request';
  import type { AffiliatedPerson, ShapedLink } from './lib/types';

  let {
    person,
    org_slug,
    orgName,
    client,
    onchanged,
  }: {
    person: AffiliatedPerson;
    org_slug: string;
    orgName: string;
    client: string;
    onchanged: () => void;
  } = $props();

  const displayName = $derived(person.name ?? person.person_uuid);

  // A bio page on another org's site is an affiliation signal, not just an
  // identity link — the "→ affiliation" row action opens the promotion gate.
  let promoteEntry = $state<ShapedLink | null>(null);
  // The manual re-affiliation door — same gate, no seeding entry (the
  // misfiled-person case: detach here, attach to the right org).
  let affiliating = $state(false);

  // Detach this person from THIS org — the edge only; the person and their
  // history stay. Inline confirm, then the reveal's refetch drops the row.
  let confirmDetach = $state(false);
  let detachBusy = $state(false);
  let detachError = $state<string | null>(null);
  async function detach() {
    detachBusy = true;
    detachError = null;
    try {
      await unaffiliatePerson({ person_uuid: person.person_uuid, org_slug, client });
      window.dispatchEvent(
        new CustomEvent('augment-it:entity-updated', { detail: { org_slug } }),
      );
      onchanged();
    } catch (err) {
      detachError = err instanceof Error ? err.message : String(err);
    } finally {
      detachBusy = false;
      confirmDetach = false;
    }
  }

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

  // × — the person-side correction affordance (spec: Entity-Card-Edit-And-
  // Remove-Affordances). Person entries get removes in v1; kind edits stay
  // org-side for now.
  function makeRemove(fn: (args: { person_uuid: string; url: string; client: string }) => Promise<void>) {
    return async (entry: ShapedLink) => {
      await fn({ person_uuid: person.person_uuid, url: entry.url, client });
      bump();
    };
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
  {#if person.agent_search_rationale && person.agent_search_rationale !== person.headline}
    <p class="ow-person-headline" title="didi's rationale from the team crawl that surfaced this person">
      🤖 {person.agent_search_rationale}
    </p>
  {/if}

  <p class="ow-affiliation-row">
    <span class="ow-gate-note ow-affiliation-label">
      {person.role ?? 'affiliated'} at <strong>{orgName}</strong>
    </span>
    {#if confirmDetach}
      <span class="ow-remove-confirm">
        remove this affiliation? <em class="ow-remove-note">the person and their history stay</em>
        <button type="button" class="ow-add-go ow-remove-yes" disabled={detachBusy} onclick={detach}>
          {detachBusy ? '…' : 'yes'}
        </button>
        <button type="button" class="ow-add-go" disabled={detachBusy} onclick={() => (confirmDetach = false)}>
          keep
        </button>
      </span>
    {:else}
      <button
        type="button"
        class="ow-entry-action ow-micro"
        title="remove {displayName}'s affiliation with {orgName}"
        onclick={() => (confirmDetach = true)}
      >×</button>
    {/if}
    <button
      type="button"
      class="ow-entry-action"
      title="affiliate {displayName} with another organization"
      onclick={() => (affiliating = !affiliating)}
    >
      {affiliating ? '× cancel' : '+ other org'}
    </button>
  </p>
  {#if detachError}<div class="ow-error">{detachError}</div>{/if}

  {#if affiliating}
    <AddAffiliationInline
      person_uuid={person.person_uuid}
      personName={displayName}
      {client}
      onadded={() => {
        affiliating = false;
        bump();
      }}
      oncancel={() => (affiliating = false)}
    />
  {/if}

  <AdditiveList
    title="Identity & social links"
    entries={person.personal_links}
    kindHint="kind (auto: linkedin/x/…)"
    onadd={addLink}
    onremove={makeRemove(removePersonLink)}
    onsearch={searchFor('links', `"${displayName}" LinkedIn`)}
    entryaction={{ label: '→ affiliation', fn: (entry) => (promoteEntry = entry) }}
  />

  {#if promoteEntry}
    <AddAffiliationInline
      person_uuid={person.person_uuid}
      personName={displayName}
      entry={promoteEntry}
      {client}
      onadded={() => {
        promoteEntry = null;
        bump();
      }}
      oncancel={() => (promoteEntry = null)}
    />
  {/if}

  <AdditiveList
    title="Corpus items"
    entries={person.personal_corpus}
    kindHint="kind (auto-detected from URL)"
    onadd={addCorpus}
    onremove={makeRemove(removePersonCorpus)}
    onsearch={searchFor('corpus', `"${displayName}" interview OR profile`)}
  />
</div>
