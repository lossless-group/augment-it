<script lang="ts">
  /**
   * Composite-slot header for the enrichment surface.
   *
   * Renders an icon-with-tooltip pair that swaps which member remote the
   * shell's composite slot mounts (Prompt Templates ✎ vs Pack Runner ⊞).
   * The shell owns the "which slot, which member" decision — this component
   * is pure presentation; it reads/writes the active member via a
   * caller-provided callback and reacts to changes via props.
   *
   * Spec: context-v/specs/Shell-and-Micro-Frontend-UX-Coherence.md §5
   * Plan: context-v/plans/Shell-and-Micro-Frontend-UX-Coherence-Refactor.md §2c
   */

  type Member = {
    id: string;
    icon: string;
    label: string;
  };

  let {
    members,
    activeId,
    onSelect,
  }: {
    members: Member[];
    activeId: string;
    onSelect: (memberId: string) => void;
  } = $props();
</script>

<div class="toggle-header" role="tablist" aria-label="Enrichment mode">
  {#each members as m (m.id)}
    <button
      class="toggle"
      class:active={m.id === activeId}
      role="tab"
      aria-selected={m.id === activeId}
      aria-label={m.label}
      title={m.label}
      onclick={() => onSelect(m.id)}
    >
      <span aria-hidden="true">{m.icon}</span>
    </button>
  {/each}
</div>

<style>
  .toggle-header {
    display: flex;
    gap: 0.4rem;
    padding: 0.5rem 1.5rem;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-background);
  }
  .toggle {
    background: transparent;
    color: var(--color-text-muted);
    border: 1px solid var(--color-border);
    width: 1.9rem;
    height: 1.9rem;
    padding: 0;
    border-radius: 6px;
    font-size: 1rem;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .toggle:hover {
    border-color: var(--color-accent);
    color: var(--color-accent);
  }
  .toggle.active {
    background: var(--color-accent);
    color: var(--color-on-accent);
    border-color: var(--color-accent);
    cursor: default;
  }
  .toggle.active:hover {
    color: var(--color-on-accent);
  }
</style>
