// SearXNG connector — a self-hosted metasearch aggregator (Google/Bing/DDG/
// Brave). The right substrate for social-profile discovery: it returns what a
// manual browser search finds, which is exactly what the social packs need.
// Free, no API key. Runs as a container in the stack; reached at searxng:8080
// over the internal Docker network.
//
// SearXNG must have the JSON output format enabled (search.formats: [..., json])
// and its limiter disabled for programmatic access — see
// services/social-search/searxng/settings.yml.
//
// Spec: context-v/issues/Search-Providers-as-First-Class-SearXNG-Default.md

import type { Connector, ConnectorResult } from './types';

const SEARXNG_URL = (process.env.SEARXNG_URL ?? 'http://searxng:8080').replace(/\/$/, '');

type SearxngRawResult = {
  url?: string;
  title?: string;
  content?: string;
  score?: number;
  publishedDate?: string | null;
};

type SearxngResponse = {
  results?: SearxngRawResult[];
};

export const searxngConnector: Connector = async (query, opts) => {
  // SearXNG passes the query through to its configured engines, which honor
  // site: operators if present. Domain restriction is enforced downstream by
  // the pack's domain_whitelist in pickCandidate, so include_domains is unused
  // here by design.
  const params = new URLSearchParams({ q: query, format: 'json' });

  const res = await fetch(`${SEARXNG_URL}/search?${params.toString()}`, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      // Some SearXNG configs reject requests with no UA as bot traffic.
      'user-agent': 'augment-it-social-search/0.1',
    },
    signal: opts.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`SearXNG ${res.status}: ${text || res.statusText}`);
  }

  const json = (await res.json()) as SearxngResponse;
  const results = json.results ?? [];

  return results
    .slice(0, opts.max_results)
    .map((r): ConnectorResult => ({
      url: r.url ?? '',
      title: r.title ?? '',
      content: r.content ?? '',
      score: typeof r.score === 'number' ? r.score : undefined,
      published_date: r.publishedDate ?? undefined,
    }))
    .filter((r) => r.url.length > 0);
};
