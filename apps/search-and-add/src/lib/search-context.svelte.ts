// The active launch envelope, as reactive state. Sourced two ways (spec D2
// refinement): localStorage on mount (survives the async federation mount —
// the dispatching remote wrote it before the navigate event), then live
// CustomEvents for every subsequent 🔍 while this remote is already mounted.
//
// Svelte 5 singleton, constructor-assignment $state pattern (same as the
// shell's ActiveFlowState) so toolchain class-field lowering can't break
// $state placement.

import type { SearchRequestDetail } from './types';

export const SEARCH_REQUEST_KEY = 'augment-it:search-request';
export const SEARCH_REQUEST_EVENT = 'augment-it:search-request';

function readStored(): SearchRequestDetail | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(SEARCH_REQUEST_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SearchRequestDetail;
    return parsed?.entity && parsed?.target ? parsed : null;
  } catch {
    return null;
  }
}

class SearchContextState {
  request: SearchRequestDetail | null;
  // Bumped on every new arrival so the App can auto-fire exactly once per
  // request, even when two consecutive requests are deep-equal.
  arrival: number;

  constructor() {
    this.request = $state<SearchRequestDetail | null>(readStored());
    this.arrival = $state<number>(0);
  }

  set(detail: SearchRequestDetail): void {
    this.request = detail;
    this.arrival += 1;
  }

  /** Wire the live-event listener; returns the teardown for onMount. */
  listen(): () => void {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as SearchRequestDetail | undefined;
      if (detail?.entity && detail?.target) this.set(detail);
    };
    window.addEventListener(SEARCH_REQUEST_EVENT, handler);
    return () => window.removeEventListener(SEARCH_REQUEST_EVENT, handler);
  }
}

export const searchContext = new SearchContextState();
