// SerpApi connector — Google search-results-as-JSON. The spec calls for
// SerpApi at the FIND-INDEX stage of the official-blog-pack (and later for
// SocialsMentions site-restricted queries). engine=google is the default;
// callers building site-restricted queries should bake the `site:` operator
// into the query string per Google's syntax.
//
// API ref: https://serpapi.com/search-api

import type { Connector, ConnectorResult } from './types';

const SERPAPI_ENDPOINT = 'https://serpapi.com/search.json';

type SerpApiOrganicResult = {
  title?: string;
  link?: string;
  snippet?: string;
  date?: string;
};

type SerpApiResponse = {
  organic_results?: SerpApiOrganicResult[];
  error?: string;
};

export const serpapiConnector: Connector = async (query, opts) => {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) throw new Error('SERPAPI_API_KEY is not set');

  const params = new URLSearchParams({
    engine: 'google',
    q: query,
    api_key: apiKey,
    num: String(Math.min(opts.max_results, 20)),
  });

  const res = await fetch(`${SERPAPI_ENDPOINT}?${params.toString()}`, {
    method: 'GET',
    signal: opts.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`SerpApi ${res.status}: ${text || res.statusText}`);
  }

  const json = (await res.json()) as SerpApiResponse;
  if (json.error) throw new Error(`SerpApi: ${json.error}`);

  const results: ConnectorResult[] = (json.organic_results ?? []).map((r) => ({
    url: r.link ?? '',
    title: r.title ?? '',
    content: r.snippet ?? '',
    published_date: r.date,
  }));

  return results.filter((r) => r.url);
};
