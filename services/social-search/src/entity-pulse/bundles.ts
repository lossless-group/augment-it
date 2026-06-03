// Entity Pulse bundles — the orchestration unit for the foundation-first
// four-phase DAG per [[../../../context-v/specs/Entity-Pulse-Bundle]] v0.0.0.5.
//
// Step 1 ships only the standalone `entity-blog` mini-bundle (one pack, no
// rollup, no curation). The full ENTITY_PULSE bundle config materializes as
// later phases land — `entity-blog` is the smallest exercise of the bundle
// machinery for the new pack shape.

import { OFFICIAL_BLOG_PACK_ID } from './packs/official-blog-pack';
import { OFFICIAL_PRESSRELEASE_PACK_ID } from './packs/official-pressrelease-pack';
import { OFFICIAL_SOCIAL_POSTS_PACK_ID } from './packs/official-social-posts-pack';

export type EntityPulseBundleMember = {
  pack_id: string;
  default: boolean;
  pass: 1 | 2 | 3 | 4;
  required: boolean;
  // DAG edges within / across phase boundaries. Empty for Phase 1 packs.
  depends_on?: string[];
  // Which upstream rollup feeds this pack's scoring step. Phase 3 only.
  prior_context?: string;
};

export type EntityPulseBundleConfig = {
  bundle_id: string;
  display_name: string;
  description: string;
  passes: 1 | 2 | 3 | 4;
  members: EntityPulseBundleMember[];
  target_columns: string[];
  relevance_context_default?: string;
};

// Mini-bundle for step-1 testing. Single pack, no rollup, no curation.
// Per spec migration step 1: "Purpose: get the find-index / extract two-stage
// pattern working end-to-end on a real domain with no orchestration complexity."
export const ENTITY_BLOG: EntityPulseBundleConfig = {
  bundle_id: 'entity-blog',
  display_name: 'Entity Blog (test bundle)',
  description: 'Single-pack mini-bundle: find a domain\'s blog/news/press index and pull recent posts. No rollup, no curation, no LLM scoring.',
  passes: 1,
  target_columns: ['official_updates_pulse'],
  members: [
    { pack_id: OFFICIAL_BLOG_PACK_ID, default: true, pass: 1, required: false },
  ],
};

// entity-officials: full Phase-1 OfficialUpdates roster. Step-2 milestone.
// Three packs, still no rollup-agent, still no curation layer. Exercises
// the bundle-level roster pattern (3 packs vs the 1-pack ENTITY_BLOG) so
// Pack Runner's roster checkboxes get a real test before Phase 2 lands.
export const ENTITY_OFFICIALS: EntityPulseBundleConfig = {
  bundle_id: 'entity-officials',
  display_name: 'Entity Officials (test bundle)',
  description: 'Phase-1 OfficialUpdates roster: blog + press releases + own social posts. No rollup, no curation, no LLM scoring yet.',
  passes: 1,
  target_columns: ['official_updates_pulse'],
  members: [
    { pack_id: OFFICIAL_BLOG_PACK_ID,         default: true, pass: 1, required: false },
    { pack_id: OFFICIAL_PRESSRELEASE_PACK_ID, default: true, pass: 1, required: false },
    { pack_id: OFFICIAL_SOCIAL_POSTS_PACK_ID, default: true, pass: 1, required: false },
  ],
};

export const ENTITY_PULSE_BUNDLES: Record<string, EntityPulseBundleConfig> = {
  [ENTITY_BLOG.bundle_id]: ENTITY_BLOG,
  [ENTITY_OFFICIALS.bundle_id]: ENTITY_OFFICIALS,
};
