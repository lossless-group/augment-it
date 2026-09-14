/**
 * docs-portal — ExternalLink ADOPTION, not ExternalLink behaviour.
 * packages/shared-ui/test/externallink.test.ts owns the contract.
 *
 * This member is a HOST: it mounts other members' galleries as federated
 * remotes. The rule for the rollout was that a change must not alter what a
 * GUEST looks like. All three anchors here are the portal's own chrome — the
 * lib bar's "open on <origin>" and the member card's origin footer — so they
 * are in scope; the mounted gallery region is untouched, which the last
 * describe block pins.
 *
 * Two things came out of this member specifically:
 *
 *  1. `.lib-link` measured about 19px tall (font-size 10px, padding 7px 0 0,
 *     no bottom padding) — roughly 79% of the WCAG 2.2 SC 2.5.8 24px floor.
 *     ExternalLink's `min-block-size: var(--control-h-sm)` clears it.
 *  2. `.lib-link` carries a `position: relative` that is REQUIRED by the
 *     SelectWrapper--ClickBody contract, not cosmetic — the wrapper stretches a
 *     pseudo-element across the CardRow and hit-tests each sibling's centre,
 *     console-erroring if one is buried. ExternalLink never sets `position`, so
 *     the survivor keeps working, and the assertion below keeps it from being
 *     tidied away by someone who reads it as leftover cosmetics.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');
const LIBS = 'src/MemberLibraries.svelte';
const noComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const tagsIn = (src: string) => src.match(/<ExternalLink[^>]*>/g) ?? [];

describe('docs-portal — the portal\'s own three links go through ExternalLink', () => {
  it('MemberLibraries imports ExternalLink from shared-ui', () => {
    expect(read(LIBS)).toMatch(
      /import ExternalLink from '@augment-it\/shared-ui\/ExternalLink\.svelte'/,
    );
  });

  it('ships no raw target="_blank"', () => {
    expect(read(LIBS)).not.toMatch(/target="_blank"/);
    expect(read('src/App.svelte')).not.toMatch(/target="_blank"/);
  });

  it('writes no rel of its own', () => {
    expect(read(LIBS)).not.toMatch(/rel="/);
  });

  it('adopts all three', () => {
    expect(tagsIn(read(LIBS)).length).toBe(3);
  });

  it('the error-box link keeps INHERITING the error colour, by a qualified rule', () => {
    // The one place adoption would have changed a measured contrast decision.
    // This link sits on --color-error-bg and inherits --color-error-text; the
    // federal --color-link was never measured against that surface. The old
    // `.lib-error a` was (0,1,1) and would have LOST to the component's
    // (0,2,0), turning the link blue inside a red box with nothing in the diff.
    const css = noComments(read('src/app.css'));
    expect(css).toMatch(/\.portal \.lib-error a\.lib-error-link\s*\{[^}]*color:\s*inherit/);
    // The bare-element descendant form is gone with it.
    expect(css).not.toMatch(/\.lib-error\s+a\s*\{/);
    expect(read(LIBS)).toMatch(/class="lib-error-link"/);
  });

  it('every one opts out of truncation — these are origins, read whole', () => {
    for (const tag of tagsIn(read(LIBS))) expect(tag).toMatch(/noTruncate/);
  });
});

describe('docs-portal — the ↗ glyph is decoration, not part of the name', () => {
  it('each decorative arrow is hidden from assistive tech', () => {
    const src = read(LIBS);
    // The two labelled links keep a visible ↗. Unhidden it would be READ — the
    // accessible name becomes "<origin> north east arrow (opens in a new tab)",
    // announcing the same fact twice, once unpronounceably. `label` carries the
    // real name; the glyph is aria-hidden.
    const arrows = src.match(/<span aria-hidden="true">↗<\/span>/g) ?? [];
    expect(arrows.length).toBe(2);
    expect(src).not.toMatch(/>\s*\{member\.origin\} ↗\s*</);
  });

  it('no call site reaches for aria-label', () => {
    // It would replace the anchor's subtree and take the new-tab notice with it.
    for (const tag of tagsIn(read(LIBS))) expect(tag).not.toMatch(/aria-label/);
  });
});

describe('docs-portal — the .lib-link survivors', () => {
  it('KEEPS position: relative, which the --ClickBody contract requires', () => {
    // Not cosmetic leftovers. The wrapper stretches a pseudo-element across the
    // CardRow; a static sibling sits UNDER it and stops being clickable, and
    // the component console-errors when it hit-tests the centre and finds it
    // buried. ExternalLink does not set `position`, so this still applies to
    // the anchor it renders.
    const rule = noComments(read('src/app.css')).match(/^\.lib-link\s*\{[^}]*\}/m)?.[0] ?? '';
    expect(rule).toMatch(/position:\s*relative/);
    expect(rule).toMatch(/margin-block-start:\s*auto/);
    expect(rule).toMatch(/border-top:/);
  });

  it('drops colour, text-decoration, hover and the DEAD focus-visible outline', () => {
    const css = noComments(read('src/app.css'));
    const rule = css.match(/^\.lib-link\s*\{[^}]*\}/m)?.[0] ?? '';
    expect(rule).not.toMatch(/(?<!-)color:|text-decoration:/);
    expect(css).not.toMatch(/\.lib-link:hover/);
    // `outline: var(--focus-ring, …)` never painted: --focus-ring holds a
    // box-shadow value, so the outline was invalid at computed-value time, and
    // because the property IS defined the comma fallback never applied either.
    // ExternalLink's :focus-visible paints a real box-shadow ring instead.
    expect(css).not.toMatch(/\.lib-link:focus-visible/);
  });

  it('font-size is QUALIFIED with the element, because one class only loses', () => {
    const css = noComments(read('src/app.css'));
    // ExternalLink declares `font-size: inherit` in its scoped style, emitted
    // as `.ui-extlink.svelte-<hash>` — (0,2,0). A one-class `.lib-link` is
    // (0,1,0) and loses SILENTLY; the 10px would have become the inherited
    // 11px with nothing in the diff to show it. `.portal a.lib-link` is (0,2,1).
    expect(css).toMatch(/\.portal a\.lib-link\s*\{[^}]*font-size:\s*10px/);
    const rule = css.match(/^\.lib-link\s*\{[^}]*\}/m)?.[0] ?? '';
    expect(rule).not.toMatch(/font-size:/);
  });
});

describe('docs-portal — the HOST boundary was not crossed', () => {
  it('nothing in the mounted-guest region changed shape', () => {
    // The rollout's rule for this member: a change must not alter what a GUEST
    // looks like. The three adopted anchors are portal chrome. The region that
    // hosts a remote gallery is styled by `.lib-mount*` rules and renders the
    // guest's own markup — no ExternalLink belongs there, and this asserts none
    // crept in.
    // The region is `.lib-host` — the div the remote gallery is mounted INTO
    // (`<div class="lib-host" bind:this={host}>`). Named wrong on the first
    // pass (`.lib-mount`), which is exactly why this asserts the class exists
    // before asserting anything about it: a guard aimed at a selector that does
    // not exist passes forever and guards nothing.
    const css = read('src/app.css');
    expect(css).toMatch(/^\.lib-host\s*\{/m);
    const hostRules = css.match(/\.lib-host[^{]*\{[^}]*\}/g) ?? [];
    expect(hostRules.length).toBeGreaterThan(0);
    for (const rule of hostRules) expect(rule).not.toMatch(/ui-extlink/);
    // The host's job is to get out of the guest's way, nothing more.
    for (const rule of hostRules) expect(rule).not.toMatch(/(?<!-)color:|font-family:/);
    // And no adopted link was placed inside the mounted region.
    expect(read(LIBS)).toMatch(/<div class="lib-host" bind:this=\{host\}><\/div>/);
  });
});
