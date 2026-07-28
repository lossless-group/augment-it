// Wire types for the org-workbench remote. Mirrors the shapes the
// record-surrealdb-resolver capabilities return — org identity crosses the
// wire as the slug, never a RecordId (org_id rides along for display only).
// Spec: context-v/specs/Augment-From-DB-Flow.md §Capability contract.

export type OrgSuggestion = {
  org_id: string;
  slug: string;
  complete_name: string | null;
  conventional_name: string | null;
};

export type ShapedLink = {
  url: string;
  kind: string;
  url_domain: string;
  added_at: string;
};

// media_streams entries — ShapedLink plus the stream-only fields: party
// (always 'first_party' today) and the operator-facing name ("Today's
// Credentials"); hostname is the display fallback when name is absent.
export type StreamEntry = ShapedLink & { party?: string; name?: string };

export type OrgDetail = {
  org_id: string;
  slug: string;
  complete_name: string | null;
  conventional_name: string | null;
  aliases: string[];
  domains: { domain?: string }[];
  org_links: ShapedLink[];
  media_streams: StreamEntry[];
  org_corpus: (ShapedLink & { content_id?: unknown })[];
  // Per-client has_tag observations (Initiative, Program, Funder, …) —
  // dashed values, operator-owned casing.
  tags: string[];
};

// Org↔org relations (organization.relations) — parent/child/peer projected
// server-side relative to the queried org. Per
// context-v/plans/Org-Relations-Parent-Child-Peer-Plus-Org-Tags.md.
export type OrgRelKind = 'parent' | 'child' | 'peer';

export type RelatedOrg = {
  slug: string;
  display_name: string;
  rel: OrgRelKind;
  kind: string | null;
  description: string | null;
};

export type OrgRelations = {
  parents: RelatedOrg[];
  children: RelatedOrg[];
  peers: RelatedOrg[];
};

// Phase 4 — add-person wire shapes (person-resolver.ts mirrors).
export type PersonNormRecord = {
  name: string;
  linkedin_url?: string | null;
  org_name?: string | null;
  role?: string | null;
  observation?: string | null;
  email?: string | null;
  bio?: string | null;
};

export type PersonCandidate = {
  person_uuid: string;
  name: string | null;
  headline: string | null;
  linkedin_profile_url: string | null;
  email: string | null;
  score: number;
  match_reason: string[];
};

// Phase 4 — the people reveal (organization.affiliations).
export type AffiliatedPerson = {
  person_uuid: string;
  name: string | null;
  headline: string | null;
  role: string | null;
  relevance: string | null;
  // didi's crawl reasoning, persisted on the edge at Accept (gh #59).
  agent_search_rationale: string | null;
  personal_links: ShapedLink[];
  personal_corpus: ShapedLink[];
  personal_corpus_count: number;
};

// One row of the coverage roster (organization.roster) — counts only, no
// arrays; sorted server-side fewest-corpus-first.
export type OrgRosterRow = {
  slug: string;
  complete_name: string | null;
  conventional_name: string | null;
  corpus_count: number;
  link_count: number;
  stream_count: number;
  people_count: number;
};

// Scored org candidate (resolver.candidates) — the gate's evidence when the
// operator wants to create an org: slug 100 · domain 90 · fuzzy name 60.
export type OrgCandidate = {
  org_id: string;
  slug: string;
  complete_name: string | null;
  conventional_name: string | null;
  score: number;
  match_reason: string[];
  existing: { org_links: number; media_streams: number; org_corpus: number };
};

// Phase 3 — the A→B launch envelope for the search-and-add remote (spec D2).
// Dispatched as CustomEvent('augment-it:search-request', { detail }) AND
// persisted to localStorage (see lib/search-request.ts for why both).
export type SearchRequestDetail = {
  entity:
    | { type: 'organization'; org_slug: string; display_name?: string }
    | { type: 'person'; person_uuid: string; display_name?: string };
  target: 'links' | 'corpus' | 'streams';
  seed_term: string;
  intent?: string;
  // Phase 5 — when present, search-and-add enters scan mode: the stream URL
  // is scanned via organization.stream.scan instead of a term search, and
  // ➕ lands items in org_corpus (target is 'corpus' for scan envelopes).
  stream?: { url: string; kind?: string };
  // (The v1.2 crawl flag is gone — didi's crawls enqueue through
  // search.submit and land in the search-results rail instead.)
};
