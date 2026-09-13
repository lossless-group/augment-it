<script lang="ts">
  import Button from '@augment-it/shared-ui/Button.svelte';
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

  import { workspace, resolveWsUrl } from '@augment-it/workspace';

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
      return `WebSocket ${workspace.connection_status} — workspace-service at ${resolveWsUrl()} unreachable`;
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
  <Button
    variant={open ? 'secondary' : 'outline'}
    size="sm"
    aria-haspopup="listbox"
    aria-expanded={open}
    disabled={empty || switching}
    title={tooltip}
    onclick={toggle}
  >
    <span class="dot" class:empty aria-hidden="true"></span>
    <span class="label">{label}</span>
    <span class="chev" aria-hidden="true">{open ? '▴' : '▾'}</span>
  </Button>

  {#if open}
    <ul class="menu" role="listbox" aria-label="Workspaces">
      {#each workspace.workspaces as w (w.client_id)}
        {@const isActive = w.client_id === workspace.active_client_id}
        <li>
          <Button
            variant={isActive ? 'secondary' : 'ghost'}
            role="option"
            aria-selected={isActive}
            onclick={() => pick(w.client_id)}
          >
            <span class="row-grid">
              <span class="row-label">{w.display_name}</span>
              <span class="row-slug">{w.client_id}</span>
              {#if w.has_env}
                <span class="env-chip" title="per-workspace .env present">env</span>
              {/if}
              {#if isActive}
                <span class="check" aria-hidden="true">✓</span>
              {/if}
            </span>
          </Button>
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
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-accent);
    flex-shrink: 0;
  }
  .dot.empty { background: var(--color-text-muted); }
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
  /* Rung 0 — the menu owns the column, the control owns itself. A GRID, not a
     flex row: a flex item is sized to its content, which measured 179px inside
     a 210px menu. Grid stretches it. */
  .menu > li { display: grid; }
  /* The option's label is a full-width row of its own, so it is a child
     element laid out as a grid rather than an override on the control: the
     shared control centres one child, and this child fills. No rung used. */
  .row-grid {
    display: grid;
    flex: 1;
    /* Four columns, not the three the old .row carried: label · slug · env
       chip · check. With three, a workspace that has BOTH an env chip and the
       active check wrapped to a second implicit row — which the old rule
       absorbed by growing to 53px and the fixed-height control cannot. */
    grid-template-columns: 1fr auto auto auto;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    text-align: left;
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
