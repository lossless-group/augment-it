/**
 * shell / JumboPopdown — THE KEYBOARD, NOT THE PIXELS.
 *
 * `shell` is the FEDERATION HOST. Twenty members mount inside this chrome, so a
 * regression in this file's subject is a regression in all of them at once —
 * which is why the plan sequenced shell last.
 *
 * Written BEFORE the refactor and run RED against the markup the member ships
 * today. The defect this describes, stated as an executable claim:
 *
 *   `.panel` declares `role="menu"` and its children ARE `role="menuitem"` — the
 *   triad is correct here, unlike the two ConnectorPalettes. What is missing is
 *   everything the role PROMISES. There is no keydown handler anywhere on the
 *   panel: ArrowDown moves nothing, Home/End move nothing, typeahead does not
 *   exist. Every item is its own `<button>`, so the widget is N tab stops rather
 *   than one. And the only Escape handler is a `document` listener that sets
 *   `open = false` — the focused button is unmounted with the panel and focus
 *   lands on `<body>`, which is the one outcome the loop names as worse than a
 *   popup that never opened.
 *
 * It does NOT re-test `Selector--Menu`. Wrapping, Home/End and typeahead are
 * asserted in packages/shared-ui/test/selector-menu.test.ts. What is asserted
 * here is that THIS MEMBER is wired to that widget.
 *
 * THIRD DESCRIBE, and it is the point of the whole file: `DevelopersMenu` is a
 * CALLER of JumboPopdown, not a surface of its own. The census counted it as one
 * of the nine because `grep 'role='` matched a CODE COMMENT. Asserting the
 * keyboard through the caller is how that claim stops being an argument.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount, tick } from 'svelte';
import JumboPopdown from '../src/JumboPopdown.svelte';
import type { PopdownItem } from '../src/JumboPopdown.svelte';
import DevelopersMenu from '../src/DevelopersMenu.svelte';
import { resolveWsUrl, STUB_WS_URL, resetStub } from './stubs/workspace';

const ITEMS: PopdownItem[] = [
  { id: 'build-corpora', title: 'Build Corpora', description: 'Curate a client corpus from the inbox.' },
  { id: 'augment-records', title: 'Augment Records', description: 'Fire packs against a record set.' },
  { id: 'review-responses', title: 'Review Responses', description: 'Triage what the packs came back with.' },
];

let host: HTMLElement;
let picked: string[];

function render(props: Record<string, unknown> = {}) {
  mount(JumboPopdown, {
    target: host,
    props: { triggerLabel: 'Flows', items: ITEMS, onSelect: (id: string) => picked.push(id), ...props },
  });
}

/** The trigger is the first <button> in document order; the panel follows it. */
const trigger = () => host.querySelector<HTMLElement>('button')!;
const menu = () => host.querySelector<HTMLElement>('[role="menu"]');
/**
 * Spelled so the SAME selector works before and after: today the rows are
 * `<button role="menuitem">`, afterwards `<div role="menuitem">`. A test that
 * could only see one shape would fail because the component was missing rather
 * than because the keyboard was.
 */
const rows = () => Array.from(menu()?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

const press = async (el: Element, key: string, init: KeyboardEventInit = {}) => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));
  await tick();
};

/** The member's own documented open path: click-toggle on the trigger button. */
async function openMenu() {
  trigger().focus();
  trigger().click();
  await tick();
}

beforeEach(() => {
  document.body.innerHTML = '';
  picked = [];
  resetStub();
  host = document.createElement('div');
  document.body.appendChild(host);
});

// ─── the sandbox, asserted ────────────────────────────────────────────────────
describe('the workspace stub is in play', () => {
  it('resolveWsUrl() is the sentinel, not a real service', () => {
    // A config key that is accepted and ignored is indistinguishable from one
    // that worked — right up until it writes to a client.
    expect(resolveWsUrl()).toBe(STUB_WS_URL);
    expect(STUB_WS_URL).toContain('stub.invalid');
  });
});

// ─── harness sanity — green in both worlds ────────────────────────────────────
describe('JumboPopdown — the popdown opens (sanity)', () => {
  it('clicking the trigger opens a named menu carrying every item', async () => {
    render();
    expect(menu()).toBeNull();
    await openMenu();
    expect(menu()).not.toBeNull();
    expect(menu()!.getAttribute('aria-label')).toBe('Flows');
    expect(menu()!.textContent).toContain('Build Corpora');
    expect(menu()!.textContent).toContain('Review Responses');
  });
});

// ─── guard: the role triad was already right here ─────────────────────────────
describe('JumboPopdown — role="menu" over real menuitems', () => {
  it('renders one role="menuitem" per item', async () => {
    render();
    await openMenu();
    expect(rows()).toHaveLength(3);
  });

  it('a menu is ACTIONS — no menuitem carries a selected state', async () => {
    render();
    await openMenu();
    for (const r of rows()) {
      expect(r.hasAttribute('aria-selected')).toBe(false);
      expect(r.hasAttribute('aria-checked')).toBe(false);
    }
  });

  it('each row still carries its title AND its description — this is the "jumbo" half', async () => {
    render();
    await openMenu();
    expect(rows()[0].textContent).toContain('Build Corpora');
    expect(rows()[0].textContent).toContain('Curate a client corpus from the inbox.');
  });
});

// ─── RED: one tab stop ────────────────────────────────────────────────────────
describe('JumboPopdown — the popdown is ONE tab stop, not N', () => {
  it('exactly one row is reachable by Tab; the rest are tabindex="-1"', async () => {
    render();
    await openMenu();
    const tabbable = menu()!.querySelectorAll(
      'button:not([disabled]):not([tabindex="-1"]), [tabindex="0"], a[href]',
    );
    expect(tabbable).toHaveLength(1);
  });
});

// ─── RED: the arrows ──────────────────────────────────────────────────────────
describe('JumboPopdown — arrow keys move the active row, and focus follows', () => {
  it('ArrowDown advances one row', async () => {
    render();
    await openMenu();
    rows()[0].focus();
    await press(document.activeElement!, 'ArrowDown');
    expect(document.activeElement).toBe(rows()[1]);
  });

  it('ArrowUp from the first row wraps to the last, and stays inside the menu', async () => {
    render();
    await openMenu();
    rows()[0].focus();
    await press(document.activeElement!, 'ArrowUp');
    expect(document.activeElement).toBe(rows()[2]);
    expect(menu()!.contains(document.activeElement)).toBe(true);
  });

  it('arrowing to a row and pressing Enter selects THAT item', async () => {
    render();
    await openMenu();
    rows()[0].focus();
    await press(document.activeElement!, 'ArrowDown');
    await press(document.activeElement!, 'Enter');
    expect(picked).toEqual(['augment-records']);
  });
});

// ─── RED: Escape ──────────────────────────────────────────────────────────────
describe('JumboPopdown — Escape closes and returns focus to the trigger', () => {
  it('Escape closes the panel', async () => {
    render();
    await openMenu();
    rows()[0].focus();
    await press(document.activeElement!, 'Escape');
    expect(menu()).toBeNull();
  });

  it('focus lands back on the trigger that opened it — never on <body>', async () => {
    render();
    await openMenu();
    const t = trigger();
    rows()[0].focus();
    await press(document.activeElement!, 'Escape');
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(t);
  });
});

// ─── RED: the keyboard is reachable at all ────────────────────────────────────
describe('JumboPopdown — opening from the keyboard puts focus IN the widget', () => {
  it('a click-opened panel focuses its first row, so arrows work without a mouse', async () => {
    // A popup whose keydown handler is on the panel, opened with focus still on
    // the trigger, has a widget whose entire keyboard is unreachable.
    render();
    await openMenu();
    expect(menu()!.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(rows()[0]);
  });
});

// ─── guard: the mouse path must not regress ───────────────────────────────────
describe('JumboPopdown — clicking a row still selects and closes (guard)', () => {
  it('a click fires onSelect with that id and closes the panel', async () => {
    render();
    await openMenu();
    rows()[2].click();
    await tick();
    expect(picked).toEqual(['review-responses']);
    expect(menu()).toBeNull();
  });
});

// ─── DevelopersMenu is a CALLER, not a tenth surface ──────────────────────────
describe('DevelopersMenu — inherits the keyboard through JumboPopdown', () => {
  function renderDev() {
    mount(DevelopersMenu, {
      target: host,
      props: { wsHttpBase: 'http://stub.invalid/ws', onOpenDesignSystem: () => {} },
    });
  }

  it('declares no role of its own — the census entry matched a code comment', async () => {
    // Before this file existed, `shell/DevelopersMenu` was counted as one of the
    // nine broken surfaces. It has never declared a composite role: the grep hit
    // a comment. Fixing JumboPopdown fixes it, and this asserts that rather than
    // arguing it.
    renderDev();
    expect(host.querySelector('[role="menu"]')).toBeNull();
    const t = host.querySelector<HTMLElement>('button')!;
    t.click();
    await tick();
    expect(host.querySelector('[role="menu"]')).not.toBeNull();
  });

  it('is ONE tab stop and its arrows move focus', async () => {
    renderDev();
    const t = host.querySelector<HTMLElement>('button')!;
    t.focus();
    t.click();
    await tick();
    const m = host.querySelector<HTMLElement>('[role="menu"]')!;
    const r = Array.from(m.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    expect(r.length).toBeGreaterThan(1);
    expect(
      m.querySelectorAll('button:not([disabled]):not([tabindex="-1"]), [tabindex="0"], a[href]'),
    ).toHaveLength(1);
    r[0].focus();
    await press(document.activeElement!, 'ArrowDown');
    expect(document.activeElement).toBe(r[1]);
  });
});
