// iso-helper — anything date-shaped → ISO-8601 UTC string, or null.
//
// One source of truth for date normalization across packs (and eventually
// across services). The web returns dates in every form imaginable; the rest
// of the system should only ever see ISO. Never throws — bad input returns
// null so callers can stack fallbacks without try/catch noise.
//
// Functions:
//   toIso(input)                   — generic normalizer (Date, number, string)
//   extractIsoFromText(text)       — scan a body of text for the first date
//   extractIsoFromJsonLd(rawHtml)  — parse <script type="application/ld+json">
//                                    blocks; look for datePublished / dateCreated
//                                    / uploadDate / pubDate / dateModified
//   parseRssFeed(xml)              — RSS / Atom → Map<itemUrl, isoDate>
//
// Add a new input shape here, every caller benefits.

const MONTH_NAMES: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

function isoOrNull(d: Date): string | null {
  const t = d.getTime();
  if (!Number.isFinite(t)) return null;
  // Sanity bounds — anything before 1990 or more than 2y in the future is
  // almost certainly a parse error rather than a real date in our domain.
  const year = d.getUTCFullYear();
  if (year < 1990 || year > new Date().getUTCFullYear() + 2) return null;
  return d.toISOString();
}

// Generic — accepts Date, number (epoch ms or s), or string in any of the
// common forms web sources emit.
export function toIso(input: unknown): string | null {
  if (input == null) return null;
  if (input instanceof Date) return isoOrNull(input);

  if (typeof input === 'number') {
    // Distinguish epoch seconds vs ms. Anything below 1e12 is too small to
    // be milliseconds since 1970 (1e12 ms ≈ 2001-09-09).
    const ms = input < 1e12 ? input * 1000 : input;
    return isoOrNull(new Date(ms));
  }

  if (typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw) return null;

  // Native Date parses ISO-8601, RFC 2822 (RSS pubDate), and the common
  // human-readable forms ("May 14, 2026") on V8 — try it first.
  const native = new Date(raw);
  const nativeIso = isoOrNull(native);
  if (nativeIso) return nativeIso;

  // Fallback: hand-parse "Month DD, YYYY" / "DD Month YYYY" — these
  // sometimes come back from scrapers with extra whitespace or punctuation
  // native Date chokes on.
  const m = raw.match(
    /(\b\d{1,2}\b)?\s*(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s*\.?\s*(\b\d{1,2}\b)?,?\s*(\d{4})/i,
  );
  if (m) {
    const monthIndex = MONTH_NAMES[m[2].toLowerCase()];
    const day = Number.parseInt(m[1] ?? m[3] ?? '1', 10);
    const year = Number.parseInt(m[4], 10);
    if (monthIndex != null && Number.isFinite(day) && Number.isFinite(year)) {
      return isoOrNull(new Date(Date.UTC(year, monthIndex, day)));
    }
  }

  // Fallback: bare YYYY-MM-DD or YYYY/MM/DD anywhere in the string.
  const ymd = raw.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (ymd) {
    const year = Number.parseInt(ymd[1], 10);
    const month = Number.parseInt(ymd[2], 10) - 1;
    const day = Number.parseInt(ymd[3], 10);
    return isoOrNull(new Date(Date.UTC(year, month, day)));
  }

  return null;
}

// Scan a body of text for the first plausible date. Used as a last-resort
// fallback when no structured metadata is available — the byline area on
// blog posts often spells out the date in human-readable form.
//
// Looks at the first `maxChars` of the input to avoid catching dates in
// the middle of an article body (e.g. "Carnegie was founded in 1911").
export function extractIsoFromText(text: string, maxChars = 500): string | null {
  if (!text) return null;
  const head = text.slice(0, maxChars);

  // Order matters — most specific patterns first.
  const patterns = [
    // ISO-8601 (with or without time)
    /\b\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/,
    // RFC 2822 / RSS pubDate ("Wed, 14 May 2026 13:00:04 GMT")
    /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}\s+\d{2}:\d{2}:\d{2}\s+(?:GMT|UTC|[+-]\d{4})/i,
    // "Month DD, YYYY"
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b/i,
    // "DD Month YYYY"
    /\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}\b/i,
    // "YYYY/MM/DD"
    /\b\d{4}\/\d{1,2}\/\d{1,2}\b/,
  ];

  for (const re of patterns) {
    const match = head.match(re);
    if (match) {
      const iso = toIso(match[0]);
      if (iso) return iso;
    }
  }
  return null;
}

// Parse <script type="application/ld+json"> blocks from raw HTML. Looks for
// the first date-shaped field on any JSON-LD object — schema.org publishes
// `datePublished`, but `dateCreated`, `uploadDate`, and `pubDate` all show
// up in the wild too.
//
// Walks nested objects + arrays. The most common shape is one top-level
// object with `@type: 'Article'` and `datePublished`, but BlogPosting,
// NewsArticle, WebPage, etc. follow the same convention.
export function extractIsoFromJsonLd(rawHtml: string): string | null {
  if (!rawHtml) return null;
  const blocks = rawHtml.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  const datePropPriority = [
    'datePublished',
    'dateCreated',
    'uploadDate',
    'pubDate',
    'dateModified', // fallback only — modified ≠ published, but better than nothing
  ];

  for (const m of blocks) {
    const body = m[1].trim();
    if (!body) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      continue;
    }
    for (const prop of datePropPriority) {
      const value = findInTree(parsed, prop);
      if (typeof value === 'string') {
        const iso = toIso(value);
        if (iso) return iso;
      }
    }
  }
  return null;
}

function findInTree(node: unknown, key: string): unknown {
  if (node == null) return undefined;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findInTree(item, key);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if (key in obj) return obj[key];
    for (const child of Object.values(obj)) {
      const found = findInTree(child, key);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

// Parse an RSS / Atom feed XML body. Returns a map keyed by item link URL to
// the item's normalized ISO publish date. Misses on a per-item basis just
// omit that entry; the caller will fall back to other strategies for the
// missing posts.
//
// No XML parser dependency — regex over the predictable RSS/Atom shapes is
// enough for date+link extraction. (For full XML-correctness we'd want
// fast-xml-parser; deferred until a feed actually breaks this.)
export function parseRssFeed(xml: string): Map<string, string> {
  const out = new Map<string, string>();
  if (!xml) return out;

  // RSS 2.0: <item>...<link>URL</link>...<pubDate>...</pubDate></item>
  const rssItems = xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi);
  for (const m of rssItems) {
    const body = m[1];
    const link = body.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1]?.trim();
    const pubDate =
      body.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1]?.trim() ??
      body.match(/<dc:date[^>]*>([\s\S]*?)<\/dc:date>/i)?.[1]?.trim();
    if (link && pubDate) {
      const iso = toIso(pubDate);
      if (iso) out.set(normalizeUrl(link), iso);
    }
  }

  // Atom: <entry>...<link href="URL"/>...<published>...</published></entry>
  const atomEntries = xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi);
  for (const m of atomEntries) {
    const body = m[1];
    const link =
      body.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1]?.trim() ??
      body.match(/<id[^>]*>([\s\S]*?)<\/id>/i)?.[1]?.trim();
    const published =
      body.match(/<published[^>]*>([\s\S]*?)<\/published>/i)?.[1]?.trim() ??
      body.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i)?.[1]?.trim();
    if (link && published) {
      const iso = toIso(published);
      if (iso) out.set(normalizeUrl(link), iso);
    }
  }

  return out;
}

// URL normalizer for cross-source matching. Strips trailing slash + fragment
// + lowercases the host so the RSS pubDate map keys match the post-page
// scrape URLs.
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = '';
    let pathname = u.pathname;
    if (pathname.length > 1 && pathname.endsWith('/')) pathname = pathname.slice(0, -1);
    return `${u.protocol}//${u.host.toLowerCase()}${pathname}${u.search}`;
  } catch {
    return url.trim();
  }
}

// Age in whole days from an ISO string to `now`. Returns null on bad input.
export function ageDaysFromIso(iso: string | null, now: Date = new Date()): number | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return null;
  return Math.floor((now.getTime() - then) / (1000 * 60 * 60 * 24));
}
