// Google News RSS connector — free, no auth, no quota. The Entity Pulse
// spec calls this the v1 default for `search.news` (media-news-coverage-pack)
// and the cheapest find-path for the press-release pack (site-restricted
// to wire-service domains).
//
// Endpoint: https://news.google.com/rss/search?q=<query>&hl=en-US&gl=US&ceid=US:en
//
// Returns standard RSS 2.0 XML; we reuse iso-helper's parseRssFeed for date
// extraction. Per-item shape:
//   <item>
//     <title>Article Title - Publication</title>
//     <link>https://news.google.com/rss/articles/...</link>   ← Google redirect
//     <guid>...</guid>
//     <pubDate>Wed, 14 May 2026 13:00:00 GMT</pubDate>
//     <description>HTML excerpt with the canonical article link inside</description>
//     <source url="https://example.com">Example.com</source>
//   </item>
//
// Two gotchas:
//
// 1. **<link> is a Google redirect URL.** The canonical article URL is
//    inside <description> as an <a href>. Both get returned; the caller
//    can prefer the canonical one when needed.
//
// 2. **<title> appends "- Publication"** which is great for source
//    attribution but noise when computing title similarity for dedup.
//    The caller should strip the trailing " - <Publication>" if titles
//    are compared.

import type { Connector, ConnectorResult } from './types';

const GOOGLE_NEWS_RSS = 'https://news.google.com/rss/search';

export const googleNewsRssConnector: Connector = async (query, opts) => {
  const params = new URLSearchParams({
    q: query,
    hl: 'en-US',
    gl: 'US',
    ceid: 'US:en',
  });

  const res = await fetch(`${GOOGLE_NEWS_RSS}?${params.toString()}`, {
    method: 'GET',
    headers: { 'user-agent': 'augment-it/0.0.1 (lossless-group)' },
    signal: opts.signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Google News RSS ${res.status}: ${text || res.statusText}`);
  }

  const xml = await res.text();
  return parseGoogleNewsRss(xml).slice(0, opts.max_results);
};

// Exported for testing + reuse by packs that want to call the parser
// directly without re-fetching.
export function parseGoogleNewsRss(xml: string): ConnectorResult[] {
  const items = xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi);
  const out: ConnectorResult[] = [];
  for (const m of items) {
    const body = m[1];
    const title = decodeXmlEntities(
      body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '',
    );
    const link = body.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1]?.trim() ?? '';
    const pubDate = body.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1]?.trim();
    const description = decodeXmlEntities(
      body.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1]?.trim() ?? '',
    );
    // The canonical article URL is buried inside the description HTML.
    const canonical = description.match(/<a\s+href=["']([^"']+)["']/i)?.[1];
    if (!link && !canonical) continue;
    out.push({
      url: canonical ?? link,
      title,
      content: stripHtml(description),
      published_date: pubDate, // RFC 2822; iso-helper's toIso normalizes
    });
  }
  return out;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}
