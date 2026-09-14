<script lang="ts">
  // Related organizations — the parent/child/peer section of the org card.
  // Three groups (Part of / Contains / Peers), each row click-through-able:
  // walking the Koch constellation edge by edge is the payoff interaction.
  // Add relates to EXISTING orgs only — creation stays doored through the
  // header's gated + New organization (OrgCreateInline).
  // Per context-v/plans/Org-Relations-Parent-Child-Peer-Plus-Org-Tags.md §2.1.

  import Button from '@augment-it/shared-ui/Button.svelte';
  import CountBadge from '@augment-it/shared-ui/CountBadge.svelte';
  import CardRow from '@augment-it/shared-ui/CardRow.svelte';
  import ListContainer from '@augment-it/shared-ui/ListContainer.svelte';
  import Chip from '@augment-it/shared-ui/Chip.svelte';
  import OrgSearch from './OrgSearch.svelte';
  import { fetchOrgRelations, relateOrg, unrelateOrg, patchOrgRelation } from './lib/org-client';
  import type { OrgRelations, OrgRelKind, OrgSuggestion, RelatedOrg } from './lib/types';

  let {
    org_slug,
    client,
    onopen,
  }: {
    org_slug: string;
    client: string;
    onopen: (slug: string) => void;
  } = $props();

  // Open vocabulary — datalist suggestions, never enum-enforced. Kinds are
  // orthogonal to rel: funder_of / agency_of ride PEER edges as readily as
  // hierarchical ones (operator ruling 2026-07-27 — hierarchy is the
  // special case, peer + a descriptive kind is the normal shape).
  const KIND_SUGGESTIONS = [
    'funder_of',
    'partners_with',
    'agency_of',
    'initiative_of',
    'fund_of',
    'program_of',
    'chapter_of',
  ];

  let relations = $state<OrgRelations>({ parents: [], children: [], peers: [] });
  let loading = $state(false);
  let error = $state<string | null>(null);

  let adding = $state(false);
  let picked = $state<OrgSuggestion | null>(null);
  let addRel = $state<OrgRelKind>('parent');
  let addKind = $state('');
  let addDescription = $state('');
  let busy = $state(false);
  let note = $state<string | null>(null);

  let editingSlug = $state<string | null>(null);
  let editRel = $state<OrgRelKind>('parent');
  let editKind = $state('');
  let editDescription = $state('');
  let pendingRemove = $state<RelatedOrg | null>(null);

  const total = $derived(
    relations.parents.length + relations.children.length + relations.peers.length,
  );

  async function load() {
    loading = true;
    error = null;
    try {
      relations = await fetchOrgRelations(org_slug, client);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  }

  // Fresh org card → fresh relations, and drop any in-flight edit state.
  $effect(() => {
    void org_slug;
    adding = false;
    picked = null;
    editingSlug = null;
    pendingRemove = null;
    note = null;
    void load();
  });

  async function commitAdd(e: SubmitEvent) {
    e.preventDefault();
    if (!picked) return;
    busy = true;
    error = null;
    try {
      const { created } = await relateOrg({
        org_slug,
        other_slug: picked.slug,
        rel: addRel,
        kind: addKind.trim() || null,
        description: addDescription.trim() || null,
        client,
      });
      note = created ? null : 'already related — edit the existing relation instead';
      adding = false;
      picked = null;
      addKind = '';
      addDescription = '';
      await load();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }

  function startEdit(r: RelatedOrg) {
    editingSlug = r.slug;
    editRel = r.rel;
    editKind = r.kind ?? '';
    editDescription = r.description ?? '';
    pendingRemove = null;
  }

  async function commitEdit(e: SubmitEvent) {
    e.preventDefault();
    if (!editingSlug) return;
    busy = true;
    error = null;
    try {
      await patchOrgRelation({
        org_slug,
        other_slug: editingSlug,
        rel: editRel,
        kind: editKind.trim() || null,
        description: editDescription.trim() || null,
        client,
      });
      editingSlug = null;
      await load();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }

  async function commitRemove() {
    if (!pendingRemove) return;
    busy = true;
    error = null;
    try {
      await unrelateOrg({ org_slug, other_slug: pendingRemove.slug, client });
      pendingRemove = null;
      await load();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }
</script>

{#snippet relRow(r: RelatedOrg)}
  <!-- CardRow with NO SelectWrapper: a relation row is displayed and acted on,
         never selected. Its 3 (display) / 6 (edit) sibling controls are exactly
         the population --ClickBody's overlay would bury. rung 0: .ro-row is the
         inner layout line, because CardRow is align-items:flex-start at (0,2,0)
         and this row reads on a baseline. -->
  <CardRow as="li" density="compact">
    <span class="ro-row">
    {#if editingSlug === r.slug}
      <form class="ow-add ro-edit" onsubmit={commitEdit}>
        <span class="ro-edit-name">{r.display_name}</span>
        <select class="ow-add-kind" bind:value={editRel} disabled={busy}>
          <option value="parent">parent of this org</option>
          <option value="child">child of this org</option>
          <option value="peer">peer</option>
        </select>
        <input class="ow-add-kind" type="text" list="ro-kinds" placeholder="kind (initiative_of/…)" bind:value={editKind} disabled={busy} />
        <input class="ow-add-url" type="text" placeholder="description (free text)" bind:value={editDescription} disabled={busy} />
        <Button type="submit" variant="primary" size="lg" disabled={busy}>{busy ? '…' : 'Save'}</Button>
        <Button size="lg" aria-label="Cancel editing this relation" onclick={() => (editingSlug = null)} disabled={busy}>×</Button>
      </form>
    {:else}
      <Button variant="link" size="sm" title="open {r.slug} in the workbench" onclick={() => onopen(r.slug)}>
        {r.display_name}
      </Button>
      {#if r.kind}<Chip size="sm">{r.kind}</Chip>{/if}
      {#if r.description}<span class="ro-desc">{r.description}</span>{/if}
      <span class="ro-actions">
        <Button variant="ghost" size="sm" aria-label="Edit the relation to {r.display_name}" title="edit relation" onclick={() => startEdit(r)}>✎</Button>
        <Button variant="ghost" size="sm" aria-label="Remove the relation to {r.display_name}" title="remove relation" onclick={() => (pendingRemove = r)}>×</Button>
      </span>
    {/if}
    </span>
  </CardRow>
{/snippet}

<section class="ro-section">
  <header class="ow-list-head">
    <h3 class="ow-list-title">Related organizations{#if !loading}&nbsp;<CountBadge count={total} tone="neutral" label="Related organizations" />{/if}</h3>
    <span class="ow-list-actions">
      <Button
        variant="outline"
        size="icon"
        aria-expanded={adding}
        aria-label={adding ? 'Close the relate-organization form' : 'Relate an existing organization (parent / child / peer)'}
        title="relate an existing organization (parent / child / peer)"
        onclick={() => { adding = !adding; note = null; }}
      >
        {adding ? '×' : '+'}
      </Button>
    </span>
  </header>

  {#if note}<p class="ow-empty">{note}</p>{/if}
  {#if error}<div class="ow-error">{error}</div>{/if}

  {#if adding}
    <div class="ro-add">
      {#if picked}
        <form class="ow-add" onsubmit={commitAdd}>
          <span class="ro-picked">{picked.complete_name ?? picked.conventional_name ?? picked.slug}</span>
          <select class="ow-add-kind" bind:value={addRel} disabled={busy}>
            <option value="parent">is the parent of this org</option>
            <option value="child">is a child of this org</option>
            <option value="peer">is a peer</option>
          </select>
          <input class="ow-add-kind" type="text" list="ro-kinds" placeholder="kind (initiative_of/…)" bind:value={addKind} disabled={busy} />
          <input class="ow-add-url" type="text" placeholder="description (free text — the context humans hold)" bind:value={addDescription} disabled={busy} />
          <Button type="submit" variant="primary" size="lg" disabled={busy}>{busy ? '…' : 'Relate'}</Button>
          <Button size="lg" aria-label="Clear the picked organization" onclick={() => (picked = null)} disabled={busy}>×</Button>
        </form>
      {:else}
        <OrgSearch {client} onpick={(s) => (picked = s)} />
        <p class="ow-empty">relates to existing organizations only — create missing orgs via “+ New organization” first</p>
      {/if}
    </div>
  {/if}

  {#if loading}
    <p class="ow-empty">loading relations…</p>
  {:else if total === 0 && !adding}
    <p class="ow-empty">no related organizations yet</p>
  {:else}
    {#if relations.parents.length > 0}
      <h4 class="ro-group">Part of</h4>
      <ListContainer as="ul" gap="sm" label="Organizations this one is part of">{#each relations.parents as r (r.slug)}{@render relRow(r)}{/each}</ListContainer>
    {/if}
    {#if relations.children.length > 0}
      <h4 class="ro-group">Contains</h4>
      <ListContainer as="ul" gap="sm" label="Organizations this one contains">{#each relations.children as r (r.slug)}{@render relRow(r)}{/each}</ListContainer>
    {/if}
    {#if relations.peers.length > 0}
      <h4 class="ro-group">Peers</h4>
      <ListContainer as="ul" gap="sm" label="Peer organizations">{#each relations.peers as r (r.slug)}{@render relRow(r)}{/each}</ListContainer>
    {/if}
  {/if}

  {#if pendingRemove}
    <p class="ow-chip-confirm">
      remove the relation to <strong>{pendingRemove.display_name}</strong>? (both orgs stay — only the edge goes)
      <Button variant="destructive" size="sm" aria-label="Confirm removing the relation to {pendingRemove.display_name}" disabled={busy} onclick={commitRemove}>{busy ? '…' : 'yes'}</Button>
      <Button size="sm" aria-label="Keep the relation to {pendingRemove.display_name}" disabled={busy} onclick={() => (pendingRemove = null)}>keep</Button>
    </p>
  {/if}

  <datalist id="ro-kinds">
    {#each KIND_SUGGESTIONS as k (k)}<option value={k}></option>{/each}
  </datalist>
</section>

<style>
  .ro-section { display: flex; flex-direction: column; gap: 0.35rem; }
  .ro-group { margin: 0.35rem 0 0.1rem; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; opacity: 0.65; }
  .ro-row { display: flex; align-items: baseline; gap: 0.5rem; min-width: 0; flex: 1; }
  .ro-desc { font-size: 0.78rem; opacity: 0.6; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
  .ro-actions { margin-left: auto; display: inline-flex; align-items: center; gap: 0.25rem; }
  /* opacity, not visibility — the buttons stay focusable/clickable for
     keyboard users and assistive tech; :focus-within reveals them on Tab */
  .ro-row:not(:hover):not(:focus-within) .ro-actions { opacity: 0; }
  .ro-add { display: flex; flex-direction: column; gap: 0.25rem; }
  .ro-picked, .ro-edit-name { font-size: 0.85rem; font-weight: 600; white-space: nowrap; }
</style>
