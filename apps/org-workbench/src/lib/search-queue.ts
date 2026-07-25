// Enqueue an agent search — the 🤖 door (Search-Results-Queue-Remote spec).
// search.submit returns the id immediately; the search lands as a card in
// the search-results rail, and the shell flips the rail visible on the
// window event so the operator sees where their search went. No navigate,
// no column hijack — fire and keep working.

import { workspace } from '@augment-it/workspace';

export async function submitCrawl(args: {
  org_slug: string;
  display_name?: string;
  target: 'links' | 'streams' | 'team';
  client: string;
}): Promise<string> {
  const r = (await workspace.invoke('search.submit', {
    entity: { org_slug: args.org_slug, display_name: args.display_name },
    target: args.target,
    client: args.client,
  })) as { ok: boolean; search_id?: string; error?: string };
  if (!r.ok || !r.search_id) throw new Error(r.error || 'search.submit failed');
  window.dispatchEvent(new CustomEvent('augment-it:search-submitted', { detail: { search_id: r.search_id } }));
  return r.search_id;
}
