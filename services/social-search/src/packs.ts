// Six pack configs for the common-six social packs. Each pack identity is
// distinct in response-store (every ResponseRecord carries its own pack_id);
// the deployment unit is shared (one service, this file routes internally).
//
// Spec: context-v/prompts/Common-Six-Social-Packs.md
//       context-v/blueprints/Packs-and-Bundles-Pattern.md
//
// To add a pack: extend PACKS with a new entry. The pack_id is the public
// handle; the Tavily query template and domain whitelist drive search +
// verification. Confidence scoring is in ./scoring.ts and is generic — the
// whitelist regex is the per-pack input.

export type PackConfig = {
  pack_id: string;
  display_name: string;
  // Domain regex applied to result URL hostname. The +60 Tier-1 contribution
  // in scoring.ts depends on a match here.
  domain_whitelist: RegExp;
  // Tavily query template. {{entity_name}} is the only supported slot for v1.
  tavily_query_template: string;
  // Restrict Tavily search to these domains. Empty = no restriction.
  tavily_include_domains: string[];
};

export const PACKS: Record<string, PackConfig> = {
  'linkedin-pack': {
    pack_id: 'linkedin-pack',
    display_name: 'LinkedIn',
    // Accepts both /in/ (people) and /company/ (orgs) — see "Open calls" in
    // the prompt; single pack covers both, split if scoring gets noisy.
    domain_whitelist: /(^|\.)linkedin\.com$/i,
    tavily_query_template:
      '"{{entity_name}}" site:linkedin.com/in OR site:linkedin.com/company',
    tavily_include_domains: ['linkedin.com'],
  },
  'x-pack': {
    pack_id: 'x-pack',
    display_name: 'X / Twitter',
    domain_whitelist: /(^|\.)(x\.com|twitter\.com)$/i,
    tavily_query_template:
      '"{{entity_name}}" site:x.com OR site:twitter.com',
    tavily_include_domains: ['x.com', 'twitter.com'],
  },
  'bluesky-pack': {
    pack_id: 'bluesky-pack',
    display_name: 'BlueSky',
    domain_whitelist: /(^|\.)bsky\.app$/i,
    tavily_query_template: '"{{entity_name}}" site:bsky.app',
    tavily_include_domains: ['bsky.app'],
  },
  'youtube-pack': {
    pack_id: 'youtube-pack',
    display_name: 'YouTube',
    domain_whitelist: /(^|\.)youtube\.com$/i,
    tavily_query_template:
      '"{{entity_name}}" site:youtube.com/@ OR site:youtube.com/channel OR site:youtube.com/user',
    tavily_include_domains: ['youtube.com'],
  },
  'facebook-pack': {
    pack_id: 'facebook-pack',
    display_name: 'Facebook',
    domain_whitelist: /(^|\.)(facebook\.com|fb\.com)$/i,
    tavily_query_template: '"{{entity_name}}" site:facebook.com',
    tavily_include_domains: ['facebook.com', 'fb.com'],
  },
  'wikipedia-pack': {
    pack_id: 'wikipedia-pack',
    display_name: 'Wikipedia',
    domain_whitelist: /(^|\.)wikipedia\.org$/i,
    tavily_query_template: '"{{entity_name}}" site:en.wikipedia.org',
    tavily_include_domains: ['en.wikipedia.org'],
  },
};

export const PACK_IDS = Object.keys(PACKS);

export function getPack(pack_id: string): PackConfig | undefined {
  return PACKS[pack_id];
}
