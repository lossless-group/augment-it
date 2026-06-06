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

export async function fetchViaJina(url: string): Promise<JinaResult> {
  const RETRIES = 3;
  let backoffMs = 2000;
  let lastErr: { ok: false; error: string; status?: number } | null = null;
  for (let attempt = 0; attempt < RETRIES; attempt += 1) {
    const result = await jinaFetchOnce(url);
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

async function jinaFetchOnce(url: string): Promise<JinaResult> {
  const fetched_at = new Date().toISOString();
  const apiKey = process.env.JINA_API_KEY;
  const headers: Record<string, string> = { Accept: 'text/markdown' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  let res: Response;
  try {
    res = await fetch(JINA_BASE + url, { headers });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (!res.ok) {
    return { ok: false, error: `HTTP ${res.status} ${res.statusText}`, status: res.status };
  }
  const markdown = await res.text();
  if (!markdown.trim()) {
    return { ok: false, error: 'Jina returned empty body' };
  }
  const title = extractTitle(markdown, url);
  const extra: Record<string, unknown> = {
    jina_status: res.status,
    content_length_bytes: markdown.length,
  };
  for (const h of ['x-canonical-url', 'x-title', 'x-description', 'x-language']) {
    const v = res.headers.get(h);
    if (v) extra[h.replace(/^x-/, '').replace(/-/g, '_')] = v;
  }
  return { ok: true, markdown, title, fetched_at, extra };
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
