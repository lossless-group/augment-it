<script lang="ts">
  // The Developers menu — header affordances only a developer wants.
  //
  // Replaces the bare `tiling host · :3100` label, which spent a permanent slot
  // in the header to state one fact nobody needed at a glance. That fact now
  // lives inside, next to the other things you actually go looking for when
  // something is wrong: which services this build points at, and the design
  // system.
  //
  // Built on JumboPopdown so it inherits the interaction contract already
  // agreed for header dropdowns — hover-open, click-toggle, Esc, click-outside,
  // role="menu"/"menuitem" — rather than inventing a second one.

  import JumboPopdown, { type PopdownItem } from './JumboPopdown.svelte';
  import { workspace } from '@augment-it/workspace';

  let {
    wsHttpBase,
    onOpenDesignSystem,
  }: {
    wsHttpBase: string;
    /** Mounts the portal inside the shell rather than opening a tab. */
    onOpenDesignSystem: (view?: 'tokens' | 'components') => void;
  } = $props();

  // Same env convention as the federated remotes and DidiBadge: a PUBLIC_-
  // prefixed var inlined at build time, with a localhost fallback so local dev
  // needs no configuration. `||` not `??` deliberately — an unset Docker ARG
  // resolves to an EMPTY STRING once assigned to ENV, and `??` would ship the
  // empty string. That exact bug has bitten this repo before; see the remotes
  // block in shell/rsbuild.config.ts.
  const env = (import.meta as { env?: Record<string, string> }).env ?? {};
  const DESIGN_PORTAL = env.PUBLIC_DESIGN_PORTAL_URL || 'http://localhost:3020';
  const ID_BASE = env.PUBLIC_ID_BASE || 'http://localhost:4000';

  let copied = $state(false);

  // $derived, not const: wsHttpBase is a prop, and a const array would capture
  // its initial value and leave the workspace-service description stale.
  const items: PopdownItem[] = $derived([
    {
      id: 'design-system',
      title: 'Design system',
      description: 'Brand guidelines, design tokens, the three-mode contract — every token on every surface with live contrast. Opens in the shell.',
    },
    {
      id: 'component-libraries',
      title: 'Component libraries',
      description:
        'Every member’s own components and class recipes, in every state worth pinning — three modes side by side, live contract and accessibility audit, and a link to each specimen on the member’s own address. Opens in the shell.',
    },
    {
      id: 'workspace-service',
      title: 'Workspace service',
      description: `Session, tenancy and capability config · ${wsHttpBase}`,
    },
    {
      id: 'identity',
      title: 'Identity · didi.sh',
      description: `Sign-in and session issuer · ${ID_BASE}`,
    },
    {
      id: 'diagnostics',
      title: 'Shell host · :3100',
      description: 'Federation host. Copies this build’s environment to the clipboard for a bug report.',
    },
  ]);

  /** Everything you would otherwise have to ask someone to read off a screen. */
  function diagnostics(): string {
    return JSON.stringify(
      {
        shell: 'tiling host :3100',
        ws_url: wsHttpBase,
        id_base: ID_BASE,
        design_portal: DESIGN_PORTAL,
        active_client_id: workspace.active_client_id ?? null,
        pinned: workspace.pinned ?? null,
        didi_auth_mode: workspace.didi_auth_mode ?? null,
        didi_id: workspace.user?.didi_id ?? null,
        mode: document.documentElement.dataset.mode ?? null,
        user_agent: navigator.userAgent,
      },
      null,
      2,
    );
  }

  function open(url: string): void {
    // noopener: a tab opened from here must not get a handle on the shell.
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function onSelect(id: string): Promise<void> {
    switch (id) {
      case 'design-system':
        // Mounts under the shell header as a federated remote. The standalone
        // page on DESIGN_PORTAL still exists for anyone who wants it in its own
        // tab, but the default is to stay in the app.
        onOpenDesignSystem('tokens');
        break;
      case 'component-libraries':
        // The same remote, opened on its other half. One portal, two views —
        // the federal token vocabulary and the members' local libraries — so
        // the design system is one destination rather than two.
        onOpenDesignSystem('components');
        break;
      case 'workspace-service':
        open(`${wsHttpBase}/config`);
        break;
      case 'identity':
        open(ID_BASE);
        break;
      case 'diagnostics':
        try {
          await navigator.clipboard.writeText(diagnostics());
          copied = true;
          setTimeout(() => (copied = false), 1600);
        } catch {
          // Clipboard is permission-gated and unavailable over plain http on
          // some origins. Falling back to the console beats failing silently —
          // the point is that the developer ends up holding the text.
          console.info('[developers] diagnostics:\n' + diagnostics());
        }
        break;
    }
  }
</script>

<span class="dev-menu">
  <JumboPopdown triggerLabel="Developers" triggerIcon="⚙" {items} onSelect={(id) => void onSelect(id)} />
  {#if copied}
    <span class="copied" role="status">copied</span>
  {/if}
</span>

<style>
  .dev-menu {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .copied {
    font-size: 10px;
    color: var(--color-ok-text);
    background: var(--color-ok-bg);
    border-radius: 2px;
    padding: 2px 6px;
    white-space: nowrap;
  }
</style>
