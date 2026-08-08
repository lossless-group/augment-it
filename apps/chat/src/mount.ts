// Federation-exposed mount. The shared body lives in @augment-it/federation,
// which also carries the theme.css import — see that module for why the
// ordering below (federation first, ./app.css second) is load-bearing.
//
// The chat connects to the workspace WebSocket on mount and disconnects on
// unmount. In federation mode the workspace singleton is per-remote (the
// shell's no-`shared` discipline), so the chat owns its own workspace
// connection and exchanges state with the rest of the stack via the same
// broadcast subjects everyone else sees.

import { makeMount } from '@augment-it/federation';
import './app.css';
import type { Component } from 'svelte';
import App from './App.svelte';

export type { MountResult } from '@augment-it/federation';

export const mountChat = makeMount(App as Component);
