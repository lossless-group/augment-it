// Federal mount glue. Every federated remote exposes a `./mount` module whose
// entire job is: inject the token stylesheet, mount App into a host-provided
// target, hand back a destroy(). That was 17 hand-maintained copies of the same
// 23 lines, differing only in the exported function name. This is the one copy.
//
// WHY THE theme.css IMPORT LIVES HERE, AND WHY ORDER MATTERS
//
// theme.css and the member's ./app.css are imported as side effects so the
// bundler's CSS pipeline injects them — Svelte's append_styles does not fire
// reliably across the federation chunk boundary. theme.css MUST evaluate
// before app.css, so its :root tokens exist before app.css's var() refs
// resolve. That ordering is preserved by the member importing this module
// FIRST and './app.css' SECOND: ES module imports evaluate in declaration
// order, so this module's transitive theme.css lands ahead of the member's
// stylesheet. Reorder those two lines in a member's mount.ts and its tokens
// resolve to nothing.
//
// This centralisation is deliberately friendly to Phase 1b / F10 of the
// federated design system, which makes the shell the sole injector of
// theme.css. When that lands, deleting the import below removes it from all
// 17 members at once instead of requiring 14 separate edits.
// See context-v/handoffs/Federated-Design-System-Phases-0-and-1-Shipped-Nothing-Seen.md
//
// Each remote still ships its own inlined copy of this code — the federation
// host declares no `shared` block, so a workspace import is bundled per
// remote rather than linked at runtime. One source of truth in the repo,
// seventeen independent artifacts. Autonomy is unaffected.
// See context-v/notes/Sharing-Code-Without-Breaking-Microfrontend-Autonomy.md

import '@augment-it/theme/theme.css';
import { mount, unmount, type Component } from 'svelte';

export type MountResult = {
  destroy: () => void;
};

export type MountFn = (target: HTMLElement) => MountResult;

/**
 * Build a federation-exposed mount function for a remote's root component.
 *
 *   import { makeMount } from '@augment-it/federation';
 *   import './app.css';
 *   import App from './App.svelte';
 *
 *   export const mountPackRunner = makeMount(App as Component);
 *
 * The distinct export name per remote is load-bearing — Module Federation
 * exposes it by name — so members keep their own named export and only the
 * body is shared.
 */
export function makeMount(App: Component): MountFn {
  return (target: HTMLElement): MountResult => {
    const component = mount(App, { target });
    return {
      destroy: () => {
        unmount(component);
      },
    };
  };
}
