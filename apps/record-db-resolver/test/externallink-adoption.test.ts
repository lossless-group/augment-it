/**
 * record-db-resolver — ExternalLink ADOPTION, not ExternalLink behaviour.
 *
 * packages/shared-ui/test/externallink.test.ts owns the contract.
 *
 * All four sightings here are in one component, and all four had
 * `rel="noopener"` already — so this member is a RATCHET, not a repair. What
 * is worth pinning is the judgement call instead: RecordCard is the operator's
 * read of the exact values about to be written to a canonical org, so this
 * member has a standing choice to show a URL WHOLE and let it wrap
 * (`word-break: break-all`). ExternalLink truncates by default. Adopting
 * without `noTruncate` would have silently overturned a deliberate design
 * decision with a component default — invisible in review, obvious to the
 * operator comparing two near-identical URLs.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');
const CARD = 'src/components/RecordCard.svelte';

describe('record-db-resolver — all four record URLs go through ExternalLink', () => {
  it('RecordCard imports ExternalLink from shared-ui', () => {
    expect(read(CARD)).toMatch(
      /import ExternalLink from '@augment-it\/shared-ui\/ExternalLink\.svelte'/,
    );
  });

  it('ships no raw target="_blank" anywhere in src', () => {
    for (const f of [CARD, 'src/app.css', 'src/components/CandidateList.svelte']) {
      expect(read(f)).not.toMatch(/target="_blank"/);
    }
  });

  it('writes no rel of its own', () => {
    // These four already had noopener. The ratchet is that there is no longer
    // a literal to drop it from on the next edit.
    expect(read(CARD)).not.toMatch(/rel="/);
  });

  it('adopts all four sightings, not just the easy standalone one', () => {
    // Three of the four are inside {#each} blocks over socials / streams /
    // corpus. A count pins that none was skipped.
    expect((read(CARD).match(/<ExternalLink/g) ?? []).length).toBe(4);
  });
});

describe('record-db-resolver — the whole URL stays visible', () => {
  it('every call site opts out of truncation', () => {
    const tags = read(CARD).match(/<ExternalLink[\s\S]*?\/>/g) ?? [];
    expect(tags.length).toBe(4);
    for (const tag of tags) expect(tag).toMatch(/noTruncate/);
  });

  it('the .rdr-link recipe keeps only the wrapping that makes noTruncate work', () => {
    const css = read('src/app.css');
    const rule = css.match(/^\.rdr-link\s*\{[^}]*\}/m)?.[0] ?? '';
    // break-all is why noTruncate is safe: without it the untruncated URL
    // would overflow the card instead of wrapping inside it.
    expect(rule).toMatch(/word-break:\s*break-all/);
    expect(rule).not.toMatch(/color|text-decoration/);
    expect(css).not.toMatch(/\.rdr-link:hover/);
    expect(css).not.toMatch(/\.rdr-link:visited/);
  });

  it('the survivor rule is in the GLOBAL stylesheet, where a class prop can reach it', () => {
    // records-surface found this the hard way: Svelte scopes a component
    // <style> by hashing a class onto the elements that component renders, and
    // a `class` prop handed to a CHILD gets no hash — so a survivor rule kept
    // in a component <style> is silently dead. `.rdr-link` is passed to
    // ExternalLink, so it MUST live in the global app.css to apply at all.
    expect(read('src/app.css')).toMatch(/^\.rdr-link\s*\{/m);
    expect(read(CARD)).not.toMatch(/^\s*\.rdr-link\s*\{/m);
  });
});
