<script lang="ts">
  import { onMount } from 'svelte';
  import type { RemoteEntry } from './remotes';

  // Mounts ONE federated remote into its own div and keeps it alive for
  // the lifetime of this component. App.svelte renders MountHosts in a
  // keyed {#each} — so as long as a remote stays in the visible set, its
  // MountHost instance (and the live app inside it) survives mode changes,
  // hover, drag, everything. Only leaving the visible set unmounts it.

  let { remote }: { remote: RemoteEntry } = $props();

  let el: HTMLDivElement;
  let handle: { destroy: () => void } | null = null;
  let error = $state<string | null>(null);

  onMount(() => {
    let cancelled = false;
    (async () => {
      try {
        const mod = await remote.importMount();
        // Federation contract: ./mount exposes a single mount function —
        // default export, or the first function value in the module.
        const fn = (mod.default ?? Object.values(mod).find((v) => typeof v === 'function')) as
          | ((target: HTMLElement) => { destroy: () => void })
          | undefined;
        if (typeof fn !== 'function') throw new Error('remote exposes no mount function');
        if (cancelled) return;
        handle = fn(el);
      } catch (e: unknown) {
        error = e instanceof Error ? e.message : String(e);
      }
    })();
    return () => {
      cancelled = true;
      handle?.destroy();
    };
  });
</script>

<div class="mount-host" bind:this={el}>
  {#if error}
    <div class="mount-error">
      <strong>{remote.label}</strong> failed to load
      <pre>{error}</pre>
    </div>
  {/if}
</div>

<style>
  .mount-host {
    width: 100%;
    height: 100%;
    overflow: auto;
  }
  .mount-error {
    padding: 1.5rem;
    color: var(--color-error-text);
  }
  .mount-error pre {
    margin-top: 0.5rem;
    white-space: pre-wrap;
    word-break: break-word;
    background: var(--color-field);
    padding: 0.6rem;
    border-radius: 4px;
  }
</style>
