<script lang="ts">
  import { onMount } from 'svelte';
  import ModeToggle from './ModeToggle.svelte';
  import MountHost from './MountHost.svelte';
  import { REMOTES, PAIRINGS, CHAT_REMOTE, remoteById, type RemoteEntry } from './remotes';
  import { layout, type LayoutMode } from './layout.svelte';

  // Chat rail visibility — persistent left-side companion to the focused
  // Window. Toggleable from the header; persisted to localStorage so a
  // user's preference survives reloads. Per the four-roles model in
  // context-v/blueprints/Chat-As-Verb-Surface-Patterns.md, the chat is a
  // peer to the Window (not a remote in the rotation) — it goes WITH the
  // user as they switch which Window they're focused on.
  const CHAT_VISIBLE_KEY = 'augment-it:chat-rail-visible';
  let chatVisible = $state<boolean>(
    typeof localStorage === 'undefined' ? true : localStorage.getItem(CHAT_VISIBLE_KEY) !== 'false',
  );
  function toggleChat(): void {
    chatVisible = !chatVisible;
    try {
      localStorage.setItem(CHAT_VISIBLE_KEY, String(chatVisible));
    } catch {
      /* localStorage unavailable */
    }
  }

  // ---- geometry constants -------------------------------------------------
  const HOVER_PCT = 38;       // a hovered peek neighbour expands to this width
  const MIN_PEEK = 4;         // a peek neighbour never narrower than this

  type StageRole = 'focused' | 'prev' | 'next' | 'pair-left' | 'pair-right' | 'full';
  type StageItem = {
    id: string;
    remote: RemoteEntry;
    widthPct: number;
    zIndex: number;
    role: StageRole;
  };

  // ---- transient interaction state (never persisted) ----------------------
  let hoveredNeighborId = $state<string | null>(null);
  let stageEl = $state<HTMLDivElement | undefined>(undefined);
  let resizing = $state<boolean>(false);
  let splitting = $state<boolean>(false);

  // ---- the stage geometry — derived from layout + interaction -------------
  const stage = $derived.by<StageItem[]>(() => {
    if (layout.mode === 'full') {
      const r = REMOTES[layout.focusIndex];
      return r ? [{ id: r.id, remote: r, widthPct: 100, zIndex: 1, role: 'full' }] : [];
    }

    if (layout.mode === 'co-existence') {
      const pairing = PAIRINGS.find((p) => p.key === layout.activePairKey) ?? PAIRINGS[0];
      if (!pairing) return [];
      const left = remoteById(pairing.left);
      const right = remoteById(pairing.right);
      if (!left || !right) return [];
      const leftPct = layout.ratioFor(pairing.key, pairing.defaultLeftPct);
      return [
        { id: left.id, remote: left, widthPct: leftPct, zIndex: 1, role: 'pair-left' },
        { id: right.id, remote: right, widthPct: 100 - leftPct, zIndex: 1, role: 'pair-right' },
      ];
    }

    // peek-deck
    const i = layout.focusIndex;
    const focused = REMOTES[i];
    if (!focused) return [];
    const prev = REMOTES[i - 1];
    const next = REMOTES[i + 1];
    const neighbours = [prev, next].filter(Boolean) as RemoteEntry[];
    const remainder = 100 - layout.focusedWidthPct;
    const peekEach = neighbours.length ? Math.max(MIN_PEEK, remainder / neighbours.length) : 0;

    const hoveredIsNeighbour =
      hoveredNeighborId !== null && neighbours.some((n) => n.id === hoveredNeighborId);
    const widthOf = (n: RemoteEntry): number =>
      hoveredIsNeighbour && n.id === hoveredNeighborId ? HOVER_PCT : peekEach;

    const items: StageItem[] = [];
    if (prev) {
      items.push({
        id: prev.id, remote: prev, widthPct: widthOf(prev),
        zIndex: prev.id === hoveredNeighborId ? 2 : 1, role: 'prev',
      });
    }
    const consumed =
      (prev ? widthOf(prev) : 0) + (next ? widthOf(next) : 0);
    items.push({
      id: focused.id, remote: focused, widthPct: Math.max(20, 100 - consumed),
      zIndex: 3, role: 'focused',
    });
    if (next) {
      items.push({
        id: next.id, remote: next, widthPct: widthOf(next),
        zIndex: next.id === hoveredNeighborId ? 2 : 1, role: 'next',
      });
    }
    return items;
  });

  // ---- peek-deck: commit a neighbour as the new focus ---------------------
  function commitFocus(remoteId: string): void {
    const idx = REMOTES.findIndex((r) => r.id === remoteId);
    if (idx >= 0) {
      hoveredNeighborId = null;
      layout.setFocusIndex(idx);
    }
  }

  // ---- focused-panel edge resize (peek-deck) ------------------------------
  function startResize(e: PointerEvent): void {
    e.preventDefault();
    resizing = true;
    const onMove = (ev: PointerEvent) => {
      if (!stageEl) return;
      const rect = stageEl.getBoundingClientRect();
      // distance of the cursor from the stage centre, doubled, is the
      // focused panel's width as a fraction of the stage.
      const centre = rect.left + rect.width / 2;
      const pct = (Math.abs(ev.clientX - centre) * 2) / rect.width * 100;
      layout.setFocusedWidth(pct);
    };
    const onUp = () => {
      resizing = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  // ---- co-existence splitter drag ----------------------------------------
  function startSplitter(e: PointerEvent): void {
    e.preventDefault();
    const pairing = PAIRINGS.find((p) => p.key === layout.activePairKey) ?? PAIRINGS[0];
    if (!pairing) return;
    splitting = true;
    const onMove = (ev: PointerEvent) => {
      if (!stageEl) return;
      const rect = stageEl.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      layout.setRatio(pairing.key, pct);
    };
    const onUp = () => {
      splitting = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  // ---- single-record enrich trigger (dispatched by record-collector) ------
  onMount(() => {
    const onEnrich = () => {
      const pairing = PAIRINGS[0];
      if (pairing) layout.openPair(pairing.key);
    };
    window.addEventListener('augment-it:enrich-record', onEnrich);
    return () => window.removeEventListener('augment-it:enrich-record', onEnrich);
  });

  // ---- cross-remote navigation (dispatched by any remote) -----------------
  // Remotes that want to send the user to a different surface dispatch a
  // window event:  window.dispatchEvent(new CustomEvent('augment-it:navigate',
  //   { detail: { remoteId: 'promptTemplateManager', mode?: 'full'|'co-existence' }}))
  // The shell switches layout accordingly. Used by enhanced-records-list's
  // post-promotion "Do another round of enhancements" affordance.
  onMount(() => {
    const onNavigate = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { remoteId?: string; mode?: LayoutMode }
        | undefined;
      if (!detail?.remoteId) return;
      const idx = REMOTES.findIndex((r) => r.id === detail.remoteId);
      if (idx >= 0) {
        // Standard rotation remote — switch focus + mode as requested.
        layout.setFocusIndex(idx);
        layout.setMode(detail.mode ?? 'full');
        return;
      }
      // Not in the rotation — might be a "pair-only" remote like packRunner.
      // If a PAIRING includes it, open the pair in co-existence mode so the
      // user lands somewhere usable rather than nowhere.
      const pairing = PAIRINGS.find(
        (p) => p.left === detail.remoteId || p.right === detail.remoteId,
      );
      if (pairing) {
        layout.openPair(pairing.key);
      }
    };
    window.addEventListener('augment-it:navigate', onNavigate);
    return () => window.removeEventListener('augment-it:navigate', onNavigate);
  });

  const MODE_BUTTONS: { mode: LayoutMode; label: string }[] = [
    { mode: 'peek-deck', label: 'Deck' },
    { mode: 'co-existence', label: 'Split' },
    { mode: 'full', label: 'Full' },
  ];

  function selectMode(mode: LayoutMode): void {
    if (mode === 'co-existence') {
      const pairing = PAIRINGS[0];
      if (pairing) layout.openPair(pairing.key);
    } else {
      layout.setMode(mode);
    }
  }

  const showSplitter = $derived(layout.mode === 'co-existence' && stage.length === 2);
</script>

<header>
  <div class="brand">
    <strong>augment-it</strong>
    <span class="muted">· shell</span>
  </div>
  <nav>
    {#each MODE_BUTTONS as b (b.mode)}
      <button class:active={layout.mode === b.mode} onclick={() => selectMode(b.mode)}>
        {b.label}
      </button>
    {/each}
  </nav>
  <div class="metrics">
    <button
      class="chat-toggle"
      class:on={chatVisible}
      onclick={() => toggleChat()}
      aria-pressed={chatVisible}
      title={chatVisible ? 'Hide chat rail' : 'Show chat rail'}
    >
      💬 chat
    </button>
    <span class="muted">tiling host · :3100</span>
    <ModeToggle />
  </div>
</header>

<div class="below-header" class:has-chat={chatVisible}>
  {#if chatVisible}
    <aside class="chat-rail" aria-label="Chat panel">
      <MountHost remote={CHAT_REMOTE} />
    </aside>
  {/if}
  <main
    class="stage"
    class:fast={hoveredNeighborId !== null}
    class:dragging={resizing || splitting}
    bind:this={stageEl}
  >
  {#each stage as item (item.id)}
    {@const isInteractive = item.role !== 'prev' && item.role !== 'next'}
    <section class="slot" class:slot-peek={!isInteractive}
      style="width: {item.widthPct}%; z-index: {item.zIndex};">
      <MountHost remote={item.remote} />

      {#if !isInteractive}
        <!-- peek neighbour: a click-capture overlay. Hover expands it,
             click commits it as the new focus. The live app underneath is
             not interactive while it is a neighbour. -->
        <button
          class="peek-overlay"
          aria-label={`Focus ${item.remote.label}`}
          onmouseenter={() => (hoveredNeighborId = item.id)}
          onmouseleave={() => (hoveredNeighborId = null)}
          onclick={() => commitFocus(item.id)}
        >
          <span class="peek-label">{item.remote.label}</span>
        </button>
      {/if}

      {#if item.role === 'focused'}
        <!-- focused-panel resize edges — distinct pixels from the peek
             overlays, so a resize-drag never fires a focus-commit. -->
        <div class="resize-edge resize-edge-left"
          onpointerdown={startResize}
          role="separator" aria-label="Resize focused panel" tabindex="-1"></div>
        <div class="resize-edge resize-edge-right"
          onpointerdown={startResize}
          role="separator" aria-label="Resize focused panel" tabindex="-1"></div>
      {/if}
    </section>
  {/each}

  {#if showSplitter}
    {@const leftPct = stage[0].widthPct}
    <div class="splitter" style="left: {leftPct}%;"
      onpointerdown={startSplitter}
      role="separator" aria-orientation="vertical"
      aria-label="Resize the two panels" tabindex="-1"></div>
  {/if}

  {#if stage.length === 0}
    <div class="empty">no frontend to show</div>
  {/if}
  </main>
</div>

<style>
  header {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 1.5rem;
    align-items: center;
    padding: 0.75rem 1.5rem;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface-raised);
    position: sticky;
    top: 0;
    z-index: 100;
    height: 56px;
    box-sizing: border-box;
  }
  .brand strong { color: var(--color-accent); font-size: 1.05rem; }
  .brand .muted { color: var(--color-text-muted); }
  nav { display: flex; gap: 0.5rem; }
  nav button {
    background: transparent;
    color: var(--color-text);
    border: 1px solid var(--color-border);
    padding: 4px 12px;
    border-radius: 4px;
    font: inherit;
    cursor: pointer;
  }
  nav button:hover { border-color: var(--color-accent); }
  nav button.active {
    background: var(--color-selected-tint);
    border-color: var(--color-accent);
    color: var(--color-accent);
  }
  .metrics { display: flex; gap: 0.75rem; align-items: center; font-size: 11px; }
  .muted { color: var(--color-text-muted); }

  /* ---- chat toggle in the header ---- */
  .chat-toggle {
    background: transparent;
    color: var(--color-text-muted);
    border: 1px solid var(--color-border);
    padding: 4px 10px;
    border-radius: 4px;
    font: inherit;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.12s ease;
  }
  .chat-toggle:hover { border-color: var(--color-accent); color: var(--color-text); }
  .chat-toggle.on {
    background: var(--color-selected-tint);
    border-color: var(--color-accent);
    color: var(--color-accent);
  }

  /* ---- below-header: chat rail on the left, stage on the right ---- */
  .below-header {
    display: flex;
    align-items: stretch;
    height: calc(100vh - 56px);
    overflow: hidden;
  }
  .chat-rail {
    width: 360px;
    min-width: 280px;
    max-width: 480px;
    flex-shrink: 0;
    border-right: 1px solid var(--color-border);
    background: var(--color-surface-raised, var(--color-background));
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  /* ---- the tiling stage ---- */
  .stage {
    position: relative;
    display: flex;
    align-items: stretch;
    flex: 1;
    min-width: 0;
    height: 100%;
    overflow: hidden;
    background: var(--color-background);
  }
  .stage.dragging { user-select: none; cursor: col-resize; }

  .slot {
    position: relative;
    height: 100%;
    overflow: hidden;
    background: var(--color-background);
    /* default: the slow, eased snap-back (~1.9s, slow → fast → slow) */
    transition: width 1.9s cubic-bezier(0.45, 0.05, 0.55, 0.95);
  }
  /* while a neighbour is hovered, every slot redistributes FAST */
  .stage.fast .slot { transition: width 0.2s ease-out; }
  /* no transition mid-drag — the pointer drives the width directly */
  .stage.dragging .slot { transition: none; }

  /* the focused / interactive slot reads as raised */
  .slot:not(.slot-peek) {
    box-shadow: var(--fx-card-shadow);
  }

  /* peek neighbour click-capture overlay */
  .peek-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 1.5rem;
    background: color-mix(in srgb, var(--color-background) 55%, transparent);
    border: 0;
    border-left: 1px solid var(--color-border);
    border-right: 1px solid var(--color-border);
    cursor: pointer;
    font: inherit;
  }
  .peek-overlay:hover {
    background: color-mix(in srgb, var(--color-background) 22%, transparent);
  }
  .peek-label {
    color: var(--color-text-muted);
    font-size: 11px;
    writing-mode: vertical-rl;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  /* focused-panel resize edges */
  .resize-edge {
    position: absolute;
    top: 0;
    width: 8px;
    height: 100%;
    cursor: col-resize;
    z-index: 5;
  }
  .resize-edge-left { left: 0; }
  .resize-edge-right { right: 0; }
  .resize-edge:hover {
    background: color-mix(in srgb, var(--color-accent) 25%, transparent);
  }

  /* co-existence splitter */
  .splitter {
    position: absolute;
    top: 0;
    width: 8px;
    height: 100%;
    margin-left: -4px;
    cursor: col-resize;
    z-index: 50;
    background: var(--color-border);
  }
  .splitter:hover {
    background: var(--color-accent);
    box-shadow: var(--fx-accent-glow);
  }

  .empty {
    margin: auto;
    color: var(--color-text-muted);
  }
</style>
