// Wire types for the search-results remote.
// Spec: context-v/specs/Search-Results-Queue-Remote.md §Capability contract.

export type SearchTarget = 'links' | 'streams' | 'team';
export type SearchStatus = 'queued' | 'running' | 'done' | 'failed';

// The card shape (spec D5) — services/workspace/src/searches.ts SearchCard,
// verbatim. Enough to render collapsed; results fetch on expand.
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

// A links/streams crawl candidate — the crawl reply's ConnectorResult shape
// (services/social-search connectors/types.ts), plus the crawl extras: the
// model's inferred entry kind and (streams) the stream's real title, carried
// through the ➕ so the add write keeps them instead of re-inferring.
export type ConnectorResult = {
  url: string;
  title: string;
  content: string;
  score?: number;
  published_date?: string;
  kind?: string;
  name?: string;
};

// A team crawl candidate (org-workbench's org-client.ts CrawledPerson mirror).
export type CrawledPerson = {
  name: string;
  role: string | null;
  headline: string | null;
  linkedin_url: string | null;
  bio_url: string | null;
};

// person.candidates wire shape (org-workbench lib/types.ts mirror) — the
// accept gate's evidence when a staged person might already exist.
export type PersonCandidate = {
  person_uuid: string;
  name: string | null;
  headline: string | null;
  linkedin_profile_url: string | null;
  email: string | null;
  score: number;
  match_reason: string[];
};

// search.results — one envelope, per-target payload.
export type SearchResults = {
  status: SearchStatus;
  results?: ConnectorResult[];
  people?: CrawledPerson[];
  filtered_note?: string;
  source_urls?: string[];
  provider?: string;
  error?: string;
};
