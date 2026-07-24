// Wire types for the search-and-add remote.
// Spec: context-v/specs/Augment-From-DB-Flow.md §Capability contract.

// The A→B launch envelope (spec D2). Arrives via
// CustomEvent('augment-it:search-request') and, because the event alone is
// racy across an async federation mount, also via
// localStorage['augment-it:search-request'] — read once on mount.
export type SearchRequestDetail = {
  entity:
    | { type: 'organization'; org_slug: string; display_name?: string }
    | { type: 'person'; person_uuid: string; display_name?: string };
  target: 'links' | 'corpus' | 'streams';
  seed_term: string;
  intent?: string;
  // Phase 5 — scan mode: when present, the stream URL is scanned via
  // organization.stream.scan instead of a term search.
  stream?: { url: string; kind?: string };
  // v1.2 — crawl mode: didi's web crawl (organization.crawl) fires instead
  // of a term search; no TermBar, no palette. Spec §v1.2.
  crawl?: boolean;
};

// Normalized result every connector returns (services/social-search
// connectors/types.ts ConnectorResult, verbatim) — plus the scan mode's
// already-in-corpus flag, absent on term-search results.
export type ConnectorResult = {
  url: string;
  title: string;
  content: string;
  score?: number;
  published_date?: string;
  known?: boolean;
  // Crawl-mode extras: the model's inferred entry kind, and (streams) the
  // stream's real title — carried through the ➕ so the add write keeps them.
  kind?: string;
  name?: string;
};

// connectors.inventory wire shape — ConnectorRegistration minus `fire`.
export type ConnectorInfo = {
  id: string;
  display_name: string;
  short_label: string;
  capabilities: string[];
  cost_tier: 'free' | 'free-tier' | 'paid';
  requires_env: string[];
  status: 'available' | 'disabled' | 'rate-limited' | 'auth-failed' | 'needs-env';
};
