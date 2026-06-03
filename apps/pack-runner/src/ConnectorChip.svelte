<script lang="ts">
  // Single chip in the per-record palette. Names an INTENT
  // ("search.social.facebook" → `f`), not a connector — multiple connectors
  // can live behind one chip. Default click fires the pack through its
  // preferred-connector chain; long-press opens a menu of available
  // connectors for that intent.
  //
  // Spec: context-v/specs/Connector-Inventory-and-Per-Record-Palette.md
  // §"UI seam — the per-record palette".

  export type ChipState =
    | { kind: 'idle' }
    | { kind: 'firing' }
    | { kind: 'found'; count: number }
    | { kind: 'not_found' }
    | { kind: 'error'; message?: string }
    | { kind: 'rate_limited' }
    | { kind: 'needs_env'; missing: string[] }
    | { kind: 'accepted' };

  type Props = {
    intent: string;
    short_label: string;
    display_name: string;
    accent?: string;
    state: ChipState;
    // The chain that will be walked on default click. Surfaced as a tooltip
    // line so the user knows what's "behind" the chip without long-pressing.
    chain_summary?: string;
    onclick: () => void;
    onlongpress: (event: MouseEvent | KeyboardEvent) => void;
  };

  let {
    intent,
    short_label,
    display_name,
    accent = 'var(--color-text)',
    state,
    chain_summary,
    onclick,
    onlongpress,
  }: Props = $props();

  // Long-press detection — 450ms is the sweet spot from prior work. Tracks
  // mousedown timestamps; if mouseup happens after the threshold OR a
  // contextmenu event fires, treat as long-press.
  const LONG_PRESS_MS = 450;
  let pressTimer: ReturnType<typeof setTimeout> | null = null;
  let longPressed = false;

  function startPress(event: MouseEvent) {
    longPressed = false;
    pressTimer = setTimeout(() => {
      longPressed = true;
      onlongpress(event);
    }, LONG_PRESS_MS);
  }

  function endPress(event: MouseEvent) {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
    if (!longPressed) {
      // Defer so any contextmenu handler can preempt.
      if (state.kind !== 'firing' && state.kind !== 'needs_env') onclick();
    }
  }

  function cancelPress() {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  }

  function onContextMenu(event: MouseEvent) {
    event.preventDefault();
    cancelPress();
    onlongpress(event);
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (state.kind !== 'firing' && state.kind !== 'needs_env') onclick();
    } else if (event.key === 'ArrowDown' || event.shiftKey && event.key === 'F10') {
      event.preventDefault();
      onlongpress(event);
    }
  }

  const stateLabel = $derived.by(() => {
    switch (state.kind) {
      case 'idle': return 'idle';
      case 'firing': return 'firing…';
      case 'found': return `found ${state.count}`;
      case 'not_found': return 'no results';
      case 'error': return `error${state.message ? `: ${state.message}` : ''}`;
      case 'rate_limited': return 'rate-limited';
      case 'needs_env': return `needs ${state.missing.join(', ')}`;
      case 'accepted': return 'already accepted';
    }
  });

  const title = $derived.by(() => {
    const lines = [`${display_name} (${intent})`, stateLabel];
    if (chain_summary) lines.push(`Chain: ${chain_summary}`);
    lines.push('Click to fire; long-press / right-click for connector menu');
    return lines.join('\n');
  });
</script>

<button
  class="connector-chip"
  class:idle={state.kind === 'idle'}
  class:firing={state.kind === 'firing'}
  class:found={state.kind === 'found'}
  class:not-found={state.kind === 'not_found'}
  class:error={state.kind === 'error'}
  class:rate-limited={state.kind === 'rate_limited'}
  class:needs-env={state.kind === 'needs_env'}
  class:accepted={state.kind === 'accepted'}
  style:--chip-accent={accent}
  {title}
  aria-label={title}
  disabled={state.kind === 'needs_env' || state.kind === 'firing'}
  onmousedown={startPress}
  onmouseup={endPress}
  onmouseleave={cancelPress}
  oncontextmenu={onContextMenu}
  onkeydown={onKey}
>
  {#if state.kind === 'firing'}
    <span class="spinner" aria-hidden="true"></span>
  {:else}
    <span class="label">{short_label}</span>
  {/if}
  {#if state.kind === 'found'}
    <span class="badge count" aria-hidden="true">{state.count}</span>
  {:else if state.kind === 'accepted'}
    <span class="badge check" aria-hidden="true">✓</span>
  {:else if state.kind === 'rate_limited'}
    <span class="badge clock" aria-hidden="true">⏱</span>
  {:else if state.kind === 'needs_env'}
    <span class="badge env" aria-hidden="true">⚿</span>
  {:else if state.kind === 'error'}
    <span class="badge bang" aria-hidden="true">!</span>
  {/if}
</button>

<style>
  .connector-chip {
    --chip-accent: var(--color-text);
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 2.25rem;
    height: 1.75rem;
    padding: 0 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background: transparent;
    color: var(--color-text-muted);
    font-size: 0.8rem;
    font-weight: 600;
    font-family: ui-monospace, monospace;
    cursor: pointer;
    user-select: none;
    transition: all 120ms ease;
  }
  .connector-chip:hover:not(:disabled) {
    border-color: var(--chip-accent);
    color: var(--chip-accent);
  }
  .connector-chip.found {
    background: var(--chip-accent);
    color: white;
    border-color: var(--chip-accent);
  }
  .connector-chip.firing {
    border-color: var(--chip-accent);
    color: var(--chip-accent);
  }
  .connector-chip.not-found .label {
    text-decoration: line-through;
    opacity: 0.6;
  }
  .connector-chip.error {
    border-color: var(--color-error-text);
    color: var(--color-error-text);
  }
  .connector-chip.rate-limited {
    border-style: dashed;
    opacity: 0.7;
  }
  .connector-chip.needs-env {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .connector-chip.accepted .label {
    color: var(--chip-accent);
  }
  .label { letter-spacing: 0.02em; }
  .badge {
    position: absolute;
    top: -0.4rem;
    right: -0.35rem;
    min-width: 0.95rem;
    height: 0.95rem;
    padding: 0 0.2rem;
    border-radius: 0.5rem;
    background: var(--chip-accent);
    color: white;
    font-size: 0.6rem;
    line-height: 0.95rem;
    text-align: center;
    pointer-events: none;
  }
  .badge.check { background: var(--color-ok-text, #2a8a3a); }
  .badge.bang { background: var(--color-error-text); }
  .badge.env { background: var(--color-text-muted); }
  .badge.clock { background: transparent; color: var(--color-text-muted); }
  .spinner {
    display: inline-block;
    width: 0.85rem;
    height: 0.85rem;
    border: 2px solid var(--chip-accent);
    border-right-color: transparent;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
