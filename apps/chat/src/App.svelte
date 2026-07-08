<script lang="ts">
  // Chat root. Connects the workspace, mounts CharacterCastRow + ChatSurface.
  // Standalone-mode-friendly: at :3006 the chat connects directly to
  // workspace-service at ws://localhost:3001/ws; in federation mode the
  // shell mounts this remote and the same connection is established.

  import { onMount } from 'svelte';
  import { workspace } from '@augment-it/workspace';
  import CharacterCastRow from './CharacterCastRow.svelte';
  import ChatSurface from './ChatSurface.svelte';

  let connectionStatus = $state<'connecting' | 'open' | 'closed' | 'error'>('connecting');

  onMount(() => {
    const TOKEN_KEY = 'augment_it_session_token';
    workspace.connect({
      url: 'ws://localhost:3001/ws',
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
