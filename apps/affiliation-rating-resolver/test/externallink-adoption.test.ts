/**
 * affiliation-rating-resolver — ExternalLink ADOPTION, not ExternalLink
 * behaviour. packages/shared-ui/test/externallink.test.ts owns the contract.
 *
 * Four sightings, one per link list (person links / person corpus / org links /
 * org corpus), all four byte-identical and all four already carrying
 * `rel="noopener"`. So this member is a ratchet rather than a repair, and the
 * thing actually worth pinning is the CSS it left behind.
 *
 * The recipe here was `.arr-link-list a` — a DESCENDANT selector on the bare
 * element. That is the shape that outlives a migration: it is a standing claim
 * on every anchor that ever lands in one of these lists, including the one
 * ExternalLink renders and every future one the component is meant to own. The
 * federation has hit it before; search-results' suite asserts its `.srq-note a`
 * is gone for the same reason. Replaced here with an explicit class, so the
 * rung-0 survivors apply on purpose or not at all.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

describe('affiliation-rating-resolver — all four link lists go through ExternalLink', () => {
  it('App imports ExternalLink from shared-ui', () => {
    expect(read('src/App.svelte')).toMatch(
      /import ExternalLink from '@augment-it\/shared-ui\/ExternalLink\.svelte'/,
    );
  });

  it('ships no raw target="_blank"', () => {
    expect(read('src/App.svelte')).not.toMatch(/target="_blank"/);
    expect(read('src/app.css')).not.toMatch(/target="_blank"/);
  });

  it('writes no rel of its own', () => {
    expect(read('src/App.svelte')).not.toMatch(/rel="/);
  });

  it('adopts all four lists, not three of them', () => {
    // The four are byte-identical and easy to half-migrate. Person links,
    // person corpus, org links, org corpus.
    expect((read('src/App.svelte').match(/<ExternalLink/g) ?? []).length).toBe(4);
  });

  it('every call site opts out of truncation', () => {
    // These are the canonical links an operator is RATING — a truncated URL is
    // the wrong default when the decision depends on reading it whole.
    const tags = read('src/App.svelte').match(/<ExternalLink[\s\S]*?\/>/g) ?? [];
    expect(tags.length).toBe(4);
    for (const tag of tags) expect(tag).toMatch(/noTruncate/);
  });
});

describe('affiliation-rating-resolver — the descendant-a recipe is gone', () => {
  it('no bare-element selector claims links in these lists any more', () => {
    // Comments stripped first: the replacement rule's own comment NAMES the
    // selector it replaced, and a raw match on the file caught that prose and
    // failed. A commented-out selector is not a live one — assert on the rules.
    const css = read('src/app.css').replace(/\/\*[\s\S]*?\*\//g, '');
    // THE assertion of this file. A descendant `a` would still style the anchor
    // ExternalLink renders, which is the component and the member fighting over
    // the same element — and it would silently capture any future link too.
    expect(css).not.toMatch(/\.arr-link-list\s+a\b/);
  });

  it('the replacement .arr-link recipe keeps only rung-0 layout and wrapping', () => {
    const css = read('src/app.css');
    const rule = css.match(/^\.arr-link\s*\{[^}]*\}/m)?.[0] ?? '';
    expect(rule).toMatch(/flex:\s*1/);
    expect(rule).toMatch(/word-break:\s*break-all/);
    expect(rule).not.toMatch(/color|text-decoration/);
    // ExternalLink already declares min-inline-size: 0; re-declaring it here
    // would be the member restating the component's own rule.
    expect(rule).not.toMatch(/min-inline-size/);
  });

  it('the survivor lives in the GLOBAL stylesheet, where a class prop can reach it', () => {
    // records-surface found this the hard way: Svelte scopes a component
    // <style> by hashing a class onto the elements THAT component renders, and
    // a `class` prop handed to a child gets no hash — so the rule would be
    // silently dead. `.arr-link` is passed to ExternalLink, so it must be here.
    expect(read('src/app.css')).toMatch(/^\.arr-link\s*\{/m);
    expect(read('src/App.svelte')).not.toMatch(/<style/);
  });
});
