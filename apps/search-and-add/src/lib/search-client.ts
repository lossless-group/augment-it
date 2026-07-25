// Thin typed wrappers over workspace.invoke('...'). Credential-free per
// spec D1: search.fire → social-search; the add verbs →
// record-surrealdb-resolver. Template: apps/org-workbench/src/lib/org-client.ts.

import { workspace } from '@augment-it/workspace';
import type { ConnectorInfo, ConnectorResult, SearchRequestDetail } from './types';

export async function fireSearch(args: {
  query: string;
  intent?: string;
  provider?: string;
  max_results?: number;
}): Promise<{ provider: string; results: ConnectorResult[] }> {
  const r = (await workspace.invoke('search.fire', args)) as {
    ok: boolean;
    provider?: string;
    results?: ConnectorResult[];
    error?: string;
  };
  if (!r.ok) throw new Error(r.error || 'search.fire failed');
  return { provider: r.provider ?? 'unknown', results: r.results ?? [] };
}

export async function scanStream(args: {
  org_slug: string;
  stream_url: string;
  stream_kind?: string;
  client: string;
}): Promise<{ results: ConnectorResult[]; already_known: number }> {
  const r = (await workspace.invoke('organization.stream.scan', args)) as {
    ok: boolean;
    items?: {
      url: string;
      title: string;
      snippet: string;
      published_date: string | null;
      already_in_corpus: boolean;
    }[];
    meta?: { already_known: number };
    error?: string;
  };
  if (!r.ok) throw new Error(r.error || 'organization.stream.scan failed');
  return {
    results: (r.items ?? []).map((i) => ({
      url: i.url,
      title: i.title,
      content: i.snippet,
      published_date: i.published_date ?? undefined,
      known: i.already_in_corpus,
    })),
    already_known: r.meta?.already_known ?? 0,
  };
}

// (The v1.2 crawl mode is retired — didi's crawls enqueue via search.submit
// and land in the search-results rail, per Search-Results-Queue-Remote.)

export async function fetchConnectors(): Promise<ConnectorInfo[]> {
  const r = (await workspace.invoke('connectors.inventory', {})) as {
    ok: boolean;
    connectors?: ConnectorInfo[];
    error?: string;
  };
  if (!r.ok) throw new Error(r.error || 'connectors.inventory failed');
  return r.connectors ?? [];
}

// One ➕, routed by the launch envelope's entity + target. Persons have no
// streams — the palette never offers that combination (App-level guard too).
const ORG_VERBS: Record<SearchRequestDetail['target'], string> = {
  links: 'organization.links.add',
  streams: 'organization.streams.add',
  corpus: 'organization.corpus.add',
};
const PERSON_VERBS: Partial<Record<SearchRequestDetail['target'], string>> = {
  links: 'person.links.add',
  corpus: 'person.corpus.add',
};

export function verbFor(req: SearchRequestDetail): string {
  const verb =
    req.entity.type === 'organization' ? ORG_VERBS[req.target] : PERSON_VERBS[req.target];
  if (!verb) throw new Error(`no add verb for ${req.entity.type} + ${req.target}`);
  return verb;
}

export async function addResult(
  req: SearchRequestDetail,
  url: string,
  client: string,
): Promise<void> {
  const verb = verbFor(req);
  const args =
    req.entity.type === 'organization'
      ? { org_slug: req.entity.org_slug, url, client }
      : { person_uuid: req.entity.person_uuid, url, client };
  const r = (await workspace.invoke(verb, args)) as { ok: boolean; error?: string };
  if (!r.ok) throw new Error(r.error || `${verb} failed`);
  window.dispatchEvent(
    new CustomEvent('augment-it:entity-updated', {
      detail:
        req.entity.type === 'organization'
          ? { org_slug: req.entity.org_slug }
          : { person_uuid: req.entity.person_uuid },
    }),
  );
}
