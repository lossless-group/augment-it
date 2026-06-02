// Bundles — the orchestration unit for source-bound fan-out. A bundle is
// a named composition of packs with a default roster; the user fires the
// bundle, not a list of packs. Per
// [[../../context-v/blueprints/Packs-and-Bundles-Pattern]]:
//
//   - 4-6 default-true packs per bundle (the "common" set for the entity type)
//   - rest opt-in via roster-override
//   - one bundle ↔ one user-facing chat verb (chat verb registration comes
//     from In-App-Chat-v0-0-1; not this file's concern)
//   - bundle_id rides on every ResponseRecord the bundle's packs produce
//
// Public source of truth. Pack Runner duplicates this shape client-side
// (apps/pack-runner/src/bundles.ts) — matches the same one-file-each
// convention as packs.ts. If a bundle lands or its roster changes, update
// both. Future: graduate to packages/bundles/ when a third consumer appears.

export type BundleMember = {
  pack_id: string;
  default: boolean;            // true → roster-checked on bundle load
  pass: 1 | 2;                 // single-pass bundles always 1
  required: boolean;           // true → bundle reports failure if this pack errors
};

export type BundleConfig = {
  bundle_id: string;
  display_name: string;        // shown in the Pack Runner selector
  description: string;         // tooltip / subtitle
  entity_type?: string;        // matches the .common / .nonprofit suffix on chat verbs
  passes: 1 | 2;               // single-pass for v1
  members: BundleMember[];
  // What gets richer when a fan-out succeeds and a human accepts the
  // responses. v1: every pack writes into row.socials per the 2026-05-25
  // design pivot, so every bundle targets ['socials']. Future bundles
  // whose packs write to other columns can list multiple targets here;
  // the Pack Runner UI surfaces the union near the Fire button so the
  // user always knows what column(s) get improved (spec Decision §9).
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

export const BUNDLES: Record<string, BundleConfig> = {
  [PROFILE_BUILDER.bundle_id]: PROFILE_BUILDER,
  [PROFILE_BUILDER_NONPROFIT.bundle_id]: PROFILE_BUILDER_NONPROFIT,
};

export const BUNDLE_IDS = Object.keys(BUNDLES);

export function getBundle(bundle_id: string): BundleConfig | undefined {
  return BUNDLES[bundle_id];
}

/** Effective pack ids for a bundle, given its default roster and an optional override set. */
export function effectivePackIds(bundle: BundleConfig, override?: Set<string>): string[] {
  return bundle.members
    .filter((m) => (override ? override.has(m.pack_id) : m.default))
    .map((m) => m.pack_id);
}
