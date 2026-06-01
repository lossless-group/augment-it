// Pack configs for the common-seven social packs. Each pack identity is
// distinct in response-store (every ResponseRecord carries its own pack_id);
// the deployment unit is shared (one service, this file routes internally).
//
// Spec: context-v/prompts/Common-Six-Social-Packs.md
//       context-v/blueprints/Packs-and-Bundles-Pattern.md
//       context-v/issues/Search-Providers-as-First-Class-SearXNG-Default.md
//
// To add a pack: extend PACKS with a new entry. The pack_id is the public
// handle; `connector` names its default search provider; the query template
// and domain whitelist drive search + verification. Confidence scoring is in
// ./scoring.ts and is generic — the whitelist regex is the per-pack input.
//
// Provider note: the social packs default to SearXNG because Tavily's
// content-RAG index under-represents sparse-text social-profile pages. The
// default is overridable per-fire via `provider_override` on the dispatcher,
// which is how the per-row iteration loop re-fires a pack through a different
// provider without editing this file.

import type { ProviderId } from './connectors/types';

export type PackConfig = {
  pack_id: string;
  display_name: string;
  // Default search provider for this pack. Overridable per-fire.
  connector: ProviderId;
  // Domain regex applied to result URL hostname. The +60 Tier-1 contribution
  // in scoring.ts depends on a match here, and pickCandidate uses it to filter
  // results down to the right platform regardless of which provider ran.
  domain_whitelist: RegExp;
  // Query template. {{entity_name}} is the only supported slot for v1. Kept
  // broad (no quotes, no site: operator) so SearXNG → Google/Bing returns what
  // a manual search finds; the whitelist does the domain gating downstream.
  query_template: string;
  // Server-side domain restriction for connectors that support it (Tavily).
  // SearXNG ignores this and relies on the whitelist. Empty = no restriction.
  include_domains: string[];
};

export const PACKS: Record<string, PackConfig> = {
  'linkedin-pack': {
    pack_id: 'linkedin-pack',
    display_name: 'LinkedIn',
    connector: 'searxng',
    // Accepts both /in/ (people) and /company/ (orgs); single pack covers both.
    domain_whitelist: /(^|\.)linkedin\.com$/i,
    query_template: '{{entity_name}} LinkedIn',
    include_domains: ['linkedin.com'],
  },
  'x-pack': {
    pack_id: 'x-pack',
    display_name: 'X / Twitter',
    connector: 'searxng',
    domain_whitelist: /(^|\.)(x\.com|twitter\.com)$/i,
    query_template: '{{entity_name}} Twitter X',
    include_domains: ['x.com', 'twitter.com'],
  },
  'bluesky-pack': {
    pack_id: 'bluesky-pack',
    display_name: 'BlueSky',
    connector: 'searxng',
    domain_whitelist: /(^|\.)bsky\.app$/i,
    query_template: '{{entity_name}} Bluesky bsky',
    include_domains: ['bsky.app'],
  },
  'youtube-pack': {
    pack_id: 'youtube-pack',
    display_name: 'YouTube',
    connector: 'searxng',
    domain_whitelist: /(^|\.)youtube\.com$/i,
    query_template: '{{entity_name}} YouTube channel',
    include_domains: ['youtube.com'],
  },
  'facebook-pack': {
    pack_id: 'facebook-pack',
    display_name: 'Facebook',
    connector: 'searxng',
    domain_whitelist: /(^|\.)(facebook\.com|fb\.com)$/i,
    query_template: '{{entity_name}} Facebook',
    include_domains: ['facebook.com', 'fb.com'],
  },
  'wikipedia-pack': {
    pack_id: 'wikipedia-pack',
    display_name: 'Wikipedia',
    connector: 'searxng',
    domain_whitelist: /(^|\.)wikipedia\.org$/i,
    query_template: '{{entity_name}} Wikipedia',
    include_domains: ['en.wikipedia.org'],
  },
  'instagram-pack': {
    pack_id: 'instagram-pack',
    display_name: 'Instagram',
    connector: 'searxng',
    // Both instagram.com/ROOT and instagram.com/p/POST share the hostname; the
    // whitelist matches any. The URL-shape verifier can't tell a profile from a
    // post, so the user corrects via the inline URL edit when needed.
    domain_whitelist: /(^|\.)instagram\.com$/i,
    query_template: '{{entity_name}} Instagram',
    include_domains: ['instagram.com'],
  },
};

export const PACK_IDS = Object.keys(PACKS);

export function getPack(pack_id: string): PackConfig | undefined {
  return PACKS[pack_id];
}

// Substitute the entity name into a pack's query template. The only slot.
export function buildQuery(pack: PackConfig, entity_name: string): string {
  return pack.query_template.replace(/\{\{\s*entity_name\s*\}\}/g, entity_name);
}
