// Tavily connector — a content-RAG search index. Stays wired in as a peer for
// future content-RAG packs/bundles (deep-research, document extraction). Reads
// TAVILY_API_KEY from env; throws if missing so the caller records a localized
// outcome: 'error' for that one cell rather than failing the whole run.
//
// Tavily API ref: https://docs.tavily.com/api-reference/endpoint/search

import type { Connector, ConnectorResult } from './types';

const TAVILY_ENDPOINT = 'https://api.tavily.com/search';

type TavilyResponse = {
  results?: ConnectorResult[];
  error?: string;
};

export const tavilyConnector: Connector = async (query, opts) => {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error('TAVILY_API_KEY is not set');

  const body = {
    api_key: apiKey,
    query,
    search_depth: 'basic',
    include_raw_content: false,
    include_answer: false,
    max_results: opts.max_results,
    include_domains: opts.include_domains ?? [],
  };

  const res = await fetch(TAVILY_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Tavily ${res.status}: ${text || res.statusText}`);
  }

  const json = (await res.json()) as TavilyResponse;
  if (json.error) throw new Error(`Tavily: ${json.error}`);
  return json.results ?? [];
};
