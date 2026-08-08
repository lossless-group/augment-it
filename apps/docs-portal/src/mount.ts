// Federation-exposed mount. The shared body lives in @augment-it/federation,
// which also carries the token floor — see that module for why the ordering
// below (federation first, ./app.css second) is load-bearing.
//
// Note what this does NOT import: theme.css. Under the shell, the shell is the
// canonical injector and supplies all three mode blocks, so the portal's mode
// toggle switches against the real theme. The standalone entry (./index.ts)
// still loads the full theme, because on :3020 there is no shell to inherit
// from and a swatch page with one mode would be pointless.

import { makeMount } from '@augment-it/federation';
import './app.css';
import type { Component } from 'svelte';
import App from './App.svelte';

export type { MountResult } from '@augment-it/federation';

export const mountDesignSystem = makeMount(App as Component);
