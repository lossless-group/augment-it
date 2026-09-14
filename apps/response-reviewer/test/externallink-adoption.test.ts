/**
 * response-reviewer — ExternalLink ADOPTION, not ExternalLink behaviour.
 * packages/shared-ui/test/externallink.test.ts owns the contract.
 *
 * Eight sightings, the most of any member in the federation, and the only
 * member carrying all THREE call-site shapes at once: two icon links, five URL
 * rows, and one labelled link in a list. All eight already had `noopener
 * noreferrer`, so this is a ratchet rather than a repair — and the interesting
 * findings are in the CSS, not the markup:
 *
 *  - `ul.links li a` was a descendant selector on the bare element, the shape
 *    that silently outlives a migration and captures the component's own
 *    anchor. Replaced with an explicit class.
 *  - `.cr-url` needed a monospace face, and hit a genuine SPECIFICITY TIE:
 *    ExternalLink declares font-family and font-size in its scoped style at
 *    (0,2,0), and `.resp-app .cr-url` is also (0,2,0), so the winner was
 *    stylesheet injection order. Qualifying with the element — `a.cr-url`,
 *    (0,2,1) — makes it deterministic. That is rung 2, not rung 4: no `style=`
 *    and no `data-deviation`. It is asserted below because the tie is silent
 *    and resolves correctly about half the time, which is the worst failure
 *    mode a style rule can have.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');
const APP = 'src/App.svelte';
const noComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * Every <ExternalLink ...> opening tag, whether self-closing or not.
 *
 * NOT `/<ExternalLink[\s\S]*?\/>/`: the two icon links close with `>` rather
 * than `/>` because they take a child (the ↗ glyph), so a non-greedy run to
 * `/>` sails straight past them and swallows the NEXT self-closing tag too.
 * That made a 5-tag assertion see 6 and fail for the wrong reason.
 */
const tagsIn = (src: string) => src.match(/<ExternalLink[^>]*>/g) ?? [];

describe('response-reviewer — all eight links go through ExternalLink', () => {
  it('App imports ExternalLink from shared-ui', () => {
    expect(read(APP)).toMatch(
      /import ExternalLink from '@augment-it\/shared-ui\/ExternalLink\.svelte'/,
    );
  });

  it('ships no raw target="_blank"', () => {
    expect(read(APP)).not.toMatch(/target="_blank"/);
  });

  it('writes no rel of its own', () => {
    expect(read(APP)).not.toMatch(/rel="/);
  });

  it('adopts all eight, not the easy ones', () => {
    // Five of the eight sit in nested {#if}/{#each} branches that only render
    // for one outcome — easy to migrate the visible ones and miss the rest.
    expect((read(APP).match(/<ExternalLink/g) ?? []).length).toBe(8);
  });
});

describe('response-reviewer — the two icon links use iconOnly', () => {
  it('both pass iconOnly and neither names the anchor with aria-label', () => {
    const tags = tagsIn(read(APP)).filter((t) => /iconOnly/.test(t));
    expect(tags.length).toBe(2);
    // aria-label would REPLACE the anchor's subtree and take the
    // visually-hidden new-tab notice with it — the defect the component exists
    // to stop, reintroduced by the fix.
    for (const tag of tags) expect(tag).not.toMatch(/aria-label/);
  });

  it('each icon link is named by the URL it opens, not by the glyph', () => {
    // Unlabelled, the accessible name would be the ↗ character, which a screen
    // reader announces as "north east arrow".
    const tags = tagsIn(read(APP)).filter((t) => /iconOnly/.test(t));
    expect(tags.length).toBe(2);
    for (const tag of tags) expect(tag).toMatch(/label=\{/);
  });

  it('the .record-url-open recipe keeps only the border box', () => {
    const css = noComments(read('src/app.css'));
    const rule = css.match(/\.resp-app \.record-url-open\s*\{[^}]*\}/)?.[0] ?? '';
    // The border is the one thing ExternalLink never sets, so it is the one
    // thing left to keep.
    expect(rule).toMatch(/border:\s*1px solid/);
    // Centring, colour and text-decoration are [data-icon]'s now. `color` and
    // `font-size` in particular are dropped rather than kept, because they
    // would have TIED with the component at (0,2,0).
    expect(rule).not.toMatch(/display:|align-items:|justify-content:|text-decoration:/);
    // `(?<!-)color:` and not `color`: the surviving rule legitimately contains
    // `var(--color-border)`, and a bare /color/ matched the TOKEN NAME.
    expect(rule).not.toMatch(/(?<!-)color:/);
    expect(rule).not.toMatch(/font-size:/);
  });
});

describe('response-reviewer — truncation is chosen per row, not by accident', () => {
  it('the five URL rows opt out of truncation', () => {
    // These display an exact_url or a candidate URL the operator is comparing
    // character by character against what a fetch returned.
    const tags = tagsIn(read(APP)).filter((t) => /cr-url|candidate-url/.test(t));
    expect(tags.length).toBe(5);
    for (const tag of tags) expect(tag).toMatch(/noTruncate/);
  });

  it('the helpful-links row KEEPS the default truncation it used to hand-roll', () => {
    // This is the one that should truncate: a labelled link in a fixed row
    // beside a note and a remove button. It had its own
    // nowrap/overflow/ellipsis triplet; that is now the component's default,
    // so the correct adoption passes nothing.
    const tag = tagsIn(read(APP)).find((t) => /class="link-url"/.test(t)) ?? '';
    expect(tag).toBeTruthy();
    expect(tag).not.toMatch(/noTruncate/);
  });
});

describe('response-reviewer — the CSS findings', () => {
  it('no descendant bare-element selector claims links in the helpful-links list', () => {
    const css = noComments(read('src/app.css'));
    // The shape that outlives a migration. It would style the anchor
    // ExternalLink renders AND silently capture any future link in the list.
    expect(css).not.toMatch(/ul\.links\s+li\s+a\b/);
    const rule = css.match(/\.resp-app \.link-url\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/flex:\s*0 1 auto/);
    expect(rule).not.toMatch(/white-space:|overflow:|text-overflow:|(?<!-)color:|min-width:/);
  });

  it('.cr-url QUALIFIES with the element, because a class alone only ties', () => {
    const css = noComments(read('src/app.css'));
    // THE assertion of this file. ExternalLink declares font-family and
    // font-size in its scoped style, which Svelte emits as
    // `.ui-extlink.svelte-<hash>` — (0,2,0). A member rule `.resp-app .cr-url`
    // is also (0,2,0), so which one won came down to stylesheet injection
    // order. `a.cr-url` is (0,2,1) and wins by the cascade rather than by luck.
    expect(css).toMatch(/\.resp-app a\.cr-url\s*\{/);
    expect(css).not.toMatch(/\.resp-app \.cr-url\s*\{/);
    const rule = css.match(/\.resp-app a\.cr-url\s*\{[^}]*\}/)![0];
    expect(rule).toMatch(/font-family:\s*var\(--font-mono\)/);
    // overflow-wrap is what makes noTruncate safe on these four — untruncated,
    // the URL has to wrap inside the card instead of overflowing it.
    expect(rule).toMatch(/overflow-wrap:\s*anywhere/);
    expect(rule).not.toMatch(/(?<!-)color:|text-decoration:/);
  });

  it('the deleted recipes are gone, not merely unused', () => {
    const css = noComments(read('src/app.css'));
    for (const sel of [
      /\.cr-url:hover/,
      /\.candidate-url:hover/,
      // (?<!-) so this rules out `color:` without also matching the
      // `border-color:` the hover rule is SUPPOSED to keep.
      /\.record-url-open:hover\s*\{[^}]*(?<!-)color:/,
    ]) {
      expect(css).not.toMatch(sel);
    }
    // .candidate-url keeps ONLY its wrapping.
    const rule = css.match(/\.resp-app \.candidate-url\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/word-break:\s*break-all/);
    expect(rule).not.toMatch(/(?<!-)color:|text-decoration:/);
  });
});
