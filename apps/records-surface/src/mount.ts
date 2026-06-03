import '@augment-it/theme/theme.css';
import './app.css';
import { mount, unmount, type Component } from 'svelte';
import App from './App.svelte';

export type MountResult = { destroy: () => void };

export function mountRecordsSurface(target: HTMLElement): MountResult {
  const component = mount(App as Component, { target });
  return { destroy: () => { unmount(component); } };
}
