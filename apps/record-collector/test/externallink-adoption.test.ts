/**
 * record-collector — ExternalLink ADOPTION, not ExternalLink behaviour.
 *
 * packages/shared-ui/test/externallink.test.ts owns the contract.
 *
 * This member is the one with a DELIBERATE holdout, which is the interesting
 * case to pin. `.social-chip` is an `<a>` drawn as a pill — border, radius,
 * surface, a ConfidencePill inside it. That is the interactive-badge shape, a
 * different organ from a link, and the federation has exactly one sighting of
 * it. Adopting ExternalLink there would negate the base recipe rather than
 * adjust it. So the holdout is counted here rather than merely tolerated: add a
 * NEW raw anchor to this file and the count assertion fails instead of the new
 * one hiding behind the old one.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

describe('record-collector — the url_list field goes through ExternalLink', () => {
  it('App imports ExternalLink from shared-ui', () => {
    expect(read('src/App.svelte')).toMatch(
      /import ExternalLink from '@augment-it\/shared-ui\/ExternalLink\.svelte'/,
    );
  });

  it('exactly one raw target="_blank" survives, and it is the chip', () => {
    const src = read('src/App.svelte');
    expect((src.match(/target="_blank"/g) ?? []).length).toBe(1);
    // Pin WHICH one, not just how many — a count alone would pass if the chip
    // were adopted and a fresh raw anchor appeared somewhere else.
    expect(src).toMatch(/class="social-chip"[\s\S]{0,120}target="_blank"/);
  });

  it('the .field-value-url-link recipe keeps only rung-0 layout', () => {
    // Colour, hover, :visited and the overflow/ellipsis/nowrap triplet all
    // deleted. `flex: 1` survives because the link still has to be the growing
    // item beside the chip and the label, and ExternalLink never sets `flex` —
    // so this class does not fight the component.
    const css = read('src/app.css');
    const rule = css.match(/^\.rc-app \.field-value-url-link\s*\{[^}]*\}/m)?.[0] ?? '';
    expect(rule).toMatch(/flex:\s*1/);
    expect(rule).not.toMatch(/color|text-decoration|text-overflow|white-space/);
    expect(css).not.toMatch(/\.field-value-url-link:hover/);
    expect(css).not.toMatch(/\.field-value-url-link:visited/);
  });

  it('the .social-chip recipe is untouched — the holdout keeps its drawing', () => {
    const css = read('src/app.css');
    expect(css).toMatch(/^\.rc-app \.social-chip\s*\{/m);
    expect(css).toMatch(/border-radius:\s*999px/);
  });
});
