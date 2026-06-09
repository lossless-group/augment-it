// NATS handlers. Four capabilities:
//
//   content_ingest.preview       { record_id, fire_id?, force_refetch? }
//                                returns { previews: PreviewResult[] }
//                                Reads responses for the record, scopes to
//                                the latest fire_id per (row_id, pack_id)
//                                by default (Rule 8), filters to same-host
//                                + non-navigation (defense in depth for
//                                Rules 1+2), Jina-fetches each, returns
//                                title + excerpt.
//
//   content_ingest.preview_url   { record_id, url }
//                                returns PreviewResult
//                                Operator-pasted URL path. Does NOT enforce
//                                same-host (Rule 1 binds pack outputs; Rule
//                                5 — operator decides per item — trumps for
//                                manual additions). Jina-fetches the URL,
//                                returns the same shape as content_ingest.
//                                preview's entries, with extra_metadata
//                                flagging same_host: true|false so the UI
//                                can show an off-domain chip.
//
//   corpus.add                   { client_id, record_id, response_id,
//                                  title, tags, exact_url, funder_slug,
//                                  pack_id }
//                                returns { corpus_path, written_at }
//                                Reads cached Jina markdown (or re-fetches),
//                                composes frontmatter, writes the file.
//                                For manual additions, response_id is a
//                                synthetic 'manual-<ts>-<rand>' minted by
//                                the caller and pack_id is 'manual'.
//
//   corpus.list_for_record       { client_id, record_id }
//                                returns { entries: CorpusEntry[] }

import { JSONCodec, type NatsConnection } from 'nats';
import { fetchViaJina } from './jina';
import * as cache from './cache';
import { addToCorpus, addToInbox, listForRecord, type CorpusEntry } from './corpus';
import { isNavigationUrl, isSameDomain } from './filters';

const jc = JSONCodec();

const CONTENT_PACK_IDS = new Set(['official-blog-pack']);

type ResponseLite = {
  response_id: string;
  row_id: string;
  pack_id: string | null;
  fire_id: string | null;
  structured: { url?: string; display_name?: string; snippet?: string } | null;
};

type PreviewResult = {
  response_id: string;
  status: 'ready' | 'failed';
  exact_url: string;
  pack_id: string | null;
  title?: string;
  excerpt?: string;
  fetched_at?: string;
  extra_metadata?: Record<string, unknown>;
  error?: string;
};

export function registerHandlers(nc: NatsConnection): void {
  // content_ingest.preview
  (async () => {
    const sub = nc.subscribe('content_ingest.preview.requested');
    for await (const msg of sub) {
      const args = jc.decode(msg.data) as {
        record_id: string;
        force_refetch?: boolean;
      };
      try {
        const rowUrl = await fetchRowUrl(nc, args.record_id);
        const responses = await fetchResponsesForRecord(nc, args.record_id);
        // Scope to the LATEST fire_id per (row_id, pack_id) — Rule 8.
        // Within content packs the row_id is uniform (this record), so
        // the scope is "latest fire_id per pack_id."
        const latestByPack = latestFireIdPerPack(responses);
        const scoped = responses.filter((r) => {
          if (r.pack_id == null || !CONTENT_PACK_IDS.has(r.pack_id)) return false;
          const latest = latestByPack.get(r.pack_id);
          if (latest == null) return r.fire_id == null;
          return r.fire_id === latest;
        });

        // Deduplicate by URL within the scoped set.
        const seenUrls = new Set<string>();
        type Job = { r: ResponseLite; url: string };
        const jobs: Job[] = [];
        for (const r of scoped) {
          const url = r.structured?.url?.trim();
          if (!url) continue;
          if (seenUrls.has(url)) continue;
          seenUrls.add(url);
          // Defense-in-depth: Rules 1 + 2 should already be enforced at
          // the pack layer, but if any old responses leaked off-domain or
          // navigation URLs into the store, drop them here too.
          if (rowUrl && !isSameDomain(url, rowUrl)) continue;
          if (isNavigationUrl(url)) continue;
          jobs.push({ r, url });
        }

        // Bounded-parallel Jina fetches with per-hostname concurrency = 1.
        // Same-domain bursts trigger Jina's per-host rate limit; the
        // retry-429 backoff inside fetchViaJina handles it, but serializing
        // per host keeps things sane.
        const previews: PreviewResult[] = new Array(jobs.length);
        const byHost = new Map<string, Job[]>();
        const indexOf = new Map<Job, number>();
        for (let i = 0; i < jobs.length; i += 1) {
          indexOf.set(jobs[i], i);
          let host = '';
          try { host = new URL(jobs[i].url).hostname; }
          catch { host = `__bad__${i}`; }
          const bucket = byHost.get(host) ?? [];
          bucket.push(jobs[i]);
          byHost.set(host, bucket);
        }
        async function processHost(hostJobs: Job[]) {
          for (const job of hostJobs) {
            const i = indexOf.get(job)!;
            let result = args.force_refetch ? null : cache.get(job.url);
            if (!result) {
              result = await fetchViaJina(job.url);
              cache.set(job.url, result);
            }
            if (result.ok) {
              previews[i] = {
                response_id: job.r.response_id,
                status: 'ready',
                exact_url: job.url,
                pack_id: job.r.pack_id,
                title: result.title,
                excerpt: excerptFrom(result.markdown),
                fetched_at: result.fetched_at,
                extra_metadata: result.extra,
              };
            } else {
              previews[i] = {
                response_id: job.r.response_id,
                status: 'failed',
                exact_url: job.url,
                pack_id: job.r.pack_id,
                error: result.error,
              };
            }
          }
        }
        await Promise.all([...byHost.values()].map(processHost));
        if (msg.reply) msg.respond(jc.encode({ previews }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(jc.encode({ ok: false, error }));
      }
    }
  })();

  // content_ingest.preview_url — operator-pasted URL → Jina preview
  (async () => {
    const sub = nc.subscribe('content_ingest.preview_url.requested');
    for await (const msg of sub) {
      const args = jc.decode(msg.data) as {
        record_id: string;
        url: string;
        force_refetch?: boolean;
      };
      try {
        const url = args.url.trim();
        if (!url) throw new Error('url is required');
        let parsed: URL;
        try {
          parsed = new URL(url);
        } catch {
          throw new Error('url is not a valid absolute URL');
        }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          throw new Error(`unsupported protocol: ${parsed.protocol}`);
        }
        const rowUrl = await fetchRowUrl(nc, args.record_id);
        const sameHost = rowUrl ? isSameDomain(url, rowUrl) : false;

        let result = args.force_refetch ? null : cache.get(url);
        if (!result) {
          result = await fetchViaJina(url);
          cache.set(url, result);
        }
        // Synthetic response_id so corpus.add has a stable handle. Caller
        // can override by minting their own before posting to corpus.add;
        // this is just a default surfaced in the preview for convenience.
        const synthetic_response_id = `manual-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 8)}`;
        let preview: PreviewResult;
        if (result.ok) {
          preview = {
            response_id: synthetic_response_id,
            status: 'ready',
            exact_url: url,
            pack_id: 'manual',
            title: result.title,
            excerpt: excerptFrom(result.markdown),
            fetched_at: result.fetched_at,
            extra_metadata: {
              ...result.extra,
              same_host: sameHost,
              row_host: rowUrl
                ? (() => {
                    try {
                      return new URL(rowUrl).hostname.replace(/^www\./, '');
                    } catch {
                      return null;
                    }
                  })()
                : null,
              source: 'manual',
            },
          };
        } else {
          preview = {
            response_id: synthetic_response_id,
            status: 'failed',
            exact_url: url,
            pack_id: 'manual',
            error: result.error,
            extra_metadata: { same_host: sameHost, source: 'manual' },
          };
        }
        if (msg.reply) msg.respond(jc.encode({ preview }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(jc.encode({ ok: false, error }));
      }
    }
  })();

  // corpus.add
  (async () => {
    const sub = nc.subscribe('corpus.add.requested');
    for await (const msg of sub) {
      const args = jc.decode(msg.data) as {
        client_id: string;
        record_id: string;
        response_id: string;
        title: string;
        tags: string[];
        exact_url: string;
        funder_slug: string;
        pack_id: string;
      };
      try {
        let result = cache.get(args.exact_url);
        if (!result) {
          result = await fetchViaJina(args.exact_url);
          cache.set(args.exact_url, result);
        }
        if (!result.ok) throw new Error(`Jina fetch failed: ${result.error}`);
        const written = await addToCorpus({
          client_id: args.client_id,
          record_id: args.record_id,
          response_id: args.response_id,
          funder_slug: args.funder_slug,
          pack_id: args.pack_id,
          title: args.title,
          tags: args.tags,
          exact_url: args.exact_url,
          fetched_at: result.fetched_at,
          markdown_body: result.markdown,
          extra_metadata: result.extra,
        });
        if (msg.reply) msg.respond(jc.encode(written));
        nc.publish(
          'corpus.added',
          jc.encode({
            client_id: args.client_id,
            record_id: args.record_id,
            response_id: args.response_id,
            corpus_path: written.corpus_path,
          }),
        );
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(jc.encode({ ok: false, error }));
      }
    }
  })();

  // corpus.inbox.add — operator-pasted URL → corpus/<client>/corpus/inbox/.
  // Per [[Corpus-Inbox-Capture-and-Triage]] v0.0.0.2 — Vector 2a (/inbox
  // verb) and Vector 2b (conversational paste) share this same handler.
  (async () => {
    const sub = nc.subscribe('corpus.inbox.add.requested');
    for await (const msg of sub) {
      const args = jc.decode(msg.data) as {
        client_id: string;
        url: string;
        note?: string;
        tags?: string[];
        captured_from?: 'content-reader' | 'chat-verb' | 'chat-paste' | 'plugin' | 'inbox-direct';
        captured_session_id?: string;
        fetch?: boolean;
      };
      try {
        const url = args.url?.trim();
        if (!url) throw new Error('url is required');
        let parsed: URL;
        try {
          parsed = new URL(url);
        } catch {
          throw new Error('url is not a valid absolute URL');
        }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          throw new Error(`unsupported protocol: ${parsed.protocol}`);
        }
        const shouldFetch = args.fetch !== false;
        let title = url;
        let markdown_body = '';
        let fetched_at = new Date().toISOString();
        let extra_metadata: Record<string, unknown> = {};
        if (shouldFetch) {
          let result = cache.get(url);
          if (!result) {
            result = await fetchViaJina(url);
            cache.set(url, result);
          }
          if (result.ok) {
            title = result.title;
            markdown_body = result.markdown;
            fetched_at = result.fetched_at;
            extra_metadata = result.extra;
          } else {
            // Fetch failed — still write a stub so the URL isn't lost.
            extra_metadata = {
              jina_status: 'fetch_failed',
              jina_error: result.error,
            };
          }
        } else {
          extra_metadata = { jina_status: 'not_fetched' };
        }
        const written = await addToInbox({
          client_id: args.client_id,
          url,
          title,
          tags: args.tags ?? [],
          fetched_at,
          markdown_body,
          extra_metadata,
          captured_from: args.captured_from ?? 'inbox-direct',
          captured_note: args.note ?? '',
          captured_session_id: args.captured_session_id ?? '',
        });
        if (msg.reply) msg.respond(jc.encode(written));
        nc.publish(
          'corpus.inbox.added',
          jc.encode({
            client_id: args.client_id,
            url,
            corpus_path: written.corpus_path,
            captured_from: args.captured_from ?? 'inbox-direct',
          }),
        );
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(jc.encode({ ok: false, error }));
      }
    }
  })();

  // corpus.list_for_record
  (async () => {
    const sub = nc.subscribe('corpus.list_for_record.requested');
    for await (const msg of sub) {
      const args = jc.decode(msg.data) as { client_id: string; record_id: string };
      try {
        const entries: CorpusEntry[] = await listForRecord(args);
        if (msg.reply) msg.respond(jc.encode({ entries }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(jc.encode({ ok: false, error }));
      }
    }
  })();
}

async function fetchRowUrl(nc: NatsConnection, row_id: string): Promise<string | null> {
  try {
    const reply = await nc.request(
      'row.get.requested',
      jc.encode({ row_id }),
      { timeout: 5_000 },
    );
    const out = jc.decode(reply.data) as { row?: { fields?: { url?: unknown } } };
    const url = out.row?.fields?.url;
    return typeof url === 'string' ? url : null;
  } catch {
    return null;
  }
}

async function fetchResponsesForRecord(
  nc: NatsConnection,
  record_id: string,
): Promise<ResponseLite[]> {
  const reply = await nc.request(
    'response.list.requested',
    jc.encode({ row_id: record_id }),
    { timeout: 10_000 },
  );
  const out = jc.decode(reply.data) as { responses: ResponseLite[] };
  return out.responses ?? [];
}

// Group responses by pack_id, return the latest fire_id (lexicographic-
// max — fire_ids are time-prefixed) per pack. Null fire_id is treated as
// "older than any stamped fire."
function latestFireIdPerPack(responses: ResponseLite[]): Map<string, string | null> {
  const out = new Map<string, string | null>();
  for (const r of responses) {
    if (r.pack_id == null) continue;
    const cur = out.get(r.pack_id);
    if (cur === undefined) {
      out.set(r.pack_id, r.fire_id);
    } else if (r.fire_id != null && (cur == null || r.fire_id > cur)) {
      out.set(r.pack_id, r.fire_id);
    }
  }
  return out;
}

const EXCERPT_MAX = 500;
function excerptFrom(markdown: string): string {
  const body = markdown
    .replace(/^Title:\s*.+$/gim, '')
    .replace(/^URL Source:\s*.+$/gim, '')
    .replace(/^Markdown Content:\s*$/gim, '')
    .replace(/^Published Time:\s*.+$/gim, '')
    .trim();
  if (body.length <= EXCERPT_MAX) return body;
  const slice = body.slice(0, EXCERPT_MAX);
  const lastPeriod = slice.lastIndexOf('. ');
  if (lastPeriod > EXCERPT_MAX * 0.7) return slice.slice(0, lastPeriod + 1) + '…';
  return slice + '…';
}
