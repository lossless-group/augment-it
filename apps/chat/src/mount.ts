// Federation-exposed mount. Same pattern as prompt-template-manager —
// theme.css first (so :root tokens exist before app.css's var() refs
// resolve), then app.css, then mount the App component.
//
// The chat connects to the workspace WebSocket on mount and disconnects
// on unmount. In federation mode the workspace singleton is per-remote
// (the shell's no-`shared` discipline), so the chat owns its own
// workspace connection and exchanges state with the rest of the stack
// via the same broadcast subjects everyone else sees.

import '@augment-it/theme/theme.css';
import './app.css';
import { mount, unmount, type Component } from 'svelte';
import App from './App.svelte';

export type MountResult = {
  destroy: () => void;
};

export function mountChat(target: HTMLElement): MountResult {
  const component = mount(App as Component, { target });
  return {
    destroy: () => {
      unmount(component);
    },
  };
}
