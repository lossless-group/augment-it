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
  pass: 1 | 2;
  required: boolean;
};

export type BundleConfig = {
  bundle_id: string;
  display_name: string;
  description: string;
  entity_type?: string;
  passes: 1 | 2;
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

export const BUNDLES: BundleConfig[] = [PROFILE_BUILDER, PROFILE_BUILDER_NONPROFIT];

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
