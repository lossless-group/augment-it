<script lang="ts">
  /**
   * Composite-slot header — slot label on the left, icon-toggle pair on
   * the right. The label announces which slot the user is in (the
   * composite's identity); the icons swap which member remote mounts
   * within it.
   *
   * Pure presentation: receives label + members + activeId + onSelect.
   * Owns no state. The shell owns "which slot, which member."
   *
   * Spec: context-v/specs/Shell-and-Micro-Frontend-UX-Coherence.md §5, §11
   * Plan: context-v/plans/Shell-and-Micro-Frontend-UX-Coherence-Refactor.md §2c
   */

  type Member = {
    id: string;
    icon: string;
    label: string;
  };

  let {
    slotLabel,
    members,
    activeId,
    onSelect,
  }: {
    slotLabel?: string;
    members: Member[];
    activeId: string;
    onSelect: (memberId: string) => void;
  } = $props();
</script>

<div class="toggle-header" role="tablist" aria-label={slotLabel ?? 'Composite mode'}>
  {#if slotLabel}
    <span class="slot-label">{slotLabel}</span>
  {/if}
  <div class="toggles">
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
</div>

<style>
  .toggle-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.5rem 1.5rem;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-background);
  }
  .slot-label {
    color: var(--color-accent);
    font-size: 0.8rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .toggles {
    display: flex;
    gap: 0.4rem;
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
