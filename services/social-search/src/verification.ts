// URL-shape verification. Tier-1 contribution to the confidence score —
// a candidate URL with a hostname matching the pack's domain whitelist is
// strong evidence the result is on the right platform.
//
// Spec: context-v/blueprints/Packs-and-Bundles-Pattern.md §Confidence pill

import type { PackConfig } from './packs';

export type VerificationOutcome = {
  tier_1_match: boolean;
  hostname: string | null;
  normalized_url: string;
};

/**
 * Check whether `url` matches the pack's domain whitelist. Also strip query
 * strings and trailing slashes for storage so the same canonical URL doesn't
 * appear twice across multiple pack runs.
 */
export function verifyUrl(pack: PackConfig, url: string): VerificationOutcome {
  let hostname: string | null = null;
  let normalized_url = url;
  try {
    const u = new URL(url);
    hostname = u.hostname;
    // Strip search + hash for canonical form. Keep the path.
    normalized_url = `${u.protocol}//${u.hostname}${u.pathname}`.replace(/\/$/, '');
  } catch {
    // Malformed URL — caller decides whether to keep it. We just don't
    // confer a Tier-1 match.
    return { tier_1_match: false, hostname: null, normalized_url };
  }
  return {
    tier_1_match: pack.domain_whitelist.test(hostname),
    hostname,
    normalized_url,
  };
}
