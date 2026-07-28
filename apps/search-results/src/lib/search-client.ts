// Thin typed wrappers over workspace.invoke('...'). The registry ops
// (submit/list/results/dismiss) are served by the workspace service itself;
// the accept verbs ride the same routes the search-and-add and org-workbench
// surfaces use (per-remote copies, spec D7 — knowingly more fuel for the
// component library, gh #22). Template: apps/search-and-add/src/lib/search-client.ts.

import { workspace } from '@augment-it/workspace';
import type { PersonCandidate, SearchCard, SearchResults, SearchTarget } from './types';

// ---- registry ops ----------------------------------------------------------

export async function submitSearch(args: {
  entity: { org_slug: string; display_name?: string };
  target: SearchTarget;
  client: string;
}): Promise<string> {
  const r = (await workspace.invoke('search.submit', args)) as {
    ok: boolean;
    search_id?: string;
    error?: string;
  };
  if (!r.ok || !r.search_id) throw new Error(r.error || 'search.submit failed');
  return r.search_id;
}

export async function listSearches(client: string): Promise<SearchCard[]> {
  const r = (await workspace.invoke('search.list', { client })) as {
    ok: boolean;
    searches?: SearchCard[];
    error?: string;
  };
  if (!r.ok) throw new Error(r.error || 'search.list failed');
  return r.searches ?? [];
}

export async function fetchSearchResults(search_id: string): Promise<SearchResults> {
  const r = (await workspace.invoke('search.results', { search_id })) as { ok: boolean } & SearchResults;
  if (!r.ok) throw new Error(r.error || 'search.results failed');
  return r;
}

export async function dismissSearch(search_id: string): Promise<void> {
  const r = (await workspace.invoke('search.dismiss', { search_id })) as {
    ok: boolean;
    error?: string;
  };
  if (!r.ok) throw new Error(r.error || 'search.dismiss failed');
}

// ---- accept verbs — links/streams (ResultsAccept) --------------------------

// One ➕: crawl extras (kind, and a stream's real name) ride the write so it
// keeps the model's inference instead of re-inferring server-side. Broadcasts
// entity-updated so the org card refetches (spec Phase 3).
export async function addCrawlResult(args: {
  target: 'links' | 'streams';
  org_slug: string;
  url: string;
  client: string;
  kind?: string;
  name?: string;
}): Promise<void> {
  const verb = args.target === 'links' ? 'organization.links.add' : 'organization.streams.add';
  const body: Record<string, unknown> = {
    org_slug: args.org_slug,
    url: args.url,
    client: args.client,
    ...(args.kind ? { kind: args.kind } : {}),
    ...(args.target === 'streams' && args.name ? { name: args.name } : {}),
  };
  const r = (await workspace.invoke(verb, body)) as { ok: boolean; error?: string };
  if (!r.ok) throw new Error(r.error || `${verb} failed`);
  window.dispatchEvent(
    new CustomEvent('augment-it:entity-updated', { detail: { org_slug: args.org_slug } }),
  );
}

// ---- accept verbs — team (TeamAccept) ---------------------------------------
// person.candidates → gate → person.apply → person.affiliate (+ link adds on
// created persons). org-workbench lib/org-client.ts mirrors.

export type PersonNormRecord = {
  name: string;
  linkedin_url?: string | null;
  role?: string | null;
  bio?: string | null;
};

export async function fetchPersonCandidates(
  record: PersonNormRecord,
  client: string,
): Promise<PersonCandidate[]> {
  const r = (await workspace.invoke('person.candidates', { record, client })) as {
    ok: boolean;
    candidates?: PersonCandidate[];
    error?: string;
  };
  if (!r.ok) throw new Error(r.error || 'person.candidates failed');
  return r.candidates ?? [];
}

export async function applyPerson(args: {
  action: 'match' | 'create';
  person_uuid?: string;
  record: PersonNormRecord;
  client: string;
  source?: string;
}): Promise<{ person_uuid: string; created: boolean }> {
  const r = (await workspace.invoke('person.apply', args)) as {
    ok: boolean;
    person_uuid?: string;
    created?: boolean;
    error?: string;
  };
  if (!r.ok || !r.person_uuid) throw new Error(r.error || 'person.apply failed');
  return { person_uuid: r.person_uuid, created: r.created ?? false };
}

export async function affiliatePerson(args: {
  person_uuid: string;
  org_slug: string;
  role?: string | null;
  // didi's per-candidate reasoning — persisted on the affiliation edge as
  // agent_search_rationale so Accept doesn't discard it (gh #59).
  agent_search_rationale?: string | null;
  client: string;
  source?: string;
}): Promise<void> {
  const r = (await workspace.invoke('person.affiliate', {
    person_uuid: args.person_uuid,
    org_action: 'match',
    org_slug: args.org_slug,
    role: args.role ?? null,
    agent_search_rationale: args.agent_search_rationale ?? null,
    client: args.client,
    source: args.source ?? 'search-results',
  })) as { ok: boolean; error?: string };
  if (!r.ok) throw new Error(r.error || 'person.affiliate failed');
}

export async function addPersonLink(args: {
  person_uuid: string;
  url: string;
  client: string;
}): Promise<void> {
  const r = (await workspace.invoke('person.links.add', args)) as { ok: boolean; error?: string };
  if (!r.ok) throw new Error(r.error || 'person.links.add failed');
}

// ---- display helpers ---------------------------------------------------------

/** "1:20" from ms. */
export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
