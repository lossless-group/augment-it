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

import { type NatsConnection } from '@nats-io/transport-node';
import { fetchViaJina } from './jina';
import * as cache from './cache';
import {
  addToCorpus,
  addToInbox,
  addDomainIndex,
  addSourceFile,
  fetchSourceContent,
  appendExtract,
  removeSourceFile,
  updateSourceFile,
  attachSourceFile,
  retypeDomainFiles,
  listForRecord,
  type CorpusEntry,
  type DomainIndexArgs,
  type AddSourceFileArgs,
  type FetchSourceArgs,
  type AppendExtractArgs,
  type SourceFileRef,
  type UpdateSourceArgs,
  type AttachFileArgs,
} from './corpus';
import { isNavigationUrl, isSameDomain } from './filters';
import { downloadBinaryAsset, type BinaryAssetResult } from './binary-asset';
import { promoteSnapshot } from './promote';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

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

export function registerContentIngestHandlers(nc: NatsConnection): void {
  // corpus.domain.write_index — internal (resolver → here): write a domain's
  // folder + index.md definition file (<type-plural>/<slug>/index.md). Not a
  // browser capability; the resolver's domain.create handler requests it so the
  // create is filesystem-authoritative.
  (async () => {
    const sub = nc.subscribe('corpus.domain.write_index.requested');
    for await (const msg of sub) {
      const args = msg.json() as DomainIndexArgs;
      try {
        if (!args?.client_slug || !args?.type || !args?.slug) throw new Error('client_slug, type and slug are required');
        const result = await addDomainIndex(args);
        if (msg.reply) msg.respond(JSON.stringify({ ok: true, ...result }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // corpus.domain.retype — internal (resolver → here, once per client_slug on
  // the domain): move <old-type-plural>/<slug>/ → <new-type-plural>/<slug>/
  // and patch every frontmatter reference to the type.
  (async () => {
    const sub = nc.subscribe('corpus.domain.retype.requested');
    for await (const msg of sub) {
      const args = msg.json() as { client_slug: string; old_type: string; new_type: string; slug: string };
      try {
        if (!args?.client_slug || !args?.old_type || !args?.new_type || !args?.slug) {
          throw new Error('client_slug, old_type, new_type and slug are required');
        }
        const result = await retypeDomainFiles(args);
        if (msg.reply) msg.respond(JSON.stringify({ ok: true, ...result }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // corpus.source.add — internal (resolver → here): Jina-fetch a source's metadata
  // and write the metadata-only per-source file (<domain>/sources/<slug>.md).
  (async () => {
    const sub = nc.subscribe('corpus.source.add.requested');
    for await (const msg of sub) {
      const args = msg.json() as AddSourceFileArgs;
      try {
        if (!args?.client_slug || !args?.domain_slug || !args?.url) throw new Error('client_slug, domain_slug and url are required');
        const result = await addSourceFile(args);
        if (msg.reply) msg.respond(JSON.stringify({ ok: true, ...result }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // corpus.source.fetch — internal: pull full body + PDF into the per-source file.
  (async () => {
    const sub = nc.subscribe('corpus.source.fetch.requested');
    for await (const msg of sub) {
      const args = msg.json() as FetchSourceArgs;
      try {
        if (!args?.client_slug || !args?.domain_slug || !args?.url) throw new Error('client_slug, domain_slug and url are required');
        const result = await fetchSourceContent(args);
        if (msg.reply) msg.respond(JSON.stringify({ ok: true, ...result }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // corpus.source.remove — internal: delete a source's file (+ binary sibling).
  (async () => {
    const sub = nc.subscribe('corpus.source.remove.requested');
    for await (const msg of sub) {
      const args = msg.json() as SourceFileRef;
      try {
        if (!args?.client_slug || !args?.domain_slug || !args?.source_slug) throw new Error('client_slug, domain_slug and source_slug are required');
        const result = await removeSourceFile(args);
        if (msg.reply) msg.respond(JSON.stringify({ ok: true, ...result }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // corpus.source.update — internal: patch frontmatter fields on a source file.
  (async () => {
    const sub = nc.subscribe('corpus.source.update.requested');
    for await (const msg of sub) {
      const args = msg.json() as UpdateSourceArgs;
      try {
        if (!args?.client_slug || !args?.domain_slug || !args?.source_slug) throw new Error('client_slug, domain_slug and source_slug are required');
        const result = await updateSourceFile(args);
        if (msg.reply) msg.respond(JSON.stringify({ ok: true, ...result }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // corpus.source.attach — internal: write an operator-uploaded binary (PDF) as
  // the source's content artifact + mark it fetched.
  (async () => {
    const sub = nc.subscribe('corpus.source.attach.requested');
    for await (const msg of sub) {
      const args = msg.json() as AttachFileArgs;
      try {
        if (!args?.client_slug || !args?.domain_slug || !args?.source_slug) throw new Error('client_slug, domain_slug and source_slug are required');
        if (!args?.content_base64) throw new Error('content_base64 is required');
        const result = await attachSourceFile(args);
        if (msg.reply) msg.respond(JSON.stringify({ ok: true, ...result }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // corpus.source.extract — internal: append a pasted extract to a source file.
  (async () => {
    const sub = nc.subscribe('corpus.source.extract.requested');
    for await (const msg of sub) {
      const args = msg.json() as AppendExtractArgs;
      try {
        if (!args?.client_slug || !args?.domain_slug || !args?.source_slug) throw new Error('client_slug, domain_slug and source_slug are required');
        const result = await appendExtract(args);
        if (msg.reply) msg.respond(JSON.stringify({ ok: true, ...result }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // content_ingest.preview
  (async () => {
    const sub = nc.subscribe('content_ingest.preview.requested');
    for await (const msg of sub) {
      const args = msg.json() as {
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
        if (msg.reply) msg.respond(JSON.stringify({ previews }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // content_ingest.preview_url — operator-pasted URL → Jina preview
  (async () => {
    const sub = nc.subscribe('content_ingest.preview_url.requested');
    for await (const msg of sub) {
      const args = msg.json() as {
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
        // PDF detection. Cheap: prefer URL-suffix check (no extra
        // round-trip for the common .pdf case), fall back to HEAD when
        // the suffix is ambiguous. Surfaces as extra_metadata.is_pdf
        // so the Content Reader preview can show a "PDF" chip and the
        // "save to inbox instead" toggle.
        const is_pdf = await detectIsPdf(url, parsed);
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
              is_pdf,
            },
          };
        } else {
          preview = {
            response_id: synthetic_response_id,
            status: 'failed',
            exact_url: url,
            pack_id: 'manual',
            error: result.error,
            extra_metadata: { same_host: sameHost, source: 'manual', is_pdf },
          };
        }
        if (msg.reply) msg.respond(JSON.stringify({ preview }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // corpus.add
  (async () => {
    const sub = nc.subscribe('corpus.add.requested');
    for await (const msg of sub) {
      const args = msg.json() as {
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
        // Resolve record_uuid via row-store so the file's frontmatter
        // carries the lineage-stable id. Soft-fail if row-store is
        // briefly unreachable — the file lands without record_uuid and
        // listForRecord's fallback path covers it.
        const recordUuidByRowId = await getRecordUuidByRowId(nc);
        const recordUuid = recordUuidByRowId.get(args.record_id);
        const written = await addToCorpus({
          client_id: args.client_id,
          record_id: args.record_id,
          record_uuid: recordUuid,
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
        if (msg.reply) msg.respond(JSON.stringify(written));
        nc.publish(
          'corpus.added',
          JSON.stringify({
            client_id: args.client_id,
            record_id: args.record_id,
            response_id: args.response_id,
            corpus_path: written.corpus_path,
          }),
        );
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // corpus.inbox.add — operator-pasted URL → corpus/<client>/corpus/inbox/.
  // Per [[Corpus-Inbox-Capture-and-Triage]] v0.0.0.2 — Vector 2a (/inbox
  // verb) and Vector 2b (conversational paste) share this same handler.
  (async () => {
    const sub = nc.subscribe('corpus.inbox.add.requested');
    for await (const msg of sub) {
      const args = msg.json() as {
        client_id: string;
        url: string;
        note?: string;
        tags?: string[];
        captured_from?: 'content-reader' | 'chat-verb' | 'chat-paste' | 'plugin' | 'inbox-direct';
        captured_session_id?: string;
        fetch?: boolean;
        fetch_binary?: boolean;       // default true; false skips binary download
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
        const shouldFetchBinary = args.fetch_binary !== false;
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

        // Binary companion. Default-on; the primitive itself short-
        // circuits on unsupported_type (HTML pages don't pay the GET).
        // On any non-ok status we still emit a binary_asset block with
        // download_status so the operator can see we tried — EXCEPT
        // unsupported_type, which is the common HTML case and would
        // pollute every inbox entry with an "we tried" block.
        let binary_asset: Parameters<typeof addToInbox>[0]['binary_asset'] = undefined;
        if (shouldFetchBinary) {
          const ba: BinaryAssetResult = await downloadBinaryAsset(url);
          const downloaded_at = new Date().toISOString();
          if (ba.ok) {
            binary_asset = {
              buffer: ba.buffer,
              content_type: ba.content_type,
              size_bytes: ba.size_bytes,
              sha256: ba.sha256,
              downloaded_at,
              download_status: ba.status,
            };
          } else if (ba.status !== 'unsupported_type') {
            // Tried but failed — record the attempt without a buffer.
            binary_asset = {
              buffer: null,
              content_type: 'application/pdf',
              size_bytes: 0,
              sha256: '',
              downloaded_at,
              download_status: ba.status,
            };
          }
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
          binary_asset,
        });
        if (msg.reply) msg.respond(JSON.stringify(written));
        nc.publish(
          'corpus.inbox.added',
          JSON.stringify({
            client_id: args.client_id,
            url,
            corpus_path: written.corpus_path,
            captured_from: args.captured_from ?? 'inbox-direct',
            binary_asset: written.binary_asset ?? null,
          }),
        );
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // corpus.list_for_record
  (async () => {
    const sub = nc.subscribe('corpus.list_for_record.requested');
    for await (const msg of sub) {
      const args = msg.json() as { client_id: string; record_id: string };
      try {
        // Fetch the row_id → {uuid, slug} maps (cached for ~60s).
        // listForRecord uses the slug for the primary "scan-one-dir"
        // join and falls back to the uuid lineage when slug is unset.
        const meta = await getRowMetaByRowId(nc);
        const entries: CorpusEntry[] = await listForRecord({
          ...args,
          record_uuid_by_row_id: meta.uuids,
          corpus_funder_slug: meta.slugs.get(args.record_id),
        });
        if (msg.reply) msg.respond(JSON.stringify({ entries }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // pipeline.promote_snapshot — reads the latest inputs/*_vN.csv,
  // walks corpus/*/*.md indexing by record_id frontmatter, emits
  // <date>_<basename>_v(N+1).csv with system columns appended.
  // Plan: [[../../../context-v/plans/Augmentation-State-Preservation-
  // and-Snapshot-Promotion]] §Phase B.
  (async () => {
    const sub = nc.subscribe('pipeline.promote_snapshot.requested');
    for await (const msg of sub) {
      const args = msg.json() as { client_id: string };
      try {
        if (!args?.client_id) throw new Error('client_id is required');
        // Build row_id → record_uuid map from row-store. The CSV's
        // identity column is record_uuid; the corpus markdown's
        // record_id field is the internal row_id. Without this map
        // the join silently misses every corpus file.
        const recordUuidByRowId = await fetchRecordUuidByRowId(nc);
        const result = await promoteSnapshot({
          client_id: args.client_id,
          record_uuid_by_row_id: recordUuidByRowId,
        });
        // Auto-ingest the freshly-promoted CSV as a new record set so
        // it shows up as a loadable record set in the UI immediately,
        // without forcing the operator to upload-the-file-they-just-
        // emitted. record_uuid carries through ingest so the lineage
        // back to the prior version is preserved (row-store's
        // createRecordSet preserves an incoming record_uuid; only
        // mints a fresh one when missing).
        let ingested: {
          record_set_id?: string;
          record_set_name?: string;
          variant_family_id?: string;
          predecessor_archived?: boolean;
        } = {};
        try {
          const csvAbsPath = `${process.env.CLIENTS_ROOT ?? '/clients'}/${result.snapshot_path}`;
          const csvText = await readFile(csvAbsPath, 'utf8');
          const filename = basename(result.snapshot_path);
          // Resolve the source vN's record_set_id + variant_family_id
          // BEFORE ingest so we can stitch the lineage at create time:
          //   - predecessor_record_set_id → row-store sets promoted_from
          //     on the new set AND archives the predecessor in the same
          //     persist cycle.
          //   - variant_family_id → we explicitly inherit the family on
          //     the new set (the heuristic suggestVariantFamily uses a
          //     ≤3 column-count tolerance which our +6 system-column
          //     append blows past; the heuristic gets the wrong answer
          //     for this exact case).
          const sourceInfo = await fetchSourceRecordSetInfo(nc, result.source_filename);
          const ingestReply = await nc.request(
            'record_set.ingest.requested',
            JSON.stringify({
              filename,
              csv: csvText,
              name: filename.replace(/\.csv$/i, ''),
              ...(sourceInfo?.record_set_id
                ? { predecessor_record_set_id: sourceInfo.record_set_id }
                : {}),
            }),
            { timeout: 30_000 },
          );
          const ingestOut = ingestReply.json() as {
            ok?: false;
            error?: string;
            record_set?: { record_set_id?: string; name?: string };
          };
          if (ingestOut.ok !== false && ingestOut.record_set?.record_set_id) {
            const newRecordSetId = ingestOut.record_set.record_set_id;
            ingested.record_set_id = newRecordSetId;
            ingested.record_set_name = ingestOut.record_set.name;
            ingested.predecessor_archived = Boolean(sourceInfo?.record_set_id);
            if (sourceInfo?.variant_family_id) {
              try {
                await nc.request(
                  'variant_family.add.requested',
                  JSON.stringify({
                    variant_family_id: sourceInfo.variant_family_id,
                    record_set_id: newRecordSetId,
                  }),
                  { timeout: 10_000 },
                );
                ingested.variant_family_id = sourceInfo.variant_family_id;
              } catch {
                // Soft-fail: family link is a quality-of-life rider.
              }
            }
          }
        } catch {
          // Soft-fail: the CSV is on disk and can be uploaded manually
          // if auto-ingest stumbles. The verb's primary contract is the
          // file on disk; auto-load is a quality-of-life rider.
        }
        const finalResult = { ...result, ...ingested };
        if (msg.reply) msg.respond(JSON.stringify(finalResult));
        nc.publish(
          'pipeline.promote_snapshot.completed',
          JSON.stringify({
            client_id: args.client_id,
            snapshot_path: result.snapshot_path,
            source_version: result.source_version,
            new_version: result.new_version,
            record_set_id: ingested.record_set_id ?? null,
          }),
        );
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();
}

type SourceRecordSetInfo = {
  record_set_id: string;
  variant_family_id: string | null;
};

async function fetchSourceRecordSetInfo(
  nc: NatsConnection,
  sourceFilename: string,
): Promise<SourceRecordSetInfo | null> {
  if (!sourceFilename) return null;
  try {
    const reply = await nc.request(
      'record_set.list.requested',
      JSON.stringify({}),
      { timeout: 10_000 },
    );
    const out = reply.json() as {
      record_sets?: {
        record_set_id?: string;
        name?: string;
        variant_family_id?: string;
        archived?: boolean;
      }[];
    };
    // Match by the source CSV's bare filename. Record sets that came
    // in via record_set.ingest carry the filename verbatim; ones that
    // came in via the older promotion flow may have the .csv stripped.
    // Try both.
    const stripped = sourceFilename.replace(/\.csv$/i, '');
    for (const rs of out.record_sets ?? []) {
      if (rs?.archived) continue;
      const n = rs?.name ?? '';
      if ((n === sourceFilename || n === stripped) && rs?.record_set_id) {
        return {
          record_set_id: rs.record_set_id,
          variant_family_id: rs.variant_family_id ?? null,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

type RowMeta = {
  // Two parallel maps built from a single row.list pass.
  //
  //   uuids — row_id → record_uuid (lineage-stable identity across
  //           promotions; used by the fallback lineage join in
  //           corpus.listForRecord AND by promote_snapshot).
  //   slugs — row_id → corpus_funder_slug (the operator-edited cell
  //           on the records sheet; the PRIMARY join in
  //           corpus.listForRecord — scan only `corpus/<slug>/`).
  //
  // Rows missing either field are simply absent from the corresponding
  // map; downstream code soft-fails (uuid-missing → full-walk lineage;
  // slug-missing → fall through to lineage logic too).
  uuids: Map<string, string>;
  slugs: Map<string, string>;
};

async function fetchRowMetaByRowId(nc: NatsConnection): Promise<RowMeta> {
  const uuids = new Map<string, string>();
  const slugs = new Map<string, string>();
  try {
    const reply = await nc.request(
      'row.list.requested',
      JSON.stringify({}),
      { timeout: 30_000 },
    );
    const out = reply.json() as {
      rows?: {
        row_id: string;
        fields?: { record_uuid?: unknown; corpus_funder_slug?: unknown };
      }[];
    };
    for (const r of out.rows ?? []) {
      const ru = r?.fields?.record_uuid;
      if (typeof ru === 'string' && ru) uuids.set(r.row_id, ru);
      const slug = r?.fields?.corpus_funder_slug;
      if (typeof slug === 'string' && slug.trim() !== '') {
        slugs.set(r.row_id, slug.trim());
      }
    }
  } catch {
    // Caller is expected to soft-fail when the maps are empty. For
    // promotion this means the join drops to zero; for corpus.list_for_
    // record this means the reader degrades to strict record_id match
    // (the v0 behavior). Both are acceptable degradations vs hard fail.
  }
  return { uuids, slugs };
}

// Backwards-compatible shim — promote_snapshot still asks for just the
// uuid map and shouldn't grow a second return value.
async function fetchRecordUuidByRowId(nc: NatsConnection): Promise<Map<string, string>> {
  const meta = await fetchRowMetaByRowId(nc);
  return meta.uuids;
}

// Cached row_id → {uuids, slugs} pair. The lens fires
// corpus.list_for_record once per visible row at view load time —
// without caching, that's N parallel row.list NATS round-trips even
// though every caller wants the same maps. TTL is short enough that
// row-store mutations (new ingest, promotion, slug-cell edit) surface
// within seconds.
const RECORD_UUID_CACHE_TTL_MS = 60_000;
let rowMetaCache: { meta: RowMeta; fetched_at_ms: number } | null = null;
let rowMetaInflight: Promise<RowMeta> | null = null;

async function getRowMetaByRowId(nc: NatsConnection): Promise<RowMeta> {
  const now = Date.now();
  if (rowMetaCache && now - rowMetaCache.fetched_at_ms < RECORD_UUID_CACHE_TTL_MS) {
    return rowMetaCache.meta;
  }
  // De-dup concurrent callers — when 96 lens rows fan out their
  // corpus.list_for_record requests in parallel, only the first one
  // actually fetches; the rest await the same in-flight promise.
  if (rowMetaInflight) return rowMetaInflight;
  rowMetaInflight = (async () => {
    try {
      const meta = await fetchRowMetaByRowId(nc);
      rowMetaCache = { meta, fetched_at_ms: Date.now() };
      return meta;
    } finally {
      rowMetaInflight = null;
    }
  })();
  return rowMetaInflight;
}

// Shim for callers that only need the uuid map (corpus.add stamps
// record_uuid into freshly-written files; doesn't care about the slug).
async function getRecordUuidByRowId(nc: NatsConnection): Promise<Map<string, string>> {
  const meta = await getRowMetaByRowId(nc);
  return meta.uuids;
}

// Public hook for callers that mutate row-store and want the cache
// invalidated immediately (currently unused; reserved for explicit
// invalidation on record_set.created / row.updated broadcasts).
export function invalidateRecordUuidCache(): void {
  rowMetaCache = null;
}

async function fetchRowUrl(nc: NatsConnection, row_id: string): Promise<string | null> {
  try {
    const reply = await nc.request(
      'row.get.requested',
      JSON.stringify({ row_id }),
      { timeout: 5_000 },
    );
    const out = reply.json() as { row?: { fields?: { url?: unknown } } };
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
    JSON.stringify({ row_id: record_id }),
    { timeout: 10_000 },
  );
  const out = reply.json() as { responses: ResponseLite[] };
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

// PDF detection for the preview. Suffix-first to avoid an extra HEAD
// round-trip on the common case; HEAD fallback for URLs without a .pdf
// suffix (e.g. content-disposition delivery). Returns false on any
// error — the chip is decorative, the inbox download path probes
// independently when the operator commits to inboxing.
async function detectIsPdf(url: string, parsed: URL): Promise<boolean> {
  if (parsed.pathname.toLowerCase().endsWith('.pdf')) return true;
  try {
    const head = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    if (!head.ok) return false;
    const ct = head.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    return ct === 'application/pdf';
  } catch {
    return false;
  }
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
