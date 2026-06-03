<script lang="ts">
  import { onMount } from 'svelte';
  import { workspace } from '@augment-it/workspace';
  import RecordsList from './components/RecordsList.svelte';
  import { records } from './state/records.svelte';

  const TOKEN_KEY = 'augment-it:session-token';
  const WS_URL = 'ws://localhost:3001/ws';

  let status = $state<'connecting' | 'open' | 'closed' | 'error'>('connecting');

  onMount(() => {
    workspace.connect({
      url: WS_URL,
      getToken: () => localStorage.getItem(TOKEN_KEY),
      saveToken: (t) => localStorage.setItem(TOKEN_KEY, t),
      onStatus: (s) => (status = s),
    });
    void records.loadRecordSets();
  });
</script>

<div class="records-surface">
  <div class="records-surface-status">
    workspace: <span class="status status-{status}">{status}</span>
  </div>
  <RecordsList />
</div>

<style>
  .records-surface { padding: 0.5rem 0; }
  .records-surface-status { padding: 0.5rem 1.5rem; font-size: 0.75rem; color: var(--color-text-muted); }
  .status { padding: 1px 7px; border-radius: 3px; background: var(--color-border); }
  .status-open { background: var(--color-ok-bg); color: var(--color-ok-text); }
  .status-closed, .status-error { background: var(--color-error-bg); color: var(--color-error-text); }
</style>
