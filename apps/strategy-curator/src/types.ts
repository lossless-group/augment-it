// Local view-model types for the strategy-curator surface. The authoritative
// shapes live in the spec (Strategy-Curator-Entry-Point-for-Augment-It.md) and,
// once the backend handlers land, in the resolver / content-ingest services.

export type ExtractKind = 'Quotes' | 'Stats' | 'References' | 'Mentions';

export const EXTRACT_KINDS: ExtractKind[] = ['Quotes', 'Stats', 'References', 'Mentions'];

export type SourceStatus = 'metadata-only' | 'fetched';

// A "strategy" is a domain of type 'strategy' (the catalog is generic + typed;
// this app is the strategy-type view). Shape matches the resolver's DomainRow.
export type Strategy = {
  slug: string;
  type?: string;
  client_slugs: string[]; // owning workspace(s) — multi-client
  title: string;
  tags?: string[];
};

export type Source = {
  source_uuid: string; // canonical, from the shared sources registry
  normalized_url?: string;
  url: string;
  title?: string;
  authors?: string[];
  publisher?: string;
  published_date?: string;
  strategy_slugs?: string[];
  funder_slugs?: string[];
  tags?: string[]; // Train-Case, from the workspace vocabulary
  status?: SourceStatus;
  content_pulled?: boolean;
  verdict_error?: boolean;
  source_slug?: string; // the on-disk filename stem (sources/<source_slug>.md)
  corpus_path?: string;
  binary_filename?: string; // an attached/downloaded file sibling (e.g. the report PDF)
  binary_bytes?: number;
};
