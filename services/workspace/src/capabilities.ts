// Capability dispatcher: maps browser-side invoke() calls to NATS subjects.
// The Workspace Service owns no domain data; it routes capabilities to
// whichever microservice subscribes to the relevant subject.

import { JSONCodec } from 'nats';
import { getNats } from './nats';

const jc = JSONCodec();

const CAPABILITY_TO_SUBJECT: Record<string, string> = {
  // record set operations
  'record_set.list': 'record_set.list.requested',
  'record_set.get': 'record_set.get.requested',
  'record_set.ingest': 'record_set.ingest.requested',
  'record_set.ingest.xlsx': 'record_set.ingest.xlsx.requested',
  'record_set.delete': 'record_set.delete.requested',
  // Promotion + archive — see Enhanced-Records-List spec
  'record_set.promote': 'record_set.promote.requested',
  'record_set.archive': 'record_set.archive.requested',
  // Variant-family operations — see Record-Set-Family-Grouping spec.
  // Read-only heuristic; safe to call after every ingest.
  'record_set.suggest_variant_family': 'record_set.suggest_variant_family.requested',
  'variant_family.list': 'variant_family.list.requested',
  'variant_family.create': 'variant_family.create.requested',
  'variant_family.update': 'variant_family.update.requested',
  'variant_family.add': 'variant_family.add.requested',
  'variant_family.remove': 'variant_family.remove.requested',
  'variant_family.dissolve': 'variant_family.dissolve.requested',
  // row operations
  'row.list': 'row.list.requested',
  'row.get': 'row.get.requested',
  'row.update': 'row.update.requested',
  'row.helpful_links.add': 'row.helpful_links.add.requested',
  'row.helpful_links.remove': 'row.helpful_links.remove.requested',
  // Packs-and-bundles: pack-response accepts route to socials.add (replace-
  // by-pack_id). Mirrors the helpful_links pair shape. Spec:
  // context-v/blueprints/Packs-and-Bundles-Pattern.md §Row write-back
  'row.socials.add': 'row.socials.add.requested',
  'row.socials.remove': 'row.socials.remove.requested',
  'row.archive': 'row.archive.requested',
  // prompt template operations
  'prompt.list': 'prompt.list.requested',
  'prompt.get': 'prompt.get.requested',
  'prompt.create': 'prompt.create.requested',
  'prompt.update': 'prompt.update.requested',
  'prompt.delete': 'prompt.delete.requested',
  // prompt execution — runs N LLM calls, can take minutes
  'prompt.run': 'prompt.run.requested',
  // cancel an in-flight prompt.run (by record_set_id)
  'prompt.run.cancel': 'prompt.run.cancel.requested',
  // request preview — builds the request for one row, no LLM call
  'prompt.preview': 'prompt.preview.requested',
  // chat-driven prompt drafting — one LLM call, persisted with status='draft'
  'prompt.draft': 'prompt.draft.requested',
  // chat-driven refinement of an existing draft from natural-language feedback
  'prompt.improve': 'prompt.improve.requested',
  // chat-driven apply — runs the prompt + flips status to 'applied' on success
  'prompt.apply': 'prompt.apply.requested',
  // response review (post-flight)
  'response.list': 'response.list.requested',
  'response.get': 'response.get.requested',
  'response.flag': 'response.flag.requested',
  'response.accept': 'response.accept.requested',
  'response.delete': 'response.delete.requested',
  'response.delete_all': 'response.delete_all.requested',
  'response.coverage': 'response.coverage.requested',
  'response.set_text': 'response.set_text.requested',
  // Patch a pack response's structured Candidate (URL, display_name, ...) —
  // used by the by-record review surface for inline human corrections.
  'response.set_structured': 'response.set_structured.requested',
  // Packs-and-bundles. social-search-service is the consumer for both.
  // pack.search is one (pack × row); pack.fan_out is M rows × N packs,
  // concurrency-bounded server-side, single reply when all cells settled.
  'pack.search': 'pack.search.requested',
  'pack.fan_out': 'pack.fan_out.requested',
  // Entity Pulse — list-shaped pack run (Phase 1). Each handler returns the
  // full EntityPulseListResponse JSON in the reply (no response-store write
  // yet — the curation layer lands later). Per
  // context-v/specs/Entity-Pulse-Bundle.md migration step 2.
  'pack.entity_pulse': 'pack.entity_pulse.requested',
  // Connector Inventory — read-only registry snapshot. Powers the per-record
  // palette UI's chip menu (cost tiers, needs-env affordances). Optional
  // 'intent' arg filters to connectors serving a specific capability. Per
  // context-v/specs/Connector-Inventory-and-Per-Record-Palette.md.
  'connectors.inventory': 'connectors.inventory.requested',
  // Records Surface per-record fire — runs one connector against one row's
  // URL and returns a list of candidate URLs (the OfficialUpdate index
  // pages). Reply rides on NATS; no response-store write. Per
  // context-v/specs/Flow-for-Bundles-Packs.md §"The connectors".
  'connector.fire': 'connector.fire.requested',
  // Content ingest — Jina-pull markdown + per-client corpus. Per
  // context-v/specs/Funder-Content-Corpus-Workflow.md §Step 5 and
  // context-v/specs/Response-Reviewer-Shell-and-Content-Reader-Mode.md.
  'content_ingest.preview': 'content_ingest.preview.requested',
  // Operator-pasted URL → Jina preview. Same shape as one entry of
  // content_ingest.preview but for a single user-supplied URL; does not
  // enforce same-host (manual additions ride Rule 5, not Rule 1).
  'content_ingest.preview_url': 'content_ingest.preview_url.requested',
  'corpus.add': 'corpus.add.requested',
  'corpus.list_for_record': 'corpus.list_for_record.requested',
};

const CAPABILITY_TIMEOUTS_MS: Record<string, number> = {
  'record_set.ingest': 30_000,
  'record_set.ingest.xlsx': 30_000,
  // a row_limit-capped run is N sequential LLM calls; give it generous room
  'prompt.run': 600_000,
  // single-LLM-call drafting / improving — 60s is comfortable for Sonnet
  'prompt.draft': 60_000,
  'prompt.improve': 60_000,
  // apply wraps prompt.run; needs the same generous budget
  'prompt.apply': 600_000,
  // pack.fan_out can run many cells in sequence; give it room. The
  // service caps concurrency at 4 calls, so N cells ≈ N/4 × per-cell.
  'pack.fan_out': 600_000,
  // one pack × one row, but a SearXNG aggregate query (Google/Bing/DDG/Brave)
  // can take several seconds — the 5s default is too tight for the per-record
  // run buttons in the by-record triage view.
  'pack.search': 30_000,
  // Entity Pulse packs do multi-stage work (find-index + extract, or multi-
  // wire parallel queries, or per-platform walks). 60s leaves room without
  // gold-plating.
  'pack.entity_pulse': 60_000,
  // Records Surface per-record fire — one scrape + parse + (optional) Haiku
  // call. 60s is generous; Firecrawl typically lands in 5-15s.
  'connector.fire': 60_000,
  // Content ingest — Jina fires N URLs per preview (one per content-pack
  // response on the record, deduped, bounded-parallel-per-host with 429
  // retry). 300s safety margin for a record with many unique URLs on a
  // slow domain.
  'content_ingest.preview': 300_000,
  // One Jina fetch on a user-pasted URL; same per-fetch shape as the
  // bulk preview but bounded to a single URL.
  'content_ingest.preview_url': 60_000,
  // corpus.add re-uses warm cache or re-fetches once via Jina.
  'corpus.add': 30_000,
};

export async function dispatch(capability: string, args: unknown): Promise<unknown> {
  const subject = CAPABILITY_TO_SUBJECT[capability];
  if (!subject) throw new Error(`unknown capability: ${capability}`);
  const timeout = CAPABILITY_TIMEOUTS_MS[capability] ?? 5_000;
  const reply = await getNats().request(subject, jc.encode(args), { timeout });
  return jc.decode(reply.data);
}
