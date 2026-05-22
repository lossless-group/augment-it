// Mode switcher — the light / dark / vibrant three-mode contract.
//
// Adapted from the Astro Knots ModeSwitcher
// (astro-knots/context-v/blueprints/Maintain-Themes-Mode-Across-CSS-Tailwind.md §4).
// Sets `data-mode` on <html>; theme.css's three mode blocks re-point the
// semantic tokens off that attribute. Persists to localStorage; dispatches a
// `mode-change` event; SSR-safe (guards document/window/localStorage).
//
// In the federated app there is ONE <html> shared by the shell and every
// mounted remote — so the shell setting `data-mode` themes every remote for
// free. Standalone remotes import this too so they theme when run alone.

export type Mode = 'light' | 'dark' | 'vibrant';

export const MODES: readonly Mode[] = ['light', 'dark', 'vibrant'];

const STORAGE_KEY = 'augment-it:mode';
const DEFAULT_MODE: Mode = 'dark'; // augment-it's native look is dark

function isMode(value: unknown): value is Mode {
  return value === 'light' || value === 'dark' || value === 'vibrant';
}

function readStored(): Mode {
  if (typeof localStorage === 'undefined') return DEFAULT_MODE;
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isMode(v) ? v : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

let current: Mode = readStored();

export function getMode(): Mode {
  return current;
}

export function applyMode(mode: Mode, persist = true): void {
  current = mode;
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-mode', mode);
  }
  if (persist && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // private-mode / disabled storage — mode still applies for this session
    }
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('mode-change', { detail: { mode } }));
  }
}

export function setMode(mode: Mode): void {
  applyMode(mode);
}

/** Advance light → dark → vibrant → light. Returns the new mode. */
export function cycleMode(): Mode {
  const next = MODES[(MODES.indexOf(current) + 1) % MODES.length];
  applyMode(next);
  return next;
}

/** Subscribe to mode changes. Returns an unsubscribe function. */
export function onModeChange(listener: (mode: Mode) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event) => listener((e as CustomEvent<{ mode: Mode }>).detail.mode);
  window.addEventListener('mode-change', handler);
  return () => window.removeEventListener('mode-change', handler);
}

// Boot: apply the stored (or default) mode the moment this module is imported.
// `persist: false` — reading is not a user change.
applyMode(current, false);
