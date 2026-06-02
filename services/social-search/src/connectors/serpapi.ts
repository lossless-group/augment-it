// SerpApi connector — Google search-results-as-JSON. The spec calls for
// SerpApi at the FIND-INDEX stage of the official-blog-pack (and later for
// SocialsMentions site-restricted queries). engine=google is the default;
// callers building site-restricted queries should bake the `site:` operator
// into the query string per Google's syntax.
//
// API ref: https://serpapi.com/search-api
//
// ---
// RETURN-SHAPE REFERENCE (engine='google', captured 2026-06-02)
//
// The response is much richer than this connector currently reads. We only
// surface `organic_results` because the existing dispatcher expects a single
// flat ConnectorResult[] shape. The other blocks below are unused but
// available behind the same single API call — when a consumer needs them
// (Entity Pulse's SocialsMentions, knowledge-graph disambiguation, local-
// presence ranking), the connector should grow a variant that returns the
// richer structure rather than re-querying SerpApi.
//
// Top-level blocks (presence depends on the query — some are absent for
// non-commercial / non-local queries):
//
//   search_metadata        — id, status, json_endpoint (cached raw response
//                            URL), raw_html_file, processed_at, total_time_taken
//   search_parameters      — what was actually sent (engine, q, device, location)
//   search_information     — total_results count, results_for, time_taken_displayed
//   organic_results[]      — { position, title, link, snippet, source, thumbnail,
//                              favicon, sitelinks, snippet_highlighted_words,
//                              rich_snippet?, redirect_link, displayed_link }
//                            ← CURRENTLY THE ONLY BLOCK READ
//   knowledge_graph        — { title, type, kgmid (Google's stable entity id —
//                              great for disambiguation), description, source,
//                              header_images[], sources_include_links[] }
//   local_results.places[] — { position, title, type, address, gps_coordinates,
//                              place_id, rating, reviews, price, description,
//                              thumbnail }
//   local_map              — { link, image, gps_coordinates }
//   immersive_products[]   — shopping listings (Walmart, Amazon, etc.)
//   related_questions[]    — "People Also Ask" — { question, type: 'featured_snippet'
//                            | 'ai_overview', snippet, snippet_links[], references[],
//                            link, source_logo, date }
//   perspectives[]         — multi-source results across socials/media —
//                            { author, author_description, source: 'YouTube' |
//                              'Reddit' | 'LinkedIn' | 'Substack' | 'Facebook' |
//                              'Instagram' | 'The New York Times' | …,
//                              title, link, date ("4 days ago" | "1 month ago" | …),
//                              thumbnails[], extensions[] }
//                            ← HIGHLY RELEVANT for Entity Pulse's SocialsMentions
//                              + MediaMentions packs (a single SerpApi call
//                              surfaces YouTube + Reddit + LinkedIn + Substack
//                              mentions of the entity with dates and authors).
//   related_searches[]     — query suggestions
//   refine_this_search[]   — filter suggestions
//   refine_search_filters  — structured facets (Type, Color, Brand, …)
//   things_to_know         — Google's expandable info cards (Health Benefits,
//                              Caffeine Content, Brewing Methods, …)
//   pagination             — { current, next, other_pages: { 2: <url>, … } }
//   serpapi_pagination     — same but with serpapi-rerouted next_link
//
// Engine variants change the shape: engine='google_news' returns
// `news_results[]` instead of `organic_results[]`; engine='google_scholar'
// returns `organic_results[]` with `publication_info` + `cited_by` fields;
// engine='google_jobs' returns `jobs_results[]`. The current connector
// always uses engine='google' — when a caller needs another engine, the
// `hints` field on ConnectorFireOpts is the seam to thread `engine` through
// without refactoring the connector signature.

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
