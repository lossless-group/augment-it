// Launch the search-and-add remote pre-scoped to one entity + one list
// (spec D2). Three writes, in order:
//   1. localStorage — survives the async federation mount (the event alone
//      is racy when search-and-add isn't mounted yet);
//   2. the live CustomEvent — picked up instantly when it IS mounted;
//   3. augment-it:navigate — the shell opens the orgWorkbench+searchAndAdd
//      pairing so both surfaces tile side by side.

import type { SearchRequestDetail } from './types';

const SEARCH_REQUEST_KEY = 'augment-it:search-request';

export function requestSearch(detail: SearchRequestDetail): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(SEARCH_REQUEST_KEY, JSON.stringify(detail));
  }
  window.dispatchEvent(new CustomEvent('augment-it:search-request', { detail }));
  window.dispatchEvent(
    new CustomEvent('augment-it:navigate', { detail: { remoteId: 'searchAndAdd' } }),
  );
}
