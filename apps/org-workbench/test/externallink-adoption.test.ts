/**
 * org-workbench — ExternalLink ADOPTION, not ExternalLink behaviour.
 *
 * packages/shared-ui/test/externallink.test.ts owns the contract. This member
 * owns its one call site — and that call site carried the SECURITY half of the
 * federation's defect: `.ow-url` set `target="_blank"` with `rel="noreferrer"`
 * and no `noopener`. It was the only sighting in this group of eight that did.
 *
 * So the `rel` assertion below is a source assertion, not a rendered one. The
 * thing worth pinning is not a better literal — it is that this member no
 * longer WRITES a rel at all, because a call site that writes one is a call
 * site that can drop `noopener` again on the next edit.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

describe('org-workbench — the additive-list URL goes through ExternalLink', () => {
  it('AdditiveList imports ExternalLink from shared-ui', () => {
    expect(read('src/AdditiveList.svelte')).toMatch(
      /import ExternalLink from '@augment-it\/shared-ui\/ExternalLink\.svelte'/,
    );
  });

  it('ships no raw target="_blank" anywhere in src', () => {
    // Whole-member, not one file: a count scoped to AdditiveList would pass if
    // a fresh raw anchor appeared in a sibling component.
    for (const f of ['src/AdditiveList.svelte', 'src/app.css']) {
      expect(read(f)).not.toMatch(/target="_blank"/);
    }
  });

  it('writes no rel of its own — the security property is the component\'s', () => {
    expect(read('src/AdditiveList.svelte')).not.toMatch(/rel="/);
  });

  it('the entry label is the name when there is one, the href display otherwise', () => {
    // `label` defaults to the raw href, which is NOT what this row wants: the
    // list shows a human name when the entry carries one.
    expect(read('src/AdditiveList.svelte')).toMatch(
      /label=\{e\.name \?\? display\(e\.url\)\}/,
    );
  });

  it('the .ow-url recipe keeps only rung-0 layout', () => {
    const css = read('src/app.css');
    const rule = css.match(/^\.ow-url\s*\{[^}]*\}/m)?.[0] ?? '';
    expect(rule).toMatch(/flex:\s*1 1 auto/);
    // Colour, hover, and the overflow/ellipsis/nowrap triplet are the
    // component's now. A member rule that still set them would fight it.
    expect(rule).not.toMatch(/color|text-decoration|text-overflow|white-space|overflow/);
    expect(css).not.toMatch(/\.ow-url:hover/);
    expect(css).not.toMatch(/\.ow-url:visited/);
  });
});
