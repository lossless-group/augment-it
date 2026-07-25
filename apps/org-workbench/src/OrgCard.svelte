<script lang="ts">
  // The org card — one screen that views AND edits in place (the
  // Augment-From-Affiliations operator ruling: no "two loops, two apps").
  // Identity block up top, then the three additive lists. Every successful
  // add triggers the parent's refetch so the card always shows DB truth,
  // never an optimistic guess.

  import AdditiveList from './AdditiveList.svelte';
  import PeopleReveal from './PeopleReveal.svelte';
  import {
    addOrgLink,
    addOrgStream,
    updateOrgStream,
    addOrgCorpus,
    updateOrgLink,
    removeOrgLink,
    removeOrgStream,
    updateOrgCorpus,
    removeOrgCorpus,
    updateOrgIdentity,
  } from './lib/org-client';
  import { requestSearch } from './lib/search-request';
  import { submitCrawl } from './lib/search-queue';
  import type { OrgDetail, SearchRequestDetail, ShapedLink, StreamEntry } from './lib/types';

  let {
    org,
    client,
    onchanged,
  }: {
    org: OrgDetail;
    client: string;
    onchanged: () => void;
  } = $props();

  function bump() {
    onchanged();
    window.dispatchEvent(
      new CustomEvent('augment-it:entity-updated', { detail: { org_slug: org.slug } }),
    );
  }

  function makeAdd(fn: (args: { org_slug: string; url: string; kind?: string; client: string }) => Promise<unknown>) {
    return async (url: string, kind?: string) => {
      await fn({ org_slug: org.slug, url, kind, client });
      bump();
    };
  }

  // Streams get their own add (name rides along) and the url/kind/name patch.
  async function addStream(url: string, kind?: string, name?: string) {
    await addOrgStream({ org_slug: org.slug, url, kind, name, client });
    bump();
  }

  async function editStream(entry: StreamEntry, patch: { url?: string; kind?: string; name?: string }) {
    await updateOrgStream({
      org_slug: org.slug,
      url: entry.url,
      new_url: patch.url,
      kind: patch.kind,
      name: patch.name,
      client,
    });
    bump();
  }

  // ✎/× — the correction affordances (spec: Entity-Card-Edit-And-Remove-
  // Affordances). Updates patch by current URL; removes detach the entry.
  function makeEdit(fn: (args: { org_slug: string; url: string; new_url?: string; kind?: string; client: string }) => Promise<void>) {
    return async (entry: ShapedLink, patch: { url?: string; kind?: string }) => {
      await fn({ org_slug: org.slug, url: entry.url, new_url: patch.url, kind: patch.kind, client });
      bump();
    };
  }
  function makeRemove(fn: (args: { org_slug: string; url: string; client: string }) => Promise<void>) {
    return async (entry: ShapedLink) => {
      await fn({ org_slug: org.slug, url: entry.url, client });
      bump();
    };
  }

  // The stream × caution: corpus items scanned from a stream share its
  // domain — approximate "this stream fed the corpus" with a domain match.
  // Items always stay (removes detach entries, never delete content).
  function streamRemoveNote(entry: ShapedLink): string | null {
    const fed = org.org_corpus.filter((c) => c.url_domain && c.url_domain === entry.url_domain).length;
    return fed > 0 ? `this stream's domain fed ${fed} corpus item${fed === 1 ? '' : 's'} — they stay` : null;
  }

  // Identity-block editing — names inline, aliases/domains as ✕-chips with
  // the same inline confirm. All ride resolver.update_org.
  let editingNames = $state(false);
  let nameDraft = $state('');
  let convDraft = $state('');
  let identityBusy = $state(false);
  let identityError = $state<string | null>(null);
  let pendingChip = $state<{ kind: 'alias' | 'domain'; value: string } | null>(null);

  function startNamesEdit() {
    nameDraft = org.complete_name ?? '';
    convDraft = org.conventional_name ?? '';
    identityError = null;
    editingNames = true;
  }

  async function identityWrite(patch: {
    complete_name?: string;
    conventional_name?: string;
    aliases?: string[];
    domains?: { domain?: string }[];
  }) {
    identityBusy = true;
    identityError = null;
    try {
      await updateOrgIdentity({ org_slug: org.slug, ...patch, client });
      editingNames = false;
      pendingChip = null;
      bump();
    } catch (err) {
      identityError = err instanceof Error ? err.message : String(err);
    } finally {
      identityBusy = false;
    }
  }

  function commitNames(e: SubmitEvent) {
    e.preventDefault();
    const patch: { complete_name?: string; conventional_name?: string } = {};
    if (nameDraft.trim() && nameDraft.trim() !== (org.complete_name ?? '')) patch.complete_name = nameDraft.trim();
    if (convDraft.trim() && convDraft.trim() !== (org.conventional_name ?? '')) patch.conventional_name = convDraft.trim();
    if (!patch.complete_name && !patch.conventional_name) {
      editingNames = false;
      return;
    }
    void identityWrite(patch);
  }

  function commitChipRemove() {
    if (!pendingChip) return;
    if (pendingChip.kind === 'alias') {
      void identityWrite({ aliases: org.aliases.filter((a) => a !== pendingChip!.value) });
    } else {
      void identityWrite({ domains: org.domains.filter((d) => d.domain !== pendingChip!.value) });
    }
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

  // 🤖 — didi's crawl for a whole list, enqueued as an async job: the search
  // lands as a card in the search-results rail (which the shell flips
  // visible), no column hijack, no babysitting. Replaces the v1.2
  // search-and-add crawl mode per the Search-Results-Queue-Remote spec.
  function makeCrawl(target: 'links' | 'streams') {
    return () => {
      void submitCrawl({ org_slug: org.slug, display_name: displayName, target, client }).catch(
        (err) => console.warn('[org-workbench] search.submit failed', err),
      );
    };
  }
</script>

<article class="ow-card">
  <header class="ow-card-head">
    {#if editingNames}
      <form class="ow-add ow-names-edit" onsubmit={commitNames}>
        <input class="ow-add-url" type="text" placeholder="complete name" bind:value={nameDraft} disabled={identityBusy} />
        <input class="ow-add-kind" type="text" placeholder="known as (conventional)" bind:value={convDraft} disabled={identityBusy} />
        <button type="submit" class="ow-add-go" disabled={identityBusy}>{identityBusy ? '…' : 'Save'}</button>
        <button type="button" class="ow-add-go" onclick={() => (editingNames = false)} disabled={identityBusy}>×</button>
      </form>
    {:else}
      <h2 class="ow-card-name">{org.complete_name ?? org.conventional_name ?? org.slug}</h2>
      <button type="button" class="ow-entry-action ow-micro" title="edit names" onclick={startNamesEdit}>✎</button>
      <code class="ow-card-slug">{org.slug}</code>
    {/if}
  </header>

  <dl class="ow-identity">
    {#if org.conventional_name && org.conventional_name !== org.complete_name}
      <dt>Known as</dt>
      <dd>{org.conventional_name}</dd>
    {/if}
    {#if org.aliases.length > 0}
      <dt>Aliases</dt>
      <dd>
        {#each org.aliases as alias (alias)}
          <span class="ow-chip">
            {alias}
            <button
              type="button"
              class="ow-chip-x ow-micro"
              title="remove alias"
              onclick={() => (pendingChip = { kind: 'alias', value: alias })}
            >×</button>
          </span>
        {/each}
      </dd>
    {/if}
    {#if org.domains.length > 0}
      <dt>Domains</dt>
      <dd>
        {#each org.domains.filter((d) => d.domain) as d (d.domain)}
          <span class="ow-chip">
            {d.domain}
            <button
              type="button"
              class="ow-chip-x ow-micro"
              title="remove domain"
              onclick={() => (pendingChip = { kind: 'domain', value: d.domain ?? '' })}
            >×</button>
          </span>
        {/each}
      </dd>
    {/if}
  </dl>
  {#if pendingChip}
    <p class="ow-chip-confirm">
      remove {pendingChip.kind} <strong>{pendingChip.value}</strong>?
      <button type="button" class="ow-add-go ow-remove-yes" disabled={identityBusy} onclick={commitChipRemove}>
        {identityBusy ? '…' : 'yes'}
      </button>
      <button type="button" class="ow-add-go" disabled={identityBusy} onclick={() => (pendingChip = null)}>keep</button>
    </p>
  {/if}
  {#if identityError}<div class="ow-error">{identityError}</div>{/if}

  <div class="ow-lists">
    <AdditiveList
      title="Identity & social links"
      entries={org.org_links}
      kindHint="kind (auto: website/linkedin/x/…)"
      onadd={makeAdd(addOrgLink)}
      onedit={makeEdit(updateOrgLink)}
      onremove={makeRemove(removeOrgLink)}
      onsearch={makeSearch('links', (n) => `"${n}" LinkedIn`)}
      oncrawl={makeCrawl('links')}
    />
    <AdditiveList
      title="Pulse streams"
      entries={org.media_streams}
      kindHint="kind (auto: blog_index/rss/newsroom/…)"
      nameable
      onadd={addStream}
      onedit={editStream}
      onremove={makeRemove(removeOrgStream)}
      removenote={streamRemoveNote}
      onsearch={makeSearch('streams', (n) => `"${n}" blog`)}
      oncrawl={makeCrawl('streams')}
      entryaction={{
        label: 'scan',
        fn: (stream) =>
          requestSearch({
            entity: { type: 'organization', org_slug: org.slug, display_name: displayName },
            target: 'corpus',
            seed_term: '',
            stream: { url: stream.url, kind: stream.kind },
          }),
      }}
    />
    <AdditiveList
      title="Corpus items"
      entries={org.org_corpus}
      kindHint="kind (optional)"
      onadd={makeAdd(addOrgCorpus)}
      onedit={makeEdit(updateOrgCorpus)}
      onremove={makeRemove(removeOrgCorpus)}
      onsearch={makeSearch('corpus', (n) => `"${n}" news`)}
    />

    <PeopleReveal org_slug={org.slug} orgName={displayName} {client} />
  </div>
</article>
