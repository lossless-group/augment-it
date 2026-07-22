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

export type OrgDetail = {
  org_id: string;
  slug: string;
  complete_name: string | null;
  conventional_name: string | null;
  aliases: string[];
  domains: { domain?: string }[];
  org_links: ShapedLink[];
  media_streams: (ShapedLink & { party?: string })[];
  org_corpus: (ShapedLink & { content_id?: unknown })[];
};

// Phase 4 — the people reveal (organization.affiliations).
export type AffiliatedPerson = {
  person_uuid: string;
  name: string | null;
  headline: string | null;
  role: string | null;
  relevance: string | null;
  personal_links: ShapedLink[];
  personal_corpus_count: number;
};

// Phase 3 — the A→B launch envelope for the search-and-add remote (spec D2).
// Dispatched as CustomEvent('augment-it:search-request', { detail }).
export type SearchRequestDetail = {
  entity:
    | { type: 'organization'; org_slug: string }
    | { type: 'person'; person_uuid: string };
  target: 'links' | 'corpus' | 'streams';
  seed_term: string;
  intent?: string;
};
