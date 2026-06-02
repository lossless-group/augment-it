// GDELT connector — Doc 2.0 ArtList API. Free, no auth. Per the Entity
// Pulse spec, GDELT is the immediate peer to Google News RSS for the
// `search.news` capability.
//
// API ref: https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
// Endpoint: https://api.gdeltproject.org/api/v2/doc/doc
//
// ---
// RETURN-SHAPE REFERENCE (mode='artlist', format='json')
//
// Live probe on 2026-06-02 hit the public-endpoint daily rate cap before
// returning content (the limiter responds with the cooldown notice on the
// first request even after long quiet windows from a previously-throttled
// IP). Shape below is from GDELT's documentation + prior project use.
// Update when a live response is captured.
//
//   {
//     "articles": [
//       {
//         "url": "https://example.com/article",
//         "url_mobile": "https://m.example.com/article",
//         "title": "Article Title",
//         "seendate": "20260514T130000Z",   // when GDELT first saw the URL,
//                                            // NOT the article's pubdate.
//                                            // ISO-8601 once normalized via
//                                            // iso-helper's extractIsoFromText
//                                            // / toIso.
//         "socialimage": "https://...",     // OG image when present
//         "domain": "example.com",
//         "language": "English",
//         "sourcecountry": "United States"
//       },
//       ...
//     ]
//   }
//
// Notable gaps vs other news APIs:
//
// 1. **No article snippet/description.** GDELT's ArtList payload is link +
//    title + metadata only — no body excerpt. Callers that need a snippet
//    have to fetch the article themselves (Firecrawl scrape, etc.) or
//    use GDELT's separate `mode=tonechart`/`mode=clusters` endpoints which
//    return aggregate analysis but not raw text either.
//
// 2. **`seendate` is crawl time, not publish time.** For Entity Pulse's
//    `published_date` field we treat seendate as a proxy with a known
//    accuracy floor (usually within hours of pubdate for major sources,
//    can be days off for slow-crawled sources). When a more accurate
//    pubdate matters, the consumer pack should re-fetch the article URL
//    and let iso-helper's fallback stack pick a better date.
//
// 3. **No relevance score** in artlist mode — sort can be hybridrel or
//    datedesc but the score isn't surfaced per-result. Mode `tonechart`
//    returns aggregate tone but not per-article.
//
// 4. **Heavy IP-based rate limiting.** Public endpoint enforces ~1 req/5s
//    soft cap AND a daily quota that can lock out from-the-same-IP probes
//    for ≥1hr after repeated bursts. Production use should batch
//    aggressively and consider GDELT's BigQuery dataset for high-volume
//    workloads.

import type { Connector, ConnectorResult } from './types';

const GDELT_ENDPOINT = 'https://api.gdeltproject.org/api/v2/doc/doc';

type GdeltArticle = {
  url?: string;
  url_mobile?: string;
  title?: string;
  seendate?: string;
  socialimage?: string;
  domain?: string;
  language?: string;
  sourcecountry?: string;
};

type GdeltResponse = {
  articles?: GdeltArticle[];
};

// Convert GDELT's `YYYYMMDDTHHMMSSZ` seendate to a normal ISO-8601 string
// (`YYYY-MM-DDTHH:MM:SSZ`). iso-helper's toIso() can also handle this via
// its general fallback stack, but GDELT's shape is so consistent it's
// cheaper to format directly here.
function seendateToIso(seendate?: string): string | undefined {
  if (!seendate) return undefined;
  const m = seendate.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (!m) return undefined;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
}

export const gdeltConnector: Connector = async (query, opts) => {
  const params = new URLSearchParams({
    query,
    mode: 'artlist',
    format: 'json',
    maxrecords: String(Math.min(opts.max_results, 250)),
    sort: 'datedesc',
  });

  const res = await fetch(`${GDELT_ENDPOINT}?${params.toString()}`, {
    method: 'GET',
    // GDELT explicitly asks for an identifying UA per their docs — anonymous
    // requests are throttled harder.
    headers: { 'user-agent': 'augment-it/0.0.1 (lossless-group)' },
    signal: opts.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GDELT ${res.status}: ${text || res.statusText}`);
  }

  // GDELT returns text/plain (rate-limit notice) instead of JSON when
  // throttled — the HTTP status stays 200 but the body is human-readable.
  // Detect and surface as a real error.
  const bodyText = await res.text();
  if (bodyText.startsWith('Please limit') || !bodyText.trim().startsWith('{')) {
    throw new Error(`GDELT throttled or non-JSON response: ${bodyText.slice(0, 200)}`);
  }

  let json: GdeltResponse;
  try {
    json = JSON.parse(bodyText) as GdeltResponse;
  } catch {
    throw new Error(`GDELT: unparseable response: ${bodyText.slice(0, 200)}`);
  }

  const results: ConnectorResult[] = (json.articles ?? []).map((a) => ({
    url: a.url ?? '',
    title: a.title ?? '',
    // No snippet in GDELT artlist — leave content empty. Consumer packs
    // that need a snippet fetch the article URL separately.
    content: '',
    published_date: seendateToIso(a.seendate),
  }));

  return results.filter((r) => r.url);
};
