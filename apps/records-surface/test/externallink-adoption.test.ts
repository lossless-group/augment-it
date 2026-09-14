/**
 * records-surface — ExternalLink ADOPTION, not ExternalLink behaviour.
 *
 * packages/shared-ui/test/externallink.test.ts owns the contract.
 *
 * This member is where the component's `iconOnly` mode came from. The first
 * pass adopted the two TEXT links here and then REFUSED the two ICON links,
 * recording two blockers in the CSS — either alone sufficient:
 *
 *   1. naming an icon link needs an `aria-label`, and an aria-label REPLACES
 *      the anchor's subtree, taking the visually-hidden new-tab notice with it
 *      — so the member would have lost the one thing it adopted for;
 *   2. ExternalLink declares `min-inline-size: 0` in its own scoped style at
 *      (0,2,0), so `.candidate-open` at (0,1,0) could not have kept the 24px
 *      width floor it had won by hand. Adopting would have turned a measured
 *      WCAG 2.2 SC 2.5.8 pass into a measured failure.
 *
 * That refusal was correct, and it is why `iconOnly` exists. This suite pins
 * the close: both icon links now go through the component, and the two things
 * the refusal protected — the notice and the floor — are asserted as still
 * true, so a future edit that reaches for `aria-label` here fails loudly.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

const ADOPTED = [
  'src/components/RecordRow.svelte',
  'src/components/CandidatesPanel.svelte',
] as const;

describe('records-surface — every link that leaves the app goes through ExternalLink', () => {
  it.each(ADOPTED)('%s imports ExternalLink from shared-ui', (path) => {
    expect(read(path)).toMatch(
      /import ExternalLink from '@augment-it\/shared-ui\/ExternalLink\.svelte'/,
    );
  });

  it.each(ADOPTED)('%s ships no raw target="_blank"', (path) => {
    expect(read(path)).not.toMatch(/target="_blank"/);
  });

  it.each(ADOPTED)('%s writes no rel of its own', (path) => {
    // Both sightings here already had `noopener noreferrer`, so this is not a
    // fix — it is a ratchet. A call site that writes its own rel is a call site
    // that can drop noopener on the next edit; this member no longer has one.
    expect(read(path)).not.toMatch(/rel="/);
  });
});

describe('records-surface — the two icon links use iconOnly, not aria-label', () => {
  it.each(ADOPTED)('%s passes iconOnly rather than naming the anchor', (path) => {
    const src = read(path);
    expect(src).toMatch(/<ExternalLink[^>]*iconOnly/);
    // THE regression this member refused to ship. aria-label would replace the
    // anchor's subtree and take the visually-hidden new-tab notice with it —
    // the exact defect ExternalLink exists to stop, reintroduced by the fix.
    //
    // Scoped to the ExternalLink tags, NOT the whole file: a file-wide match
    // failed here on the Remove <Button aria-label="Remove {a}">, which is a
    // correct name on a button with no notice to lose. The bug this guards is
    // specifically aria-label ON the component.
    for (const tag of src.match(/<ExternalLink[\s\S]*?>/g) ?? []) {
      expect(tag).not.toMatch(/aria-label/);
    }
  });

  it('names each icon link by its href rather than by the glyph', () => {
    // Without a label the accessible name would be the ↗ character, which a
    // screen reader reads as "north east arrow". `label` makes it the URL.
    expect(read('src/components/RecordRow.svelte')).toMatch(
      /<ExternalLink href=\{url\} label=\{url\} iconOnly>/,
    );
    expect(read('src/components/CandidatesPanel.svelte')).toMatch(
      /label=\{c\.url\} iconOnly>/,
    );
  });
});

describe('records-surface — the hand-rolled recipes are deleted, not merely unused', () => {
  it('.record-row-url-open is gone entirely — it had nothing rung-0 to keep', () => {
    const src = read('src/components/RecordRow.svelte');
    expect(src).not.toMatch(/^\s*\.record-row-url-open\s*\{/m);
    expect(src).not.toMatch(/\.record-row-url-open:hover/);
    // And the class is off the call site too, not left dangling on the element.
    expect(src).not.toMatch(/class="record-row-url-open"/);
  });

  it('.candidate-open is gone, and no survivor rule is left in a component <style>', () => {
    const src = read('src/components/CandidatesPanel.svelte');
    expect(src).not.toMatch(/^\s*\.candidate-open\s*\{/m);
    expect(src).not.toMatch(/\.candidate-open:hover/);
    expect(src).not.toMatch(/class="candidate-open"/);
  });

  it('neither icon link passes a class to ExternalLink from a component <style>', () => {
    // The trap this member found. Svelte scopes a <style> block by hashing a
    // class onto the elements the component ITSELF renders; a `class` prop
    // handed to a CHILD lands on the child's element and gets no hash, so the
    // rule never matches and svelte-check reports "Unused CSS selector".
    //
    // The first group never hit this because every survivor it kept
    // (`.ow-url`, `.field-value-url-link`) lives in a GLOBAL app.css. A future
    // adoption here that keeps a survivor must put it in app.css or :global()
    // it — this assertion is what stops it being kept silently dead instead.
    for (const path of ADOPTED) {
      const src = read(path);
      if (!/<style/.test(src)) continue;
      for (const tag of src.match(/<ExternalLink[\s\S]*?>/g) ?? []) {
        expect(tag).not.toMatch(/\sclass=/);
      }
    }
  });

  it('the 24px target floor is the COMPONENT\'s, and it is still declared there', () => {
    // The refusal protected a measured WCAG 2.2 SC 2.5.8 pass. Adoption only
    // stays safe while [data-icon] keeps declaring the floor — if that rule
    // ever loses it, this member silently regresses to the 10x20 it started at.
    const ext = readFileSync(
      resolve(__dirname, '../../../packages/shared-ui/src/ExternalLink.svelte'),
      'utf8',
    );
    const rule = ext.match(/\.ui-extlink\[data-icon\]\s*\{[^}]*\}/)![0];
    expect(rule).toMatch(/min-inline-size:\s*var\(--control-h-sm\)/);
    expect(ext).toMatch(/min-block-size:\s*var\(--control-h-sm\)/);
  });
});
