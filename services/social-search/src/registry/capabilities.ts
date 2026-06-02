// The Capability enum — the language the connector registry speaks.
//
// Spec: [[../../../../context-v/specs/Connector-Inventory-and-Per-Record-Palette]]
// §"Code seam — the Connector Registry" → "Capability — the enum of intents".
//
// Intent ≠ connector. A pack declares the intent it serves (e.g.
// `search.social.linkedin` = "find this entity's LinkedIn page"). The
// registry then resolves that intent to one or more connectors that can
// serve it; the pack's `preferred_connectors` chain orders them. Adding a
// new connector for an existing intent is a registration + a config line —
// no pack changes.
//
// Add a capability: one line here, then any connector that serves it lists
// it in its registration's `capabilities[]`. Packs declare which intent
// they want. The per-record palette UI reads `availableFor(intent)` to
// render the connector menu behind each chip.

export type Capability =
  // Generic web
  | 'search.web'
  | 'search.news'
  | 'search.scholar'
  // Social — per platform
  | 'search.social.linkedin'
  | 'search.social.x'
  | 'search.social.bluesky'
  | 'search.social.facebook'
  | 'search.social.instagram'
  | 'search.social.youtube'
  | 'search.social.tiktok'        // future
  | 'search.social.threads'       // future
  // Crawl + extract
  | 'crawl.site'
  | 'crawl.extract'
  // Knowledge / structured
  | 'fetch.knowledge_graph'
  | 'fetch.wikipedia';

// Short labels — the per-record palette alphabet. Two- or three-char-max.
// Locked at the pack level (per spec); customizable per user is a v2
// follow-up. Lives here so connectors AND packs read the same source of
// truth for "what chip should display for intent X."
export const SHORT_LABEL_BY_INTENT: Record<Capability, string> = {
  'search.web': 'w',
  'search.news': 'gn',
  'search.scholar': 'gs',
  'search.social.linkedin': 'in',
  'search.social.x': 'x',
  'search.social.bluesky': 'bs',
  'search.social.facebook': 'f',
  'search.social.instagram': 'ig',
  'search.social.youtube': 'yt',
  'search.social.tiktok': 'tk',
  'search.social.threads': 'th',
  'crawl.site': 'c',
  'crawl.extract': 'cx',
  'fetch.knowledge_graph': 'kg',
  'fetch.wikipedia': 'wp',
};
