// Federal mount glue. Every federated remote exposes a `./mount` module whose
// entire job is: inject the token stylesheet, mount App into a host-provided
// target, hand back a destroy(). That was 17 hand-maintained copies of the same
// 23 lines, differing only in the exported function name. This is the one copy.
//
// WHY THIS IMPORTS THE BASELINE AND NOT THE FULL THEME (gate A20)
//
// The shell is the canonical injector of theme.css (F10). A federated member
// therefore inherits its real token values from the shell's :root at runtime —
// they share one document, and custom properties inherit.
//
// The danger in that arrangement is token INTRODUCTION, not retirement.
// Retirement can be aliased forever. Introduction cannot: a member deployed
// against a token the DEPLOYED shell does not define yet resolves to nothing —
// invalid at computed-value time, so text inherits and backgrounds go
// transparent. It renders unreadable in production and is invisible in the
// member's own repo, because locally that member has the latest theme.
//
// token-baseline.css closes that hole. Every Tier-2 token is registered with
// @property and an initial-value, which gives each one a FLOOR: when no
// declaration matches, the initial value is used instead of nothing. The
// shell's declarations still win whenever they exist, so this costs nothing
// when the stack is healthy and degrades to a legible dark surface when it is
// not. Generated from theme.css by scripts/generate-token-baseline.mjs.
//
// Standalone entries (each member's src/index.ts) still import the FULL
// theme.css — they have no shell to inherit from and need all three mode
// blocks. Only the federated path is thin.
//
// ORDER STILL MATTERS. This module must evaluate before the member's
// './app.css', so the registrations exist before app.css's var() refs resolve.
// ES module imports evaluate in declaration order, so the member importing
// this FIRST and './app.css' SECOND is what preserves it. Reorder those two
// lines in a member's mount.ts and you are back to unstyled.
//
// Each remote still ships its own inlined copy of this code — the federation
// host declares no `shared` block, so a workspace import is bundled per
// remote rather than linked at runtime. One source of truth in the repo,
// seventeen independent artifacts. Autonomy is unaffected.
// See context-v/notes/Sharing-Code-Without-Breaking-Microfrontend-Autonomy.md

import '@augment-it/theme/token-baseline.css';
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
