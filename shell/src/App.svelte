<script lang="ts">
  import { onMount } from 'svelte';
  import ModeToggle from './ModeToggle.svelte';

  type MountFn = (target: HTMLElement) => { destroy: () => void };

  type RemoteEntry = {
    id: string;
    label: string;
    description: string;
    importMount: () => Promise<Record<string, unknown>>;
  };

  // As more remotes land they get added here. Each one is expected to
  // expose a mount function (named export or default export) that takes a
  // host-provided DOM element and returns a destroy() handle.
  const REMOTES: RemoteEntry[] = [
    {
      id: 'recordCollector',
      label: 'Record Collector',
      description: 'Ingest CSV / XLSX, browse rows, edit cells',
      // @ts-expect-error — federation remote, type comes from MF runtime
      importMount: () => import('recordCollector/mount'),
    },
    {
      id: 'promptTemplateManager',
      label: 'Prompt Templates',
      description: 'Author prompts, run them per-row to enrich record sets',
      // @ts-expect-error — federation remote, type comes from MF runtime
      importMount: () => import('promptTemplateManager/mount'),
    },
  ];

  let activeRemoteId = $state<string>(REMOTES[0].id);
  let loadError = $state<string | null>(null);
  let loading = $state<boolean>(true);
  let mountTarget: HTMLDivElement;
  let currentMount: { destroy: () => void } | null = null;

  onMount(() => {
    void loadRemote(activeRemoteId);
    return () => {
      currentMount?.destroy();
    };
  });

  async function loadRemote(id: string) {
    activeRemoteId = id;
    loadError = null;
    loading = true;
    currentMount?.destroy();
    currentMount = null;

    const entry = REMOTES.find((r) => r.id === id);
    if (!entry) {
      loadError = `unknown remote: ${id}`;
      loading = false;
      return;
    }
    try {
      const mod = await entry.importMount();
      // Federation contract: a remote's ./mount exposes a single mount
      // function. The shell doesn't care what it's named — take the
      // default export, or the first function value in the module.
      const fn = (mod.default ?? Object.values(mod).find((v) => typeof v === 'function')) as
        | MountFn
        | undefined;
      if (typeof fn !== 'function') {
        throw new Error('remote does not export a mount function');
      }
      // Wait for the target div to exist (post-render)
      await new Promise((r) => setTimeout(r, 0));
      mountTarget.innerHTML = '';
      currentMount = fn(mountTarget);
      loading = false;
    } catch (err: unknown) {
      loadError = err instanceof Error ? err.message : String(err);
      loading = false;
    }
  }
</script>

<header>
  <div class="brand">
    <strong>augment-it</strong>
    <span class="muted">· shell</span>
  </div>
  <nav>
    {#each REMOTES as r (r.id)}
      <button
        class:active={r.id === activeRemoteId}
        onclick={() => loadRemote(r.id)}
        title={r.description}
      >{r.label}</button>
    {/each}
  </nav>
  <div class="metrics">
    <span class="muted">federation host · :3100</span>
    <ModeToggle />
  </div>
</header>

<main>
  {#if loadError}
    <div class="error-box">
      <h3>remote load failed</h3>
      <pre>{loadError}</pre>
      <p class="muted">Is the remote dev server running on its expected port?</p>
    </div>
  {/if}
  {#if loading && !loadError}
    <div class="loading">loading remote…</div>
  {/if}
  <div bind:this={mountTarget} class="mount-target"></div>
</main>

<style>
  /* body styling lives in @augment-it/theme/theme.css — every frontend
     imports it. The shell only styles its own chrome here, off semantic
     tokens; the three modes follow automatically. */
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
    z-index: 10;
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

  main { min-height: calc(100vh - 56px); }
  .loading, .error-box {
    padding: 3rem 2rem;
    text-align: center;
    color: var(--color-text-muted);
  }
  .error-box {
    text-align: left;
    max-width: 600px;
    margin: 3rem auto;
  }
  .error-box pre {
    background: var(--color-field);
    padding: 0.75rem;
    border-radius: 4px;
    color: var(--color-error-text);
    white-space: pre-wrap;
  }
  .mount-target { min-height: 200px; }
</style>
