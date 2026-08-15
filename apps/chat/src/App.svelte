<script lang="ts">
  // Chat root. Connects the workspace, mounts CharacterCastRow + ChatSurface.
  // Standalone-mode-friendly: at :3006 the chat connects directly to
  // workspace-service at PUBLIC_WS_URL (localhost:3001 default for dev); in
  // federation mode the shell mounts this remote and the same connection
  // is established independently (no shared workspace singleton).

  import { onMount } from 'svelte';
  import { workspace } from '@augment-it/workspace';
  import CharacterCastRow from './CharacterCastRow.svelte';
  import ChatSurface from './ChatSurface.svelte';

  // No `shared` block in federation (see shell/rsbuild.config.ts's note) —
  // this remote owns its own workspace singleton and connects independently
  // even when mounted inside the shell, so it needs the same env-configured
  // WS_URL the shell and corpora-curator each read (rsbuild inlines
  // PUBLIC_-prefixed vars into import.meta.env at build time).
  const WS_URL =
    ((import.meta as { env?: Record<string, string> }).env?.PUBLIC_WS_URL as string | undefined) ||
    'ws://localhost:3001/ws';

  let connectionStatus = $state<'connecting' | 'open' | 'closed' | 'error' | 'auth_required'>('connecting');

  onMount(() => {
    const TOKEN_KEY = 'augment_it_session_token';
    workspace.connect({
      url: WS_URL,
      getToken: () => localStorage.getItem(TOKEN_KEY),
      saveToken: (t) => localStorage.setItem(TOKEN_KEY, t),
      onStatus: (s) => {
        connectionStatus = s;
      },
    });
    // Don't disconnect on unmount — the workspace singleton is shared with
    // any sibling remote that connected before us; closing here would
    // break them too.
  });
</script>

<div class="chat-app">
  <div class="chat-status" class:open={connectionStatus === 'open'} class:closed={connectionStatus !== 'open'}>
    <img class="didi-avatar" src="/didi-avatar.png" alt="" aria-hidden="true" />
    <span class="didi-name">didi</span>
    <span class="chat-status-sep">·</span>
    <span class="chat-status-app">augment-it</span>
    <span class="chat-status-sep">·</span>
    <span class="chat-status-conn">{connectionStatus}</span>
  </div>
  <CharacterCastRow />
  <ChatSurface />
</div>
