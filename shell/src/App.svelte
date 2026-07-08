<script lang="ts">
  import { onMount } from 'svelte';
  import ModeToggle from './ModeToggle.svelte';
  import MountHost from './MountHost.svelte';
  import FlowWidget from './FlowWidget.svelte';
  import WorkspaceSwitcher from './WorkspaceSwitcher.svelte';
  import DidiBadge from './DidiBadge.svelte';
  import SignInWall from './SignInWall.svelte';
  import JumboPopdown, { type PopdownItem } from './JumboPopdown.svelte';
  import ToggleHeader from '@augment-it/shared-ui/ToggleHeader__PromptOrPackage--Icons.svelte';
  import { workspace } from '@augment-it/workspace';
  import {
    PAIRINGS,
    CHAT_REMOTE,
    remoteById,
    slotById,
    type RemoteEntry,
    type Slot,
  } from './remotes';
  import {
    COMPOSITES,
    readActiveMemberId,
    writeActiveMemberId,
    compositeFor,
    type CompositeEntry,
  } from './composites';
  import { layout, type LayoutMode } from './layout.svelte';
  import { activeFlow, FLOWS } from './flows.svelte';

  // workspace-service's WS endpoint — every app that connects to it directly
  // (this shell, plus the strategy-curator and chat remotes independently)
  // reads the same PUBLIC_WS_URL, defaulting to localhost for dev. Rsbuild
  // inlines PUBLIC_-prefixed env vars into import.meta.env at build time
  // (same convention DidiBadge.svelte's PUBLIC_ID_BASE already uses).
  // Deriving the plain-HTTP base from it (ws→http, wss→https) rather than a
  // second env var — Step 7's /config check needs the same origin, not the
  // WS scheme.
  const WS_URL =
    ((import.meta as { env?: Record<string, string> }).env?.PUBLIC_WS_URL as string | undefined) ??
    'ws://localhost:3001/ws';
  const WS_HTTP_BASE = WS_URL.replace(/^ws/, 'http').replace(/\/ws$/, '');

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

  // ---- pre-auth wall (Build-Order Step 7) --------------------------------
  // A single-tenant deploy sets DIDI_AUTH=required; the session frame
  // carries that posture (workspace.didi_auth_mode) so the shell can
  // decide BEFORE mounting any remote, rather than let each one fail
  // capability calls closed one at a time. Unknown (null, pre-session)
  // reads as "don't show the wall yet" — the session frame lands
  // effectively instantly after the WS opens, so there's nothing worth
  // building a loading skeleton around.
  const showWall = $derived(
    workspace.didi_auth_mode === 'required' && !workspace.user?.didi_id,
  );

  // ---- composite slots — active-member state ----------------------------
  // A composite slot hosts one-of-N remotes based on shared state. We
  // keep the active member id per composite as reactive state so the
  // stage derived re-builds when the user clicks the in-slot toggle.
  // The state is also published via the composite's modeKey window event,
  // so external dispatchers (e.g. cross-remote augment-it:navigate) keep
  // working.
  let activeMembers = $state<Record<string, string>>(
    Object.fromEntries(COMPOSITES.map((c) => [c.id, readActiveMemberId(c)])),
  );

  function setCompositeMember(c: CompositeEntry, memberId: string): void {
    activeMembers = { ...activeMembers, [c.id]: memberId };
    writeActiveMemberId(c, memberId);
  }

  // ---- geometry constants -------------------------------------------------
  const HOVER_PCT = 38;       // a hovered peek neighbour expands to this width
  const MIN_PEEK = 4;         // a peek neighbour never narrower than this

  type StageRole = 'focused' | 'prev' | 'next' | 'pair-left' | 'pair-right' | 'full';
  type StageItem = {
    id: string;                  // rotation slot id (remote id or composite id); stable across composite toggles
    remote: RemoteEntry;         // the active remote for this slot (resolved composite member, or the remote itself)
    label: string;               // user-facing label — composite.label for composites, remote.label otherwise
    widthPct: number;
    zIndex: number;
    role: StageRole;
    composite?: CompositeEntry;  // when set, render ToggleHeader above MountHost and {#key} the mount on active-member changes
  };

  function materializeSlot(slot: Slot, widthPct: number, role: StageRole, zIndex = 1): StageItem | null {
    if (slot.kind === 'remote') {
      return {
        id: slot.remote.id,
        remote: slot.remote,
        label: slot.remote.label,
        widthPct,
        zIndex,
        role,
      };
    }
    const c = slot.composite;
    const activeId = activeMembers[c.id] ?? c.defaultMemberId;
    const remote = remoteById(activeId);
    if (!remote) return null;
    return {
      id: c.id,
      remote,
      label: c.label,
      widthPct,
      zIndex,
      role,
      composite: c,
    };
  }

  // ---- transient interaction state (never persisted) ----------------------
  let hoveredNeighborId = $state<string | null>(null);
  let stageEl = $state<HTMLDivElement | undefined>(undefined);
  let resizing = $state<boolean>(false);
  let splitting = $state<boolean>(false);

  // ---- the stage geometry — derived from layout + interaction -------------
  // All three modes walk activeFlow.rotation (the ACTIVE flow's list of
  // slot ids — shell/src/flows.svelte.ts) and resolve each id via
  // slotById() — a slot can be a federated remote or a composite. The
  // composite case keeps a ToggleHeader in the slot in every layout mode,
  // so the in-slot toggle (e.g. enrichment's PTM⇄Pack-Runner pair) works
  // in Flow, Split, and Full alike (Phase 2d).
  const stage = $derived.by<StageItem[]>(() => {
    const rotation = activeFlow.rotation;
    if (layout.mode === 'full') {
      const slot = slotById(rotation[layout.focusIndex]);
      if (!slot) return [];
      const item = materializeSlot(slot, 100, 'full');
      return item ? [item] : [];
    }

    if (layout.mode === 'co-existence') {
      const pairing = PAIRINGS.find((p) => p.key === layout.activePairKey) ?? PAIRINGS[0];
      if (!pairing) return [];
      const leftSlot = slotById(pairing.left);
      const rightSlot = slotById(pairing.right);
      if (!leftSlot || !rightSlot) return [];
      const leftPct = layout.ratioFor(pairing.key, pairing.defaultLeftPct);
      const items: StageItem[] = [];
      const l = materializeSlot(leftSlot, leftPct, 'pair-left');
      const r = materializeSlot(rightSlot, 100 - leftPct, 'pair-right');
      if (l) items.push(l);
      if (r) items.push(r);
      return items;
    }

    // peek-flow
    const i = layout.focusIndex;
    const focusedSlot = slotById(rotation[i]);
    if (!focusedSlot) return [];
    const prevSlot = i > 0 ? slotById(rotation[i - 1]) : undefined;
    const nextSlot = i < rotation.length - 1 ? slotById(rotation[i + 1]) : undefined;
    const neighbourCount = (prevSlot ? 1 : 0) + (nextSlot ? 1 : 0);
    const remainder = 100 - layout.focusedWidthPct;
    const peekEach = neighbourCount ? Math.max(MIN_PEEK, remainder / neighbourCount) : 0;

    const slotKey = (s: Slot): string => (s.kind === 'remote' ? s.remote.id : s.composite.id);
    const isHovered = (s: Slot): boolean =>
      hoveredNeighborId !== null && slotKey(s) === hoveredNeighborId;
    const widthOf = (s: Slot): number => (isHovered(s) ? HOVER_PCT : peekEach);

    const items: StageItem[] = [];
    if (prevSlot) {
      const item = materializeSlot(
        prevSlot,
        widthOf(prevSlot),
        'prev',
        isHovered(prevSlot) ? 2 : 1,
      );
      if (item) items.push(item);
    }
    const consumed =
      (prevSlot ? widthOf(prevSlot) : 0) + (nextSlot ? widthOf(nextSlot) : 0);
    const focused = materializeSlot(focusedSlot, Math.max(20, 100 - consumed), 'focused', 3);
    if (focused) items.push(focused);
    if (nextSlot) {
      const item = materializeSlot(
        nextSlot,
        widthOf(nextSlot),
        'next',
        isHovered(nextSlot) ? 2 : 1,
      );
      if (item) items.push(item);
    }
    return items;
  });

  // ---- peek-flow: commit a neighbour as the new focus ---------------------
  function commitFocus(slotId: string): void {
    const idx = activeFlow.rotation.findIndex((id) => id === slotId);
    if (idx >= 0) {
      hoveredNeighborId = null;
      layout.setFocusIndex(idx);
    }
  }

  // ---- focused-panel edge resize (peek-flow) ------------------------------
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

  // ---- workspace bootstrap -----------------------------------------------
  // The shell now makes its own capability calls (workspace.list / .activate
  // from the header switcher), so its singleton needs its OWN transport.
  // Each federation remote also connects, but those instances are separate
  // — no `shared` block in rsbuild config — and pre-today the shell didn't
  // dispatch anything itself.
  //
  // Connect first, then load workspaces. `workspace.connect()` is idempotent
  // on the singleton, so if a remote raced us and connected first the
  // second call is a no-op.
  onMount(() => {
    const TOKEN_KEY = 'augment_it_session_token';
    // Fire BEFORE/alongside connect(), not after — an anonymous WS upgrade
    // against a DIDI_AUTH=required instance is rejected (4401) before any
    // session frame ships, so this plain GET is the only way an
    // unauthenticated visitor's shell learns the wall should render.
    void workspace.fetchDidiAuthMode(WS_HTTP_BASE);
    workspace.connect({
      url: WS_URL,
      getToken: () => localStorage.getItem(TOKEN_KEY),
      saveToken: (t) => localStorage.setItem(TOKEN_KEY, t),
      onStatus: () => {
        /* shell doesn't render its own connection indicator — the chat rail does */
      },
    });
    let cancelled = false;
    const tryLoad = async (attempt = 0): Promise<void> => {
      if (cancelled) return;
      try {
        await workspace.loadWorkspaces();
      } catch (err) {
        if (attempt < 8) {
          setTimeout(() => tryLoad(attempt + 1), 200 * (attempt + 1));
        } else {
          console.warn('[shell] workspace.list failed; switcher will be empty', err);
        }
      }
    };
    void tryLoad();
    return () => {
      cancelled = true;
    };
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
      // Direct rotation hit — the requested id is a slot in the ACTIVE
      // flow's rotation (a remote or a composite). Set focus + mode and
      // we're done.
      const rotIdx = activeFlow.rotation.findIndex((id) => id === detail.remoteId);
      if (rotIdx >= 0) {
        layout.setFocusIndex(rotIdx);
        layout.setMode(detail.mode ?? 'full');
        return;
      }
      // The id might be a composite member (e.g. `packRunner` inside the
      // enrichment composite). Set the composite's active member; then
      // either focus its rotation slot (if the composite is in the active
      // flow's rotation) or open its co-existence pairing.
      const composite = compositeFor(detail.remoteId);
      if (composite) {
        setCompositeMember(composite, detail.remoteId);
        const compIdx = activeFlow.rotation.findIndex((id) => id === composite.id);
        if (compIdx >= 0) {
          layout.setFocusIndex(compIdx);
          layout.setMode(detail.mode ?? 'full');
          return;
        }
        const pair = PAIRINGS.find(
          (p) => p.left === composite.id || p.right === composite.id,
        );
        if (pair) layout.openPair(pair.key);
        return;
      }
      // Otherwise — a "pair-only" remote referenced directly by a PAIRING.
      const pairing = PAIRINGS.find(
        (p) => p.left === detail.remoteId || p.right === detail.remoteId,
      );
      if (pairing) {
        layout.openPair(pairing.key);
      }
    };
    window.addEventListener('augment-it:navigate', onNavigate);

    // Listen for external composite-mode broadcasts so peer surfaces that
    // change a composite's active member (e.g. a future analytics overlay)
    // stay in sync. Internal toggle clicks update activeMembers directly
    // via setCompositeMember; this handler covers everything else.
    const compositeListeners = COMPOSITES.map((c) => {
      const handler = (ev: Event) => {
        const d = (ev as CustomEvent).detail as { memberId?: string } | undefined;
        if (d?.memberId && d.memberId !== activeMembers[c.id]) {
          activeMembers = { ...activeMembers, [c.id]: d.memberId };
        }
      };
      window.addEventListener(c.modeKey, handler);
      return () => window.removeEventListener(c.modeKey, handler);
    });

    return () => {
      window.removeEventListener('augment-it:navigate', onNavigate);
      compositeListeners.forEach((off) => off());
    };
  });

  function selectMode(mode: LayoutMode): void {
    if (mode === 'co-existence') {
      const pairing = PAIRINGS[0];
      if (pairing) layout.openPair(pairing.key);
    } else {
      layout.setMode(mode);
    }
  }

  // Click a bubble in the Flow widget — navigate to that rotation step.
  // In peek-flow we just move focusIndex; in co-existence / full we move
  // focusIndex AND drop back to peek-flow (the user picked a step, not a
  // pairing). Matches the augment-it:navigate handler's behaviour when the
  // caller doesn't request a specific mode.
  function selectStep(slotId: string): void {
    const idx = activeFlow.rotation.findIndex((id) => id === slotId);
    if (idx < 0) return;
    layout.setFocusIndex(idx);
    if (layout.mode !== 'peek-flow') layout.setMode('peek-flow');
  }

  function toggleFlowWidgetPosition(): void {
    layout.setFlowWidgetPosition(layout.flowWidgetPosition === 'top' ? 'left' : 'top');
  }

  const showSplitter = $derived(layout.mode === 'co-existence' && stage.length === 2);

  // ---- flows popdown — "what are you trying to do?" ----------------------
  // See context-v/explorations/Augment-It-Has-Outgrown-One-Flow-The-Choose-A-Flow-Front-Door.md
  // and shell/src/flows.svelte.ts. Each FLOWS entry owns its own rotation;
  // picking one here switches activeFlow, which FlowWidget and the stage
  // derivation both read reactively — the bubble strip resizes to however
  // many steps the picked flow actually has.
  const FLOW_ITEMS: PopdownItem[] = FLOWS.map((f) => ({
    id: f.id,
    title: f.label,
    description: f.description,
  }));

  function onFlowSelect(flowId: string): void {
    if (flowId === activeFlow.activeFlowId) return;
    activeFlow.setActiveFlow(flowId);
    // Reset to the new flow's first step — a stale focusIndex from the
    // previous flow is meaningless once the rotation length changes.
    // Layout MODE is deliberately preserved (peek-flow / full carry over)
    // EXCEPT co-existence: PAIRINGS are tied to specific slot ids from
    // CSV_AUGMENTATION_ROTATION, not scoped per-flow, so an old pairing
    // could reference slots that make no sense in the new flow. Fall back
    // to peek-flow rather than show a stale/broken split.
    if (layout.mode === 'co-existence') layout.setMode('peek-flow');
    layout.setFocusIndex(0);
  }
</script>

{#if showWall}
  <SignInWall />
{:else}
<header>
  <div class="header-left">
    <div class="brand">
      <strong>augment-it</strong>
      <span class="muted">· shell</span>
    </div>
    <JumboPopdown triggerLabel="Flows" items={FLOW_ITEMS} onSelect={onFlowSelect} />
    {#if layout.flowWidgetPosition === 'top'}
      <FlowWidget
        rotation={activeFlow.rotation}
        activeIndex={layout.focusIndex}
        mode={layout.mode}
        orientation="top"
        onSelectStep={selectStep}
        onSelectMode={selectMode}
        onTogglePosition={toggleFlowWidgetPosition}
      />
    {/if}
  </div>

  <!-- Layout toggles in the center of the header (Phase 4 Decision §8
       refinement, 2026-06-01). Split / Full are shell-level layout
       controls about HOW the current Flow step renders — not Flow-step
       controls. Separating them visually from the bubble strip makes
       the hierarchy clearer at a glance. They sit centered between the
       Flow widget (left) and the metrics (right). -->
  <div class="header-layout-toggles" role="tablist" aria-label="Layout sub-option">
    <button
      type="button"
      class="layout-toggle"
      class:active={layout.mode === 'co-existence'}
      role="tab"
      aria-selected={layout.mode === 'co-existence'}
      aria-label="Split — two cooperating panes"
      title="Split — two cooperating panes"
      onclick={() => selectMode('co-existence')}
    >
      <span aria-hidden="true">⊟</span>
    </button>
    <button
      type="button"
      class="layout-toggle"
      class:active={layout.mode === 'full'}
      role="tab"
      aria-selected={layout.mode === 'full'}
      aria-label="Full — one pane, full bleed"
      title="Full — one pane, full bleed"
      onclick={() => selectMode('full')}
    >
      <span aria-hidden="true">▢</span>
    </button>
  </div>

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
    <DidiBadge />
    <ModeToggle />
    {#if !workspace.pinned}
      <WorkspaceSwitcher />
    {/if}
  </div>
</header>

<div class="below-header" class:has-chat={chatVisible} class:has-flow-rail={layout.flowWidgetPosition === 'left'}>
  {#if layout.flowWidgetPosition === 'left'}
    <aside class="flow-rail" aria-label="Workflow rail">
      <FlowWidget
        rotation={activeFlow.rotation}
        activeIndex={layout.focusIndex}
        mode={layout.mode}
        orientation="left"
        onSelectStep={selectStep}
        onSelectMode={selectMode}
        onTogglePosition={toggleFlowWidgetPosition}
      />
    </aside>
  {/if}
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
    <section class="slot" class:slot-peek={!isInteractive} class:slot-composite={!!item.composite}
      style="width: {item.widthPct}%; z-index: {item.zIndex};">
      {#if item.composite}
        <ToggleHeader
          slotLabel={item.composite.label}
          members={item.composite.members.map((m) => ({ id: m.remoteId, icon: m.icon, label: m.label }))}
          activeId={activeMembers[item.composite.id] ?? item.composite.defaultMemberId}
          onSelect={(memberId) => setCompositeMember(item.composite!, memberId)}
        />
        <!-- {#key activeMember} re-mounts MountHost when the toggle flips.
             MountHost only runs its dynamic import in onMount, so without
             the key change a swapped `remote` prop would leak the previous
             member. -->
        {#key activeMembers[item.composite.id]}
          <MountHost remote={item.remote} />
        {/key}
      {:else}
        <MountHost remote={item.remote} />
      {/if}

      {#if !isInteractive}
        <!-- peek neighbour: a click-capture overlay. Hover expands it,
             click commits it as the new focus. The live app underneath is
             not interactive while it is a neighbour.
             When the Flow widget is on the left rail, the bubble strip
             carries the "where am I" information, so we hide the per-slot
             label here to avoid double-rendering it (spec §8 coherence
             with §6 — same information, two locations is silly). -->
        <button
          class="peek-overlay"
          aria-label={`Focus ${item.label}`}
          onmouseenter={() => (hoveredNeighborId = item.id)}
          onmouseleave={() => (hoveredNeighborId = null)}
          onclick={() => commitFocus(item.id)}
        >
          {#if layout.flowWidgetPosition !== 'left'}
            <span class="peek-label">{item.label}</span>
          {/if}
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
{/if}

<style>
  header {
    display: grid;
    /* Three-section layout: Flow widget anchors left (auto), layout
       sub-options sit centered in the 1fr column (justify-self), metrics
       anchor right. Putting Split/Full in the middle gives them their
       own visual identity instead of being huddled with the Flow step
       bubbles. */
    grid-template-columns: auto 1fr auto;
    gap: 1.25rem;
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
  .header-left {
    display: flex;
    align-items: center;
    gap: 1.25rem;
  }
  .brand strong { color: var(--color-accent); font-size: 1.05rem; }
  .brand .muted { color: var(--color-text-muted); }
  .header-layout-toggles {
    display: flex;
    gap: 0.3rem;
    justify-self: center;
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
  /* Flow widget when positioned as a left rail (spec §8 + Phase 4).
     Persistent vertical workflow indicator; sits outside the chat-rail
     so the order is: flow-rail | chat-rail | stage. */
  .flow-rail {
    width: 64px;
    flex-shrink: 0;
    border-right: 1px solid var(--color-border);
    background: var(--color-surface-raised, var(--color-background));
    overflow: hidden;
    display: flex;
    justify-content: center;
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

  /* Composite slots stack the toggle header above the mounted remote;
     the MountHost takes the remaining vertical space (Phase 2c). */
  .slot-composite {
    display: flex;
    flex-direction: column;
  }
  .slot-composite :global(.mount-host) {
    flex: 1 1 auto;
    min-height: 0;
  }

  /* peek neighbour click-capture overlay.
     Labels anchor at the slice's left margin (spec Decision §6) — they
     are landmarks, not floating titles. Uniform left-anchor across prev
     and next peeks for now; if the right-peek's inner-edge label reads
     wrong against the focused pane, revisit with role-aware positioning. */
  .peek-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: flex-start;
    justify-content: flex-start;
    padding-top: 1.5rem;
    padding-left: 0.75rem;
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
