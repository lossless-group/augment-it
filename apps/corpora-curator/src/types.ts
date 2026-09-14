// Local view-model types for the corpora-curator surface. The authoritative
// shapes live in the spec (Strategy-Curator-Entry-Point-for-Augment-It.md) and,
// once the backend handlers land, in the resolver / content-ingest services.

export type ExtractKind = 'Quotes' | 'Stats' | 'References' | 'Mentions';

export const EXTRACT_KINDS: ExtractKind[] = ['Quotes', 'Stats', 'References', 'Mentions'];

export type SourceStatus = 'metadata-only' | 'fetched';

// Mirrors the workspace transport's connection_status union
// (packages/workspace/src/state.svelte.ts). It stays here because
// curation.svelte.ts types its `connection` field from it; it is deliberately
// the SAME six members as <StatusIndicator>'s own `ConnectionState`, and the
// adoption test asserts that rather than letting the two unions drift.
export type ConnStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error' | 'auth_required';

// --- Chip tone, chosen by MEANING ------------------------------------------
//
// @augment-it/shared-ui's <Chip> takes a semantic tone, and the rule is that it
// is picked by what the label means rather than by the colour the member drew.
//
// CONNECTION_TONE USED TO LIVE HERE and no longer does. It was a correct map —
// open ok, connecting info, auth_required warn, closed/error error, idle
// neutral — and that is exactly the problem it turned out to be: fifteen other
// members were making the same six-way decision, most of them wrongly, and a
// correct copy in one member fixes one member. The map is now the federal
// <StatusIndicator>, which owns both halves of the decision — the tone AND the
// WORD. This member only ever owned the tone; it rendered the raw enum as its
// label, so `auth_required` reached the operator as `auth_required`. The word
// is the half a local tone map cannot carry.
//
// What is left below is the one tone decision that is genuinely this member's,
// because SourceStatus is this member's vocabulary and nobody else's.
export type ChipTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'error' | 'info';

// Two values, and only one of them is an outcome. `fetched` is the affirmative
// result of the Fetch action, so it is `ok`; `metadata-only` is a legitimate
// resting state rather than a degradation, so it is `neutral` — NOT `warn`,
// which would read as a defect on every source the operator has not got to yet.
export const SOURCE_STATUS_TONE: Record<SourceStatus, ChipTone> = {
  fetched: 'ok',
  'metadata-only': 'neutral',
};

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
