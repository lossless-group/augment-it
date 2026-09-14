/**
 * person-enrichment — ExternalLink ADOPTION, not ExternalLink behaviour.
 * packages/shared-ui/test/externallink.test.ts owns the contract.
 *
 * One anchor, already carrying `rel="noopener"` — so a ratchet, not a repair.
 *
 * The interesting thing about this member is what it does NOT adopt. The two
 * search controls beside the source link (`google <email>` / `duckduckgo`) open
 * a new tab too, but they do it with `window.open(..., '_blank', 'noopener')`
 * from a <Button onclick>, not with an anchor. They are out of ExternalLink's
 * reach by construction: it renders an <a>, and these are buttons. That is
 * RAISED, not chased — see the assertion at the bottom, which pins the shape so
 * the gap stays visible instead of being rediscovered.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

describe('person-enrichment — the event source link goes through ExternalLink', () => {
  it('App imports ExternalLink from shared-ui', () => {
    expect(read('src/App.svelte')).toMatch(
      /import ExternalLink\s+from '@augment-it\/shared-ui\/ExternalLink\.svelte'/,
    );
  });

  it('ships no raw target="_blank"', () => {
    expect(read('src/App.svelte')).not.toMatch(/target="_blank"/);
  });

  it('writes no rel of its own', () => {
    expect(read('src/App.svelte')).not.toMatch(/rel="/);
  });

  it('"open source" opts out of truncation — a short label in a wide row', () => {
    expect(read('src/App.svelte')).toMatch(
      /<ExternalLink href=\{event\.source_url\} label="open source" noTruncate \/>/,
    );
  });

  it('the .pe-link recipe is deleted, not merely unused', () => {
    const css = read('src/app.css').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toMatch(/^\.pe-link\s*\{/m);
    expect(css).not.toMatch(/\.pe-link:hover/);
    expect(read('src/App.svelte')).not.toMatch(/class="pe-link"/);
  });
});

describe('person-enrichment — the window.open controls are a RAISED gap, not a miss', () => {
  it('the two search controls still open a new tab from a button, not an anchor', () => {
    // Pinned so it stays visible. These carry the SAME defect the component
    // exists to fix — a new tab opens with nothing announcing it to a screen
    // reader — but in a shape ExternalLink cannot cover, because it renders an
    // <a> and these are <Button onclick={...}> calling window.open. Closing it
    // needs an API this rollout is not allowed to add (packages/ is off-limits
    // here). If these ever become anchors, this assertion fails and the newly
    // adoptable links get noticed instead of silently staying raw.
    const src = read('src/App.svelte');
    // Matched to the statement terminator, not with [^)]*: the URL argument
    // contains `encodeURIComponent(...)`, so a negated-paren class stops at the
    // FIRST inner `)` and never reaches the '_blank' it was looking for.
    const opens = src.match(/window\.open\([\s\S]*?\);/g) ?? [];
    expect(opens.length).toBe(2);
    // 'noopener' in the window.open feature string is the button-shaped
    // equivalent of rel="noopener"; losing it is the same security defect.
    for (const call of opens) expect(call).toMatch(/noopener/);
  });
});
