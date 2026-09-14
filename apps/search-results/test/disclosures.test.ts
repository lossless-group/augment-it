/**
 * search-results — the queue card's disclosure, as executable claims.
 *
 * WRITTEN AGAINST THE MARKUP THAT SHIPS TODAY. The card has TWO controls that
 * both claim to disclose the same region, and between them three defects that
 * render perfectly:
 *
 *   1. The row passes `aria-expanded` into SelectWrapper--ClickBody, which
 *      hard-renders `aria-pressed` BEFORE its {...rest}. One button therefore
 *      announces a toggle-button contract AND a disclosure contract at once —
 *      the exact error DisclosureRow's own header names. This is the SECOND
 *      instance of that shape in the federation (org-workbench's person row is
 *      the first), which is what makes it evidence rather than an oddity.
 *   2. NEITHER control carries `aria-controls`, and `.srq-card-body` has no id
 *      at all, so nothing associates the state with the region it governs.
 *   3. Two controls, one region: whatever the contract is, it has to be the
 *      SAME on both, or a screen reader gets two different stories about one
 *      piece of the page.
 *
 * These do NOT re-test DisclosureRow — packages/shared-ui/test/disclosure.test.ts
 * owns that contract. These test what search-results announces.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount, flushSync, tick } from 'svelte';
import SearchCard from '../src/SearchCard.svelte';
import type { SearchCard as SearchCardT } from '../src/lib/types';

let host: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = '';
  host = document.createElement('div');
  host.className = 'srq-app';
  document.body.appendChild(host);
});

const CARD: SearchCardT = {
  search_id: 'srq-1',
  entity: { org_slug: 'acme-foundation', display_name: 'Acme Foundation' },
  target: 'links',
  client: 'test-client',
  status: 'failed', // terminal, so toggling does not reach for results
  submitted_at: '2026-09-01T00:00:00Z',
  started_at: '2026-09-01T00:00:01Z',
  finished_at: '2026-09-01T00:00:09Z',
  error: 'the crawl failed',
  result_summary: null,
  typical_ms: 8000,
};

function render(card: SearchCardT = CARD) {
  mount(SearchCard, {
    target: host,
    props: { card, client: 'test-client', now: Date.parse('2026-09-01T00:00:09Z'), ondismiss: () => {} },
  });
  flushSync();
}

const caret = () => host.querySelector<HTMLButtonElement>('.srq-card-side button[aria-expanded]')!;
const body = () => host.querySelector<HTMLElement>('.srq-card-body');

describe('search-results card — one region, one contract', () => {
  it('no control on the card carries BOTH aria-pressed and aria-expanded', () => {
    render();
    const confused = Array.from(host.querySelectorAll('button')).filter(
      (b) => b.hasAttribute('aria-pressed') && b.hasAttribute('aria-expanded'),
    );
    expect(confused).toHaveLength(0);
  });

  it('exactly one control claims the disclosure contract', () => {
    render();
    expect(host.querySelectorAll('button[aria-expanded]')).toHaveLength(1);
  });
});

describe('search-results card — the caret', () => {
  it('associates itself with the card body once expanded, and that body exists', async () => {
    render();
    const c = caret();
    expect(c.getAttribute('aria-expanded')).toBe('false');
    expect(body()).toBeNull();
    c.click();
    flushSync();
    await tick();
    expect(c.getAttribute('aria-expanded')).toBe('true');
    const id = c.getAttribute('aria-controls');
    expect(id).toBeTruthy();
    expect(document.getElementById(id!)).not.toBeNull();
    expect(document.getElementById(id!)).toBe(body());
  });

  it('does not dangle aria-controls while collapsed', () => {
    render();
    const id = caret().getAttribute('aria-controls');
    if (id !== null) expect(document.getElementById(id)).not.toBeNull();
  });

  it('names two cards’ bodies distinctly — an id is unique per document', async () => {
    // TWO DISTINCT CARDS. The first draft of this test mounted the same
    // search_id twice and failed on identical ids — which was the test being
    // wrong, not the member: two renders of one card SHOULD name one body.
    render();
    render({ ...CARD, search_id: 'srq-2' }); // a queue is a list of cards
    const carets = Array.from(host.querySelectorAll<HTMLButtonElement>('.srq-card-side button[aria-expanded]'));
    expect(carets).toHaveLength(2);
    for (const c of carets) {
      c.click();
      flushSync();
    }
    await tick();
    const ids = carets.map((c) => c.getAttribute('aria-controls'));
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(document.getElementById(id!)).not.toBeNull();
  });
});
