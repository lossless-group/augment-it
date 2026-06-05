<script lang="ts">
  // The list of record sets, grouped into families per
  // context-v/specs/Record-Set-Family-Grouping.md. Variant families
  // render as collapsible group headers with member cards inside;
  // ungrouped sets render as top-level cards with no header (just
  // like before for the trivial case). Archived lineage predecessors
  // tuck into an "Earlier generations (archived)" sub-section
  // collapsed by default.

  import type { RecordSet } from '@augment-it/workspace';
  import RecordSetCard from './RecordSetCard.svelte';
  import { buildFamilyGroups, type FamilyGroup, type FamilyMember } from '../logic/family';

  type Props = {
    recordSets: RecordSet[];
    selectedId: string | null;
    onselect: (id: string) => void;
    ondelete: (rs: RecordSet) => void;
    onrefresh: () => void;
    onRenameFamily: (variant_family_id: string, currentLabel: string) => void;
    onDissolveFamily: (variant_family_id: string, label: string) => void;
  };
  let {
    recordSets,
    selectedId,
    onselect,
    ondelete,
    onrefresh,
    onRenameFamily,
    onDissolveFamily,
  }: Props = $props();

  // Hide archived sets from the default view, except when they're
  // already part of a lineage chain (in which case they live under
  // "Earlier generations" inside the leaf's group).
  const visible = $derived.by(() => recordSets.filter((rs) => !rs.archived));

  // Build the family grouping. The grouping function only sees
  // non-archived sets at the top level; archived predecessors come
  // back via the leaf's promoted_from walk inside buildFamilyGroups.
  // To make that work, we need to pass the FULL list so promoted_from
  // pointers resolve into archived ancestors — but only the
  // non-archived sets become leaves. Pass everything; let the algo
  // do the work.
  const groups = $derived.by(() => {
    const allByLeaf = buildFamilyGroups(recordSets);
    // Filter out groups whose leaf is itself archived — those should
    // not appear as a leaf in the default view. (An archived leaf
    // means the whole lineage chain is archived; it's reachable only
    // via "show archived" — out of scope for v0.)
    return allByLeaf.filter((g) => g.members.some((m) => !m.leaf.archived));
  });

  // Collapse state per group_id and per member-archive-section.
  // Persisted to localStorage so reload survives.
  const COLLAPSE_KEY = 'augment-it:record-collector:family-collapsed';
  const ARCHIVE_COLLAPSE_KEY = 'augment-it:record-collector:archive-collapsed';

  function loadCollapseState(key: string): Set<string> {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return new Set(Array.isArray(arr) ? arr : []);
    } catch {
      return new Set();
    }
  }

  function saveCollapseState(key: string, set: Set<string>): void {
    try {
      localStorage.setItem(key, JSON.stringify([...set]));
    } catch {
      // localStorage unavailable — state simply won't persist.
    }
  }

  let collapsed = $state<Set<string>>(loadCollapseState(COLLAPSE_KEY));
  let archiveCollapsed = $state<Set<string>>(loadCollapseState(ARCHIVE_COLLAPSE_KEY));
  // Default: archive sections start collapsed. Track which ones the user
  // has explicitly opened.
  function isArchiveOpen(key: string): boolean {
    // Inverse: present in archiveCollapsed = user opened it. Empty default
    // means closed for new keys.
    return archiveCollapsed.has(key);
  }

  function toggleGroup(id: string) {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    collapsed = next;
    saveCollapseState(COLLAPSE_KEY, next);
  }

  function toggleArchive(id: string) {
    const next = new Set(archiveCollapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    archiveCollapsed = next;
    saveCollapseState(ARCHIVE_COLLAPSE_KEY, next);
  }

  function memberKey(g: FamilyGroup, m: FamilyMember): string {
    return `${g.group_id}::${m.leaf.record_set_id}`;
  }

  function archivedAncestors(m: FamilyMember): RecordSet[] {
    return m.lineage.filter((l) => l.rs.archived).map((l) => l.rs);
  }
</script>

<div class="rs-list-wrap">
  <header class="rs-list-head">
    <h2>Record sets</h2>
    <button type="button" class="rs-refresh" onclick={onrefresh}>refresh</button>
  </header>

  <ul class="rs-list">
    {#each groups as g (g.group_id)}
      {#if g.kind === 'variant_family'}
        {@const isCollapsed = collapsed.has(g.group_id)}
        <li class="rs-family">
          <div class="rs-family-head-row">
            <button
              type="button"
              class="rs-family-head"
              onclick={() => toggleGroup(g.group_id)}
              aria-expanded={!isCollapsed}
              title={isCollapsed ? 'Expand family' : 'Collapse family'}
            >
              <span class="rs-family-chevron">{isCollapsed ? '▸' : '▾'}</span>
              <span class="rs-family-label">{g.label}</span>
              <span class="rs-family-count">
                {g.members.length} variant{g.members.length === 1 ? '' : 's'}{#if g.generation_total > g.members.length}, {g.generation_total} gen{g.generation_total === 1 ? '' : 's'}{/if}
              </span>
            </button>
            <div class="rs-family-actions">
              <button
                type="button"
                class="rs-family-action"
                title="Rename this family"
                onclick={() => onRenameFamily(g.group_id, g.label)}
                aria-label={`rename family ${g.label}`}
              >✎</button>
              <button
                type="button"
                class="rs-family-action rs-family-action-destructive"
                title="Dissolve this family — the member sets stay, the grouping goes"
                onclick={() => onDissolveFamily(g.group_id, g.label)}
                aria-label={`dissolve family ${g.label}`}
              >×</button>
            </div>
          </div>
          {#if !isCollapsed}
            <ul class="rs-family-members">
              {#each g.members as m (m.leaf.record_set_id)}
                {@const archived = archivedAncestors(m)}
                {@const mKey = memberKey(g, m)}
                {@const archiveOpen = isArchiveOpen(mKey)}
                <RecordSetCard
                  rs={m.leaf}
                  selected={m.leaf.record_set_id === selectedId}
                  onselect={() => onselect(m.leaf.record_set_id)}
                  ondelete={() => ondelete(m.leaf)}
                />
                {#if archived.length > 0}
                  <li class="rs-archive-wrap">
                    <button
                      type="button"
                      class="rs-archive-head"
                      onclick={() => toggleArchive(mKey)}
                      aria-expanded={archiveOpen}
                    >
                      <span class="rs-family-chevron">{archiveOpen ? '▾' : '▸'}</span>
                      Earlier generations ({archived.length} archived)
                    </button>
                    {#if archiveOpen}
                      <ul class="rs-archive-list">
                        {#each archived as ar (ar.record_set_id)}
                          <RecordSetCard
                            rs={ar}
                            selected={ar.record_set_id === selectedId}
                            onselect={() => onselect(ar.record_set_id)}
                            ondelete={() => ondelete(ar)}
                          />
                        {/each}
                      </ul>
                    {/if}
                  </li>
                {/if}
              {/each}
            </ul>
          {/if}
        </li>
      {:else}
        {@const m = g.members[0]}
        {@const archived = archivedAncestors(m)}
        {@const mKey = memberKey(g, m)}
        {@const archiveOpen = isArchiveOpen(mKey)}
        <RecordSetCard
          rs={m.leaf}
          selected={m.leaf.record_set_id === selectedId}
          onselect={() => onselect(m.leaf.record_set_id)}
          ondelete={() => ondelete(m.leaf)}
        />
        {#if archived.length > 0}
          <li class="rs-archive-wrap rs-archive-solo">
            <button
              type="button"
              class="rs-archive-head"
              onclick={() => toggleArchive(mKey)}
              aria-expanded={archiveOpen}
            >
              <span class="rs-family-chevron">{archiveOpen ? '▾' : '▸'}</span>
              Earlier generations ({archived.length} archived)
            </button>
            {#if archiveOpen}
              <ul class="rs-archive-list">
                {#each archived as ar (ar.record_set_id)}
                  <RecordSetCard
                    rs={ar}
                    selected={ar.record_set_id === selectedId}
                    onselect={() => onselect(ar.record_set_id)}
                    ondelete={() => ondelete(ar)}
                  />
                {/each}
              </ul>
            {/if}
          </li>
        {/if}
      {/if}
    {/each}
    {#if groups.length === 0}
      <li class="rs-list-empty">no record sets yet — upload below</li>
    {/if}
  </ul>
</div>

<style>
  .rs-list-wrap { display: flex; flex-direction: column; gap: 0.5rem; }
  .rs-list-head { display: flex; justify-content: space-between; align-items: baseline; gap: 0.5rem; }
  .rs-list-head h2 { margin: 0; }
  .rs-refresh {
    padding: 0.2rem 0.6rem;
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: 3px;
    color: var(--color-text);
    font-size: 0.75rem;
    cursor: pointer;
  }
  .rs-refresh:hover { border-color: var(--color-text); }
  .rs-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .rs-list-empty {
    color: var(--color-text-muted);
    font-style: italic;
    padding: 0.4rem 0.6rem;
  }

  /* Variant-family group — wraps its member cards in a bordered card.
     Header is a button so the whole row toggles. */
  .rs-family {
    list-style: none;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background: var(--color-surface, rgba(255, 255, 255, 0.02));
  }
  .rs-family-head-row {
    display: flex;
    align-items: stretch;
    border-bottom: 1px solid var(--color-border);
  }
  .rs-family-head-row:has(.rs-family-head[aria-expanded='false']) {
    border-bottom-color: transparent;
  }
  .rs-family-head {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex: 1;
    min-width: 0;
    padding: 0.45rem 0.55rem;
    background: transparent;
    border: 0;
    color: var(--color-text);
    cursor: pointer;
    text-align: left;
    font: inherit;
  }
  .rs-family-head:hover { background: var(--color-surface, rgba(255, 255, 255, 0.04)); }
  .rs-family-actions {
    display: flex;
    align-items: center;
    gap: 0.15rem;
    padding-right: 0.35rem;
  }
  .rs-family-action {
    width: 1.5rem;
    height: 1.5rem;
    padding: 0;
    background: transparent;
    color: var(--color-text-muted);
    border: 0;
    border-radius: 3px;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .rs-family-action:hover {
    color: var(--color-text);
    background: var(--color-surface, rgba(255, 255, 255, 0.06));
  }
  .rs-family-action-destructive:hover {
    color: var(--color-error-text);
    background: var(--color-error-bg, rgba(200, 50, 50, 0.1));
  }
  .rs-family-chevron {
    display: inline-block;
    width: 0.9rem;
    color: var(--color-text-muted);
    font-size: 0.75rem;
    flex-shrink: 0;
  }
  .rs-family-label {
    font-weight: 600;
    color: var(--color-accent, var(--color-text));
    overflow-wrap: anywhere;
    min-width: 0;
    flex: 1;
  }
  .rs-family-count {
    color: var(--color-text-muted);
    font-size: 0.72rem;
    white-space: nowrap;
  }
  .rs-family-members {
    list-style: none;
    margin: 0;
    padding: 0.4rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  /* Archive sub-section — shown either inside a family member or
     directly below an ungrouped (solo) card. */
  .rs-archive-wrap {
    list-style: none;
    border: 1px dashed var(--color-border);
    border-radius: 3px;
    padding: 0;
    margin-left: 0.6rem;
  }
  .rs-archive-solo { margin-left: 0; }
  .rs-archive-head {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    width: 100%;
    padding: 0.3rem 0.5rem;
    background: transparent;
    border: 0;
    color: var(--color-text-muted);
    cursor: pointer;
    text-align: left;
    font: inherit;
    font-size: 0.72rem;
  }
  .rs-archive-head:hover { color: var(--color-text); }
  .rs-archive-list {
    list-style: none;
    margin: 0;
    padding: 0.3rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    opacity: 0.7;
  }
</style>
