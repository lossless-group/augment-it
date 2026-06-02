// Boot-time registration of the existing connectors into the new
// capability-style registry.
//
// PARALLEL INFRASTRUCTURE. The existing dispatcher in ../search.ts still
// calls connectors via getConnector(id) from ../connectors/index.ts. This
// file does NOT change that. It registers the same connectors a second
// time into the new registry so the registry has something to resolve
// while the rest of the system is migrated. When packs flip to declaring
// `intent` + `preferred_connectors` (migration step 2), the dispatcher can
// start resolving through the registry instead — at which point the old
// getConnector path becomes the deprecation alias, not the other way
// around.
//
// Each adapter wraps the existing flat-search Connector into the
// ConnectorFn signature (intent-aware). For connectors that serve multiple
// intents differently (SerpApi via engine=), the adapter reads
// `opts.hints?.engine` or branches on `opts.intent` directly.

import type { Capability } from './capabilities';
import type {
  ConnectorFireOpts,
  ConnectorRegistration,
} from './types';
import type { ConnectorRegistry } from './registry';
import { searxngConnector } from '../connectors/searxng';
import { tavilyConnector } from '../connectors/tavily';
import { serpapiConnector } from '../connectors/serpapi';
import { gdeltConnector } from '../connectors/gdelt';

// All of the social-search intents the legacy SearXNG-default packs serve.
// Listed here once so multiple registrations don't redeclare the same set.
const SOCIAL_INTENTS: Capability[] = [
  'search.social.linkedin',
  'search.social.x',
  'search.social.bluesky',
  'search.social.facebook',
  'search.social.instagram',
  'search.social.youtube',
];

const SEARXNG_REG: ConnectorRegistration = {
  id: 'searxng',
  display_name: 'SearXNG (self-hosted)',
  short_label: 'sx',
  capabilities: ['search.web', 'fetch.wikipedia', ...SOCIAL_INTENTS],
  cost_tier: 'free',
  requires_env: [],
  status: 'available',
  fire: async (opts: ConnectorFireOpts) =>
    searxngConnector(opts.query, {
      include_domains: opts.include_domains,
      max_results: opts.max_results,
      signal: opts.signal,
    }),
};

const TAVILY_REG: ConnectorRegistration = {
  id: 'tavily',
  display_name: 'Tavily',
  short_label: 'tv',
  capabilities: ['search.web', 'search.news', 'crawl.site', 'crawl.extract'],
  cost_tier: 'paid',
  requires_env: ['TAVILY_API_KEY'],
  status: 'available',
  fire: async (opts: ConnectorFireOpts) =>
    tavilyConnector(opts.query, {
      include_domains: opts.include_domains,
      max_results: opts.max_results,
      signal: opts.signal,
    }),
};

const SERPAPI_REG: ConnectorRegistration = {
  id: 'serpapi-google',
  display_name: 'SerpApi (Google engine)',
  short_label: 'sp',
  capabilities: [
    'search.web',
    'search.news',
    'search.scholar',
    'fetch.knowledge_graph',
    ...SOCIAL_INTENTS,
  ],
  cost_tier: 'paid',
  requires_env: ['SERPAPI_API_KEY'],
  status: 'available',
  // The connector currently always uses engine='google'. When a caller wants
  // 'google_news' / 'google_scholar', they pass it via opts.hints.engine; the
  // adapter would translate that to the SerpApi `engine` param. The
  // underlying serpapiConnector doesn't yet read hints — that's the gap to
  // close when news / scholar packs adopt the registry path.
  fire: async (opts: ConnectorFireOpts) =>
    serpapiConnector(opts.query, {
      include_domains: opts.include_domains,
      max_results: opts.max_results,
      signal: opts.signal,
    }),
};

const GDELT_REG: ConnectorRegistration = {
  id: 'gdelt',
  display_name: 'GDELT (Doc 2.0)',
  short_label: 'gd',
  capabilities: ['search.news'],
  cost_tier: 'free',
  // GDELT has no auth — soft rate-limit is the constraint, not env vars.
  requires_env: [],
  // Surface a conservative rate hint so the registry can throttle when
  // a future "registry-aware dispatcher" lands.
  rate_hints: { per_second: 0.2, daily_cap: 2000 },
  status: 'available',
  fire: async (opts: ConnectorFireOpts) =>
    gdeltConnector(opts.query, {
      include_domains: opts.include_domains,
      max_results: opts.max_results,
      signal: opts.signal,
    }),
};

// Firecrawl is an extract connector (URL → page data), not a search
// connector. Its current shape doesn't fit ConnectorFn (which expects a
// query + returns ConnectorResult[]). Registration for crawl-style
// capabilities is a step-2 concern when the registry seam adds a sibling
// shape (e.g. CrawlConnectorFn). For now Firecrawl stays out of the
// registry and is invoked directly from the pack (official-blog-pack
// already does this).

export function registerExistingConnectors(registry: ConnectorRegistry): void {
  registry.register(SEARXNG_REG);
  registry.register(TAVILY_REG);
  registry.register(SERPAPI_REG);
  registry.register(GDELT_REG);
}
