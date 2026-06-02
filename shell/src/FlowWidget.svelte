<script lang="ts">
  /**
   * Hierarchical Flow widget (spec Decision §8 / Phase 4).
   *
   * Three tiers:
   *  1. Parent label "Flow" — raised above the rest.
   *  2. Numbered bubble progress strip — one bubble per ROTATION step,
   *     active bubble highlighted, click navigates, hover shows tooltip
   *     with the step's label + description.
   *  3. Layout sub-options — Split / Full as small icon-with-tooltip
   *     toggles (peek-flow is the implicit "Flow" mode and isn't a button
   *     here; clicking the parent "Flow" label exits Split/Full back to
   *     peek-flow).
   *
   * Position toggle: the widget renders horizontally at the top (default)
   * or vertically as a left rail. The owning App.svelte places the widget
   * in the right slot and passes `orientation`; the widget renders the
   * same content in both directions.
   *
   * Pure presentation: receives `steps`, `activeIndex`, `mode`, the
   * `orientation`, and callbacks. Owns no state.
   */

  import { ROTATION, slotById, type Slot } from './remotes';
  import type { LayoutMode, FlowWidgetPosition } from './layout.svelte';

  type Step = {
    id: string;          // ROTATION slot id
    label: string;       // slot.label (composite.label or remote.label)
    description: string; // slot.description
  };

  let {
    activeIndex,
    mode,
    orientation,
    onSelectStep,
    onSelectMode,
    onTogglePosition,
  }: {
    activeIndex: number;
    mode: LayoutMode;
    orientation: FlowWidgetPosition;
    onSelectStep: (slotId: string) => void;
    onSelectMode: (mode: LayoutMode) => void;
    onTogglePosition: () => void;
  } = $props();

  // Derive steps from ROTATION via slotById. composites expose label and
  // description directly; remotes expose them through remote.
  const steps: Step[] = ROTATION.map((id) => {
    const slot = slotById(id);
    if (!slot) return { id, label: id, description: '' };
    if (slot.kind === 'remote') {
      return { id, label: slot.remote.label, description: slot.remote.description };
    }
    return { id, label: slot.composite.label, description: slot.composite.description };
  });
</script>

<div class="flow-widget" class:orientation-top={orientation === 'top'} class:orientation-left={orientation === 'left'}>
  <button
    type="button"
    class="flow-parent"
    class:active={mode === 'peek-flow'}
    title="Flow — left-to-right workflow across the rotation"
    onclick={() => onSelectMode('peek-flow')}
  >
    Flow
  </button>

  <ol class="bubble-strip" aria-label="Workflow steps">
    {#each steps as step, i (step.id)}
      <li>
        <button
          type="button"
          class="bubble"
          class:active={i === activeIndex}
          aria-current={i === activeIndex ? 'step' : undefined}
          title={`${step.label}${step.description ? ' — ' + step.description : ''}`}
          onclick={() => onSelectStep(step.id)}
        >
          <span class="bubble-num">{i + 1}</span>
        </button>
      </li>
    {/each}
  </ol>

  <div class="layout-toggles" role="tablist" aria-label="Layout sub-option">
    <button
      type="button"
      class="layout-toggle"
      class:active={mode === 'co-existence'}
      role="tab"
      aria-selected={mode === 'co-existence'}
      aria-label="Split — two cooperating panes"
      title="Split — two cooperating panes"
      onclick={() => onSelectMode('co-existence')}
    >
      <span aria-hidden="true">⊟</span>
    </button>
    <button
      type="button"
      class="layout-toggle"
      class:active={mode === 'full'}
      role="tab"
      aria-selected={mode === 'full'}
      aria-label="Full — one pane, full bleed"
      title="Full — one pane, full bleed"
      onclick={() => onSelectMode('full')}
    >
      <span aria-hidden="true">▢</span>
    </button>
  </div>

  <button
    type="button"
    class="position-toggle"
    aria-label={orientation === 'top' ? 'Move Flow widget to left rail' : 'Move Flow widget to top'}
    title={orientation === 'top' ? 'Move to left rail' : 'Move to top'}
    onclick={onTogglePosition}
  >
    <span aria-hidden="true">{orientation === 'top' ? '⇲' : '⇱'}</span>
  </button>
</div>

<style>
  .flow-widget {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    color: var(--color-text);
  }
  .orientation-left {
    flex-direction: column;
    gap: 1rem;
    padding: 1rem 0.5rem;
    align-items: center;
  }

  .flow-parent {
    background: transparent;
    color: var(--color-accent);
    border: 0;
    padding: 0;
    font: inherit;
    font-size: 0.95rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    cursor: pointer;
    text-transform: uppercase;
  }
  .flow-parent:hover { color: var(--color-text); }
  .flow-parent.active {
    text-decoration: underline;
    text-decoration-thickness: 2px;
    text-underline-offset: 4px;
  }

  /* Bubble progress strip */
  .bubble-strip {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .orientation-left .bubble-strip {
    flex-direction: column;
    gap: 0.6rem;
  }
  .bubble {
    background: transparent;
    color: var(--color-text-muted);
    border: 1px solid var(--color-border);
    width: 1.75rem;
    height: 1.75rem;
    padding: 0;
    border-radius: 999px;
    font: inherit;
    font-size: 0.75rem;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: border-color 0.12s ease, color 0.12s ease;
  }
  .bubble:hover {
    border-color: var(--color-accent);
    color: var(--color-accent);
  }
  .bubble.active {
    background: var(--color-accent);
    color: var(--color-on-accent);
    border-color: var(--color-accent);
    cursor: default;
  }

  /* Split / Full icon toggles */
  .layout-toggles {
    display: flex;
    gap: 0.3rem;
  }
  .orientation-left .layout-toggles {
    flex-direction: column;
  }
  .layout-toggle {
    background: transparent;
    color: var(--color-text-muted);
    border: 1px solid var(--color-border);
    width: 1.6rem;
    height: 1.6rem;
    padding: 0;
    border-radius: 4px;
    font: inherit;
    font-size: 0.95rem;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .layout-toggle:hover {
    border-color: var(--color-accent);
    color: var(--color-accent);
  }
  .layout-toggle.active {
    background: var(--color-accent);
    color: var(--color-on-accent);
    border-color: var(--color-accent);
    cursor: default;
  }

  .position-toggle {
    background: transparent;
    border: 0;
    color: var(--color-text-muted);
    padding: 0.2rem 0.3rem;
    cursor: pointer;
    font-size: 0.95rem;
    line-height: 1;
    border-radius: 4px;
  }
  .position-toggle:hover { color: var(--color-accent); }
</style>
