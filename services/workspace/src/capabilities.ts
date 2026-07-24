// Capability dispatcher: maps browser-side invoke() calls to NATS subjects.
// The Workspace Service owns no domain data; it routes capabilities to
// whichever microservice subscribes to the relevant subject.

import { getNats } from './nats';
import {
  getActiveClientId,
  isPinned,
  listWorkspaces,
  setActiveClientId,
  type WorkspaceSummary,
} from './workspaces';

// workspace.* capabilities are served locally by the workspace-service —
// no NATS round-trip, no domain microservice owns them. The shape mirrors
// the NATS-dispatched path so the browser sees one uniform invoke surface.
// See [[Workspaces-as-Tenant-Primitive]] § "Toggle UI" + "Tenant-aware
// envelope".
const LOCAL_CAPABILITIES: Record<string, (args: unknown) => Promise<unknown>> = {
  'workspace.list': async () => {
    const workspaces = await listWorkspaces();
    // pinned: true → this instance was booted with ACTIVE_CLIENT_ID set
    // (single-tenant deploy). The shell hides the WorkspaceSwitcher rather
    // than offer a switch that doesn't apply. Build-Order Step 7.
    return { workspaces, active_client_id: getActiveClientId(), pinned: isPinned() };
  },
  'workspace.activate': async (args: unknown) => {
    const a = (args ?? {}) as { client_id?: string };
    if (!a.client_id) throw new Error('workspace.activate requires { client_id }');
    const summary: WorkspaceSummary = setActiveClientId(a.client_id);
    return { active: summary };
  },
  'workspace.active': async () => ({ active_client_id: getActiveClientId() }),
};

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
  // Augment from DB — generic query-shaped fire resolved through the
  // connector registry (explicit provider wins, else free-tier-first for the
  // intent). social-search-service is the consumer. Per
  // context-v/specs/Augment-From-DB-Flow.md §Capability contract.
  'search.fire': 'search.fire.requested',
  // Scan one media_streams entry (blog/RSS/newsroom index) via the
  // official-blog machinery's curated-index path + content_items dedup.
  'organization.stream.scan': 'organization.stream.scan.requested',
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
  // Corpus Inbox — capture-first destination. v0.0.1 ships the add path;
  // list + triage handlers come later per [[Corpus-Inbox-Capture-and-Triage]].
  'corpus.inbox.add': 'corpus.inbox.add.requested',
  // Snapshot promotion — emit inputs/<date>_<basename>_v(N+1).csv with
  // corpus_* system columns derived from filesystem truth at promote
  // time. Plan: [[Augmentation-State-Preservation-and-Snapshot-
  // Promotion]] §Phase B.
  'pipeline.promote_snapshot': 'pipeline.promote_snapshot.requested',
  // Record ↔ DB Resolver — operator-driven match/create bridge from row-store
  // records to canonical SurrealDB organizations. DB-agnostic capability
  // contract; the record-surrealdb-resolver service is the consumer. Per
  // context-v/specs/Record-DB-Resolver.md.
  'resolver.candidates': 'resolver.candidates.requested',
  'resolver.search': 'resolver.search.requested',
  'resolver.apply': 'resolver.apply.requested',
  // v0.0.0.2 — edit the matched/created canonical org's name + slug (slug rename
  // pushes the old slug into aliases[]; the UI re-stamps the bonded row after).
  'resolver.update_org': 'resolver.update_org.requested',
  // v0.0.0.3 — opportunities (auto-minted on apply); reverse bond org → opportunities.
  'resolver.opportunities_for_org': 'resolver.opportunities_for_org.requested',
  // v0.0.0.4 — edit an opportunity's name (distinct from the org name).
  'resolver.update_opportunity': 'resolver.update_opportunity.requested',
  // Record ↔ DB Resolver, person side — separate remote (person-db-resolver),
  // separate write target (persons + affiliations + observations, no
  // organizations, no opportunity concept). Per
  // context-v/plans/Person-Aware-Canonical-Resolver-Extension.md.
  'person.candidates': 'person.candidates.requested',
  'person.search': 'person.search.requested',
  'person.apply': 'person.apply.requested',
  'person.affiliate': 'person.affiliate.requested',
  'person.add_observation': 'person.add_observation.requested',
  'person.observations': 'person.observations.requested',
  // Augment from Affiliations — the CSV-round-trip rating write, keyed by
  // (person_uuid, org_slug) rather than a resolved candidate. Per
  // context-v/specs/Augment-From-Affiliations.md.
  'affiliation.rate': 'affiliation.rate.requested',
  // Augment from Affiliations v0.2.0.0 — inline link/corpus editing on the
  // affiliation-rating-resolver card, narrower than person.apply /
  // resolver.apply (one entry, not a whole record batch).
  'person.links.add': 'person.links.add.requested',
  'person.corpus.add': 'person.corpus.add.requested',
  'organization.links.add': 'organization.links.add.requested',
  'organization.corpus.add': 'organization.corpus.add.requested',
  'affiliation.detail': 'affiliation.detail.requested',
  // Augment from DB — the org-workbench reads (full org card; people reveal
  // over the affiliations edges). record-surrealdb-resolver is the consumer.
  // Per context-v/specs/Augment-From-DB-Flow.md §Capability contract.
  'organization.detail': 'organization.detail.requested',
  'organization.affiliations': 'organization.affiliations.requested',
  'organization.streams.add': 'organization.streams.add.requested',
  // The coverage column — per-org counts for a client, fewest corpus first.
  'organization.roster': 'organization.roster.requested',
  // The per-workspace relevance brief — standing operator intent didi crawls
  // load. Per context-v/specs/Augment-From-DB-Flow.md §v1.2.
  'client.brief.get': 'client.brief.get.requested',
  'client.brief.set': 'client.brief.set.requested',
  // didi's web crawl for one org (links/streams/team) — served by
  // prompt-runner with Anthropic server-side web search; candidates only.
  'organization.crawl': 'organization.crawl.requested',
  // Patch kind/name on one media_streams entry, matched by URL. Per
  // context-v/plans/Workbench-Usability-Sweep-Corpus-Visibility-Stream-Editing-Affiliation-Promotion.md.
  'organization.streams.update': 'organization.streams.update.requested',

  // Domain catalog — the canonical typed-grouping graph behind apps/strategy-curator
  // (which is the type='strategy' view). Served by record-surrealdb-resolver
  // (domains.ts). Per context-v/specs/Strategy-Curator-Entry-Point-for-Augment-It.md.
  // (source.fetch / extract.add — the corpus file writes — land in content-ingest next.)
  'domain.create': 'domain.create.requested',
  'domain.list': 'domain.list.requested',
  'domain.assemble': 'domain.assemble.requested',
  // Move a domain from one type to another (e.g. strategy → thesis) —
  // DB + filesystem, all clients on the row at once. Admin-ish action, no
  // dedicated UI yet; invoked directly (see scripts/prove-didi-auth.mjs's
  // RETYPE mode).
  'domain.retype': 'domain.retype.requested',
  'source.add': 'source.add.requested',
  'source.fetch': 'source.fetch.requested',
  'source.retry': 'source.retry.requested',
  'source.remove': 'source.remove.requested',
  'source.update': 'source.update.requested',
  'source.attach': 'source.attach.requested',
  'extract.add': 'extract.add.requested',
  'tag.suggest': 'tag.suggest.requested',
  'tag.apply': 'tag.apply.requested',
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
  // The lens fans out N parallel calls (one per visible row) on view
  // load. Post slug-join each call is a single small-directory walk,
  // but the 5s default was too tight when this fell back to full-walk
  // and is too tight under cold-start filesystem latency. 15s leaves
  // headroom without masking a real backend hang.
  'corpus.list_for_record': 15_000,
  // One Jina fetch + optional binary download (PDF up to 50MB) +
  // filesystem write. Bumped from 30s on 2026-06-09 when the PDF
  // download path landed — a 50MB PDF on a slow link can take real
  // seconds. See plan: Download-PDFs-into-Corpus-Inbox §Phase 2.
  'corpus.inbox.add': 90_000,
  // Walks the corpus filesystem (typically <1K markdown files at v1
  // scale), parses CSV in/out. 120s leaves room for a 10K-file corpus
  // without forcing a chunking strategy. Plan:
  // Augmentation-State-Preservation-and-Snapshot-Promotion §Phase B.
  'pipeline.promote_snapshot': 120_000,
  // Resolver — one client-org read + scoring (candidates), one small query
  // (search), or one additive write + a few content_items upserts (apply).
  // SurrealDB Cloud round-trips; 30s is generous for the org-set scale.
  'resolver.candidates': 30_000,
  'resolver.search': 30_000,
  'resolver.apply': 30_000,
  'resolver.update_org': 30_000,
  'resolver.opportunities_for_org': 30_000,
  'resolver.update_opportunity': 30_000,
  // Person resolver — same Cloud round-trip budget as the org side.
  'person.candidates': 30_000,
  'person.search': 30_000,
  'person.apply': 30_000,
  'person.affiliate': 30_000,
  'person.add_observation': 30_000,
  'person.observations': 30_000,
  // One fresh lookup by (person_uuid, org_slug) + one UPDATE — same Cloud
  // round-trip budget as its person.* siblings.
  'affiliation.rate': 30_000,
  // One entity lookup + one additive UPDATE (corpus variants also touch
  // content_items once). Same Cloud round-trip budget as everything else
  // in this service.
  'person.links.add': 30_000,
  'person.corpus.add': 30_000,
  'organization.links.add': 30_000,
  'organization.corpus.add': 30_000,
  // Two entity lookups + one edge lookup — same Cloud round-trip budget.
  'affiliation.detail': 30_000,
  // Augment from DB — one org read (detail) / one org read + one edge scan
  // (affiliations). Same Cloud round-trip budget.
  'organization.detail': 30_000,
  'organization.affiliations': 30_000,
  'organization.streams.add': 30_000,
  'organization.streams.update': 30_000,
  'organization.roster': 30_000,
  'client.brief.get': 30_000,
  'client.brief.set': 30_000,
  // A crawl is one model turn with multiple server-side web searches (plus
  // pause_turn continuations) — minutes, not seconds.
  'organization.crawl': 300_000,
  // One query, one provider — pack.search's budget.
  'search.fire': 30_000,
  // Multi-stage (Firecrawl index harvest + per-post dates + dedup read) —
  // pack.entity_pulse's budget.
  'organization.stream.scan': 60_000,
  // Domain catalog — SurrealDB graph reads/writes; same Cloud round-trip budget.
  // retype fans out one content-ingest file-move round-trip per client_slug
  // on the row (usually one) — 45s covers a multi-client domain comfortably.
  'domain.retype': 45_000,
  'domain.create': 30_000,
  'domain.list': 30_000,
  'domain.assemble': 30_000,
  'source.add': 60_000, // includes a Jina metadata fetch
  'source.fetch': 90_000, // full Jina fetch + possible PDF download
  'source.retry': 90_000,
  'source.remove': 30_000,
  'source.update': 30_000,
  'source.attach': 60_000, // operator-uploaded binary write
  'extract.add': 15_000,

  'tag.suggest': 30_000,
  'tag.apply': 30_000,
};

// Actor attribution envelope (build-order step 4) — the verified didi.sh
// identity, when the session has one. Rides beside args on every
// NATS-dispatched capability so domain services can stamp created_by /
// updated_by. workspace.* local capabilities have no domain data to stamp
// and ignore it. See [[Workspaces-as-Tenant-Primitive]] § "Tenant-aware
// envelope" for the sibling client_id pattern this mirrors.
export type Actor = { didi_id: string; via?: string };

export async function dispatch(capability: string, args: unknown, actor?: Actor): Promise<unknown> {
  const local = LOCAL_CAPABILITIES[capability];
  if (local) return local(args);
  const subject = CAPABILITY_TO_SUBJECT[capability];
  if (!subject) throw new Error(`unknown capability: ${capability}`);
  const timeout = CAPABILITY_TIMEOUTS_MS[capability] ?? 5_000;
  const body = actor ? { ...(args && typeof args === 'object' ? args : {}), actor } : args;
  const reply = await getNats().request(subject, JSON.stringify(body), { timeout });
  return reply.json();
}
