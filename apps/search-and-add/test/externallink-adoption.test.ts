/**
 * search-and-add — ExternalLink ADOPTION, not ExternalLink behaviour.
 *
 * packages/shared-ui/test/externallink.test.ts owns the contract. This member
 * is the other half of the federation's SECURITY defect: both of its external
 * links set `target="_blank"` with `rel="noreferrer"` and no `noopener`, so the
 * opened page held `window.opener` access back into ours.
 *
 * The assertion that matters is that this member no longer writes a `rel` at
 * all — a call site that writes one is a call site that can drop `noopener`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

const ADOPTED = ['src/ResultRow.svelte', 'src/App.svelte'] as const;

describe('search-and-add — links that leave the app go through ExternalLink', () => {
  it.each(ADOPTED)('%s imports ExternalLink from shared-ui', (path) => {
    expect(read(path)).toMatch(
      /import ExternalLink from '@augment-it\/shared-ui\/ExternalLink\.svelte'/,
    );
  });

  it.each(ADOPTED)('%s ships no raw target="_blank"', (path) => {
    expect(read(path)).not.toMatch(/target="_blank"/);
  });

  it.each(ADOPTED)('%s writes no rel of its own', (path) => {
    expect(read(path)).not.toMatch(/rel="/);
  });

  it('the link recipes are deleted; only rung-0 layout survives', () => {
    const css = read('src/app.css');
    expect(css).not.toMatch(/^\.saa-row-title\b/m);
    // .saa-scan-url keeps exactly ONE declaration, and it is a property
    // ExternalLink never sets — so it is layout, not a deviation. Without it a
    // long stream URL wraps the Re-scan button onto its own line in the
    // flex-wrap scanbar instead of letting the link shrink.
    const rule = css.match(/^\.saa-scan-url\s*\{[^}]*\}/m)?.[0] ?? '';
    expect(rule).toMatch(/max-inline-size/);
    expect(rule).not.toMatch(/color|text-decoration|font-size|text-overflow/);
  });
});
