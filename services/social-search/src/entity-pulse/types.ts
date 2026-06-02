// Entity Pulse — list-shaped pack result types.
//
// Lifted from [[../../../../context-v/specs/Entity-Pulse-Bundle]] v0.0.0.5.
// Resolves engineering-handoff blocker #1 — types now exist in a real file
// referenceable from packs, the dispatcher, and (eventually) response-store.
//
// Step 1 scope (per migration plan): only OfficialUpdateItem is exercised.
// MediaMentionItem + SocialsMentionItem are declared so cross-pack imports
// don't whiplash later, but only `content_type: 'official_blog_entry'`
// has a producer in this changeset.

// Per-item base — every pack returns these fields.
//
// `confidence` and `relevance` are nullable for step 1: the spec calls for
// `provider_override.score: 'none'` until the rollup-agent + LLM scoring
// land. Null is the right shape for "we deliberately did not score this";
// 0 would imply we scored and got a low number.
export type EntityPulseItem = {
  url: string;
  title: string;
  snippet: string;
  // ISO-8601. Required by the spec but in practice extract may fail to find
  // a date; the pack reports those items with null and surfaces a count in
  // meta.dropped_no_date if it chooses to drop them.
  published_date: string | null;
  // Computed at fan-out time from published_date. Null when date is null.
  age_days: number | null;
  confidence: number | null;
  relevance: number | null;
  relevance_reasoning?: string;
};

// OfficialUpdates category — three content_types across three packs.
// Only `official_blog_entry` is produced in this changeset.
export type OfficialUpdateItem = EntityPulseItem & {
  content_type:
    | 'official_blog_entry'
    | 'official_press_release'
    | 'official_social_post_item';
  // Index page that surfaced the item (blog packs). Useful for the curation
  // UI to group items by their discovery source.
  source_index_url?: string;
  wire_service?: string;
  platform?: string;
};

// MediaMentions category — declared for downstream phases (not produced here).
export type MediaMentionItem = EntityPulseItem & {
  content_type: 'news_coverage' | 'thematic_inclusion' | 'deep_analysis';
  source: string;
  sentiment?: number | null;
  is_long_form?: boolean;
};

// SocialsMentions category — declared for downstream phases (not produced here).
export type SocialsMentionItem = EntityPulseItem & {
  platform:
    | 'linkedin'
    | 'x'
    | 'bluesky'
    | 'youtube'
    | 'facebook'
    | 'instagram'
    | 'other';
  author_url?: string;
  engagement_hint?: { likes?: number; reposts?: number; replies?: number };
};

// Wrapper every pass-1 pack returns. The rollup-agent (Phase 2) merges N of
// these into a single PulseRollup; that type lands when Phase 2 ships.
export type EntityPulseListResponse<T extends EntityPulseItem> = {
  items: T[];
  meta: {
    // Free-text brief the LLM scoring step uses; passed through even when
    // scoring is disabled so downstream phases see what the human had in mind.
    relevance_context: string | null;
    total_found: number;
    dropped_low_confidence: number;
    // Per-provider attribution: { serpapi: 3, firecrawl: 12 }. Used by the
    // rollup-agent's meta and by Pack Runner / Request Reviewer surfacing.
    by_provider: Record<string, number>;
    pack_id: string;
    generated_at: string;
    // Two-stage diagnostic — which index URLs were discovered + crawled.
    // Pack-specific but lives here so downstream code can render it without
    // a per-pack switch.
    source_indexes?: string[];
  };
};

// Per-pack outcome envelope (mirrors the existing single-result SearchResult
// shape but carries an EntityPulseListResponse instead of a single record id).
// `outcome` semantics match the existing dispatcher's vocabulary so triage UI
// can treat list-shaped and single-shaped pack runs uniformly.
export type EntityPulseSearchResult<T extends EntityPulseItem> = {
  outcome: 'found' | 'not_found' | 'error';
  pack_id: string;
  row_id: string;
  // Populated on 'found'; absent on 'not_found' / 'error'.
  response?: EntityPulseListResponse<T>;
  error_message?: string;
};
