// r.jina.ai client. Free tier needs no auth and modest rate limits;
// paid tier picks up JINA_API_KEY from env (set in docker-compose).
// Retry-on-429 with exponential backoff because per-domain bursts are
// the common shape (a foundation blog index → N posts on the same host).

const JINA_BASE = 'https://r.jina.ai/';

export type JinaResult =
  | {
      ok: true;
      markdown: string;
      title: string;
      fetched_at: string;
      extra: Record<string, unknown>;
    }
  | { ok: false; error: string; status?: number };

export async function fetchViaJina(url: string, opts: { noCache?: boolean } = {}): Promise<JinaResult> {
  const RETRIES = 3;
  let backoffMs = 2000;
  let lastErr: { ok: false; error: string; status?: number } | null = null;
  for (let attempt = 0; attempt < RETRIES; attempt += 1) {
    const result = await jinaFetchOnce(url, opts.noCache);
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

async function jinaFetchOnce(url: string, noCache = false): Promise<JinaResult> {
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

  // JSON path (the normal case) — rich metadata available.
  if (parsed?.data) {
    const data = parsed.data;
    const meta = (data.metadata && typeof data.metadata === 'object' ? data.metadata : {}) as Record<string, unknown>;
    const markdown = typeof data.content === 'string' ? data.content : '';
    if (!markdown.trim()) return { ok: false, error: 'Jina returned empty content' };
    const title = firstStr(data.title) ?? extractTitle(markdown, url);
    const extra: Record<string, unknown> = { jina_status: res.status, content_length_bytes: markdown.length };

    const publishedRaw = firstStr(data.publishedTime, meta['article:published_time'], meta['article:modified_time'], meta.date);
    if (publishedRaw) {
      const iso = normalizeToISO(publishedRaw);
      if (iso) extra.published_at = iso;
    }
    const authors = normalizeAuthors(meta.author, meta['article:author'], meta['dc.creator'], data.author);
    if (authors.length) extra.authors = authors;
    const publisher = firstStr(meta['og:site_name'], data.publisher) ?? hostnameOf(url);
    if (publisher) extra.publisher = publisher;
    const description = firstStr(data.description, meta.description);
    if (description) extra.description = description;
    const language = firstStr(meta.lang, meta.language, data.lang);
    if (language) extra.language = language;

    return { ok: true, markdown, title, fetched_at, extra };
  }

  // Fallback: non-JSON body (some upstreams / error shapes) — parse the legacy
  // key:value preamble so we still degrade gracefully.
  const markdown = body;
  const title = extractTitle(markdown, url);
  const extra: Record<string, unknown> = { jina_status: res.status, content_length_bytes: markdown.length };
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

function firstStr(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

// Jina returns author as a STRING for one author but an ARRAY for several.
// Normalize to a string[] (one author → one-element array), taking the first
// key that yields anything and stripping a leading "By ".
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
// the common cases (ISO already, RFC 2822, "YYYY-MM-DD") to ISO 8601.
// Returns null when Date parsing yields NaN — better to drop than to
// stamp garbage into the frontmatter.
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
