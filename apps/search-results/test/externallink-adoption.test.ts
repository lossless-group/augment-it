/**
 * search-results — ExternalLink ADOPTION, not ExternalLink behaviour.
 *
 * packages/shared-ui/test/externallink.test.ts owns the contract. This member
 * owns the four call sites, and it is one of only two members in the federation
 * that carried the SECURITY half of the defect: all four of its external links
 * set `target="_blank"` with `rel="noreferrer"` and no `noopener`.
 *
 * That is why the `rel` assertion below is a source assertion and not a
 * rendered one — the thing worth pinning is that this member no longer WRITES
 * its own rel at all, because a call site that writes one is a call site that
 * can drop `noopener` again.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

const ADOPTED = ['src/ResultsAccept.svelte', 'src/TeamAccept.svelte'] as const;

describe('search-results — links that leave the app go through ExternalLink', () => {
  it.each(ADOPTED)('%s imports ExternalLink from shared-ui', (path) => {
    expect(read(path)).toMatch(
      /import ExternalLink from '@augment-it\/shared-ui\/ExternalLink\.svelte'/,
    );
  });

  it.each(ADOPTED)('%s ships no raw target="_blank"', (path) => {
    expect(read(path)).not.toMatch(/target="_blank"/);
  });

  it.each(ADOPTED)('%s writes no rel of its own', (path) => {
    // All four sightings here were rel="noreferrer" with no noopener. The fix
    // is not a better literal — it is that the literal is gone and the security
    // property is the component's, where a call site cannot drop it.
    expect(read(path)).not.toMatch(/rel="/);
  });

  it('the short labels in the staged-person row opt out of truncation', () => {
    // "linkedin" and "bio" are short labels in a wide wrapping row — the case
    // `noTruncate` exists for. Truncation defaults on because these components
    // carry user content, which these two do not.
    const src = read('src/TeamAccept.svelte');
    expect(src).toMatch(/label="linkedin" noTruncate/);
    expect(src).toMatch(/label="bio" noTruncate/);
  });

  it('the .srq-row-title and .srq-url recipes are deleted, not merely unused', () => {
    const css = read('src/app.css');
    expect(css).not.toMatch(/^\.srq-row-title\b/m);
    expect(css).not.toMatch(/^\.srq-url\b/m);
    // A descendant `a` selector left behind would style any future link the
    // component was supposed to own.
    expect(css).not.toMatch(/^\.srq-note a\b/m);
  });
});
