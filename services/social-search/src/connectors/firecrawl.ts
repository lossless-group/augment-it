// Firecrawl connector — page-extract stage. Not a search connector (different
// shape: takes a URL, returns structured page data + outbound links), so it
// lives outside the search-style Connector registry. The official-blog-pack
// uses it to (a) read an index page's outbound links to surface individual
// post URLs, and (b) extract each post's title + body + published date.
//
// API ref: https://docs.firecrawl.dev/api-reference/endpoint/scrape

const FIRECRAWL_SCRAPE_ENDPOINT = 'https://api.firecrawl.dev/v1/scrape';

export type FirecrawlMetadata = {
  title?: string;
  description?: string;
  sourceURL?: string;
  // Firecrawl returns a `publishedTime` field when the page exposes one
  // (OG meta, schema.org, JSON-LD). ISO-8601 when present.
  publishedTime?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  language?: string;
  statusCode?: number;
};

export type FirecrawlScrapeResult = {
  markdown?: string;
  html?: string;
  // Raw HTML as fetched, pre-cleaning. Requested via `formats: ['rawHtml']`.
  // We rely on this for parsing JSON-LD / RSS / Atom — Firecrawl's `html`
  // (cleaned) sometimes strips <script> blocks that hold structured data.
  rawHtml?: string;
  links?: string[];
  metadata?: FirecrawlMetadata;
};

type FirecrawlScrapeResponse = {
  success?: boolean;
  data?: FirecrawlScrapeResult;
  error?: string;
};

export type FirecrawlScrapeOpts = {
  // Which formats to ask Firecrawl to return. Default: markdown + links,
  // which is what the official-blog-pack needs.
  formats?: Array<'markdown' | 'html' | 'rawHtml' | 'links' | 'screenshot'>;
  // Optional CSS selectors the extractor should focus on. Useful for index
  // pages that bury post links in a specific section.
  includeTags?: string[];
  excludeTags?: string[];
  // Wait for client-side rendering. Some blog index pages are JS-only.
  waitFor?: number;
  signal?: AbortSignal;
};

export async function firecrawlScrape(
  url: string,
  opts: FirecrawlScrapeOpts = {},
): Promise<FirecrawlScrapeResult> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error('FIRECRAWL_API_KEY is not set');

  const body = {
    url,
    formats: opts.formats ?? ['markdown', 'links'],
    includeTags: opts.includeTags,
    excludeTags: opts.excludeTags,
    waitFor: opts.waitFor,
  };

  const res = await fetch(FIRECRAWL_SCRAPE_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Firecrawl ${res.status}: ${text || res.statusText}`);
  }

  const json = (await res.json()) as FirecrawlScrapeResponse;
  if (json.error) throw new Error(`Firecrawl: ${json.error}`);
  return json.data ?? {};
}
