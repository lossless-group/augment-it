// Exa connector — neural/keyword web search. Reads EXA_AI_API_KEY (the name
// already present in the repo-root .env); throws if missing so the caller
// records a localized outcome: 'error' for that one fire rather than failing
// the whole run.
//
// Exa API ref: https://docs.exa.ai/reference/search

import type { Connector, ConnectorResult } from './types';

const EXA_ENDPOINT = 'https://api.exa.ai/search';

type ExaResponse = {
  results?: { title?: string; url: string; publishedDate?: string; text?: string }[];
  error?: string;
};

export const exaConnector: Connector = async (query, opts) => {
  const apiKey = process.env.EXA_AI_API_KEY;
  if (!apiKey) throw new Error('EXA_AI_API_KEY is not set');

  const res = await fetch(EXA_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({
      query,
      numResults: opts.max_results,
      includeDomains: opts.include_domains?.length ? opts.include_domains : undefined,
      // Snippet-sized text keeps per-fire cost down; the result row only
      // needs enough content for the operator to judge relevance.
      contents: { text: { maxCharacters: 500 } },
    }),
    signal: opts.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Exa ${res.status}: ${text || res.statusText}`);
  }

  const json = (await res.json()) as ExaResponse;
  if (json.error) throw new Error(`Exa: ${json.error}`);
  return (json.results ?? []).map(
    (r): ConnectorResult => ({
      url: r.url,
      title: r.title ?? r.url,
      content: r.text ?? '',
      published_date: r.publishedDate,
    }),
  );
};
