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
      'Augment It uses AI to turn thin lists — names, emails, organizations — into rich, researched profiles. Point it at your data and it fills in the details, keeps everything organized, and stays private to you. No technical skills required.',
  },

  changelog: {
    title: "What's New",
    description:
      'The latest features and improvements in Augment It, in plain language.',
  },

  contextV: {
    title: 'Behind the Build',
    description:
      'The ideas, plans, and decisions behind how Augment It gets made.',
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
  alt: 'Augment It — AI that turns simple lists into rich, researched profiles',
} as const;
