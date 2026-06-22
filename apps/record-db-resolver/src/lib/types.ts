// Frontend mirror of the DB-agnostic resolver contract (the service's
// authoritative copy lives in services/record-surrealdb-resolver/src/resolver.ts).

export type RawLink = string | { url: string; kind?: string };

export type NormRecord = {
  name: string;
  slug_hint?: string | null;
  url?: string | null;
  domains?: string[];
  socials?: RawLink[];
  streams?: RawLink[];
  corpus?: RawLink[];
};

export type ShapedLink = { url: string; kind: string; url_domain: string; added_at: string };
export type ShapedStream = ShapedLink & { party: string };

export type Candidate = {
  org_id: string;
  slug: string;
  complete_name: string | null;
  conventional_name: string | null;
  score: number;
  match_reason: string[];
  existing: { org_links: number; media_streams: number; org_corpus: number };
  append_preview: {
    org_links: ShapedLink[];
    media_streams: ShapedStream[];
    org_corpus: ShapedLink[];
  };
};

export type OrgSuggestion = {
  org_id: string;
  slug: string;
  complete_name: string | null;
  conventional_name: string | null;
};

export type ApplyResult = {
  ok: boolean;
  org_id: string;
  slug: string;
  created: boolean;
  appended: { org_links: number; media_streams: number; org_corpus: number };
  error?: string;
};
