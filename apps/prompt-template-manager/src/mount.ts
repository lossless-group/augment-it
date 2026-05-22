// Federation-exposed mount function. The shell calls this against a
// host-provided div; the component runs inside this remote's own Svelte
// runtime. Same pattern as record-collector — see the 2026-05-21_03
// changelog for why exposing a mount function (not a component) is the
// right shape across the federation boundary.
//
// ./app.css is imported as a side effect so webpack's CSS pipeline injects
// the stylesheet — Svelte's append_styles doesn't fire reliably across the
// federation chunk boundary.

import './app.css';
import { mount, unmount, type Component } from 'svelte';
import App from './App.svelte';

export type MountResult = {
  destroy: () => void;
};

export function mountPromptTemplateManager(target: HTMLElement): MountResult {
  const component = mount(App as Component, { target });
  return {
    destroy: () => {
      unmount(component);
    },
  };
}
