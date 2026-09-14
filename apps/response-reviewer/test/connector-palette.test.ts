/**
 * response-reviewer / ConnectorPalette — THE KEYBOARD, NOT THE PIXELS.
 *
 * This file was written BEFORE the refactor and run RED against the markup the
 * member ships today. That is the whole method: `Selector` is behaviour with a
 * little appearance, so a defect here looks like NOTHING HAPPENING, and nothing
 * happening is exactly what a screenshot shows when everything is fine.
 *
 * The defect this describes, stated as an executable claim:
 *
 *   `.palette-menu` declares `role="menu"` and its children are a header div, a
 *   `<ul>` of `<li><button>`, and a footer div. There is not one
 *   `role="menuitem"` in it, there is no keydown handler anywhere on the popup,
 *   and every enabled connector is its own tab stop. `role="menu"` is a promise
 *   to a screen-reader user — *arrows move within this, Tab leaves it* — and the
 *   member delivers a list of tab stops and an Escape key that does nothing.
 *
 * It does NOT re-test `Selector--Menu`. Home/End/typeahead/wrapping are asserted
 * 32 times over in packages/shared-ui/test/selector-menu.test.ts. What is
 * asserted here is that THIS MEMBER is wired to that widget: its rows are
 * menuitems, its widget is one tab stop, its arrows move focus, and its Escape
 * hands focus back to the chip that opened it.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount, tick } from 'svelte';
import ConnectorPalette from '../src/ConnectorPalette.svelte';
import type { PaletteConnector, PalettePack } from '../src/ConnectorPalette.svelte';

const INVENTORY: PaletteConnector[] = [
  { id: 'serpapi',  display_name: 'SerpApi',       short_label: 'SA', capabilities: ['search.social'], cost_tier: 'paid',      requires_env: ['SERPAPI_KEY'], status: 'available' },
  { id: 'brave',    display_name: 'Brave Search',  short_label: 'BR', capabilities: ['search.social'], cost_tier: 'free-tier', requires_env: ['BRAVE_KEY'],   status: 'available' },
  { id: 'searxng',  display_name: 'SearXNG',       short_label: 'SX', capabilities: ['search.social'], cost_tier: 'free',      requires_env: [],              status: 'available' },
  { id: 'tavily',   display_name: 'Tavily',        short_label: 'TV', capabilities: ['search.social'], cost_tier: 'paid',      requires_env: ['TAVILY_KEY'],  status: 'needs-env' },
];

const PACKS: PalettePack[] = [
  { pack_id: 'social', display_name: 'Social profiles', intent: 'search.social', short_label: 'S', preferred_connectors: ['serpapi', 'brave'] },
];

let host: HTMLElement;
let fired: Array<[string, string | undefined]>;

function render(props: Record<string, unknown> = {}) {
  mount(ConnectorPalette, {
    target: host,
    props: {
      row_id: 'row-1',
      packs: PACKS,
      inventory: INVENTORY,
      accepted_pack_ids: new Set<string>(),
      busy_pack_ids: new Set<string>(),
      on_fire: (pack_id: string, connector_id?: string) => fired.push([pack_id, connector_id]),
      ...props,
    },
  });
}

const chip = () => host.querySelector<HTMLElement>('.connector-chip')!;
const menu = () => host.querySelector<HTMLElement>('[role="menu"]');

/**
 * The interactive rows of the popup, spelled so the SAME selector works before
 * and after the refactor: today they are `<button class="palette-menu-item">`,
 * afterwards they are `[role="menuitem"]`. A test that could only see one of the
 * two shapes would fail because the component was missing, not because the
 * keyboard was.
 */
const rows = () =>
  Array.from(menu()?.querySelectorAll<HTMLElement>('[role="menuitem"], button.palette-menu-item') ?? []);

const press = async (el: Element, key: string, init: KeyboardEventInit = {}) => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));
  await tick();
};

/** Real key event on the chip — this is the member's own documented open path. */
async function openMenu() {
  chip().focus();
  await press(chip(), 'ArrowDown');
}

beforeEach(() => {
  document.body.innerHTML = '';
  fired = [];
  host = document.createElement('div');
  document.body.appendChild(host);
});

// ─── harness sanity — these pass BEFORE the refactor too ──────────────────────
describe('ConnectorPalette — the popup opens (sanity, green in both worlds)', () => {
  it('ArrowDown on a chip opens the connector menu for that pack', async () => {
    render();
    expect(menu()).toBeNull();
    await openMenu();
    expect(menu()).not.toBeNull();
    expect(menu()!.textContent).toContain('SerpApi');
    expect(menu()!.textContent).toContain('Tavily');
  });

  it('the popup is named for the pack it belongs to', async () => {
    render();
    await openMenu();
    expect(menu()!.getAttribute('aria-label')).toContain('Social profiles');
  });
});

// ─── RED: the role triad ──────────────────────────────────────────────────────
describe('ConnectorPalette — role="menu" must have menuitem children', () => {
  it('renders one role="menuitem" per available connector', async () => {
    render();
    await openMenu();
    expect(host.querySelectorAll('[role="menuitem"]')).toHaveLength(4);
  });

  it('a menu is ACTIONS — no menuitem carries a selected state', async () => {
    render();
    await openMenu();
    for (const r of host.querySelectorAll('[role="menuitem"]')) {
      expect(r.hasAttribute('aria-selected')).toBe(false);
      expect(r.hasAttribute('aria-checked')).toBe(false);
    }
  });

  it('an unavailable connector is aria-disabled, not merely dimmed', async () => {
    render();
    await openMenu();
    const items = Array.from(host.querySelectorAll('[role="menuitem"]'));
    expect(items[3]?.getAttribute('aria-disabled')).toBe('true');
    expect(items[0]?.hasAttribute('aria-disabled')).toBe(false);
  });
});

// ─── RED: one tab stop ────────────────────────────────────────────────────────
describe('ConnectorPalette — the popup is ONE tab stop, not N', () => {
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
describe('ConnectorPalette — arrow keys move the active row, and focus follows', () => {
  it('ArrowDown advances one row', async () => {
    render();
    await openMenu();
    const before = rows();
    expect(before.length).toBeGreaterThan(1);
    before[0].focus();
    await press(document.activeElement!, 'ArrowDown');
    expect(document.activeElement).toBe(rows()[1]);
  });

  it('ArrowUp from the first row wraps to the last reachable one', async () => {
    render();
    await openMenu();
    rows()[0].focus();
    await press(document.activeElement!, 'ArrowUp');
    expect(document.activeElement).not.toBe(rows()[0]);
    expect(menu()!.contains(document.activeElement)).toBe(true);
  });

  it('arrowing to a row and pressing Enter fires THAT connector', async () => {
    render();
    await openMenu();
    rows()[0].focus();
    await press(document.activeElement!, 'ArrowDown');
    expect(document.activeElement).toBe(rows()[1]);
    await press(document.activeElement!, 'Enter');
    expect(fired).toEqual([['social', 'brave']]);
  });
});

// ─── RED: Escape ──────────────────────────────────────────────────────────────
describe('ConnectorPalette — Escape closes the popup and returns focus to the chip', () => {
  it('Escape closes it', async () => {
    render();
    await openMenu();
    rows()[0].focus();
    await press(document.activeElement!, 'Escape');
    expect(menu()).toBeNull();
  });

  it('focus lands back on the chip that opened it — never on <body>', async () => {
    render();
    await openMenu();
    const trigger = chip();
    rows()[0].focus();
    await press(document.activeElement!, 'Escape');
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(trigger);
  });
});

// ─── guard: the mouse path must not regress ───────────────────────────────────
describe('ConnectorPalette — clicking a row still fires the override (guard)', () => {
  it('a click on a row fires on_fire(pack_id, connector_id) and closes the popup', async () => {
    render();
    await openMenu();
    rows()[2].click();
    await tick();
    expect(fired).toEqual([['social', 'searxng']]);
    expect(menu()).toBeNull();
  });

  it('clicking an unavailable connector fires nothing', async () => {
    render();
    await openMenu();
    rows()[3].click();
    await tick();
    expect(fired).toEqual([]);
  });
});
