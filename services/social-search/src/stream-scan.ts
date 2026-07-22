// organization.stream.scan — scan one media_streams entry for its current
// items and flag which are already in the corpus. Spec step 8 as a service
// verb (D3: a mode of search-and-add, not a third remote).
//
// The whole trick is runOfficialBlogPack's curated_index_urls seam: a stream
// scan IS "the operator already curated the index — it's the stream URL."
// Discovery (SerpApi + homepage + path-guess) is skipped entirely; Firecrawl
// harvests the index page(s), the per-post date stack runs as usual.
//
// Dedup is a cross-service NATS read (content.urls.check on
// record-surrealdb-resolver — this service has no DB access, by design).
// Blog/RSS/newsroom kinds are the dependable path; social-wall kinds ride
// the same call but are flagged experimental in the UI (spec non-goal: no
// wall-timeline reliability commitment).
//
// Plan: context-v/plans/Augment-From-DB-Phase-5-Stream-Scan-Mode.md.

import { type NatsConnection } from '@nats-io/transport-node';
import { runOfficialBlogPack } from './entity-pulse/packs/official-blog-pack';

export type StreamScanInput = {
  org_slug: string;
  stream_url: string;
  stream_kind?: string;
  client: string;
  max_items?: number;
};

export type StreamScanItem = {
  url: string;
  title: string;
  snippet: string;
  published_date: string | null;
  already_in_corpus: boolean;
};

export type StreamScanResult = {
  ok: true;
  items: StreamScanItem[];
  meta: { stream_url: string; total_found: number; already_known: number };
};

export async function scanStream(
  nc: NatsConnection,
  input: StreamScanInput,
): Promise<StreamScanResult> {
  if (!input.stream_url?.trim()) throw new Error('organization.stream.scan: stream_url is required');

  const response = await runOfficialBlogPack({
    row_id: `org:${input.org_slug}`,
    row_url: input.stream_url,
    curated_index_urls: [input.stream_url],
    max_posts_total: input.max_items ?? 20,
  });

  const urls = response.items.map((i) => i.url);
  let existing = new Set<string>();
  if (urls.length > 0) {
    const reply = await nc.request(
      'content.urls.check.requested',
      JSON.stringify({ urls }),
      { timeout: 30_000 },
    );
    const parsed = JSON.parse(new TextDecoder().decode(reply.data)) as {
      ok: boolean;
      existing?: string[];
      error?: string;
    };
    if (!parsed.ok) throw new Error(parsed.error || 'content.urls.check failed');
    existing = new Set(parsed.existing ?? []);
  }

  const items: StreamScanItem[] = response.items.map((i) => ({
    url: i.url,
    title: i.title,
    snippet: i.snippet,
    published_date: i.published_date,
    already_in_corpus: existing.has(i.url),
  }));

  return {
    ok: true,
    items,
    meta: {
      stream_url: input.stream_url,
      total_found: items.length,
      already_known: items.filter((i) => i.already_in_corpus).length,
    },
  };
}
