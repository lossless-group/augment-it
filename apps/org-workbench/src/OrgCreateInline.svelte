<script lang="ts">
  // First-class org creation for the workbench — behind the gate. "Try to be
  // sure there is no match": name (+ optional website/domain) → scored
  // candidates from resolver.candidates (slug 100 · domain 90 · fuzzy name
  // 60 — every signal, not just the autocomplete's name-contains) → the gate
  // ALWAYS shows. Picking a candidate just OPENS that org (no write); create
  // is an explicit choice past the gate, never a silent submit. A created
  // org seeds its domain so it's domain-matchable from birth; a website URL
  // also lands as its first org_link.
  // Per context-v/issues/Org-Workbench-Needs-Create-Organization-Behind-A-No-Match-Gate.md.

  import { fetchOrgCandidates, createOrg, addOrgLink } from './lib/org-client';
  import type { OrgCandidate } from './lib/types';

  let {
    client,
    onopen,
    oncancel,
  }: {
    client: string;
    // Called with the slug to load — an existing candidate OR the new org.
    onopen: (org_slug: string) => void;
    oncancel: () => void;
  } = $props();

  let name = $state('');
  let site = $state(''); // URL or bare domain, optional
  let phase = $state<'form' | 'gate' | 'writing'>('form');
  let candidates = $state<OrgCandidate[]>([]);
  let error = $state<string | null>(null);

  function siteParts(): { url?: string; domain?: string } {
    const raw = site.trim();
    if (!raw) return {};
    const withProto = /^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      const u = new URL(withProto);
      return { url: withProto, domain: u.hostname.toLowerCase().replace(/^www\./, '') };
    } catch {
      return {};
    }
  }

  async function findMatches(e: SubmitEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    error = null;
    try {
      const { url } = siteParts();
      candidates = await fetchOrgCandidates({ name: name.trim(), url }, client);
      phase = 'gate'; // always gate — zero candidates still gets an explicit create
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  async function create() {
    phase = 'writing';
    error = null;
    try {
      const { url, domain } = siteParts();
      const r = await createOrg({ org_name: name.trim(), org_domain: domain, client });
      // A given website becomes the new org's first identity link — only on a
      // genuine create; a slug that matched an existing org keeps its lists.
      if (url && r.org_created) {
        await addOrgLink({ org_slug: r.org_slug, url, kind: 'website', client });
      }
      onopen(r.org_slug);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      phase = 'gate';
    }
  }
</script>

<div class="ow-addperson">
  <form class="ow-addperson-form" onsubmit={findMatches}>
    <input
      class="ow-add-url"
      type="text"
      placeholder="Organization name (required)"
      bind:value={name}
      required
      disabled={phase !== 'form'}
    />
    <input
      class="ow-add-url"
      type="text"
      placeholder="Website or domain (optional — strongest match signal)"
      bind:value={site}
      disabled={phase !== 'form'}
    />
    {#if phase === 'form'}
      <span class="ow-addperson-actions">
        <button type="submit" class="ow-add-go" disabled={!name.trim()}>Find matches</button>
        <button type="button" class="ow-add-go" onclick={oncancel}>Cancel</button>
      </span>
    {/if}
  </form>

  {#if phase === 'gate'}
    <div class="ow-gate">
      {#if candidates.length > 0}
        <p class="ow-gate-note">
          Existing organizations that might be “{name}” — open one instead of creating a duplicate:
        </p>
        <ul class="ow-gate-list">
          {#each candidates as c (c.slug)}
            <li>
              <button type="button" class="ow-gate-pick" onclick={() => onopen(c.slug)}>
                <strong>{c.complete_name ?? c.conventional_name ?? c.slug}</strong>
                <span class="ow-gate-headline">{c.slug}</span>
                <span class="ow-gate-score">
                  {c.score} · {c.match_reason.join(', ')} ·
                  {c.existing.org_links} links · {c.existing.media_streams} streams ·
                  {c.existing.org_corpus} corpus
                </span>
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="ow-gate-note">No existing organization matches “{name}”.</p>
      {/if}
      <span class="ow-addperson-actions">
        <button type="button" class="ow-add-go" onclick={create}>
          No match — create “{name.trim()}”
        </button>
        <button type="button" class="ow-add-go" onclick={() => (phase = 'form')}>Back</button>
      </span>
    </div>
  {:else if phase === 'writing'}
    <p class="ow-gate-note">creating organization…</p>
  {/if}
  {#if error}<div class="ow-error">{error}</div>{/if}
</div>
