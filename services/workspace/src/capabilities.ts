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
  // row operations
  'row.list': 'row.list.requested',
  'row.get': 'row.get.requested',
  'row.update': 'row.update.requested',
  'row.helpful_links.add': 'row.helpful_links.add.requested',
  'row.helpful_links.remove': 'row.helpful_links.remove.requested',
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
  // Packs-and-bundles. social-search-service is the consumer for both.
  // pack.search is one (pack × row); pack.fan_out is M rows × N packs,
  // concurrency-bounded server-side, single reply when all cells settled.
  'pack.search': 'pack.search.requested',
  'pack.fan_out': 'pack.fan_out.requested',
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
  // service caps concurrency at 4 Tavily calls, so N cells ≈ N/4 × per-cell.
  'pack.fan_out': 600_000,
};

export async function dispatch(capability: string, args: unknown): Promise<unknown> {
  const subject = CAPABILITY_TO_SUBJECT[capability];
  if (!subject) throw new Error(`unknown capability: ${capability}`);
  const timeout = CAPABILITY_TIMEOUTS_MS[capability] ?? 5_000;
  const reply = await getNats().request(subject, jc.encode(args), { timeout });
  return jc.decode(reply.data);
}
