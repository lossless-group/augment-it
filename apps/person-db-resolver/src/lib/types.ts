// Frontend mirror of the person-resolver contract (the service's
// authoritative copy lives in
// services/record-surrealdb-resolver/src/person-resolver.ts).

export type PersonNormRecord = {
  name: string;
  linkedin_url?: string | null;
  org_name?: string | null;
  role?: string | null;
  observation?: string | null;
};

export type PersonCandidate = {
  person_uuid: string;
  name: string | null;
  headline: string | null;
  linkedin_profile_url: string | null;
  score: number;
  match_reason: string[];
};

export type PersonApplyResult = {
  ok: boolean;
  person_uuid: string;
  created: boolean;
  name: string | null;
  error?: string;
};

// Reuses record-db-resolver's org candidate shape — same resolver.candidates
// capability, called with a synthetic {name: org_name} record. append_preview
// is part of the wire contract but unused here (no url/socials to append for
// a person-sourced org lookup).
export type OrgCandidate = {
  org_id: string;
  slug: string;
  complete_name: string | null;
  conventional_name: string | null;
  score: number;
  match_reason: string[];
};

export type OrgSuggestion = {
  org_id: string;
  slug: string;
  complete_name: string | null;
  conventional_name: string | null;
};

export type PersonAffiliateResult = {
  ok: boolean;
  org_id: string;
  org_slug: string;
  org_created: boolean;
  affiliation_created: boolean;
  error?: string;
};

// Per-record-set column mapping — which uploaded CSV column feeds each
// logical person field. Asked once (ColumnMapper.svelte), persisted against
// record_set_id, silently reused for every row after that.
export type FieldMapping = {
  name: string;
  org: string;
  role: string;
  linkedin_url: string;
  observation: string;
};
