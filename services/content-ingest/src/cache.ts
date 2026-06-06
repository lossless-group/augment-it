// 30-minute in-memory cache for Jina results. The corpus.add fired right
// after content_ingest.preview reuses the warm markdown without re-hitting
// Jina. Keyed by URL.

import type { JinaResult } from './jina';

const TTL_MS = 30 * 60 * 1000;

type Entry = { result: JinaResult; cachedAt: number };
const cache = new Map<string, Entry>();

export function get(url: string): JinaResult | null {
  const e = cache.get(url);
  if (!e) return null;
  if (Date.now() - e.cachedAt > TTL_MS) {
    cache.delete(url);
    return null;
  }
  return e.result;
}

export function set(url: string, result: JinaResult): void {
  cache.set(url, { result, cachedAt: Date.now() });
}
