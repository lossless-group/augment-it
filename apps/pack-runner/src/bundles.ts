// Client-side bundle registry — kept in sync by hand with the service
// source of truth at services/social-search/src/bundles.ts.
// Matches the same one-file-each convention as packs.ts. If a bundle
// lands or its roster changes, update both files.
//
// Spec: ../../../context-v/blueprints/Packs-and-Bundles-Pattern.md
// Plan: ../../../context-v/plans/Shell-and-Micro-Frontend-UX-Coherence-Refactor.md §Phase 3

export type BundleMember = {
  pack_id: string;
  default: boolean;
  pass: 1 | 2 | 3 | 4;
  required: boolean;
};

export type BundleConfig = {
  bundle_id: string;
  display_name: string;
  description: string;
  entity_type?: string;
  passes: 1 | 2 | 3 | 4;
  members: BundleMember[];
  // What gets richer when responses are accepted. v1: every pack writes to
  // row.socials → ['socials']. See spec Decision §9.
  target_columns: string[];
};

export const PROFILE_BUILDER: BundleConfig = {
  bundle_id: 'profile-builder',
  display_name: 'Profile Builder',
  description: 'Common-five social packs + Wikipedia — for any entity that lives on the public web',
  passes: 1,
  target_columns: ['socials'],
  members: [
    { pack_id: 'linkedin-pack',  default: true,  pass: 1, required: false },
    { pack_id: 'x-pack',         default: true,  pass: 1, required: false },
    { pack_id: 'bluesky-pack',   default: true,  pass: 1, required: false },
    { pack_id: 'youtube-pack',   default: true,  pass: 1, required: false },
    { pack_id: 'wikipedia-pack', default: true,  pass: 1, required: false },
    { pack_id: 'facebook-pack',  default: false, pass: 1, required: false },
    { pack_id: 'instagram-pack', default: false, pass: 1, required: false },
  ],
};

export const PROFILE_BUILDER_NONPROFIT: BundleConfig = {
  bundle_id: 'profile-builder.nonprofit',
  display_name: 'Profile Builder · Nonprofit',
  description: 'Common-five + Wikipedia, biased for org-shaped entities; nonprofit-specific packs (Candid, ProPublica, IRS 990) opt-in once they ship',
  entity_type: 'nonprofit',
  passes: 1,
  target_columns: ['socials'],
  members: [
    { pack_id: 'linkedin-pack',  default: true,  pass: 1, required: false },
    { pack_id: 'x-pack',         default: true,  pass: 1, required: false },
    { pack_id: 'bluesky-pack',   default: true,  pass: 1, required: false },
    { pack_id: 'youtube-pack',   default: true,  pass: 1, required: false },
    { pack_id: 'wikipedia-pack', default: true,  pass: 1, required: false },
    { pack_id: 'facebook-pack',  default: false, pass: 1, required: false },
    { pack_id: 'instagram-pack', default: false, pass: 1, required: false },
  ],
};

// Entity Pulse bundles — Phase 1 of the four-phase DAG per
// context-v/specs/Entity-Pulse-Bundle.md. List-shaped packs; the fan_out
// dispatcher in services/social-search routes by pack_id and emits one
// ResponseRecord per returned item so they triage like Profile Builder.

export const ENTITY_BLOG: BundleConfig = {
  bundle_id: 'entity-blog',
  display_name: 'Entity Blog',
  description: 'Find the entity\'s own blog/news/press index and pull recent posts',
  passes: 1,
  target_columns: ['official_updates_pulse'],
  members: [
    { pack_id: 'official-blog-pack', default: true, pass: 1, required: false },
  ],
};

export const ENTITY_OFFICIALS: BundleConfig = {
  bundle_id: 'entity-officials',
  display_name: 'Entity Officials',
  description: 'Phase-1 OfficialUpdates: blog + press releases + own social posts',
  passes: 1,
  target_columns: ['official_updates_pulse'],
  members: [
    { pack_id: 'official-blog-pack',          default: true, pass: 1, required: false },
    { pack_id: 'official-pressrelease-pack',  default: true, pass: 1, required: false },
    { pack_id: 'official-social-posts-pack',  default: true, pass: 1, required: false },
  ],
};

export const BUNDLES: BundleConfig[] = [
  PROFILE_BUILDER,
  PROFILE_BUILDER_NONPROFIT,
  ENTITY_BLOG,
  ENTITY_OFFICIALS,
];

export function getBundle(bundle_id: string): BundleConfig | undefined {
  return BUNDLES.find((b) => b.bundle_id === bundle_id);
}

/** Pack-display-name lookup table; the Pack Runner UI shows these in the roster. */
export const PACK_DISPLAY_NAMES: Record<string, string> = {
  'linkedin-pack':  'LinkedIn',
  'x-pack':         'X / Twitter',
  'bluesky-pack':   'BlueSky',
  'youtube-pack':   'YouTube',
  'facebook-pack':  'Facebook',
  'wikipedia-pack': 'Wikipedia',
  'instagram-pack': 'Instagram',
  'official-blog-pack':         'Blog / News',
  'official-pressrelease-pack': 'Press Releases',
  'official-social-posts-pack': 'Own Social Posts',
};

// Per-pack palette metadata: the intent the pack serves, the short chip
// label, an accent colour, and the default connector chain. Mirrors the
// data that lives in services/social-search/src/packs.ts (server-side
// source of truth) so the UI can render chips without a round-trip.
// If a pack lands or moves connectors, update BOTH the server file and
// this map.
export type PackPaletteMeta = {
  display_name: string;
  intent: string;
  short_label: string;
  accent: string;
  preferred_connectors: string[];
};

export const PACK_PALETTE_META: Record<string, PackPaletteMeta> = {
  'linkedin-pack':  { display_name: 'LinkedIn',  intent: 'search.social.linkedin',  short_label: 'in', accent: '#0a66c2', preferred_connectors: ['searxng', 'tavily', 'serpapi-google'] },
  'x-pack':         { display_name: 'X',         intent: 'search.social.x',         short_label: 'x',  accent: '#1d9bf0', preferred_connectors: ['searxng', 'tavily', 'serpapi-google'] },
  'bluesky-pack':   { display_name: 'Bluesky',   intent: 'search.social.bluesky',   short_label: 'bs', accent: '#1185fe', preferred_connectors: ['searxng', 'tavily', 'serpapi-google'] },
  'youtube-pack':   { display_name: 'YouTube',   intent: 'search.social.youtube',   short_label: 'yt', accent: '#ff0000', preferred_connectors: ['searxng', 'tavily', 'serpapi-google'] },
  'facebook-pack':  { display_name: 'Facebook',  intent: 'search.social.facebook',  short_label: 'f',  accent: '#1877f2', preferred_connectors: ['searxng', 'tavily', 'serpapi-google'] },
  'wikipedia-pack': { display_name: 'Wikipedia', intent: 'fetch.wikipedia',         short_label: 'wp', accent: '#888a8c', preferred_connectors: ['searxng', 'serpapi-google'] },
  'instagram-pack': { display_name: 'Instagram', intent: 'search.social.instagram', short_label: 'ig', accent: '#e1306c', preferred_connectors: ['searxng', 'tavily', 'serpapi-google'] },
  // Entity Pulse packs — Phase 1 OfficialUpdates. These don't go through the
  // search-style connector chain; the official-blog-pack and -social-posts-pack
  // use SerpApi (when keyed) + Firecrawl directly inside the pack handler,
  // and the press-release pack queries Google News RSS + GDELT in parallel
  // against wire-service domains.
  'official-blog-pack':         { display_name: 'Blog / News',      intent: 'crawl.site',  short_label: 'bn', accent: '#9b59b6', preferred_connectors: ['serpapi-google'] },
  'official-pressrelease-pack': { display_name: 'Press Releases',   intent: 'search.news', short_label: 'pr', accent: '#e67e22', preferred_connectors: ['google-news-rss', 'gdelt', 'serpapi-google'] },
  'official-social-posts-pack': { display_name: 'Own Social Posts', intent: 'crawl.site',  short_label: 'sp', accent: '#1abc9c', preferred_connectors: ['serpapi-google'] },
};

export function packDisplayName(pack_id: string): string {
  return PACK_DISPLAY_NAMES[pack_id] ?? pack_id;
}

/**
 * Ordered candidate list for auto-inferring which column holds the entity
 * name. First match against the record set's schema wins. Spec Decision §9.
 * The user can still override the choice via the small change-link in the
 * Pack Runner head; the override is persisted per record_set_id.
 */
export const ENTITY_NAME_CANDIDATES: string[] = [
  'Prospect / Organization',
  'Organization',
  'organization',
  'Company',
  'company',
  'Name',
  'name',
  'entity_name',
  'Entity Name',
  'Full Name',
];

/** Pick the first candidate that exists in the supplied schema field names. */
export function inferEntityNameField(fieldNames: string[]): string | null {
  for (const candidate of ENTITY_NAME_CANDIDATES) {
    if (fieldNames.includes(candidate)) return candidate;
  }
  return null;
}
