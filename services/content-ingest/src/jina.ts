// r.jina.ai client. Free tier needs no auth and modest rate limits;
// paid tier picks up JINA_API_KEY from env (set in docker-compose).
// Retry-on-429 with exponential backoff because per-domain bursts are
// the common shape (a foundation blog index → N posts on the same host).

const JINA_BASE = 'https://r.jina.ai/';

// Metadata comes back under different conventions depending on what KIND of
// page it is — a scholarly article hides everything under Highwire/Dublin-Core/
// PRISM keys (citation_*, dc.*, prism.*); a blog/news/company page uses
// OpenGraph (og:*, article:*). So there are two PROFILES and fuzzy routing
// picks one; forceProfile lets a human re-route when detection is wrong.
export type ParserProfile = 'structured' | 'opengraph';
export type SourceKind = 'academic-paper' | 'article' | 'company-landing' | 'web-page';

export type JinaResult =
  | {
      ok: true;
      markdown: string;
      title: string;
      fetched_at: string;
      extra: Record<string, unknown>;
    }
  | { ok: false; error: string; status?: number };

export async function fetchViaJina(
  url: string,
  opts: { noCache?: boolean; forceProfile?: ParserProfile } = {},
): Promise<JinaResult> {
  const RETRIES = 3;
  let backoffMs = 2000;
  let lastErr: { ok: false; error: string; status?: number } | null = null;
  for (let attempt = 0; attempt < RETRIES; attempt += 1) {
    const result = await jinaFetchOnce(url, opts.noCache, opts.forceProfile);
    if (result.ok) return result;
    if (result.status !== 429) return result;
    lastErr = result;
    if (attempt < RETRIES - 1) {
      await sleep(backoffMs);
      backoffMs *= 2;
    }
  }
  return lastErr ?? { ok: false, error: 'jina fetch failed after retries' };
}

async function jinaFetchOnce(url: string, noCache = false, forceProfile?: ParserProfile): Promise<JinaResult> {
  const fetched_at = new Date().toISOString();
  const apiKey = process.env.JINA_API_KEY;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  if (noCache) headers['X-No-Cache'] = 'true'; // bypass Jina's cached snapshot (retry)

  let res: Response;
  try {
    res = await fetch(JINA_BASE + url, { headers });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (!res.ok) {
    return { ok: false, error: `HTTP ${res.status} ${res.statusText}`, status: res.status };
  }
  const body = await res.text();
  if (!body.trim()) {
    return { ok: false, error: 'Jina returned empty body' };
  }

  let parsed: { data?: Record<string, unknown> } | null = null;
  try {
    parsed = JSON.parse(body) as { data?: Record<string, unknown> };
  } catch {
    parsed = null;
  }

  // JSON path (the normal case) — rich metadata available, routed by profile.
  if (parsed?.data) {
    const data = parsed.data;
    const markdown = typeof data.content === 'string' ? data.content : '';
    if (!markdown.trim()) return { ok: false, error: 'Jina returned empty content' };
    const { title, extra } = extractBib(data, url, { forceProfile });
    extra.jina_status = res.status;
    extra.content_length_bytes = markdown.length;
    return { ok: true, markdown, title, fetched_at, extra };
  }

  // Fallback: non-JSON body (some upstreams / error shapes) — parse the legacy
  // key:value preamble so we still degrade gracefully. Always the opengraph
  // profile, kind web-page (no structured metadata is available this way).
  const markdown = body;
  const title = extractTitle(markdown, url);
  const extra: Record<string, unknown> = {
    jina_status: res.status,
    content_length_bytes: markdown.length,
    source_kind: 'web-page' as SourceKind,
    parser_profile: 'opengraph' as ParserProfile,
  };
  const preamble = parsePreamble(markdown);
  const publishedTime = preamble['Published Time'] ?? preamble['published_time'];
  if (publishedTime) {
    const iso = normalizeToISO(publishedTime);
    if (iso) extra.published_at = iso;
  }
  if (preamble['Author']) extra.authors = normalizeAuthors(preamble['Author']);
  const fbPublisher = preamble['Published By'] ?? preamble['Publisher'];
  if (fbPublisher) extra.publisher = fbPublisher;
  if (preamble['Description']) extra.description = preamble['Description'];
  if (preamble['Language']) extra.language = preamble['Language'];
  return { ok: true, markdown, title, fetched_at, extra };
}

// ── Profile routing ────────────────────────────────────────────────────────

function metaOf(data: Record<string, unknown>): Record<string, unknown> {
  return (data.metadata && typeof data.metadata === 'object' ? data.metadata : {}) as Record<string, unknown>;
}

function present(meta: Record<string, unknown>, key: string): boolean {
  const v = meta[key];
  if (v == null || v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

// Fuzzy-match the source kind from which metadata convention is present, and
// map it to a parser profile. Academic tells (a DOI or citation_* journal
// keys) are the strongest signal; then OpenGraph article/website; else a
// plain web page.
export function detectProfile(data: Record<string, unknown>): { profile: ParserProfile; kind: SourceKind } {
  const meta = metaOf(data);
  const ogType = firstStr(meta['og:type']);
  if (present(meta, 'citation_title') || present(meta, 'citation_doi') || present(meta, 'DOI') || present(meta, 'citation_journal_title')) {
    return { profile: 'structured', kind: 'academic-paper' };
  }
  if (ogType === 'article' || present(meta, 'article:published_time') || present(meta, 'article:author')) {
    return { profile: 'opengraph', kind: 'article' };
  }
  if (ogType === 'website' || (present(meta, 'og:site_name') && !present(meta, 'article:published_time'))) {
    return { profile: 'opengraph', kind: 'company-landing' };
  }
  return { profile: 'opengraph', kind: 'web-page' };
}

// Pure, testable, profile-aware bibliographic extraction. Each field resolves
// across an ordered alias list (first hit wins), so a field missing under one
// convention still resolves under another. forceProfile overrides routing (the
// manual re-route path).
export function extractBib(
  data: Record<string, unknown>,
  url: string,
  opts: { forceProfile?: ParserProfile } = {},
): { title: string; extra: Record<string, unknown> } {
  const meta = metaOf(data);
  const routed = detectProfile(data);
  const profile = opts.forceProfile ?? routed.profile;
  const kind: SourceKind = opts.forceProfile
    ? (opts.forceProfile === 'structured' ? 'academic-paper' : routed.kind)
    : routed.kind;

  const markdown = typeof data.content === 'string' ? data.content : '';

  // Per-profile candidate lists. `data.*` are Jina's top-level convenience
  // fields (often undefined); the rest are pass-through meta tags.
  const titleCands =
    profile === 'structured'
      ? [data.title, meta['citation_title'], meta['dc.title'], meta['og:title']]
      : [data.title, meta['og:title'], meta['twitter:title'], meta['dc.title']];

  const authorCands =
    profile === 'structured'
      ? [meta['citation_author'], meta['dc.creator'], data.author]
      : [meta['author'], meta['article:author'], data.author, meta['dc.creator']];

  const dateCands =
    profile === 'structured'
      ? [meta['dc.date'], meta['prism.publicationDate'], meta['citation_online_date'], meta['citation_publication_date'], meta['citation_cover_date'], data.publishedTime]
      : [data.publishedTime, meta['article:published_time'], meta['article:modified_time'], meta['date'], meta['dc.date']];

  const publisherCands =
    profile === 'structured'
      ? [meta['citation_publisher'], meta['dc.publisher'], meta['prism.publicationName'], meta['citation_journal_title'], meta['og:site_name']]
      : [meta['og:site_name'], data.publisher, meta['dc.publisher']];

  const descCands =
    profile === 'structured'
      ? [meta['dc.description'], data.description, meta['description'], meta['og:description']]
      : [data.description, meta['og:description'], meta['description'], meta['twitter:description']];

  const langCands =
    profile === 'structured'
      ? [meta['citation_language'], meta['dc.language'], meta['lang'], meta['language']]
      : [meta['lang'], meta['language'], data.lang];

  const title = firstStr(...titleCands) ?? extractTitle(markdown, url);

  const extra: Record<string, unknown> = { source_kind: kind, parser_profile: profile };

  const publishedRaw = firstStr(...dateCands);
  if (publishedRaw) {
    const iso = normalizeToISO(publishedRaw);
    if (iso) extra.published_at = iso;
  }
  const authors = normalizeAuthors(...authorCands);
  if (authors.length) extra.authors = authors;
  const publisher = firstStr(...publisherCands) ?? hostnameOf(url);
  if (publisher) extra.publisher = publisher;
  const description = firstStr(...descCands);
  if (description) extra.description = description;
  const language = firstStr(...langCands);
  if (language) extra.language = language;

  // Bonus identifiers worth carrying when the structured profile has them.
  if (profile === 'structured') {
    const doi = firstStr(meta['citation_doi'], meta['DOI'], meta['prism.doi']);
    if (doi) extra.doi = doi.replace(/^doi:/i, '');
    const journal = firstStr(meta['citation_journal_title'], meta['prism.publicationName']);
    if (journal) extra.journal = journal;
  }

  return { title, extra };
}

// ── helpers ──────────────────────────────────────────────────────────────

function firstStr(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

// Jina returns author as a STRING for one author but an ARRAY for several.
// Normalize to a string[] (one author → one-element array), taking the first
// key that yields anything and stripping a leading "By ". Never comma-splits a
// single string — "Pal, Soumen" (Last, First) is one author, not two.
function normalizeAuthors(...vals: unknown[]): string[] {
  for (const v of vals) {
    let list: string[] = [];
    if (typeof v === 'string' && v.trim()) list = [v.trim()];
    else if (Array.isArray(v)) list = v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim());
    list = list.map((a) => a.replace(/^by\s+/i, '').trim()).filter(Boolean);
    if (list.length) return Array.from(new Set(list));
  }
  return [];
}

function hostnameOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

// Reads the leading `Key: Value` lines until the `Markdown Content:`
// separator. Jina interleaves blank lines BETWEEN preamble entries, so
// blank-line is NOT a terminator. The `Markdown Content:` marker is
// the reliable boundary; if it never appears (some upstreams omit it)
// we stop after 30 lines as a safety cap.
function parsePreamble(markdown: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = markdown.split('\n').slice(0, 30);
  for (const raw of lines) {
    const line = raw.trim();
    if (/^Markdown Content:/i.test(line)) break;
    if (line === '') continue;
    const m = line.match(/^([A-Za-z][A-Za-z0-9 _-]{0,40}):\s+(.+)$/);
    if (!m) continue;
    const key = m[1].trim();
    const val = m[2].trim();
    if (val !== '') out[key] = val;
  }
  return out;
}

// Jina passes through whatever the upstream meta tag carried. Coerce
// the common cases (ISO already, RFC 2822, "YYYY-MM-DD", "YYYY/MM/DD") to
// ISO 8601. Returns null when Date parsing yields NaN — better to drop than
// to stamp garbage into the frontmatter.
function normalizeToISO(raw: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? raw : d.toISOString();
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function extractTitle(markdown: string, fallback: string): string {
  const firstLines = markdown.split('\n', 10);
  for (const line of firstLines) {
    const m = line.match(/^Title:\s*(.+?)\s*$/i);
    if (m) return m[1].trim();
  }
  for (const line of firstLines) {
    const m = line.match(/^#\s+(.+?)\s*$/);
    if (m) return m[1].trim();
  }
  try {
    const u = new URL(fallback);
    return `${u.hostname}${u.pathname}`;
  } catch {
    return fallback;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
