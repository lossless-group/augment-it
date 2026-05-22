// Federation-exposed mount function. The shell imports this and invokes it
// against a host-provided DOM target. The component runs inside *this*
// remote's Svelte runtime (no shared-singleton magic, no effect_orphan
// errors from cross-runtime mount), and returns a cleanup function the
// shell calls when unmounting.
//
// Pattern: each remote brings its own framework runtime and is mounted
// rather than rendered as a component. This is the standard cross-runtime
// microfrontend pattern when framework-runtime singleton-sharing across
// the federation boundary is not workable.
//
// Styles: theme.css (the shared token system) and ./app.css are imported
// as side effects so webpack's CSS pipeline injects them into the host
// document.head when this module evaluates. theme.css first — its :root
// tokens must exist before app.css's var() refs resolve.

import '@augment-it/theme/theme.css';
import './app.css';
import { mount, unmount, type Component } from 'svelte';
import App from './App.svelte';

export type MountResult = {
  destroy: () => void;
};

export function mountRecordCollector(target: HTMLElement): MountResult {
  const component = mount(App as Component, { target });
  return {
    destroy: () => {
      unmount(component);
    },
  };
}
