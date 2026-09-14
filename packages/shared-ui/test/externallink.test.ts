/**
 * ExternalLink — written before the component.
 *
 * 34 sightings across 12 members, and measured across all of them:
 *   0  warn a screen reader that the link opens a new tab
 *   7  set target="_blank" without rel="noopener" — the opened page gets
 *      window.opener access back into ours
 *   1  measured at 10x20px, 21% of the WCAG 2.2 SC 2.5.8 target floor
 *
 * None of that is visible in a screenshot, which is why it survived 12 members.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from 'svelte';
import ExternalLink from '../src/ExternalLink.svelte';

let host: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '';
  host = document.createElement('div');
  document.body.appendChild(host);
});
const render = (props: Record<string, unknown>) => {
  mount(ExternalLink, { target: host, props: { href: 'https://example.org', ...props } });
  return host.querySelector('a') as HTMLAnchorElement;
};

describe('ExternalLink — the three defects it exists to stop', () => {
  it('tells assistive tech the link opens a new tab', () => {
    const a = render({ label: 'Annual report' });
    expect(a.textContent).toMatch(/opens in a new tab/i);
  });

  it('the new-tab notice is available to AT but not shouted visually', () => {
    render({ label: 'Annual report' });
    expect(host.querySelector('.ui-extlink__newtab')).not.toBeNull();

    // getComputedStyle cannot see this: the plugin does not inject component CSS
    // into the test document, so every property reads as its initial value. That
    // is the same trap that made an earlier target-size assertion VACUOUS — it
    // passed unconditionally. Here it fails unconditionally, which is louder but
    // no more useful. The claim lives in the source, so assert there.
    const src = readFileSync(resolve('src/ExternalLink.svelte'), 'utf8');
    const rule = src.match(/\.ui-extlink__newtab\s*\{[^}]*\}/)![0];
    expect(rule).toMatch(/position:\s*absolute/);
    // display:none would remove it from the ACCESSIBILITY TREE as well as the
    // page — invisible to exactly the user it exists for, while looking finished.
    expect(rule).not.toMatch(/display:\s*none/);
  });

  it('always sets rel="noopener noreferrer" when it opens a new tab', () => {
    const a = render({ label: 'x' });
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toContain('noopener');
    expect(a.getAttribute('rel')).toContain('noreferrer');
  });

  it('a member cannot accidentally drop rel by passing its own', () => {
    const a = render({ label: 'x', rel: 'nofollow' });
    expect(a.getAttribute('rel')).toContain('noopener');
    expect(a.getAttribute('rel')).toContain('nofollow');
  });

  it('declares a target floor rather than reaching 24px by luck', () => {
    render({ label: 'x' });
    const src = readFileSync(resolve('src/ExternalLink.svelte'), 'utf8');
    expect(src).toMatch(/\.ui-extlink\s*\{[^}]*min-block-size:\s*var\(--control-h-sm\)/);
  });
});

describe('ExternalLink — same-tab is a different thing', () => {
  it('sameTab drops the target, the rel and the notice', () => {
    const a = render({ label: 'x', sameTab: true });
    expect(a.hasAttribute('target')).toBe(false);
    expect(a.textContent).not.toMatch(/new tab/i);
  });
});

describe('ExternalLink — truncation, because these carry user content', () => {
  it('truncates by default without clipping the accessible name', () => {
    const long = 'https://example.org/' + 'a'.repeat(300);
    const a = render({ label: long });
    expect(a.getAttribute('title')).toBe(long);
    const src = readFileSync(resolve('src/ExternalLink.svelte'), 'utf8');
    expect(src).toMatch(/text-overflow:\s*ellipsis/);
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('ExternalLink — iconOnly, the gap that cost two adoptions', () => {
  it('composes the name in the DOM so the new-tab notice survives', () => {
    const a = render({ label: 'Open annual report', iconOnly: true });
    // Not aria-label: that would REPLACE the subtree and take the notice with it.
    expect(a.hasAttribute('aria-label')).toBe(false);
    expect(a.textContent).toContain('Open annual report');
    expect(a.textContent).toMatch(/opens in a new tab/i);
  });

  it('is square and clears the width floor a member could not reach', () => {
    render({ label: 'x', iconOnly: true });
    const src = readFileSync(resolve('src/ExternalLink.svelte'), 'utf8');
    const rule = src.match(/\.ui-extlink\[data-icon\]\s*\{[^}]*\}/)![0];
    expect(rule).toMatch(/min-inline-size:\s*var\(--control-h-sm\)/);
  });

  it('does not truncate an icon', () => {
    const a = render({ label: 'x', iconOnly: true });
    expect(a.hasAttribute('data-truncate')).toBe(false);
  });
});

describe('ExternalLink — inheritColor, for a link inside a coloured container', () => {
  it('declares the opt-out rather than leaving it to specificity', () => {
    const a = render({ label: 'Retry', inheritColor: true });
    expect(a.hasAttribute('data-inherit-color')).toBe(true);
    const src = readFileSync(resolve('src/ExternalLink.svelte'), 'utf8');
    const rule = src.match(/\.ui-extlink\[data-inherit-color\][^{]*\{[^}]*\}/)![0];
    expect(rule).toMatch(/color:\s*inherit/);
  });

  it('covers :visited too, or a followed link breaks the container contrast', () => {
    const src = readFileSync(resolve('src/ExternalLink.svelte'), 'utf8');
    const rule = src.match(/\.ui-extlink\[data-inherit-color\][^{]*\{[^}]*\}/)![0];
    expect(rule).toMatch(/:visited/);
  });

  it('is off unless asked', () => {
    const a = render({ label: 'x' });
    expect(a.hasAttribute('data-inherit-color')).toBe(false);
  });
});
