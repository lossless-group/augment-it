/**
 * sort-filter-lens — the record-set picker, as executable claims.
 *
 * WRITTEN AGAINST THE MARKUP THAT SHIPS TODAY, before the refactor.
 *
 * `.picker-popover` declares `role="menu"` and its children are shared
 * `Button`s — `role="button"`. It is a `menu` with ZERO `menuitem` children,
 * which a screen reader announces as a structurally broken widget.
 *
 * It is also the wrong organ. The popover picks a *record set* and marks the
 * current one with `aria-current` and a different Button variant. A thing with a
 * selected state is a LISTBOX even when it is drawn as a popdown — so the fix is
 * `listbox` / `option` / `aria-selected`, not `menuitem`.
 *
 * On top of that: no roving tabindex (N tab stops), no arrow keys, no Home/End,
 * no typeahead, and no Escape handler anywhere — the popover cannot be
 * dismissed from the keyboard at all.
 *
 * `rows()` deliberately matches BOTH the shipping markup (a Button per record
 * set) and the target markup (an option per record set), so the keyboard tests
 * fail on "the key moved nothing" rather than on "the element does not exist".
 * A test that dies in its own setup describes the setup, not the defect.
 *
 * These do NOT re-test Selector; packages/shared-ui/test/selector.test.ts owns
 * that contract. These test that sort-filter-lens USES it.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount, tick } from 'svelte';
import App from '../src/App.svelte';
import { RECORD_SETS } from './stubs/workspace';

const ACTIVE_KEY = 'augment-it:active-record-set';
let host: HTMLElement;

/** Mount with a known selection, let the fixture land, then open the picker. */
async function open(selected = 'rs_alpha') {
  localStorage.setItem(ACTIVE_KEY, selected);
  mount(App, { target: host });
  await tick();
  await Promise.resolve();
  await tick();
  const trigger = host.querySelector<HTMLButtonElement>('.record-set-picker button')!;
  trigger.click();
  await tick();
  return trigger;
}

const box = () => host.querySelector<HTMLElement>('[role="listbox"]');
/** One row per record set, in either markup. */
const rows = () =>
  Array.from(
    host.querySelectorAll<HTMLElement>('.picker-popover [role="option"], .picker-popover button'),
  );

const key = async (el: Element, k: string) => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  await tick();
};

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
  host = document.createElement('div');
  document.body.appendChild(host);
});

describe('sfl record-set picker — the right organ, with the right triad', () => {
  it('is a listbox, not a menu — it has a selected state', async () => {
    await open();
    expect(host.querySelectorAll('[role="menu"]')).toHaveLength(0);
    expect(host.querySelectorAll('[role="listbox"]')).toHaveLength(1);
  });

  it('exposes one option per record set, and nothing else', async () => {
    await open();
    expect(rows()).toHaveLength(RECORD_SETS.length);
    expect(rows().map((r) => r.getAttribute('role'))).toEqual(rows().map(() => 'option'));
  });

  it('names the widget', async () => {
    await open();
    expect(box()?.getAttribute('aria-label')).toBeTruthy();
  });

  it('marks exactly one option selected, and it is the active record set', async () => {
    await open('rs_alpha');
    const sel = rows().filter((r) => r.getAttribute('aria-selected') === 'true');
    expect(sel).toHaveLength(1);
    expect(sel[0].textContent).toContain('alpha-2026-01-01.csv');
  });
});

describe('sfl record-set picker — one tab stop, not N', () => {
  it('gives the selected option tabindex=0 and every other tabindex=-1', async () => {
    await open('rs_alpha');
    expect(rows().map((r) => r.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
  });
});

describe('sfl record-set picker — the keyboard', () => {
  it('ArrowDown moves focus to the next record set', async () => {
    await open('rs_alpha');
    await key(rows()[0], 'ArrowDown');
    expect(document.activeElement).toBe(rows()[1]);
  });

  it('End jumps to the last record set', async () => {
    await open('rs_alpha');
    await key(rows()[0], 'End');
    expect(document.activeElement).toBe(rows()[2]);
  });

  it('typeahead jumps to the next record set starting with that letter', async () => {
    await open('rs_alpha');
    await key(rows()[0], 'c');
    expect(document.activeElement).toBe(rows()[2]);
  });

  it('ArrowDown then Enter selects the record set and closes the popover', async () => {
    await open('rs_alpha');
    await key(rows()[0], 'ArrowDown');
    await key(rows()[1], 'Enter');
    expect(host.querySelector('.picker-popover')).toBeNull();
    expect(localStorage.getItem(ACTIVE_KEY)).toBe('rs_bravo');
  });

  it('Escape from the TRIGGER closes the popover and keeps focus there', async () => {
    // The realistic path. Selector--Listbox has no `autofocus` (Selector--Menu
    // just gained one), so opening this popdown leaves focus on the trigger —
    // which means the listbox's own keydown handler is not where Escape lands.
    // Raised, not hand-rolled: the member-level close is on the wrapper, so it
    // catches Escape from the trigger too.
    const trigger = await open('rs_alpha');
    trigger.focus();
    await key(trigger, 'Escape');
    expect(host.querySelector('.picker-popover')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('Escape closes the popover AND returns focus to the trigger', async () => {
    const trigger = await open('rs_alpha');
    rows()[0].focus();
    await key(rows()[0], 'Escape');
    expect(host.querySelector('.picker-popover')).toBeNull();
    // A popup that closes and drops focus to <body> is worse than one that
    // never opened.
    expect(document.activeElement).toBe(trigger);
  });
});
