// official-blog-pack — Phase 1 of the Entity Pulse bundle.
//
// Spec: [[../../../../../context-v/specs/Entity-Pulse-Bundle]] §"Pass-1 pack
// details" → official-blog-pack.
//
// Two-stage mechanic:
//
//   FIND-INDEX  — SerpApi `site:<domain> press OR blog OR news OR updates`
//                 surfaces candidate index pages on the entity's own domain.
//                 Path-guessing (/blog, /news, /press, /feed, ...) is a
//                 fallback when SerpApi returns nothing or is unavailable.
//
//   EXTRACT     — Firecrawl scrape each index page for outbound links,
//                 heuristically pick post-shaped links, then scrape each
//                 post to pull title + published_date + snippet.
//
// Step-1 scope: no LLM scoring (`confidence` / `relevance` stay null), no
// rollup-agent, no curation-layer write. The job here is to prove the
// find-index + extract two-stage pattern works end-to-end.

import { getConnector } from '../../connectors';
import {
  firecrawlScrape,
  type FirecrawlScrapeResult,
} from '../../connectors/firecrawl';
import {
  toIso,
  extractIsoFromJsonLd,
  extractIsoFromText,
  parseRssFeed,
  normalizeUrl,
  ageDaysFromIso,
} from '../../lib/helpers/iso-helper';
import type {
  EntityPulseListResponse,
  OfficialUpdateItem,
} from '../types';

export const OFFICIAL_BLOG_PACK_ID = 'official-blog-pack';

export type OfficialBlogPackInput = {
  pack_id?: string;
  row_id: string;
  // Entity's primary website. Required — the find-index stage uses both the
  // hostname (for site: restriction) and the URL itself (as the homepage
  // path-guess fallback candidate).
  row_url: string;
  // Operator-curated index URLs from the records-surface per-record
  // connector flow (saved into row.fields.official_updates_index_urls).
  // When non-empty these are AUTHORITATIVE — the pack walks straight
  // into them and harvests post links; the discovery stages (SerpApi +
  // homepage scrape + path-guess) are SKIPPED to avoid re-introducing
  // noise the operator already filtered out. Rule 3 of
  // context-v/specs/Funder-Content-Corpus-Workflow.md.
  curated_index_urls?: string[];
  // Free-text brief carried through meta. Not used for scoring in step 1.
  relevance_context?: string | null;
  // Tuning knobs — exposed for the CLI driver and Request Reviewer.
  max_index_candidates?: number;
  max_posts_per_index?: number;
  max_posts_total?: number;
  signal?: AbortSignal;
};

const DEFAULT_INDEX_CANDIDATES = 3;
const DEFAULT_POSTS_PER_INDEX = 10;
const DEFAULT_POSTS_TOTAL = 20;

// Path-guess fallbacks. Order matters — RSS first because dates + titles
// come back cleaner than HTML when the source publishes a feed.
const PATH_GUESSES = [
  '/feed',
  '/rss',
  '/atom.xml',
  '/blog',
  '/news',
  '/press',
  '/updates',
  '/newsroom',
  '/insights',
];

function originOf(rowUrl: string): string {
  const u = new URL(rowUrl);
  return `${u.protocol}//${u.host}`;
}

function hostnameOf(rowUrl: string): string {
  return new URL(rowUrl).host.replace(/^www\./, '');
}

// Rule 2 of Funder-Content-Corpus-Workflow.md — navigation pages are not
// content. These patterns reject pagination, taxonomy, archives, feeds,
// directory indexes. Must stay in sync with content-ingest/src/filters.ts
// NAVIGATION_PATTERNS.
const NAVIGATION_PATH_PATTERNS = [
  /\/page\/\d+\/?$/i,           // /latest-updates/page/2/
  /\/p\/\d+\/?$/i,
  /\/category\/[^/]+\/?$/i,
  /\/categories\/[^/]+\/?$/i,
  /\/tag\/[^/]+\/?$/i,
  /\/tags\/[^/]+\/?$/i,
  /\/topic\/[^/]+\/?$/i,
  /\/topics\/[^/]+\/?$/i,
  /\/author\/[^/]+\/?$/i,
  /\/contributors\/[^/]+\/?$/i,
  /\/archive\/?$/i,
  /\/archives\/?$/i,
  /\/feed\/?$/i,
  /\/rss\/?$/i,
  /\/atom\.xml$/i,
  /\/index\.html?$/i,
  /\/\d{4}\/?$/i,               // /2024/
  /\/\d{4}\/\d{1,2}\/?$/i,      // /2024/03/
];
function looksLikeNavigation(pathname: string): boolean {
  for (const re of NAVIGATION_PATH_PATTERNS) if (re.test(pathname)) return true;
  return false;
}

// Heuristic: a link is "post-shaped" if it lives on the same host as the
// index page, the path is deeper than the index path, AND the path
// doesn't match a navigation pattern (pagination / taxonomy / archive).
function looksLikePost(href: string, indexUrl: string): boolean {
  try {
    const link = new URL(href, indexUrl);
    const index = new URL(indexUrl);
    if (link.host !== index.host) return false;
    if (link.pathname === index.pathname) return false;
    if (looksLikeNavigation(link.pathname)) return false;
    if (!link.pathname.startsWith(index.pathname.replace(/\/$/, ''))) {
      // Allow links that don't share the index path but match common post
      // shapes — e.g. /YYYY/MM/, /post/, /article/.
      if (
        !/\/(post|article|story|news|press|blog)\//i.test(link.pathname) &&
        !/\/\d{4}\/\d{2}\//.test(link.pathname)
      ) {
        return false;
      }
    }
    // Skip fragment-only, mailto, tel, javascript.
    if (!/^https?:/.test(link.protocol)) return false;
    return link.pathname.split('/').filter(Boolean).length > 1;
  } catch {
    return false;
  }
}

// Anchor-text / URL-path keywords that signal a link points at a
// blog/news/press/insights index. Loose on purpose — false positives are
// cheaper than false negatives at the discovery stage; the curation layer
// is the human gate.
const INDEX_LINK_KEYWORDS = [
  'news', 'press', 'blog', 'insights', 'insight',
  'stories', 'story', 'articles', 'article',
  'grants', 'grant', 'publications', 'publication',
  'newsroom', 'updates', 'update', 'media',
  'releases', 'release', 'announcements', 'announcement',
  'features', 'voices', 'commentary', 'perspectives',
];

function linkLooksLikeIndex(href: string, anchorText: string | undefined): boolean {
  const hay = `${href} ${anchorText ?? ''}`.toLowerCase();
  return INDEX_LINK_KEYWORDS.some((kw) =>
    new RegExp(`(?:^|/|[-_\\s])${kw}(?:[-_/\\s]|$)`, 'i').test(hay),
  );
}

// Stage 1c — homepage discovery. Scrape the row URL itself, get its
// outbound links, and pick same-domain links whose URL or anchor text
// suggests a news/press/blog/insights/stories index. This is the path
// that actually works on real foundation websites where standard
// path-guessing (`/feed`, `/blog`, …) returns 404s — foundations bury
// their content under custom slugs like `/grants-news`, `/our-work`,
// `/publications`.
async function discoverFromHomepage(
  rowUrl: string,
  signal?: AbortSignal,
): Promise<{ urls: string[]; reason?: string }> {
  try {
    const scrape = await firecrawlScrape(rowUrl, {
      formats: ['markdown', 'links'],
      signal,
    });
    const host = hostnameOf(rowUrl);
    const seen = new Set<string>();
    // Crude anchor-text harvesting: for each link, pull the markdown text
    // around it. Cheap heuristic — Firecrawl's markdown surfaces "[News](url)"
    // shapes for nav-style links; we map href → preceding anchor text.
    const anchorMap = new Map<string, string>();
    const markdown = scrape.markdown ?? '';
    for (const m of markdown.matchAll(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g)) {
      const text = m[1].trim();
      const url = m[2].trim();
      if (!anchorMap.has(url) && text.length < 80) anchorMap.set(url, text);
    }
    // Score each candidate so index-shaped URLs (e.g. /news, /stories) rank
    // above post-shaped URLs (e.g. /stories/education/one-less-thing). The
    // homepage typically links to both — its nav points at indexes, but
    // featured-content blocks also link directly to recent posts. We want
    // the indexes.
    const scored: Array<{ url: string; score: number }> = [];
    for (const href of scrape.links ?? []) {
      try {
        const u = new URL(href, rowUrl);
        if (u.host.replace(/^www\./, '') !== host) continue;
        const norm = u.toString();
        if (seen.has(norm)) continue;
        // Skip the homepage itself + obvious non-content (root, login, etc.)
        if (u.pathname === '/' || u.pathname === '') continue;
        if (/\/(login|signin|signup|search|donate|contact|about|careers|jobs)\b/i.test(u.pathname)) continue;
        const anchor = anchorMap.get(norm);
        if (!linkLooksLikeIndex(u.pathname, anchor)) continue;
        seen.add(norm);

        // Score: shallower path + last segment is a keyword = highest.
        // Each path segment past the first costs 10 points; an exact
        // last-segment keyword match earns 50; a keyword anywhere in
        // the path earns 10. Higher score wins.
        const segments = u.pathname.split('/').filter(Boolean);
        const depth = segments.length;
        const lastSegment = (segments[segments.length - 1] ?? '').toLowerCase();
        const lastSegmentIsKeyword = INDEX_LINK_KEYWORDS.some(
          (kw) => lastSegment === kw || lastSegment === `${kw}s`,
        );
        let score = 0;
        if (lastSegmentIsKeyword) score += 50;
        score += 10; // base score for any keyword match
        score -= (depth - 1) * 10; // penalty per extra path segment
        scored.push({ url: norm, score });
      } catch {
        continue;
      }
    }
    scored.sort((a, b) => b.score - a.score);
    return { urls: scored.map((s) => s.url) };
  } catch (err) {
    return { urls: [], reason: err instanceof Error ? err.message : String(err) };
  }
}

async function findIndexCandidates(
  rowUrl: string,
  signal?: AbortSignal,
): Promise<{ urls: string[]; via: Record<string, number> }> {
  const host = hostnameOf(rowUrl);
  const origin = originOf(rowUrl);
  const candidates: string[] = [];
  const via: Record<string, number> = { serpapi: 0, homepage: 0, path_guess: 0 };

  // Stage 1a — SerpApi find-index. Throws localized if key missing; we catch
  // so the homepage + path-guess fallbacks can still produce something.
  try {
    const serpapi = getConnector('serpapi');
    const results = await serpapi(
      `site:${host} press OR blog OR news OR updates`,
      { max_results: 10, signal },
    );
    for (const r of results) {
      if (r.url && !candidates.includes(r.url)) {
        candidates.push(r.url);
        via.serpapi += 1;
      }
    }
  } catch (err) {
    // Surface for the CLI driver; non-fatal.
    console.warn(
      JSON.stringify({
        level: 'warn',
        msg: 'official-blog-pack: serpapi find-index skipped',
        reason: err instanceof Error ? err.message : String(err),
      }),
    );
  }

  // Stage 1b — Homepage discovery. Scrape the entity's homepage and harvest
  // outbound links whose path or anchor text suggests a blog/news/press
  // index ("our-work", "grants-news", "publications", etc.). This is the
  // path that actually works on real foundation websites — root path-guess
  // returns 404 for nearly every philanthropic foundation, but their nav
  // bars are full of links to /grants-news, /our-work/stories,
  // /publications. Cheaper than burning SerpApi when keyed; far higher
  // recall than path-guessing alone when SerpApi is dark.
  const home = await discoverFromHomepage(rowUrl, signal);
  for (const url of home.urls) {
    if (!candidates.includes(url)) {
      candidates.push(url);
      via.homepage += 1;
    }
  }

  // Stage 1c — Path-guess fallback. Always added so the pack still works
  // even if both SerpApi and homepage scrape failed; dedupes against the
  // earlier hits.
  for (const path of PATH_GUESSES) {
    const guess = `${origin}${path}`;
    if (!candidates.includes(guess)) {
      candidates.push(guess);
      via.path_guess += 1;
    }
  }

  return { urls: candidates, via };
}

type ExtractedPostLink = {
  url: string;
  index_url: string;
};

function pickPostLinks(
  scrape: FirecrawlScrapeResult,
  indexUrl: string,
  limit: number,
): ExtractedPostLink[] {
  const seen = new Set<string>();
  const picks: ExtractedPostLink[] = [];
  for (const href of scrape.links ?? []) {
    if (!looksLikePost(href, indexUrl)) continue;
    const absolute = new URL(href, indexUrl).toString();
    if (seen.has(absolute)) continue;
    seen.add(absolute);
    picks.push({ url: absolute, index_url: indexUrl });
    if (picks.length >= limit) break;
  }
  return picks;
}

function snippetOf(markdown: string | undefined): string {
  if (!markdown) return '';
  const cleaned = markdown
    .replace(/^#+\s.*$/gm, '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, 280);
}

export async function runOfficialBlogPack(
  args: OfficialBlogPackInput,
): Promise<EntityPulseListResponse<OfficialUpdateItem>> {
  const now = new Date();
  const packId = args.pack_id ?? OFFICIAL_BLOG_PACK_ID;
  const maxIndexes = args.max_index_candidates ?? DEFAULT_INDEX_CANDIDATES;
  const maxPostsPerIndex = args.max_posts_per_index ?? DEFAULT_POSTS_PER_INDEX;
  const maxPostsTotal = args.max_posts_total ?? DEFAULT_POSTS_TOTAL;

  // Rule 3: operator curation is authoritative. When
  // official_updates_index_urls is non-empty on the row, those URLs are
  // the indexes — skip discovery entirely. Discovery (SerpApi + homepage
  // scrape + path-guess) is the FALLBACK for rows the operator hasn't
  // curated yet.
  const curated = (args.curated_index_urls ?? [])
    .map((u) => (typeof u === 'string' ? u.trim() : ''))
    .filter((u) => u.length > 0);
  let indexCandidates: string[];
  let findVia: Record<string, number>;
  if (curated.length > 0) {
    indexCandidates = curated;
    findVia = { serpapi: 0, homepage: 0, path_guess: 0, curated: curated.length };
  } else {
    const discovered = await findIndexCandidates(args.row_url, args.signal);
    indexCandidates = discovered.urls;
    findVia = { ...discovered.via, curated: 0 };
  }

  // Stage 2 — scrape index candidates for outbound links. Cap to avoid
  // burning Firecrawl credits on a pathological domain. We also ask for
  // `rawHtml` so we can parse RSS/Atom feed pubDates from the index when
  // the source is a feed; that map seeds the per-post date fallback stack.
  const indexScrapes: Array<{ url: string; scrape: FirecrawlScrapeResult }> = [];
  const byProvider: Record<string, number> = {
    serpapi: findVia.serpapi ?? 0,
    path_guess: findVia.path_guess ?? 0,
    curated: findVia.curated ?? 0,
    firecrawl: 0,
  };
  const sourceIndexes: string[] = [];
  // postUrl → ISO date, sourced from RSS/Atom feeds among the index scrapes.
  // The fallback stack consults this map when per-post metadata is missing.
  const rssDates = new Map<string, string>();

  for (const indexUrl of indexCandidates.slice(0, maxIndexes)) {
    try {
      const scrape = await firecrawlScrape(indexUrl, {
        formats: ['markdown', 'links', 'rawHtml'],
        signal: args.signal,
      });
      indexScrapes.push({ url: indexUrl, scrape });
      byProvider.firecrawl += 1;
      sourceIndexes.push(indexUrl);

      // If the index looks feed-shaped, extract the pubDate map for free.
      // Reach.edu's `/feed` is full HubSpot-generated RSS — every <item>
      // carries a <pubDate>, which the per-post page metadata omits.
      const rawHtml = scrape.rawHtml ?? '';
      const looksLikeFeed =
        /\/feed\b|\/rss\b|\/atom\.xml\b/i.test(indexUrl) ||
        /<rss\b|<feed\b/.test(rawHtml.slice(0, 500));
      if (looksLikeFeed && rawHtml) {
        const feedMap = parseRssFeed(rawHtml);
        for (const [url, iso] of feedMap) {
          if (!rssDates.has(url)) rssDates.set(url, iso);
        }
      }
    } catch (err) {
      console.warn(
        JSON.stringify({
          level: 'warn',
          msg: 'official-blog-pack: index scrape failed',
          index_url: indexUrl,
          reason: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }

  // Collect post links across all successful index scrapes.
  const postLinks: ExtractedPostLink[] = [];
  for (const { url, scrape } of indexScrapes) {
    postLinks.push(...pickPostLinks(scrape, url, maxPostsPerIndex));
    if (postLinks.length >= maxPostsTotal) break;
  }

  // Rule 1: only the funder's own domain is valid. Same-host check
  // against args.row_url. Even though pickPostLinks already requires
  // same-host as the INDEX (which is normally on the row's domain),
  // belt-and-suspenders here catches edge cases: curated indexes that
  // accidentally point off-domain (operator error), or post links that
  // SerpApi backfilled into the index scrape's link set.
  const rowHostname = (() => {
    try { return new URL(args.row_url).hostname.replace(/^www\./, ''); }
    catch { return ''; }
  })();
  const filteredPostLinks = postLinks.filter((link) => {
    if (!rowHostname) return true; // row url unparseable; fail open
    try {
      const h = new URL(link.url).hostname.replace(/^www\./, '');
      return h === rowHostname || h.endsWith('.' + rowHostname) || rowHostname.endsWith('.' + h);
    } catch {
      return false;
    }
  });

  // Stage 2b — scrape each post for title + published_date + snippet.
  // Date fallback stack (first non-null wins; all routed through toIso):
  //   1. metadata.publishedTime              — present when the page emits
  //                                            <meta property="article:published_time">
  //   2. RSS pubDate map                     — built from the index scrape;
  //                                            authoritative for feed sources
  //   3. JSON-LD datePublished in rawHtml    — HubSpot/WordPress/Drupal default
  //   4. First date-shaped match in markdown — last-resort, scans byline area
  // Each strategy is independently nullable; we keep walking until one returns ISO.
  const items: OfficialUpdateItem[] = [];
  for (const link of filteredPostLinks.slice(0, maxPostsTotal)) {
    try {
      const scrape = await firecrawlScrape(link.url, {
        formats: ['markdown', 'rawHtml'],
        signal: args.signal,
      });
      byProvider.firecrawl += 1;
      const meta = scrape.metadata ?? {};
      const normalizedUrl = normalizeUrl(link.url);

      const publishedDate =
        toIso(meta.publishedTime) ??
        rssDates.get(normalizedUrl) ??
        extractIsoFromJsonLd(scrape.rawHtml ?? '') ??
        extractIsoFromText(scrape.markdown ?? '');

      items.push({
        url: link.url,
        title: meta.title ?? meta.ogTitle ?? link.url,
        snippet: meta.description ?? meta.ogDescription ?? snippetOf(scrape.markdown),
        published_date: publishedDate,
        age_days: ageDaysFromIso(publishedDate, now),
        confidence: null,
        relevance: null,
        content_type: 'official_blog_entry',
        source_index_url: link.index_url,
      });
    } catch (err) {
      console.warn(
        JSON.stringify({
          level: 'warn',
          msg: 'official-blog-pack: post scrape failed',
          post_url: link.url,
          reason: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }

  return {
    items,
    meta: {
      relevance_context: args.relevance_context ?? null,
      total_found: items.length,
      dropped_low_confidence: 0,
      by_provider: byProvider,
      pack_id: packId,
      generated_at: now.toISOString(),
      source_indexes: sourceIndexes,
    },
  };
}
