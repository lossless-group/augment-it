// The search registry — agent searches as asynchronous jobs (spec D1/D2).
//
// `search.submit` writes an entry (`queued`), returns the id immediately,
// and kicks execution WITHOUT awaiting it: the executor dispatches the
// existing organization.crawl.requested NATS request itself (same 600s
// budget as the synchronous path) and on settle updates the entry and
// broadcasts `search.updated`. prompt-runner is untouched — the async
// boundary lives here, per
// context-v/specs/Search-Results-Queue-Remote.md.
//
// Persistence: in-memory map + write-through JSON at SEARCH_STORE_PATH
// (the sessions.json / active-workspace.json volume precedent). Results
// survive tab refresh, remount, WS reconnect, and browser close; a
// workspace restart mid-crawl marks the stranded entry `failed` with a
// retry affordance — honest and sufficient (spec non-goal: no JetStream).

import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { getNats } from './nats';
import type { Actor } from './capabilities';

export const SEARCH_UPDATED_SUBJECT = 'search.updated';

export type SearchTarget = 'links' | 'streams' | 'team';
export type SearchStatus = 'queued' | 'running' | 'done' | 'failed';

// The card shape (spec D5) — enough to render collapsed without fetching
// results. Results live server-side on the entry and fetch on expand.
export type SearchCard = {
  search_id: string;
  entity: { org_slug: string; display_name?: string };
  target: SearchTarget;
  client: string;
  status: SearchStatus;
  submitted_at: string;
  started_at?: string;
  finished_at?: string;
  error?: string;
  result_summary: { count: number } | null;
  typical_ms: number;
};

type SearchEntry = SearchCard & {
  // The crawl reply, verbatim (links/streams: {results}; team: {people,
  // filtered_note, source_urls}) — returned by search.results on expand.
  result?: Record<string, unknown>;
};

// Typical durations, hardcoded v1 from live observations (spec D6):
// links 87s, team 147s and 211s. A rolling per-target average is the v2.
const TYPICAL_MS: Record<SearchTarget, number> = {
  links: 90_000,
  streams: 90_000,
  team: 200_000,
};

const TARGETS = new Set<SearchTarget>(['links', 'streams', 'team']);
// Same ceiling the synchronous organization.crawl dispatch uses.
const CRAWL_TIMEOUT_MS = 600_000;
// Entries older than this get swept — dealt-with searches are dismissed by
// the operator; this catches the abandoned tail.
const SEARCH_TTL_MS = 24 * 60 * 60_000;

const searches = new Map<string, SearchEntry>();
let storePath = '';
// Serialize write-throughs so overlapping settles can't interleave writes.
let persistChain: Promise<void> = Promise.resolve();

function persist(): void {
  if (!storePath) return;
  persistChain = persistChain
    .then(() => writeFile(storePath, JSON.stringify([...searches.values()]), 'utf8'))
    .catch((err) => {
      console.warn('[searches] could not persist registry', err);
    });
}

function broadcast(entry: SearchEntry): void {
  try {
    getNats().publish(
      SEARCH_UPDATED_SUBJECT,
      JSON.stringify({
        search_id: entry.search_id,
        status: entry.status,
        org_slug: entry.entity.org_slug,
        target: entry.target,
        client: entry.client,
      }),
    );
  } catch (err) {
    console.warn('[searches] could not publish search.updated', err);
  }
}

/**
 * Load the persisted registry. Entries stranded in queued/running are from
 * a workspace restart mid-crawl — mark them failed with an explicit retry
 * message rather than let them spin forever (the claim-protocol lesson).
 */
export async function loadSearches(path: string): Promise<void> {
  storePath = path;
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    return; // first boot — no store yet
  }
  try {
    const entries = JSON.parse(raw) as SearchEntry[];
    let stranded = 0;
    for (const e of entries) {
      if (e.status === 'queued' || e.status === 'running') {
        e.status = 'failed';
        e.error = 'the workspace service restarted while this search was in flight — retry it';
        e.finished_at = new Date().toISOString();
        stranded += 1;
      }
      searches.set(e.search_id, e);
    }
    if (stranded > 0) persist();
    console.info(`[searches] loaded ${entries.length} entries (${stranded} marked failed after restart)`);
  } catch (err) {
    console.warn('[searches] could not parse registry — starting empty', err);
  }
}

/** Hourly TTL sweep — silent; the remote refetches on mount anyway. */
export function startSearchSweep(): void {
  setInterval(() => {
    const cutoff = Date.now() - SEARCH_TTL_MS;
    let swept = 0;
    for (const [id, e] of searches) {
      if (new Date(e.finished_at ?? e.submitted_at).getTime() < cutoff) {
        searches.delete(id);
        swept += 1;
      }
    }
    if (swept > 0) persist();
  }, 60 * 60_000).unref();
}

async function execute(entry: SearchEntry, actor?: Actor): Promise<void> {
  entry.status = 'running';
  entry.started_at = new Date().toISOString();
  persist();
  broadcast(entry);
  try {
    const body = {
      org_slug: entry.entity.org_slug,
      target: entry.target,
      client: entry.client,
      ...(actor ? { actor } : {}),
    };
    const reply = (await getNats()
      .request('organization.crawl.requested', JSON.stringify(body), { timeout: CRAWL_TIMEOUT_MS })
      .then((m) => m.json())) as Record<string, unknown> & { ok?: boolean; error?: string };
    if (reply.ok) {
      entry.status = 'done';
      entry.result = reply;
      const list = (reply.results ?? reply.people) as unknown[] | undefined;
      entry.result_summary = { count: Array.isArray(list) ? list.length : 0 };
    } else {
      entry.status = 'failed';
      entry.error = reply.error ?? 'organization.crawl failed';
    }
  } catch (err) {
    entry.status = 'failed';
    entry.error = err instanceof Error ? err.message : String(err);
  }
  entry.finished_at = new Date().toISOString();
  persist();
  broadcast(entry);
}

function toCard(e: SearchEntry): SearchCard {
  const { result: _result, ...card } = e;
  return card;
}

export async function submitSearch(args: unknown, actor?: Actor): Promise<unknown> {
  const a = (args ?? {}) as {
    entity?: { org_slug?: string; display_name?: string };
    target?: string;
    client?: string;
  };
  if (!a.entity?.org_slug) throw new Error('search.submit requires entity.org_slug');
  if (!a.target || !TARGETS.has(a.target as SearchTarget)) {
    throw new Error("search.submit requires target 'links' | 'streams' | 'team'");
  }
  if (!a.client) throw new Error('search.submit requires client');
  const target = a.target as SearchTarget;
  const entry: SearchEntry = {
    search_id: `srch_${randomUUID()}`,
    entity: { org_slug: a.entity.org_slug, display_name: a.entity.display_name },
    target,
    client: a.client,
    status: 'queued',
    submitted_at: new Date().toISOString(),
    result_summary: null,
    typical_ms: TYPICAL_MS[target],
  };
  searches.set(entry.search_id, entry);
  persist();
  broadcast(entry);
  // Fire-and-forget — the submit reply must not wait on the crawl.
  void execute(entry, actor);
  return { ok: true, search_id: entry.search_id };
}

export async function listSearches(args: unknown): Promise<unknown> {
  const a = (args ?? {}) as { client?: string };
  if (!a.client) throw new Error('search.list requires client');
  const cards = [...searches.values()]
    .filter((e) => e.client === a.client)
    .sort((x, y) => (x.submitted_at < y.submitted_at ? 1 : -1))
    .map(toCard);
  return { ok: true, searches: cards };
}

export async function getSearchResults(args: unknown): Promise<unknown> {
  const a = (args ?? {}) as { search_id?: string };
  if (!a.search_id) throw new Error('search.results requires search_id');
  const entry = searches.get(a.search_id);
  if (!entry) return { ok: false, error: 'search not found — it may have been dismissed or expired' };
  // Spread the stored crawl reply (results | people + filtered_note +
  // source_urls + provider) under our own ok/status/error envelope.
  return { ...(entry.result ?? {}), ok: true, status: entry.status, error: entry.error };
}

export async function dismissSearch(args: unknown): Promise<unknown> {
  const a = (args ?? {}) as { search_id?: string };
  if (!a.search_id) throw new Error('search.dismiss requires search_id');
  const entry = searches.get(a.search_id);
  if (entry) {
    searches.delete(a.search_id);
    persist();
    // Other tabs/sessions drop the card on the same refetch-on-event path.
    broadcast({ ...entry, status: entry.status });
  }
  return { ok: true };
}
