// Fixture data for the corpora-curator gallery.
//
// WHY THIS FILE HAS A `seed()` AT ALL — and what it is telling you.
//
// Every component in this member reads the `curation` runes singleton rather
// than taking props. That is the house convention (Per-App-Workspace-Conventions:
// single source of truth, components read derived getters and call actions), and
// it is a perfectly good convention for an app. It is a bad one for a component
// LIBRARY: a component whose inputs are ambient cannot be rendered in a state
// its author did not anticipate, which means it cannot be reviewed in one.
//
// Rather than refactor five components to make the gallery look tidy, the
// gallery seeds the singleton and says so — every fixture that needs `seed()`
// shows an "Ambient dependency" note on its Usage tab. That is the honest
// reading: these components ARE isolatable, but only by staging the world
// around them, and the cost of each new state is a hand-written world.
//
// The prop-driven entries in this catalog (the pattern recipes) need none of
// this. That contrast is the argument for pushing presentational leaves —
// rows, chips, fields — down to props, and it is visible here rather than
// asserted in a document.

import { curation } from '../curation.svelte';
import type { Source, Strategy } from '../types';

export const TAG_VOCAB = [
  'Workforce-Development',
  'Work-Based-Learning',
  'Employer-Partnerships',
  'Apprenticeship',
  'Credential-Attainment',
  'Rural-Access',
  'HNWI',
];

export const STRATEGIES: Strategy[] = [
  {
    slug: 'turning-jobs-into-degrees',
    type: 'strategy',
    client_slugs: ['reach-edu'],
    title: 'Turning Jobs Into Degrees',
    tags: ['Work-Based-Learning', 'Credential-Attainment'],
  },
  {
    slug: 'rural-income-mobility',
    type: 'strategy',
    client_slugs: ['reach-edu'],
    title: 'Rural Income Mobility',
    tags: ['Rural-Access'],
  },
  {
    slug: 'employer-of-record-models',
    type: 'strategy',
    client_slugs: ['reach-edu'],
    title: 'Employer-of-Record Models',
    tags: [],
  },
];

export const SOURCES: Source[] = [
  {
    source_uuid: 'src-0001',
    url: 'https://www.brookings.edu/articles/the-degree-is-not-the-job/',
    normalized_url: 'brookings.edu/articles/the-degree-is-not-the-job',
    title: 'The degree is not the job',
    authors: ['Anthony P. Carnevale', 'Nicole Smith'],
    publisher: 'Brookings',
    published_date: '2025-11-04',
    tags: ['Work-Based-Learning', 'Credential-Attainment'],
    status: 'fetched',
    content_pulled: true,
    source_slug: 'the-degree-is-not-the-job',
  },
  {
    source_uuid: 'src-0002',
    url: 'https://example.org/reports/apprenticeship-at-scale-2026.pdf',
    title: 'Apprenticeship at Scale 2026',
    publisher: 'National Skills Coalition',
    published_date: '2026-02-18',
    tags: ['Apprenticeship', 'Employer-Partnerships'],
    status: 'fetched',
    content_pulled: true,
    source_slug: 'apprenticeship-at-scale-2026',
    binary_filename: 'apprenticeship-at-scale-2026.pdf',
    binary_bytes: 4_182_301,
  },
  {
    // The row that exists to be the ugly one: no title, no publisher, a URL
    // long enough to test truncation, and a failed fetch. A gallery whose
    // fixtures are all well-formed is a gallery that has never seen the
    // product.
    source_uuid: 'src-0003',
    url: 'https://www.dol.gov/agencies/eta/apprenticeship/policy/registered-apprenticeship-national-guidelines-standards-of-apprenticeship-2026-revision',
    tags: [],
    status: 'metadata-only',
    verdict_error: true,
  },
  {
    source_uuid: 'src-0004',
    url: 'https://www.rand.org/pubs/research_reports/RRA2214-1.html',
    title: 'Rural Postsecondary Access and the Income Ladder',
    publisher: 'RAND',
    published_date: '2026-01-09',
    tags: ['Rural-Access'],
    status: 'metadata-only',
  },
];

type CurationPatch = Partial<{
  connection: 'idle' | 'connecting' | 'open' | 'closed' | 'error' | 'auth_required';
  lastError: string | null;
  clientSlug: string | null;
  domainType: string;
  strategies: Strategy[];
  activeSlug: string | null;
  sources: Source[];
  focusIdx: number;
  listFilter: string;
  tagVocab: string[];
  saveStatus: string;
}>;

/**
 * Stage the world, then apply the fixture's deltas.
 *
 * Always writes EVERY field, never just the ones a fixture cares about —
 * otherwise the previous fixture's state leaks into the next one and a
 * specimen quietly renders something nobody declared.
 */
export function seed(patch: CurationPatch = {}): void {
  const base: Required<CurationPatch> = {
    connection: 'open',
    lastError: null,
    clientSlug: 'reach-edu',
    domainType: 'strategy',
    strategies: STRATEGIES,
    activeSlug: 'turning-jobs-into-degrees',
    sources: SOURCES,
    focusIdx: 0,
    listFilter: '',
    tagVocab: TAG_VOCAB,
    saveStatus: '',
  };
  Object.assign(curation, base, patch);
}
