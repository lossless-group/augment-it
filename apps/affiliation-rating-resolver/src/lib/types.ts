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
