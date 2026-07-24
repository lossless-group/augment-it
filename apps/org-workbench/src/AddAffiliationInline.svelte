<script lang="ts">
  // Promote a bio-page link to an affiliation — AddPersonInline's gate
  // pattern INVERTED: the person is fixed (the link row's owner), the ORG is
  // being resolved. Seeded from the link's hostname, candidates come from
  // resolver.search (whose D4 clause matches domains[*].domain), and the gate
  // is ALWAYS shown: pick an existing org or explicitly create a thin one
  // (name + the bio's domain, so it stays domain-matchable). The edge + its
  // affiliated_with observation come from person.affiliate with the bio URL
  // as source — the link row keeps its identity role; this adds the two
  // facts it was silently dropping.
  // Per context-v/issues/Person-Bio-Pages-Are-Affiliation-Signals-Not-Just-Identity-Links.md.

  import { searchOrgs, affiliatePerson } from './lib/org-client';
  import type { OrgSuggestion, ShapedLink } from './lib/types';

  let {
    person_uuid,
    personName,
    entry,
    client,
    onadded,
    oncancel,
  }: {
    person_uuid: string;
    personName: string;
    entry: ShapedLink;
    client: string;
    onadded: () => void;
    oncancel: () => void;
  } = $props();

  function hostOf(u: string): string {
    try {
      return new URL(u).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }

  const domain = $derived(hostOf(entry.url));

  let orgName = $state('');
  let role = $state('');
  let phase = $state<'gate' | 'writing'>('gate');
  let candidates = $state<OrgSuggestion[]>([]);
  let searched = $state(false);
  let error = $state<string | null>(null);

  // Candidates load from the bio's domain on mount (D4 makes this nearly
  // free); typing a name and re-finding re-queries by name instead.
  $effect(() => {
    if (!searched && domain) void find(domain);
  });

  async function find(q: string) {
    error = null;
    try {
      candidates = await searchOrgs(q, client);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      searched = true;
    }
  }

  async function resolve(action: 'match' | 'create', org_slug?: string) {
    if (action === 'create' && !orgName.trim()) return;
    phase = 'writing';
    error = null;
    try {
      await affiliatePerson({
        person_uuid,
        org_action: action,
        org_slug,
        org_name: action === 'create' ? orgName.trim() : undefined,
        org_domain: action === 'create' ? domain : undefined,
        role: role.trim() || null,
        client,
        source: entry.url,
      });
      onadded(); // parent bumps + dispatches augment-it:entity-updated
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      phase = 'gate';
    }
  }
</script>

<div class="ow-addperson">
  <p class="ow-gate-note">
    Promote <strong>{domain || entry.url}</strong> to an affiliation for {personName} — pick the
    org this bio lives on, or create it:
  </p>

  {#if phase === 'gate'}
    {#if candidates.length > 0}
      <ul class="ow-gate-list">
        {#each candidates as c (c.slug)}
          <li>
            <button type="button" class="ow-gate-pick" onclick={() => resolve('match', c.slug)}>
              <strong>{c.complete_name ?? c.conventional_name ?? c.slug}</strong>
              <span class="ow-gate-headline">{c.slug}</span>
            </button>
          </li>
        {/each}
      </ul>
    {:else if searched}
      <p class="ow-gate-note">No existing org matches “{domain}”.</p>
    {:else}
      <p class="ow-gate-note">looking for orgs matching “{domain}”…</p>
    {/if}

    <form class="ow-addperson-form" onsubmit={(e) => { e.preventDefault(); void resolve('create'); }}>
      <input
        class="ow-add-url"
        type="text"
        placeholder="Org name (required to create)"
        bind:value={orgName}
      />
      <input
        class="ow-add-kind"
        type="text"
        placeholder="Role (optional)"
        bind:value={role}
      />
      <span class="ow-addperson-actions">
        <button type="button" class="ow-add-go" onclick={() => find(orgName.trim() || domain)}>
          Find matches
        </button>
        <button type="submit" class="ow-add-go" disabled={!orgName.trim()}>
          Create + affiliate
        </button>
        <button type="button" class="ow-add-go" onclick={oncancel}>Cancel</button>
      </span>
    </form>
  {:else}
    <p class="ow-gate-note">writing affiliation…</p>
  {/if}
  {#if error}<div class="ow-error">{error}</div>{/if}
</div>
