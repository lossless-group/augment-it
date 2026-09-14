<script lang="ts">
  import { tick } from 'svelte';
  import Button from '@augment-it/shared-ui/Button.svelte';
  import Chip from '@augment-it/shared-ui/Chip.svelte';
  import StatusIndicator from '@augment-it/shared-ui/StatusIndicator.svelte';
  import SelectorListbox from '@augment-it/shared-ui/Selector--Listbox.svelte';
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
  //
  // LISTBOX, NOT MENU, and that was already the right call: this picks the
  // CURRENT workspace and marks it with aria-selected. A thing with a selected
  // state is a listbox even when it is drawn as a popdown. The sibling
  // JumboPopdown is a list of actions and is a menu.
  //
  // WHAT THE ROLE PROMISED AND THE FILE DID NOT DELIVER: `role="listbox"` over
  // `<li><Button role="option">` reads correctly and nothing behind it was true.
  // No keydown handler on the listbox, so arrows moved nothing. Every option was
  // a real <button>, so Tab WALKED the workspaces instead of leaving the widget
  // — the exact opposite of what the role tells a screen-reader user. And the
  // only Escape handler was a document listener that set `open = false`, after
  // which the focused button unmounted and focus landed on <body>.
  // `Selector--Listbox` owns the roving tabindex, the arrows, Home/End,
  // typeahead and Escape-to-trigger now. This file owns the trigger, the popup
  // surface, and what one row LOOKS like.

  import { workspace, resolveWsUrl } from '@augment-it/workspace';

  let open = $state<boolean>(false);
  let switching = $state<boolean>(false);
  let menuEl = $state<HTMLDivElement | undefined>(undefined);

  // The real trigger node, from Button's `ref`. Escape returns focus HERE, not
  // to <body>. NEVER cleared on close: `trigger` is a Svelte prop and therefore
  // a live getter the Selector reads one line after calling `onclose`.
  let triggerEl = $state<HTMLElement | undefined>(undefined);
  // One switcher per shell, and the shell is a singleton, so a literal id is
  // honest and keeps the trigger's aria-controls and the listbox's id in one
  // place where they cannot drift apart.
  const LISTBOX_ID = 'shell-workspace-listbox';

  const active = $derived(
    workspace.workspaces.find((w) => w.client_id === workspace.active_client_id),
  );
  const empty = $derived(workspace.workspaces.length === 0);
  // Visible state — never just "empty + disabled". The pill tells the user
  // why: are we still waiting on the socket, did the call fail, is the
  // server truly returning zero workspaces?
  //
  // The socket's own state is no longer folded in here. It used to be, and it
  // covered exactly ONE of the six states: `connecting` and `idle` collapsed
  // to the string "connecting…", while `open`, `closed`, `error` and
  // `auth_required` all fell through to the workspace name — so a DEAD socket
  // and a healthy one rendered identically, and the only trace of a failure
  // was a `title` attribute nobody hovers. StatusIndicator owns every non-open
  // state below; `label` is now purely about the workspace LIST.
  const label = $derived.by(() => {
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

  // Selector--Listbox's option shape. `has_env` is looked back up by id in the
  // snippet below rather than carried here: `option` is typed
  // `Snippet<[Option]>` where `Option` is the component's own row type, so a
  // snippet declaring a WIDER parameter is contravariantly unassignable and
  // svelte-check rejects it. Both members who adopted a Selector before this
  // one landed on the identical workaround. Raised as a finding, not fought.
  const options: { id: string; label: string }[] = $derived(
    workspace.workspaces.map((w) => ({ id: w.client_id, label: w.display_name })),
  );

  function toggle(): void {
    if (empty) return;
    open = !open;
  }

  /**
   * Close and hand focus back to the trigger. `await tick()` is load-bearing on
   * the select path: `switching` flips the trigger's `disabled` attribute, and
   * Svelte writes that attribute on the NEXT flush — focus() on a still-disabled
   * button is a silent no-op, and focus would land on <body> exactly as before.
   */
  async function closeAndRestore(): Promise<void> {
    open = false;
    await tick();
    triggerEl?.focus();
  }

  async function pick(client_id: string): Promise<void> {
    if (client_id === workspace.active_client_id) {
      await closeAndRestore();
      return;
    }
    switching = true;
    try {
      await workspace.activateWorkspace(client_id);
    } finally {
      switching = false;
      await closeAndRestore();
    }
  }

  function onDocPointer(ev: PointerEvent): void {
    if (!open) return;
    if (menuEl && !menuEl.contains(ev.target as Node)) open = false;
  }

  // Kept, and not redundant with the Selector's own Escape: this covers Escape
  // pressed while focus is still on the TRIGGER. When focus is inside the
  // listbox the Selector handles it first (it is deeper in the tree), sets
  // `open` false via `onclose` and restores focus; this then sees
  // `open === false` and does nothing.
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

<!-- One workspace row. Appearance only: Selector--Listbox owns the keyboard,
     the roving tabindex and the selected state. Same split as
     ListContainer / CardRow. -->
{#snippet workspaceRow(o: { id: string; label: string })}
  <span class="row-grid">
    <span class="row-label">{o.label}</span>
    <span class="row-slug">{o.id}</span>
    {#if workspace.workspaces.find((w) => w.client_id === o.id)?.has_env}
      <!-- A non-interactive tag stating one fact, so it is the shared Chip.
           `neutral`, not a colour: the presence of an .env file is a plain
           fact, not a verdict. -->
      <Chip size="sm" title="per-workspace .env present">env</Chip>
    {/if}
    {#if o.id === workspace.active_client_id}
      <!-- Decoration on top of aria-selected, which is what actually carries
           the state now. Never colour alone, and never the only signal. -->
      <span class="check" aria-hidden="true">✓</span>
    {/if}
  </span>
{/snippet}

<div class="workspace-switcher" bind:this={menuEl}>
  <Button
    variant={open ? 'secondary' : 'outline'}
    size="sm"
    aria-haspopup="listbox"
    aria-expanded={open}
    aria-controls={open ? LISTBOX_ID : undefined}
    disabled={empty || switching}
    title={tooltip}
    ref={(el) => (triggerEl = el)}
    onclick={toggle}
  >
    {#if workspace.connection_status === 'open'}
      <span class="label">{label}</span>
    {:else}
      <!-- Replaces a hand-rolled `.dot` that encoded "are there workspaces" in
           colour ALONE (accent vs muted, aria-hidden, no word) — a WCAG 1.4.1
           defect standing in for a connection indicator it never actually
           read. The dot carried nothing `label` did not already say, so it is
           gone rather than re-tinted. -->
      <StatusIndicator state={workspace.connection_status} of="workspace" />
    {/if}
    <span class="chev" aria-hidden="true">{open ? '▴' : '▾'}</span>
  </Button>

  {#if open}
    <!-- The popover is the CONTAINER — position, surface, shadow, scroll — and
         the listbox is its one child. Rung 0: a component never positions
         itself, so none of that goes on the Selector. -->
    <div class="menu">
      <SelectorListbox
        id={LISTBOX_ID}
        {options}
        label="Workspaces"
        value={workspace.active_client_id ?? undefined}
        option={workspaceRow}
        autofocus
        onselect={(id) => void pick(id)}
        onclose={() => (open = false)}
        trigger={triggerEl}
      />
    </div>
  {/if}
</div>

<style>
  .workspace-switcher {
    position: relative;
    display: inline-flex;
    align-items: center;
  }
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
    padding: 4px;
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    box-shadow: var(--fx-card-shadow);
    min-width: 220px;
    max-height: 60vh;
    overflow: auto;
  }
  /* The old `.menu > li { display: grid }` is gone with the <ul>: it existed
     because a flex item sizes to its content (measured 179px inside a 210px
     menu) and the row had to be stretched. Selector--Listbox's option is a
     full-width flex row already, so there is nothing left to stretch.
     The row itself is a grid rather than an override on the control: the
     option centres one child, and this child fills. No rung used. */
  .row-grid {
    display: grid;
    flex: 1 1 auto;
    /* Four columns: label · slug · env chip · check. With three, a workspace
       that has BOTH an env chip and the active check wrapped to a second
       implicit row. */
    grid-template-columns: 1fr auto auto auto;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    text-align: left;
  }
  /* The single-line clamp is NOT cosmetic tidying, and it was found by driving
     a browser rather than by reading the diff. The option used to be a shared
     `Button`, which carries `white-space: nowrap` AND a fixed `height` — a long
     display name was silently CLIPPED. `Selector--Listbox`'s option carries
     neither (it has `min-block-size`, so it grows), so the same name wrapped to
     two lines and that one row became 48px against its neighbours' 29px.
     Measured in the probe: `.row-label` 49px wide, 38px tall, the 1fr track
     squeezed to the min-content of "Charlie".
     An ellipsis is strictly better than the clip it replaces — it TELLS the
     reader the name is truncated — and the full slug sits next to it either
     way. Rung 0: this is how the member's own content behaves inside the slot,
     not an override of anything the component declares. */
  .row-label {
    font-weight: 500;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row-slug {
    color: var(--color-text-muted);
    font-size: 10px;
    font-family: var(--font-mono, monospace);
    white-space: nowrap;
  }
  .check {
    color: var(--color-accent);
    font-size: 11px;
  }
</style>
