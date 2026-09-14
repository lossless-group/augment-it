/**
 * corpora-curator — ExternalLink ADOPTION, not ExternalLink behaviour.
 *
 * packages/shared-ui/test/externallink.test.ts already owns the contract: the
 * visually-hidden new-tab notice, the merged-never-replaced `rel`, the declared
 * 24px target floor. Re-asserting any of that here would be a second copy of a
 * claim that already has an owner, and the second copy is the one that rots.
 *
 * What this member can get wrong is USING it. A raw `<a target="_blank">` added
 * back tomorrow renders identically to a correct link to a sighted mouse user —
 * which is exactly how 34 of them accumulated across twelve members without
 * anyone noticing. These read this member's own source instead.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

describe('corpora-curator — links that leave the app go through ExternalLink', () => {
  it('SourceDetail imports ExternalLink and ships no raw target="_blank"', () => {
    const src = read('src/SourceDetail.svelte');
    expect(src).toMatch(
      /import ExternalLink from '@augment-it\/shared-ui\/ExternalLink\.svelte'/,
    );
    expect(src).not.toMatch(/target="_blank"/);
  });

  it('the gallery demonstrates the component, not the hand-rolled anchor', () => {
    // The gallery is how another member learns what this one does. Leaving a
    // raw anchor in it teaches the defect to the next reader.
    const src = read('src/gallery/patterns.svelte');
    expect(src).toMatch(
      /import ExternalLink from '@augment-it\/shared-ui\/ExternalLink\.svelte'/,
    );
    expect(src).not.toMatch(/class="cc-urllink"/);
  });

  it('the .cc-urllink recipe is deleted, not merely unused', () => {
    // The deletion is the point of the job. A member that adopts the component
    // and keeps its recipes has added a dependency and removed nothing.
    const css = read('src/app.css');
    expect(css).not.toMatch(/^\.cc-app \.cc-urllink\b/m);
  });
});
