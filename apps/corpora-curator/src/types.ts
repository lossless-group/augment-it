// Local view-model types for the corpora-curator surface. The authoritative
// shapes live in the spec (Strategy-Curator-Entry-Point-for-Augment-It.md) and,
// once the backend handlers land, in the resolver / content-ingest services.

export type ExtractKind = 'Quotes' | 'Stats' | 'References' | 'Mentions';

export const EXTRACT_KINDS: ExtractKind[] = ['Quotes', 'Stats', 'References', 'Mentions'];

export type SourceStatus = 'metadata-only' | 'fetched';

// Mirrors the workspace transport's connection_status union
// (packages/workspace/src/state.svelte.ts). Lives here rather than in
// curation.svelte.ts so the tone map below and the state that produces it
// cannot drift apart.
export type ConnStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error' | 'auth_required';

// --- Chip tone, chosen by MEANING ------------------------------------------
//
// @augment-it/shared-ui's <Chip> takes a semantic tone, and the rule is that it
// is picked by what the label means rather than by the colour the member drew.
// These two maps are that decision, written down once, because both the app and
// the gallery specimen have to make it identically.
//
// What the old .cc-conn recipe actually encoded: open → green, error and closed
// → red, and idle / connecting / auth_required → the same undifferentiated grey
// default. The greys are the interesting part. `connecting` is transient and
// informational; `auth_required` is a live condition the operator has to act on;
// `idle` is simply "not started". Drawing all three identically said they were
// one state. They are three.
export type ChipTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'error' | 'info';

export const CONNECTION_TONE: Record<ConnStatus, ChipTone> = {
  open: 'ok',                // connected and healthy
  connecting: 'info',        // transient, informational — nothing is wrong yet
  auth_required: 'warn',     // degraded and recoverable, but only by the operator
  closed: 'error',           // disconnected
  error: 'error',            // failed
  idle: 'neutral',           // a plain fact: no attempt has been made
};

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
