// Records Surface connector implementations. Three connectors, all returning
// the same Candidate[] shape — the Records Surface UI doesn't care which
// connector fired, only that it gets back URL candidates.
//
// Per context-v/specs/Flow-for-Bundles-Packs.md §"The connectors".

import { getConnector } from '../connectors';
import { firecrawlScrape } from '../connectors/firecrawl';

export type Candidate = {
  url: string;
  title?: string;
  anchor_text?: string;
  confidence?: number;
};

export type ConnectorId =
  | 'serpapi-site-search'
  | 'firecrawl-nav-scan'
  | 'firecrawl-nav-agent';

// Keywords used by both nav-scan + nav-agent to identify candidate links.
const INDEX_KEYWORDS = [
  'news', 'press', 'blog', 'insights', 'insight',
  'stories', 'story', 'articles', 'article',
  'grants', 'grant', 'publications', 'publication',
  'newsroom', 'updates', 'update', 'media',
  'releases', 'release', 'announcements', 'announcement',
  'features', 'voices', 'commentary', 'perspectives',
];

function hostnameOf(url: string): string {
  return new URL(url).host.replace(/^www\./, '');
}

function linkMatchesKeyword(href: string, anchorText: string | undefined): boolean {
  const hay = `${href} ${anchorText ?? ''}`.toLowerCase();
  return INDEX_KEYWORDS.some((kw) =>
    new RegExp(`(?:^|/|[-_\\s])${kw}(?:[-_/\\s]|$)`, 'i').test(hay),
  );
}

function scoreCandidate(pathname: string, lastSegmentIsKeyword: boolean): number {
  const segments = pathname.split('/').filter(Boolean);
  let score = 10;
  if (lastSegmentIsKeyword) score += 50;
  score -= (segments.length - 1) * 10;
  return score;
}

// SerpApi site-search — sends `site:<row.url> blog OR news OR press OR
// insights OR stories` to SerpApi's Google engine. Returns up to 10
// candidate URLs from organic_results.
async function fireSerpapiSiteSearch(rowUrl: string): Promise<Candidate[]> {
  const host = hostnameOf(rowUrl);
  const serpapi = getConnector('serpapi');
  const results = await serpapi(
    `site:${host} blog OR news OR press OR insights OR stories`,
    { max_results: 10 },
  );
  return results
    .filter((r) => r.url)
    .map((r) => ({
      url: r.url,
      title: r.title || undefined,
    }));
}

// Firecrawl nav-scan — scrape the row URL, harvest outbound links whose
// path or anchor text contains an index keyword, score them by path
// shallowness, return the top candidates.
async function fireFirecrawlNavScan(rowUrl: string): Promise<Candidate[]> {
  const scrape = await firecrawlScrape(rowUrl, { formats: ['markdown', 'links'] });
  const host = hostnameOf(rowUrl);

  // Anchor-text harvesting from markdown — for each [text](url) link.
  const anchorMap = new Map<string, string>();
  const markdown = scrape.markdown ?? '';
  for (const m of markdown.matchAll(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g)) {
    const text = m[1].trim();
    const url = m[2].trim();
    if (!anchorMap.has(url) && text.length < 80) anchorMap.set(url, text);
  }

  const seen = new Set<string>();
  const scored: Array<{ url: string; score: number; anchor?: string; pathname: string }> = [];
  for (const href of scrape.links ?? []) {
    try {
      const u = new URL(href, rowUrl);
      if (u.host.replace(/^www\./, '') !== host) continue;
      if (u.pathname === '/' || u.pathname === '') continue;
      if (/\/(login|signin|signup|search|donate|contact|about|careers|jobs)\b/i.test(u.pathname)) continue;
      const norm = u.toString();
      if (seen.has(norm)) continue;
      const anchor = anchorMap.get(norm);
      if (!linkMatchesKeyword(u.pathname, anchor)) continue;
      seen.add(norm);

      const segments = u.pathname.split('/').filter(Boolean);
      const lastSegment = (segments[segments.length - 1] ?? '').toLowerCase();
      const lastIsKeyword = INDEX_KEYWORDS.some(
        (kw) => lastSegment === kw || lastSegment === `${kw}s`,
      );
      scored.push({ url: norm, score: scoreCandidate(u.pathname, lastIsKeyword), anchor, pathname: u.pathname });
    } catch {
      continue;
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 10).map((s) => ({
    url: s.url,
    anchor_text: s.anchor,
  }));
}

// Firecrawl nav-agent — same scrape as nav-scan, but pipes the link set
// through Haiku to classify. Falls back to nav-scan when no ANTHROPIC_API_KEY.
async function fireFirecrawlNavAgent(rowUrl: string): Promise<Candidate[]> {
  const scrape = await firecrawlScrape(rowUrl, { formats: ['markdown', 'links'] });
  const host = hostnameOf(rowUrl);

  // Build link list with anchor text for the LLM.
  const anchorMap = new Map<string, string>();
  const markdown = scrape.markdown ?? '';
  for (const m of markdown.matchAll(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g)) {
    const text = m[1].trim();
    const url = m[2].trim();
    if (!anchorMap.has(url) && text.length < 80) anchorMap.set(url, text);
  }
  const sameDomainLinks: Array<{ url: string; anchor?: string }> = [];
  const seen = new Set<string>();
  for (const href of scrape.links ?? []) {
    try {
      const u = new URL(href, rowUrl);
      if (u.host.replace(/^www\./, '') !== host) continue;
      if (u.pathname === '/' || u.pathname === '') continue;
      const norm = u.toString();
      if (seen.has(norm)) continue;
      seen.add(norm);
      sameDomainLinks.push({ url: norm, anchor: anchorMap.get(norm) });
    } catch {
      continue;
    }
  }
  // Cap input size for the LLM call — 200 links is plenty and keeps tokens bounded.
  const linksForLLM = sameDomainLinks.slice(0, 200);

  if (!process.env.ANTHROPIC_API_KEY) {
    // Fall back to deterministic nav-scan results when no LLM key.
    return fireFirecrawlNavScan(rowUrl);
  }

  // Compose the prompt body.
  const linksList = linksForLLM
    .map((l, i) => `${i + 1}. ${l.url}${l.anchor ? ` — "${l.anchor}"` : ''}`)
    .join('\n');
  const userPrompt = `Here are nav/footer links from a foundation's homepage. Return ONLY the URLs that point at a blog, news, press, insights, publications, stories, grants-news, or similar content-index page. Skip individual posts/articles, skip donate/contact/about, skip subpages of a candidate (we want the index, not its children). Output one URL per line, nothing else.\n\n${linksList}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Anthropic ${res.status}: ${text || res.statusText}`);
  }
  const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const reply = (json.content ?? []).find((b) => b.type === 'text')?.text ?? '';

  const out: Candidate[] = [];
  const replySeen = new Set<string>();
  for (const line of reply.split('\n')) {
    const url = line.trim().replace(/^[-•*\d.)\s]+/, '').trim();
    if (!url.startsWith('http')) continue;
    if (replySeen.has(url)) continue;
    replySeen.add(url);
    // Re-attach anchor text if we have it.
    const known = linksForLLM.find((l) => l.url === url);
    out.push({ url, anchor_text: known?.anchor });
  }
  return out;
}

export async function fireConnector(
  connector_id: ConnectorId,
  rowUrl: string,
): Promise<Candidate[]> {
  switch (connector_id) {
    case 'serpapi-site-search':
      return fireSerpapiSiteSearch(rowUrl);
    case 'firecrawl-nav-scan':
      return fireFirecrawlNavScan(rowUrl);
    case 'firecrawl-nav-agent':
      return fireFirecrawlNavAgent(rowUrl);
    default:
      throw new Error(`unknown connector: ${connector_id}`);
  }
}
