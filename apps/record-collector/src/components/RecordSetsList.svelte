<script lang="ts">
  // The list of record sets, grouped into families per
  // context-v/specs/Record-Set-Family-Grouping.md. Variant families
  // render as collapsible group headers with member cards inside;
  // ungrouped sets render as top-level cards with no header (just
  // like before for the trivial case). Archived lineage predecessors
  // tuck into an "Earlier generations (archived)" sub-section
  // collapsed by default.

  import Button from '@augment-it/shared-ui/Button.svelte';
  import DisclosureRow from '@augment-it/shared-ui/DisclosureRow.svelte';
  import ListContainer from '@augment-it/shared-ui/ListContainer.svelte';
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

<!-- ListContainer. `.rs-list-wrap` (flex/direction/gap), `.rs-list-head`
     (flex/justify/align/gap) and `.rs-list` (list-style/margin/padding/flex/
     direction/gap) are ALL DELETED — three recipes, one layout. -->
<ListContainer as="ul" gap="xs" label="Record sets">
  {#snippet header()}
    <h2 class="rs-head-title">Record sets</h2>
    <!-- Rung 0 — `margin-inline-start: auto` is placement, and the loop names it
         as rung 0 explicitly. It replaces the deleted `justify-content:
         space-between`, which the layout's header does not set. -->
    <span class="rs-head-end">
      <Button variant="secondary" size="sm" onclick={onrefresh}>refresh</Button>
    </span>
  {/snippet}

    {#each groups as g (g.group_id)}
      {#if g.kind === 'variant_family'}
        {@const isCollapsed = collapsed.has(g.group_id)}
        <li class="rs-family">
          <!-- The raw-<button> holdout declared here on 2026-09-13 is RESOLVED.
               The deferral was correct at the time and its reasoning still holds
               — a disclosure is not a selection, a group header is not a CardRow
               — which is why the answer was a new organ rather than a bad fit.
               Three things the raw head got wrong, none of them visible:
                 - NO aria-controls at all: the state was announced, the region
                   it governs never was.
                 - the ▸ / ▾ glyph was TEXT inside the button, so the accessible
                   name read "▾ Investors 1 variant, 2 gens".
                 - no declared target-size floor. -->
          <DisclosureRow
            label={g.label}
            open={!isCollapsed}
            ontoggle={() => toggleGroup(g.group_id)}
            title={isCollapsed ? 'Expand family' : 'Collapse family'}
          >
            {#snippet row()}
              <!-- The count rides in the `row` snippet rather than in `hint`,
                   and that is a measured choice, not a preference. `hint` renders
                   at the END of the row, which is exactly where .rs-family-actions
                   is overlaid — the two would have sat on top of each other, and
                   no gate in this repo looks at geometry. -->
              <span class="rs-family-head-text">
                <span class="rs-family-label">{g.label}</span>
                <span class="rs-family-count">
                  {g.members.length} variant{g.members.length === 1 ? '' : 's'}{#if g.generation_total > g.members.length}, {g.generation_total} gen{g.generation_total === 1 ? '' : 's'}{/if}
                </span>
              </span>
            {/snippet}
            <!-- `.rs-family-members` DELETED — ListContainer. Layouts nest. -->
            <ListContainer as="ul" gap="xs" label={`${g.label} variants`}>
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
                    <!-- Same holdout, same resolution. Measured raw at 27px — it
                         cleared the 24px SC 2.5.8 floor by 3px, and only because
                         `padding: 0.3rem` happened to add up. `--control-h-md`
                         is the contract that replaces the luck. -->
                    <DisclosureRow
                      label={`Earlier generations (${archived.length} archived)`}
                      open={archiveOpen}
                      ontoggle={() => toggleArchive(mKey)}
                    >
                      <!-- `.rs-archive-list` DELETED. Its `opacity` is the one
                           declaration the layout does not own, and `class=`
                           merges onto the rows element rather than replacing
                           its own class, so it needs no wrapper. -->
                      <ListContainer as="ul" gap="2xs" label="Earlier generations" class="rs-archive-dim">
                        {#each archived as ar (ar.record_set_id)}
                          <RecordSetCard
                            rs={ar}
                            selected={ar.record_set_id === selectedId}
                            onselect={() => onselect(ar.record_set_id)}
                            ondelete={() => ondelete(ar)}
                          />
                        {/each}
                      </ListContainer>
                    </DisclosureRow>
                  </li>
                {/if}
              {/each}
            </ListContainer>
          </DisclosureRow>

          <!-- rung 0 — placement is the family card's job. DisclosureRow owns the
               whole header row AND the panel under it, and these two actions have
               to stay reachable while the family is collapsed, so the <li>
               positions them over the header row's trailing edge. -->
          <div class="rs-family-actions">
            <Button
              variant="ghost"
              size="icon"
              title="Rename this family"
              onclick={() => onRenameFamily(g.group_id, g.label)}
              aria-label={`rename family ${g.label}`}
            >✎</Button>
            <Button
              variant="destructive"
              size="icon"
              title="Dissolve this family — the member sets stay, the grouping goes"
              onclick={() => onDissolveFamily(g.group_id, g.label)}
              aria-label={`dissolve family ${g.label}`}
            >×</Button>
          </div>
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
            <!-- Same holdout, same resolution — the solo-card variant. -->
            <DisclosureRow
              label={`Earlier generations (${archived.length} archived)`}
              open={archiveOpen}
              ontoggle={() => toggleArchive(mKey)}
            >
              <ListContainer as="ul" gap="2xs" label="Earlier generations" class="rs-archive-dim">
                {#each archived as ar (ar.record_set_id)}
                  <RecordSetCard
                    rs={ar}
                    selected={ar.record_set_id === selectedId}
                    onselect={() => onselect(ar.record_set_id)}
                    ondelete={() => ondelete(ar)}
                  />
                {/each}
              </ListContainer>
            </DisclosureRow>
          </li>
        {/if}
      {/if}
    {/each}
    {#if groups.length === 0}
      <li class="rs-list-empty">no record sets yet — upload below</li>
    {/if}
</ListContainer>

<style>
  /* .rs-list-wrap, .rs-list-head and .rs-list are GONE — between them a
     `display: flex` x3, a `flex-direction`, a `justify-content`, an
     `align-items`, two `gap`s, a `margin`, a `padding` and a `list-style`.
     Every one belongs to ListContainer's header region or its rows region. */
  .rs-head-title { margin: 0; }
  .rs-head-end { margin-inline-start: auto; }   /* rung 0 — placement */
  .rs-list-empty {
    color: var(--color-text-muted);
    font-style: italic;
    padding: 0.4rem 0.6rem;
  }

  /* Variant-family group — wraps its member cards in a bordered card.

     THE RAW-<button> HOLDOUT DECLARED HERE IS RESOLVED. The 2026-09-13 note
     said the header stayed raw because neither CardRow nor SelectWrapper fits a
     disclosure, and that "a disclosure wrapper is a separate organ and has been
     raised as one." It shipped. Both heads are now DisclosureRow.

     DELETED with it: `.rs-family-head-row` (display / align-items /
     border-bottom), its `:has([aria-expanded='false'])` companion,
     `.rs-family-head` (eleven declarations), `.rs-family-head:hover`,
     `.rs-family-chevron` — the component's chevron is aria-hidden and rotates
     rather than swapping glyphs — and `.rs-family-count`, which is the `hint`
     prop. `.rs-family-label` survives because the accent + wrapping treatment is
     the member's own identity, carried in through the `row` snippet.

     Measured raw: 70.9px tall with a wrapping label. That is unchanged and was
     never the problem — the problem was that nothing DECLARED a floor. */
  .rs-family {
    position: relative;   /* rung 0 — the family card places its own actions */
    list-style: none;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background: var(--color-surface, rgba(255, 255, 255, 0.02));
  }
  .rs-family-actions {
    position: absolute;
    inset-block-start: 0;
    inset-inline-end: 0.35rem;
    display: flex;
    align-items: center;
    gap: 0.15rem;
    min-block-size: var(--control-h-md);
  }
  /* Reserves the strip the absolutely-placed actions occupy, so the label and
     count never run under them. Two icon controls at --control-h-md plus their
     gap and the card's own inline-end offset. */
  .rs-family-head-text {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    min-inline-size: 0;
    flex: 1;
    padding-inline-end: calc(2 * var(--control-h-md) + 0.85rem);
  }
  .rs-family-count {
    color: var(--color-text-muted);
    font-size: 0.72rem;
    white-space: nowrap;
  }
  .rs-family-label {
    font-weight: 600;
    color: var(--color-accent, var(--color-text));
    overflow-wrap: anywhere;
    min-width: 0;
    flex: 1;
  }
  /* .rs-family-members is GONE — ListContainer, gap="sm". */

  /* Archive sub-section — shown either inside a family member or
     directly below an ungrouped (solo) card.

     .rs-archive-head is GONE — DisclosureRow, same as the family head. It was
     measured raw at 27px: it cleared the 24px WCAG 2.2 SC 2.5.8 floor by 3px,
     and only because `padding: 0.3rem` happened to add up. That was luck, and
     the note said so. `--control-h-md` is the contract that replaces it.
     Twelve declarations and a `:hover` deleted with it. */
  .rs-archive-wrap {
    list-style: none;
    border: 1px dashed var(--color-border);
    border-radius: 3px;
    padding: 0;
    margin-left: 0.6rem;
  }
  .rs-archive-solo { margin-left: 0; }
  /* .rs-archive-list is GONE — ListContainer, gap="2xs", and its `opacity`
     rides in on the merging `class` prop. The surviving rule lives in app.css
     under the `.rc-app` prefix rather than as a `:global()` here: a scoped
     style cannot reach a class it hands to a component, and an unprefixed
     :global() is exactly the containment leak F2/F3 exist to catch. */
</style>
