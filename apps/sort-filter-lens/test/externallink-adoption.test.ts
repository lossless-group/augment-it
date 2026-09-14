/**
 * sort-filter-lens — ExternalLink ADOPTION, not ExternalLink behaviour.
 *
 * packages/shared-ui/test/externallink.test.ts owns the contract (the
 * visually-hidden new-tab notice, the merged `rel`, the declared 24px floor).
 * This member can only get the ADOPTION wrong, and a regression here is
 * invisible in a screenshot — which is how the defect survived twelve members.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

describe('sort-filter-lens — the row URL goes through ExternalLink', () => {
  it('App imports ExternalLink and ships no raw target="_blank"', () => {
    const src = read('src/App.svelte');
    expect(src).toMatch(
      /import ExternalLink from '@augment-it\/shared-ui\/ExternalLink\.svelte'/,
    );
    expect(src).not.toMatch(/target="_blank"/);
  });

  it('the .row-url recipe is deleted, not merely unused', () => {
    // It hand-copied colour, the overflow/ellipsis/nowrap triplet and a hover —
    // every one of them ExternalLink's. Keeping it would add a dependency and
    // remove nothing.
    const css = read('src/app.css');
    expect(css).not.toMatch(/^\.row-url\s*\{/m);
    expect(css).not.toMatch(/^\.row-url:hover\b/m);
  });

  it('.row-url-row and the inline URL editor survive — they are not link recipes', () => {
    // Guards against over-deletion: the edit affordance beside the link is a
    // separate organ and was never ExternalLink's to own.
    const css = read('src/app.css');
    expect(css).toMatch(/^\.row-url-row\s*\{/m);
    expect(css).toMatch(/^\.row-url-input\s*\{/m);
  });
});
