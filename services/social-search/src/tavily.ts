// Tavily REST client — the search substrate for v1. Reads TAVILY_API_KEY
// from env. One call per (pack × row). Results feed verification + scoring.
//
// Tavily API ref: https://docs.tavily.com/api-reference/endpoint/search

import type { PackConfig } from './packs';

const TAVILY_ENDPOINT = 'https://api.tavily.com/search';

export type TavilyResult = {
  url: string;
  title: string;
  content: string;
  score?: number;
  published_date?: string; // ISO-8601 when Tavily can extract it
};

export type TavilySearchResponse = {
  query: string;
  results: TavilyResult[];
  response_time?: number;
};

export type TavilyError = { error: string };

export function buildQuery(pack: PackConfig, entity_name: string): string {
  return pack.tavily_query_template.replace(/\{\{\s*entity_name\s*\}\}/g, entity_name);
}

/**
 * One Tavily search for one (pack × entity_name). Returns up to 3 results.
 * Throws on transport errors (caller treats as `outcome: 'error'`).
 */
export async function searchTavily(
  pack: PackConfig,
  entity_name: string,
  signal?: AbortSignal,
): Promise<TavilySearchResponse> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error('TAVILY_API_KEY is not set');

  const body = {
    api_key: apiKey,
    query: buildQuery(pack, entity_name),
    search_depth: 'basic',
    include_raw_content: false,
    include_answer: false,
    max_results: 3,
    // Tavily's include_domains restricts to these — combined with the
    // site: operators in the template, this is belt-and-suspenders. Some
    // sources (Wikipedia, YouTube) benefit from the redundancy.
    include_domains: pack.tavily_include_domains,
  };

  const res = await fetch(TAVILY_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Tavily ${res.status}: ${text || res.statusText}`);
  }

  const json = (await res.json()) as TavilySearchResponse | TavilyError;
  if ('error' in json) throw new Error(`Tavily: ${json.error}`);
  return json;
}
