<script lang="ts">
  // Workspace switcher — top-right header chrome.
  //
  // Reads workspace.workspaces (populated by workspace.list) and the
  // operator's active pick from the singleton; clicking a row activates
  // that workspace via workspace.activateWorkspace(), which persists to
  // localStorage and broadcasts WORKSPACE_CHANGED_EVENT.
  //
  // Per [[Workspaces-as-Tenant-Primitive]] § "Toggle UI": every workspace
  // is the boundary; the directory IS the workspace; no creation UI here
  // (operator does `mkdir clients/<slug>/` on disk, picks up on next
  // refresh).

  import { workspace } from '@augment-it/workspace';

  let open = $state<boolean>(false);
  let switching = $state<boolean>(false);
  let menuEl = $state<HTMLDivElement | undefined>(undefined);

  const active = $derived(
    workspace.workspaces.find((w) => w.client_id === workspace.active_client_id),
  );
  const empty = $derived(workspace.workspaces.length === 0);
  // Visible state — never just "empty + disabled". The pill tells the user
  // why: are we still waiting on the socket, did the call fail, is the
  // server truly returning zero workspaces?
  const label = $derived.by(() => {
    if (workspace.connection_status === 'connecting' || workspace.connection_status === 'idle') return 'connecting…';
    if (workspace.workspaces_status === 'loading') return 'loading…';
    if (workspace.workspaces_status === 'error') return 'error · hover';
    if (active) return active.display_name;
    if (workspace.active_client_id) return workspace.active_client_id;
    return 'no workspaces';
  });
  const tooltip = $derived.by(() => {
    if (workspace.connection_status === 'closed' || workspace.connection_status === 'error') {
      return `WebSocket ${workspace.connection_status} — workspace-service at ws://localhost:3001/ws unreachable`;
    }
    if (workspace.workspaces_status === 'error' && workspace.workspaces_error) {
      return `workspace.list failed: ${workspace.workspaces_error}`;
    }
    if (empty && workspace.workspaces_status === 'ready') {
      return 'no directories under clients/ — workspace-service returned an empty list';
    }
    return `switch workspace (active: ${label})`;
  });

  function toggle(): void {
    if (empty) return;
    open = !open;
  }

  async function pick(client_id: string): Promise<void> {
    if (client_id === workspace.active_client_id) {
      open = false;
      return;
    }
    switching = true;
    try {
      await workspace.activateWorkspace(client_id);
    } finally {
      switching = false;
      open = false;
    }
  }

  function onDocPointer(ev: PointerEvent): void {
    if (!open) return;
    if (menuEl && !menuEl.contains(ev.target as Node)) open = false;
  }

  function onKey(ev: KeyboardEvent): void {
    if (ev.key === 'Escape' && open) open = false;
  }

  $effect(() => {
    document.addEventListener('pointerdown', onDocPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDocPointer);
      document.removeEventListener('keydown', onKey);
    };
  });
</script>

<div class="workspace-switcher" bind:this={menuEl}>
  <button
    type="button"
    class="trigger"
    class:open
    class:empty
    aria-haspopup="listbox"
    aria-expanded={open}
    disabled={empty || switching}
    title={tooltip}
    onclick={toggle}
  >
    <span class="dot" aria-hidden="true"></span>
    <span class="label">{label}</span>
    <span class="chev" aria-hidden="true">{open ? '▴' : '▾'}</span>
  </button>

  {#if open}
    <ul class="menu" role="listbox" aria-label="Workspaces">
      {#each workspace.workspaces as w (w.client_id)}
        {@const isActive = w.client_id === workspace.active_client_id}
        <li>
          <button
            type="button"
            class="row"
            class:active={isActive}
            role="option"
            aria-selected={isActive}
            onclick={() => pick(w.client_id)}
          >
            <span class="row-label">{w.display_name}</span>
            <span class="row-slug">{w.client_id}</span>
            {#if w.has_env}
              <span class="env-chip" title="per-workspace .env present">env</span>
            {/if}
            {#if isActive}
              <span class="check" aria-hidden="true">✓</span>
            {/if}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .workspace-switcher {
    position: relative;
    display: inline-flex;
    align-items: center;
  }
  .trigger {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    background: transparent;
    color: var(--color-text);
    border: 1px solid var(--color-border);
    padding: 4px 10px;
    border-radius: 4px;
    font: inherit;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.12s ease;
  }
  .trigger:hover:not(:disabled) {
    border-color: var(--color-accent);
    color: var(--color-accent);
  }
  .trigger.open {
    border-color: var(--color-accent);
    color: var(--color-accent);
    background: var(--color-selected-tint);
  }
  .trigger.empty,
  .trigger:disabled {
    color: var(--color-text-muted);
    cursor: not-allowed;
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-accent);
    flex-shrink: 0;
  }
  .trigger.empty .dot { background: var(--color-text-muted); }
  .label {
    font-weight: 500;
    letter-spacing: 0.02em;
  }
  .chev {
    color: var(--color-text-muted);
    font-size: 10px;
  }

  .menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: 200;
    margin: 0;
    padding: 4px;
    list-style: none;
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    box-shadow: var(--fx-card-shadow);
    min-width: 220px;
    max-height: 60vh;
    overflow: auto;
  }
  .row {
    display: grid;
    grid-template-columns: 1fr auto auto;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    background: transparent;
    color: var(--color-text);
    border: 0;
    padding: 6px 10px;
    border-radius: 4px;
    font: inherit;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }
  .row:hover { background: var(--color-selected-tint); }
  .row.active {
    background: var(--color-selected-tint);
    color: var(--color-accent);
  }
  .row-label {
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .row-slug {
    color: var(--color-text-muted);
    font-size: 10px;
    font-family: var(--font-mono, monospace);
  }
  .env-chip {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-muted);
    border: 1px solid var(--color-border);
    border-radius: 3px;
    padding: 1px 4px;
  }
  .check {
    color: var(--color-accent);
    font-size: 11px;
  }
</style>
