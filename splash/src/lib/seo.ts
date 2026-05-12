/**
 * Static SEO copy for the augment-it splash. Centralized so MetaTags + index
 * hero read from one source of truth.
 */

export const STATIC_SEO = {
  brand: 'Augment It',
  titleSuffix: ' — Augment It',
  siteName: 'Augment It',

  root: {
    title: 'Augment It',
    description:
      'A microfrontend workshop for augmenting data with AI. Module-federated apps for prompts, requests, responses, highlights, and insights — composed by a single shell.',
  },

  changelog: {
    title: 'Changelog',
    description:
      'What shipped, when, and why — entry-by-entry notes for augment-it.',
  },

  contextV: {
    title: 'Context Vigilance',
    description:
      'Specs, habits, and reflections shaping how augment-it gets built.',
  },
} as const;

/**
 * Default OG image lives in /public/. If/when a generated banner ships,
 * point this at it (matches the lfm/splash convention).
 */
export const DEFAULT_OG = {
  url: 'trademark__Augment-It--Banner.png',
  width: 1200,
  height: 630,
  type: 'image/png',
  alt: 'Augment It — module-federated AI data augmentation',
} as const;
