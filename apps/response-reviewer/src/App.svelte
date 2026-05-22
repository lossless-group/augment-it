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

<div class="resp-app">
  <div class="resp-status-bar">
    consumes <code>@augment-it/workspace</code> · <code>{WS_URL}</code> ·
    <span class="status status-{status}">{status}</span>
  </div>

  <div class="resp-body">
    <h2>Response Reviewer</h2>
    <p class="muted">
      Post-flight surface — scaffolded and wired into the Deck (Phase 2). This
      remote mounts in the shell and connects to the workspace.
    </p>
    <p class="muted">
      Phase 3 builds the triage UI: the response stepper, the context pane,
      the markdown-rendered response, the good / partial / wrong / needs-rerun
      flags, the whole-response accept, and the re-run handoff to
      request-reviewer.
    </p>
    <p class="muted">
      Spec — <code>context-v/specs/Response-Reviewer-and-Response-Store.md</code>.
      The <code>response-store</code> service it reads from is already live.
    </p>
  </div>
</div>
