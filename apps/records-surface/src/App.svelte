<script lang="ts">
  import { onMount } from 'svelte';
  import { workspace, resolveWsUrl } from '@augment-it/workspace';
  import StatusIndicator from '@augment-it/shared-ui/StatusIndicator.svelte';
  import RecordsList from './components/RecordsList.svelte';
  import { records } from './state/records.svelte';

  const TOKEN_KEY = 'augment-it:session-token';
  const WS_URL = resolveWsUrl();

  let status = $state<'connecting' | 'open' | 'closed' | 'error' | 'auth_required'>('connecting');

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
    <StatusIndicator state={status} of="workspace" />
  </div>
  <RecordsList />
</div>

<style>
  .records-surface { padding: 0.5rem 0; }
  .records-surface-status { padding: 0.5rem 1.5rem; font-size: 0.75rem; color: var(--color-text-muted); }
</style>
