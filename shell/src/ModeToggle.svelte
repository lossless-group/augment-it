<script lang="ts">
  import { onMount } from 'svelte';
  import { getMode, cycleMode, onModeChange, type Mode } from '@augment-it/theme/mode-switcher';

  // The 3-mode cycle button — light → dark → vibrant. The mode-switcher
  // owns the data-mode attribute and persistence; this component is pure
  // chrome: show the current mode's icon, cycle on click, stay in sync via
  // the mode-change event (so it tracks changes from anywhere).
  let mode = $state<Mode>(getMode());
  onMount(() => onModeChange((m) => (mode = m)));

  const NEXT: Record<Mode, Mode> = { light: 'dark', dark: 'vibrant', vibrant: 'light' };
</script>

<button
  class="mode-toggle"
  onclick={() => cycleMode()}
  title={`Mode: ${mode} — click for ${NEXT[mode]}`}
  aria-label={`Theme mode: ${mode}. Click to switch to ${NEXT[mode]}.`}
>
  {#if mode === 'light'}
    <!-- sun -->
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  {:else if mode === 'dark'}
    <!-- moon -->
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  {:else}
    <!-- star -->
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
      <path d="M12 2l2.5 7.6H22l-6.1 4.7 2.3 7.7L12 17.3 5.8 22l2.3-7.7L2 9.6h7.5z" />
    </svg>
  {/if}
  <span class="mode-label">{mode}</span>
</button>

<style>
  .mode-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    background: transparent;
    color: var(--color-text);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    padding: 3px 9px;
    font: inherit;
    font-size: 11px;
    cursor: pointer;
    text-transform: capitalize;
  }
  .mode-toggle:hover {
    border-color: var(--color-accent);
    color: var(--color-accent);
    box-shadow: var(--fx-accent-glow);
  }
  .mode-label { letter-spacing: 0.03em; }
</style>
