<script lang="ts">
  /**
   * CardRow--Candidate — one ranked candidate in a resolver's candidate list.
   *
   * WHY THIS WRAPPER EXISTS (D1 evidence, not decoration). The shared `CardRow`
   * is `display: flex; align-items: flex-start` — a HORIZONTAL row. Every row in
   * the resolver family is vertically STACKED: an identity/score head, then
   * optional stats and a disclosure preview, then the commit action. Rendering
   * those as flex children of the base would lay them out side by side.
   *
   * The fix is rung 0, not rung 4: the base keeps owning surface, border, radius
   * and padding; this wrapper owns the stack. No `class=` on CardRow, no
   * `style=`, no data-deviation.
   *
   * `person-db-resolver` carries a byte-equivalent file under its own prefix. If
   * a third member needs the same thing, promote a stacked base (or a
   * `direction` prop) rather than copying this a fourth time.
   */
  import CardRow from '@augment-it/shared-ui/CardRow.svelte';
  import type { Snippet } from 'svelte';

  let {
    selected = false,
    children,
  }: { selected?: boolean; children?: Snippet } = $props();
</script>

<CardRow density="compact" {selected}>
  <div class="rdr-candidate-stack">{@render children?.()}</div>
</CardRow>

<style>
  .rdr-candidate-stack {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    flex: 1;
    min-inline-size: 0;
  }
</style>
