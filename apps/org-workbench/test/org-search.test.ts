/**
 * org-workbench OrgSearch — the combobox contract, as executable claims.
 *
 * WRITTEN AGAINST THE MARKUP THAT SHIPS TODAY. Every defect below renders
 * perfectly and none is visible in a screenshot:
 *
 *   1. The <ul> declares role="listbox" and the input declares NOTHING. There is
 *      no role="combobox", no aria-expanded, no aria-controls and no
 *      aria-activedescendant. The role is a promise to a screen-reader user that
 *      this is an arrow-navigable widget; OrgSearch has no keydown handler at
 *      all, so ArrowDown moves nothing. It is the last unfixed composite role
 *      outside shell.
 *   2. The listbox has no options. Its children are <li> wrapping <button>, so a
 *      screen reader is told "listbox, 0 items" over eight visible rows.
 *   3. Those buttons are focusable, so the widget is N+1 tab stops and the first
 *      Tab takes the caret OUT of the input the user is still typing into. That
 *      is the precise thing the combobox pattern forbids.
 *   4. The hand-rolled stale guard — `if (term === q.trim())` — covers the
 *      SUCCESS path only. A stale REJECTION clobbers a newer query's results and
 *      raises an error against a request the user has already moved past.
 *
 * These do NOT re-test the component. packages/shared-ui/test/searchbox.test.ts
 * owns the SearchBox contract in fifteen tests; these test that org-workbench
 * USES it.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount, tick, flushSync } from 'svelte';
import OrgSearch from '../src/OrgSearch.svelte';
import { searchHook } from './stubs/workspace';

const ORGS = [
  { org_id: 'o:1', slug: 'acme-foundation', complete_name: 'Acme Foundation', conventional_name: 'Acme' },
  { org_id: 'o:2', slug: 'acme-trust', complete_name: 'Acme Charitable Trust', conventional_name: null },
  { org_id: 'o:3', slug: 'bedrock-fund', complete_name: 'Bedrock Fund', conventional_name: null },
];

let host: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = '';
  host = document.createElement('div');
  host.className = 'ow-app';
  document.body.appendChild(host);
  searchHook.handler = async () => ORGS;
});
afterEach(() => {
  searchHook.handler = undefined;
});

const input = () => host.querySelector('input') as HTMLInputElement;
const listbox = () => host.querySelector('[role="listbox"]');
const options = () => Array.from(host.querySelectorAll<HTMLElement>('[role="option"]'));
/**
 * The popup's visible text, read WITHOUT assuming role="option" exists.
 *
 * The staleness tests below must be able to fail for exactly one reason — the
 * wrong term's results are on screen. Reading them through `[role="option"]`
 * made them fail with "expected '' to contain 'Bedrock'" today, which is the
 * MISSING-ROLE defect wearing a staleness test's name. This selector matches
 * the <ul class="ow-search-drop"> that ships and the <div role="listbox"> that
 * replaces it.
 */
const popupText = () =>
  host.querySelector<HTMLElement>('[role="listbox"], .ow-search-drop')?.textContent ?? '';

const settle = async (ms = 0) => {
  if (ms) await new Promise((r) => setTimeout(r, ms));
  flushSync();
  await tick();
  await Promise.resolve();
  await tick();
};

function search(props: Record<string, unknown> = {}) {
  mount(OrgSearch, {
    target: host,
    props: { client: 'test-client', onpick: () => {}, ...props },
  });
  return input();
}

/** Real input events — `bind:value` + `oninput` both have to see them. */
async function type(text: string) {
  const el = input();
  el.value = text;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
}

/** A real key event on the input, which is where a combobox's keyboard lives. */
async function key(k: string) {
  input().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  await settle();
}

/** The debounce is 300ms today and the component owns the number. Outlast it. */
const DEBOUNCE_WAIT = 420;

describe('org-workbench OrgSearch — the role triad', () => {
  it('the input is the combobox, not an anonymous text field beside a listbox', async () => {
    const el = search();
    expect(el.getAttribute('role')).toBe('combobox');
  });

  it('announces whether the popup is open', async () => {
    const el = search();
    await settle();
    expect(el.getAttribute('aria-expanded')).toBe('false');
    await type('ac');
    await settle(DEBOUNCE_WAIT);
    expect(el.getAttribute('aria-expanded')).toBe('true');
  });

  it('aria-controls names a listbox that EXISTS, and is absent while closed', async () => {
    const el = search();
    await settle();
    expect(el.getAttribute('aria-controls')).toBeNull();
    await type('ac');
    await settle(DEBOUNCE_WAIT);
    const id = el.getAttribute('aria-controls');
    expect(id).toBeTruthy();
    expect(document.getElementById(id!)).not.toBeNull();
  });

  it('a listbox contains options — not list items wrapping buttons', async () => {
    search();
    await type('ac');
    await settle(DEBOUNCE_WAIT);
    expect(listbox()).not.toBeNull();
    expect(options().length).toBe(ORGS.length);
  });
});

describe('org-workbench OrgSearch — the input keeps focus', () => {
  it('ArrowDown moves the ACTIVE OPTION and leaves the caret in the input', async () => {
    const el = search();
    el.focus();
    await type('ac');
    await settle(DEBOUNCE_WAIT);
    await key('ArrowDown');
    expect(document.activeElement).toBe(el);
    const active = el.getAttribute('aria-activedescendant');
    expect(active).not.toBeNull();
    expect(document.getElementById(active!)).not.toBeNull();
    expect(options()[0].id).toBe(active);
    expect(options()[0].getAttribute('aria-selected')).toBe('true');
  });

  it('ArrowDown advances and wraps, still without moving focus', async () => {
    const el = search();
    el.focus();
    await type('ac');
    await settle(DEBOUNCE_WAIT);
    await key('ArrowDown');
    await key('ArrowDown');
    expect(el.getAttribute('aria-activedescendant')).not.toBeNull();
    expect(options()[1]?.id).toBe(el.getAttribute('aria-activedescendant'));
    for (let i = 0; i < ORGS.length - 1; i++) await key('ArrowDown');
    expect(options()[0]?.id).toBe(el.getAttribute('aria-activedescendant'));
    expect(document.activeElement).toBe(el);
  });

  it('no suggestion is a tab stop — the widget is ONE tab stop', async () => {
    search();
    await type('ac');
    await settle(DEBOUNCE_WAIT);
    const focusable = Array.from(
      host.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])'),
    ).filter((e) => !e.hasAttribute('disabled'));
    expect(focusable).toHaveLength(0);
  });

  it('Enter picks the active option, and Escape closes without moving focus', async () => {
    let picked: string | undefined;
    const el = search({ onpick: (o: { slug: string }) => (picked = o.slug) });
    el.focus();
    await type('ac');
    await settle(DEBOUNCE_WAIT);
    await key('ArrowDown');
    await key('Enter');
    expect(picked).toBe('acme-foundation');

    await type('ac');
    await settle(DEBOUNCE_WAIT);
    await key('Escape');
    expect(listbox()).toBeNull();
    expect(document.activeElement).toBe(el);
  });
});

describe('org-workbench OrgSearch — the hand-rolled stale guard', () => {
  it('drops a stale SUCCESS — this half the member already had right', async () => {
    // `if (term === q.trim()) suggestions = results` is the guard that shipped.
    // On the success path it is correct, and this test is expected to be GREEN
    // before the refactor. It is here so the refactor cannot silently lose it.
    searchHook.handler = (q: string) =>
      q === 'ac'
        ? new Promise((r) => setTimeout(() => r([ORGS[0]]), 200))
        : Promise.resolve([ORGS[2]]);
    search();
    await type('ac');
    await settle(DEBOUNCE_WAIT);
    await type('bedrock');
    await settle(DEBOUNCE_WAIT + 250);
    expect(popupText()).toContain('Bedrock');
    expect(popupText()).not.toContain('Acme Foundation');
  });

  it('drops a stale FAILURE — the half the guard does not cover', async () => {
    // The catch block carries no `term === q.trim()` check, so a rejection for a
    // query the user has already moved past empties `suggestions` and paints an
    // error over results that are correct and on screen.
    searchHook.handler = (q: string) =>
      q === 'ac'
        ? new Promise((_r, reject) => setTimeout(() => reject(new Error('resolver.search failed')), 200))
        : Promise.resolve([ORGS[2]]);
    search();
    await type('ac');
    await settle(DEBOUNCE_WAIT);
    await type('bedrock');
    await settle(DEBOUNCE_WAIT + 250);
    expect(popupText()).toContain('Bedrock');
    expect(host.querySelector('[data-state="error"], .ow-error')).toBeNull();
  });
});
