/**
 * A REACTIVE affiliation fixture.
 *
 * `.svelte.ts` because a plain object passed as a mount prop is not a $state
 * proxy: AffiliationCard does `bind:value={affiliation.completeName}` and
 * `affiliation.activeOrgId = null`, and against a plain object those writes
 * land without re-running anything that reads them. The card renders, the
 * assertions run, and the test reports whatever the first paint happened to
 * say — the same "verified an empty surface" failure the Button loop warns
 * about, in test form.
 */
import type { AffiliationState, OrgSuggestion } from '../src/lib/types';

export function affiliationFixture(over: Partial<AffiliationState> = {}): AffiliationState {
  // `$state(...)` must be a variable-declaration initializer — `return $state({…})`
  // is a compile error, not a runtime one, so it takes the whole suite out.
  const s = $state({
    uiId: 'fixture-1',
    expanded: true,
    role: 'board',
    activeOrgId: null,
    completeName: '',
    conventionalName: '',
    orgLinks: [],
    orgCorpus: [],
    orgDomains: [],
    affiliationCreated: false,
    autoDetectedFrom: null,
    ...over,
  });
  return s;
}

export const ORGS: OrgSuggestion[] = [
  { id: 'organizations:ihs', complete_name: 'Institute for Humane Studies', conventional_name: 'IHS' },
  { id: 'organizations:ihf', complete_name: 'Institute for Humane Futures', conventional_name: null },
  { id: 'organizations:bedrock', complete_name: 'Bedrock Fund', conventional_name: null },
];
