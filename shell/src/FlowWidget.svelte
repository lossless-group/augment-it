<script lang="ts">
  /**
   * Hierarchical Flow widget (spec Decision §8 / Phase 4).
   *
   * Three tiers:
   *  1. Parent label "Flow" — raised above the rest.
   *  2. Numbered bubble progress strip — one bubble per active-flow step,
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

  import { slotById, type Slot } from './remotes';
  import type { LayoutMode, FlowWidgetPosition } from './layout.svelte';

  type Step = {
    id: string;          // rotation slot id
    label: string;       // slot.label (composite.label or remote.label)
    description: string; // slot.description
  };

  let {
    rotation,
    activeIndex,
    mode,
    orientation,
    onSelectStep,
    onSelectMode,
    onTogglePosition,
  }: {
    rotation: string[]; // the ACTIVE flow's rotation (shell/src/flows.svelte.ts) — not a fixed constant
    activeIndex: number;
    mode: LayoutMode;
    orientation: FlowWidgetPosition;
    onSelectStep: (slotId: string) => void;
    onSelectMode: (mode: LayoutMode) => void;
    onTogglePosition: () => void;
  } = $props();

  // Derive steps from the active flow's rotation via slotById. $derived,
  // not a plain const — `rotation` changes when the operator switches
  // flows, and the bubble strip needs to re-render with the new step
  // count. composites expose label and description directly; remotes
  // expose them through remote.
  const steps: Step[] = $derived(
    rotation.map((id) => {
      const slot = slotById(id);
      if (!slot) return { id, label: id, description: '' };
      if (slot.kind === 'remote') {
        return { id, label: slot.remote.label, description: slot.remote.description };
      }
      return { id, label: slot.composite.label, description: slot.composite.description };
    }),
  );
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
      <li
        class="step"
        class:visited={i < activeIndex}
        class:current={i === activeIndex}
        class:upcoming={i > activeIndex}
      >
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
        {#if i < steps.length - 1}
          <span
            class="connector"
            class:visited={i < activeIndex}
            class:current={i === activeIndex}
            class:upcoming={i >= activeIndex + 1}
            aria-hidden="true"
          ></span>
        {/if}
      </li>
    {/each}
  </ol>

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

  /* Bubble progress strip — bubbles connected by a state-aware line.
     Visited connectors render in muted accent; the current connector
     fades from glow to muted; upcoming connectors are border-color
     hairlines. Same convention applies vertically when the widget is
     on the left rail (orientation-left). */
  .bubble-strip {
    display: flex;
    align-items: center;
    gap: 0;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .orientation-left .bubble-strip {
    flex-direction: column;
  }

  .step {
    display: inline-flex;
    align-items: center;
  }
  .orientation-left .step {
    flex-direction: column;
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
    transition: border-color 0.18s ease, color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
  }

  /* Visited: filled in muted-accent — "you've been here." */
  .step.visited .bubble {
    background: color-mix(in srgb, var(--color-accent) 35%, transparent);
    border-color: color-mix(in srgb, var(--color-accent) 55%, transparent);
    color: var(--color-on-accent, var(--color-text));
  }
  /* Current: filled bright + glow halo — "you are here." */
  .step.current .bubble,
  .bubble.active {
    background: var(--color-accent);
    color: var(--color-on-accent);
    border-color: var(--color-accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-accent) 25%, transparent),
                0 0 12px color-mix(in srgb, var(--color-accent) 45%, transparent);
    cursor: default;
  }
  /* Upcoming: hollow with muted border — "you'll get here." */
  .step.upcoming .bubble {
    background: transparent;
    border-color: var(--color-border);
    color: var(--color-text-muted);
  }
  .bubble:hover {
    border-color: var(--color-accent);
    color: var(--color-accent);
  }

  /* Connecting line between bubbles. Each connector sits between bubble i
     and bubble i+1. State maps to the segment's relationship to current:
       visited  — both endpoints behind current  → muted accent
       current  — segment leading INTO current   → gradient muted-accent → glow
       upcoming — segment after current          → hairline border-color */
  .connector {
    display: inline-block;
    height: 2px;
    width: 1.2rem;
    background: var(--color-border);
    transition: background 0.18s ease, opacity 0.18s ease;
  }
  .connector.visited {
    background: color-mix(in srgb, var(--color-accent) 55%, transparent);
  }
  .connector.current {
    background: linear-gradient(
      to right,
      color-mix(in srgb, var(--color-accent) 55%, transparent),
      var(--color-accent)
    );
    box-shadow: 0 0 6px color-mix(in srgb, var(--color-accent) 40%, transparent);
  }
  .connector.upcoming {
    background: var(--color-border);
    opacity: 0.65;
  }

  /* Vertical orientation — same states, rotated geometry. */
  .orientation-left .connector {
    width: 2px;
    height: 1.2rem;
    background: var(--color-border);
  }
  .orientation-left .connector.visited {
    background: color-mix(in srgb, var(--color-accent) 55%, transparent);
  }
  .orientation-left .connector.current {
    background: linear-gradient(
      to bottom,
      color-mix(in srgb, var(--color-accent) 55%, transparent),
      var(--color-accent)
    );
  }
  .orientation-left .connector.upcoming {
    background: var(--color-border);
    opacity: 0.65;
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
