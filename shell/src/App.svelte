<script lang="ts">
  import { onMount } from 'svelte';

  type MountFn = (target: HTMLElement) => { destroy: () => void };

  type RemoteEntry = {
    id: string;
    label: string;
    description: string;
    importMount: () => Promise<{ default?: MountFn; mountRecordCollector?: MountFn }>;
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
      const fn = mod.mountRecordCollector ?? mod.default;
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
  :global(body) {
    margin: 0;
    background: #0f1115;
    color: #e8eaf0;
    font: 13px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  header {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 1.5rem;
    align-items: center;
    padding: 0.75rem 1.5rem;
    border-bottom: 1px solid #232634;
    background: #0c0d12;
    position: sticky;
    top: 0;
    z-index: 10;
  }
  .brand strong { color: #c75bfb; font-size: 1.05rem; }
  .brand .muted { color: #8a8f9b; }
  nav { display: flex; gap: 0.5rem; }
  nav button {
    background: transparent;
    color: #e8eaf0;
    border: 1px solid #232634;
    padding: 4px 12px;
    border-radius: 4px;
    font: inherit;
    cursor: pointer;
  }
  nav button:hover { border-color: #c75bfb; }
  nav button.active { background: rgba(199, 91, 251, 0.12); border-color: #c75bfb; color: #c75bfb; }
  .metrics { display: flex; gap: 0.75rem; align-items: center; font-size: 11px; }
  .muted { color: #8a8f9b; }

  main { min-height: calc(100vh - 56px); }
  .loading, .error-box {
    padding: 3rem 2rem;
    text-align: center;
    color: #8a8f9b;
  }
  .error-box {
    text-align: left;
    max-width: 600px;
    margin: 3rem auto;
  }
  .error-box pre {
    background: #16181f;
    padding: 0.75rem;
    border-radius: 4px;
    color: #f29a9a;
    white-space: pre-wrap;
  }
  .mount-target { min-height: 200px; }
</style>
