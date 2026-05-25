// Federation-exposed mount function. Same shape as the other remotes.
// theme.css + ./app.css imported as side effects so the bundler's CSS
// pipeline injects them — Svelte's append_styles doesn't fire reliably
// across the federation chunk boundary. theme.css first so its :root
// tokens exist before app.css's var() refs resolve.

import '@augment-it/theme/theme.css';
import './app.css';
import { mount, unmount, type Component } from 'svelte';
import App from './App.svelte';

export type MountResult = {
  destroy: () => void;
};

export function mountPackRunner(target: HTMLElement): MountResult {
  const component = mount(App as Component, { target });
  return {
    destroy: () => {
      unmount(component);
    },
  };
}
