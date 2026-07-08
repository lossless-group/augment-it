// Frontend mirror of the affiliation.rate contract (the service's
// authoritative copy lives in
// services/record-surrealdb-resolver/src/person-resolver.ts).

// Per-record-set column mapping — which uploaded CSV column feeds each
// logical field. Asked once (ColumnMapper.svelte), persisted against
// record_set_id, silently reused for every row after that. Same pattern
// person-db-resolver's FieldMapping uses.
export type RatingFieldMapping = {
  person_uuid: string;
  org_slug: string;
  relevance: string;
  relevance_note: string;
  // Informational only — shown on the row, never sent to affiliation.rate.
  person_name: string;
  org_name: string;
};

export type RatingNormRecord = {
  person_uuid: string;
  org_slug: string;
  relevance: string; // raw, human-typed — normalized server-side
  relevance_note: string | null;
  person_name: string | null;
  org_name: string | null;
};

export type AffiliationRateResult = {
  ok: boolean;
  affiliation_id: string;
  relevance: string;
  error?: string;
};

// Same canonical link shape resolver.ts/person-resolver.ts produce —
// mirrored here for the frontend, same convention as PersonCandidate etc.
export type Link = { url: string; kind: string; url_domain: string; added_at: string };
export type CorpusEntry = Link & { content_id: unknown };

export type AffiliationDetail = {
  ok: boolean;
  person: {
    person_uuid: string;
    name: string | null;
    personal_links: Link[];
    personal_corpus: CorpusEntry[];
  };
  org: {
    org_slug: string;
    complete_name: string | null;
    org_links: Link[];
    org_corpus: CorpusEntry[];
  };
  kind: string | null;
  relevance: string | null;
  relevance_note: string | null;
  error?: string;
};

// value = the canonical machine value affiliation.rate stores and
// affiliation.detail returns (services/record-surrealdb-resolver/src/
// person-resolver.ts's RELEVANCE_LABELS). Must match exactly, or a
// previously-rated row's dropdown won't pre-select on reload — the bug
// this shape fixes (values used to be the Title Case label only).
export const RELEVANCE_OPTIONS = [
  { value: 'very_relevant', label: 'Very Relevant' },
  { value: 'highly_relevant', label: 'Highly Relevant' },
  { value: 'relevant', label: 'Relevant' },
  { value: 'skip', label: 'Skip' },
  { value: 'irrelevant', label: 'Irrelevant' },
] as const;
