// Shared filter primitives — Rules 1 and 2 of
// context-v/specs/Funder-Content-Corpus-Workflow.md.
//
// Rule 1: only the funder's own domain is valid.
// Rule 2: navigation pages (pagination, taxonomy, archive, feed, section
//         landings) are not content.
//
// These are duplicated in the pack (services/social-search/src/entity-pulse/
// packs/official-blog-pack.ts). Sharing across services would require a
// workspace package; for now, duplication is intentional and the two copies
// must be kept in sync when rules evolve.

/**
 * True iff `respUrl` is on the same domain as `rowUrl` — exact host match
 * OR a subdomain in either direction. Returns false when either URL is
 * unparseable. Apex matches subdomain:
 *
 *   aecf.org              ↔  www.aecf.org              MATCH
 *   gatesfoundation.org   ↔  usprogram.gatesfoundation.org   MATCH
 *   schusterman.org       ↔  pressofatlanticcity.com   NO MATCH
 */
export function isSameDomain(respUrl: string, rowUrl: string): boolean {
  let respHost: string;
  let rowHost: string;
  try {
    respHost = new URL(respUrl).hostname.replace(/^www\./, '');
    rowHost = new URL(rowUrl).hostname.replace(/^www\./, '');
  } catch {
    return false;
  }
  if (respHost === rowHost) return true;
  if (respHost.endsWith('.' + rowHost)) return true;
  if (rowHost.endsWith('.' + respHost)) return true;
  return false;
}

/**
 * Patterns that match navigation pages — pagination, taxonomy, archives,
 * feeds, index.html. These are NOT articles; they appear as candidates
 * when the pack walks an index page's links and they must be rejected.
 *
 * Note: section landings like `/news/`, `/press/` are NOT in this list
 * because they're often the row's curated index URLs (Rule 3). The pack
 * harvests article links from INSIDE them; this filter rejects the
 * landing URL appearing as a candidate POST.
 */
const NAVIGATION_PATTERNS = [
  /\/page\/\d+\/?$/i,             // /latest-updates/page/2/
  /\/p\/\d+\/?$/i,                // /blog/p/3/
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
  /\/\d{4}\/?$/i,                 // /2024/
  /\/\d{4}\/\d{1,2}\/?$/i,        // /2024/03/
];

export function isNavigationPath(pathname: string): boolean {
  for (const re of NAVIGATION_PATTERNS) if (re.test(pathname)) return true;
  return false;
}

/**
 * True iff the URL is a navigation page. Combines URL parsing with the
 * pattern check above. Returns true (reject) for unparseable URLs as a
 * defensive default — content pipelines should never propagate URLs
 * that can't be parsed.
 */
export function isNavigationUrl(url: string): boolean {
  try {
    return isNavigationPath(new URL(url).pathname);
  } catch {
    return true;
  }
}
