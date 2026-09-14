/**
 * record-collector — the two DECLARED raw-<button> disclosures.
 *
 * WRITTEN AGAINST THE MARKUP THAT SHIPS TODAY. Both holdouts carry a comment in
 * RecordSetsList.svelte saying they stay raw because "a disclosure wrapper is a
 * separate organ and has been raised as one." That organ now exists, so what
 * was a correct deferral becomes a defect list:
 *
 *   1. NO aria-controls AT ALL. Neither head associates itself with the region
 *      it toggles, so a screen reader is told a state and never told of what.
 *   2. The chevron glyph — `▸` / `▾` — is TEXT inside the button, so it lands in
 *      the accessible name: "▸ Earlier generations (2 archived)".
 *   3. NO declared target-size floor. .rs-archive-head was measured at 27px and
 *      clears the WCAG 2.2 SC 2.5.8 24px floor only because `padding: 0.3rem`
 *      happens to add up. The file's own comment calls that luck; this asserts
 *      a contract instead.
 *
 * These do NOT re-test DisclosureRow — packages/shared-ui/test/disclosure.test.ts
 * owns that contract. These test that record-collector USES it.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount, flushSync, tick } from 'svelte';
import RecordSetsList from '../src/components/RecordSetsList.svelte';
import type { RecordSet } from '../test/stubs/workspace';

let host: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  host = document.createElement('div');
  host.className = 'rc-app';
  document.body.appendChild(host);
});

// A leaf with one archived predecessor, inside a variant family — the one shape
// that renders BOTH holdouts at once.
const rs = (over: Partial<RecordSet>): RecordSet =>
  ({
    record_set_id: 'x',
    name: 'set',
    archived: false,
    created_at: '2026-09-01T00:00:00Z',
    variant_family_id: null,
    variant_family_label: null,
    promoted_from: null,
    schema: { fields: [] },
    row_ids: [],
    ...over,
  }) as RecordSet;

const FIXTURE: RecordSet[] = [
  rs({ record_set_id: 'gen1', name: 'investors gen 1', archived: true, created_at: '2026-08-01T00:00:00Z' }),
  rs({
    record_set_id: 'gen2',
    name: 'investors gen 2',
    variant_family_id: 'fam-investors',
    variant_family_label: 'Investors',
    promoted_from: { record_set_ids: ['gen1'] },
  }),
];

function render(recordSets: RecordSet[] = FIXTURE) {
  mount(RecordSetsList, {
    target: host,
    props: {
      recordSets,
      selectedId: null,
      onselect: () => {},
      ondelete: () => {},
      onrefresh: () => {},
      onRenameFamily: () => {},
      onDissolveFamily: () => {},
    },
  });
  flushSync();
}

const disclosures = () => Array.from(host.querySelectorAll<HTMLButtonElement>('button[aria-expanded]'));
const byName = (re: RegExp) => disclosures().find((b) => re.test(b.textContent ?? ''))!;

describe('record-collector — the family group header', () => {
  it('renders as a real button with a disclosure contract, not a pressed one', () => {
    render();
    const head = byName(/Investors/);
    expect(head).toBeTruthy();
    expect(head.tagName).toBe('BUTTON');
    expect(head.getAttribute('type')).toBe('button');
    expect(head.hasAttribute('aria-pressed')).toBe(false);
  });

  it('associates itself with the region it toggles, and that region exists', async () => {
    render();
    const head = byName(/Investors/);
    expect(head.getAttribute('aria-expanded')).toBe('true'); // families start open
    const id = head.getAttribute('aria-controls');
    expect(id).toBeTruthy();
    expect(document.getElementById(id!)).not.toBeNull();
  });

  it('drops aria-controls rather than dangling it once collapsed', async () => {
    render();
    const head = byName(/Investors/);
    head.click();
    flushSync();
    await tick();
    expect(head.getAttribute('aria-expanded')).toBe('false');
    const id = head.getAttribute('aria-controls');
    if (id !== null) expect(document.getElementById(id)).not.toBeNull();
  });

  it('keeps the chevron glyph out of its accessible name', () => {
    render();
    const head = byName(/Investors/);
    expect(head.textContent ?? '').not.toMatch(/[▾▸▴▿]/);
    expect(head.querySelector('[data-chevron]')?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('record-collector — the earlier-generations archive header', () => {
  it('declares a target-size floor instead of clearing 24px by luck', () => {
    render();
    const arch = byName(/Earlier generations/);
    expect(arch).toBeTruthy();
    // Measured raw at 27px — 3px of clearance over the WCAG 2.2 SC 2.5.8 floor,
    // contributed entirely by a `padding: 0.3rem` that was never chosen for that
    // reason. jsdom does no layout, so asserting a PIXEL height here would be a
    // test that cannot fail; `getComputedStyle(...).minBlockSize` returns '' for
    // every element in this environment and passes vacuously either way.
    // What CAN be asserted is the thing that actually replaces the luck: this is
    // the shared organ's own row, and `min-block-size: var(--control-h-md)` is
    // declared there and asserted by packages/shared-ui/test/disclosure.test.ts.
    expect(arch.classList.contains('ui-disclosure__row')).toBe(true);
  });

  it('associates itself with the list it toggles once open', async () => {
    render();
    const arch = byName(/Earlier generations/);
    expect(arch.getAttribute('aria-expanded')).toBe('false'); // archives start closed
    expect(arch.getAttribute('aria-controls')).toBeNull();
    arch.click();
    flushSync();
    await tick();
    expect(arch.getAttribute('aria-expanded')).toBe('true');
    const id = arch.getAttribute('aria-controls');
    expect(id).toBeTruthy();
    expect(document.getElementById(id!)).not.toBeNull();
  });

  it('keeps the chevron glyph out of its accessible name', () => {
    render();
    const arch = byName(/Earlier generations/);
    expect(arch.textContent ?? '').not.toMatch(/[▾▸▴▿]/);
    expect(arch.querySelector('[data-chevron]')?.getAttribute('aria-hidden')).toBe('true');
  });
});
