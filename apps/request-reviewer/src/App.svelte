<script lang="ts">
  import { onMount } from 'svelte';
  import { workspace } from '@augment-it/workspace';

  // Each federated remote owns its own workspace singleton and its own
  // WebSocket — see the 2026-05-21_03 federation changelog (no `shared`
  // block). Connecting here proves the wiring; the Phase 3 UI builds on it.
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
  });
</script>

<div class="req-app">
  <div class="req-status-bar">
    consumes <code>@augment-it/workspace</code> · <code>{WS_URL}</code> ·
    <span class="status status-{status}">{status}</span>
  </div>

  <div class="req-body">
    <h2>Request Reviewer</h2>
    <p class="muted">
      Pre-flight surface — scaffolded and wired into the Deck (Phase 2). This
      remote mounts in the shell and connects to the workspace.
    </p>
    <p class="muted">
      Phase 3 builds the review UI: the resolved request with
      <code>{'{{token}}'}</code> substitution, the model toggle, the free
      <code>max_tokens</code> field, the JSON-request view, the token-binding
      panel, and the fire actions.
    </p>
    <p class="muted">
      Spec — <code>context-v/specs/Request-Reviewer-Pre-Flight-Surface.md</code>.
      The service layer it builds on (<code>prompt.preview</code>,
      <code>buildRequest</code>) is already live.
    </p>
  </div>
</div>
