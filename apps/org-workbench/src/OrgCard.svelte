<script lang="ts">
  // The org card — one screen that views AND edits in place (the
  // Augment-From-Affiliations operator ruling: no "two loops, two apps").
  // Identity block up top, then the three additive lists. Every successful
  // add triggers the parent's refetch so the card always shows DB truth,
  // never an optimistic guess.

  import AdditiveList from './AdditiveList.svelte';
  import PeopleReveal from './PeopleReveal.svelte';
  import { addOrgLink, addOrgStream, addOrgCorpus } from './lib/org-client';
  import { requestSearch } from './lib/search-request';
  import type { OrgDetail, SearchRequestDetail } from './lib/types';

  let {
    org,
    client,
    onchanged,
  }: {
    org: OrgDetail;
    client: string;
    onchanged: () => void;
  } = $props();

  function makeAdd(fn: (args: { org_slug: string; url: string; kind?: string; client: string }) => Promise<unknown>) {
    return async (url: string, kind?: string) => {
      await fn({ org_slug: org.slug, url, kind, client });
      onchanged();
      window.dispatchEvent(
        new CustomEvent('augment-it:entity-updated', { detail: { org_slug: org.slug } }),
      );
    };
  }

  // 🔍 — launch search-and-add pre-scoped to this org + list. Seed terms are
  // hardcoded v1 (spec open question: pack-template convergence later); the
  // operator rewrites them freely in the TermBar anyway — that's the point.
  const displayName = $derived(org.complete_name ?? org.conventional_name ?? org.slug);
  function makeSearch(target: SearchRequestDetail['target'], seed: (name: string) => string) {
    return () =>
      requestSearch({
        entity: { type: 'organization', org_slug: org.slug, display_name: displayName },
        target,
        seed_term: seed(displayName),
      });
  }
</script>

<article class="ow-card">
  <header class="ow-card-head">
    <h2 class="ow-card-name">{org.complete_name ?? org.conventional_name ?? org.slug}</h2>
    <code class="ow-card-slug">{org.slug}</code>
  </header>

  <dl class="ow-identity">
    {#if org.conventional_name && org.conventional_name !== org.complete_name}
      <dt>Known as</dt>
      <dd>{org.conventional_name}</dd>
    {/if}
    {#if org.aliases.length > 0}
      <dt>Aliases</dt>
      <dd>{org.aliases.join(' · ')}</dd>
    {/if}
    {#if org.domains.length > 0}
      <dt>Domains</dt>
      <dd>{org.domains.map((d) => d.domain).filter(Boolean).join(' · ')}</dd>
    {/if}
  </dl>

  <div class="ow-lists">
    <AdditiveList
      title="Identity & social links"
      entries={org.org_links}
      kindHint="kind (auto: website/linkedin/x/…)"
      onadd={makeAdd(addOrgLink)}
      onsearch={makeSearch('links', (n) => `"${n}" LinkedIn`)}
    />
    <AdditiveList
      title="Pulse streams"
      entries={org.media_streams}
      kindHint="kind (auto: blog_index/rss/newsroom/…)"
      onadd={makeAdd(addOrgStream)}
      onsearch={makeSearch('streams', (n) => `"${n}" blog`)}
    />
    <AdditiveList
      title="Corpus items"
      entries={org.org_corpus}
      kindHint="kind (optional)"
      onadd={makeAdd(addOrgCorpus)}
      onsearch={makeSearch('corpus', (n) => `"${n}" news`)}
    />

    <PeopleReveal org_slug={org.slug} orgName={displayName} {client} />
  </div>
</article>
