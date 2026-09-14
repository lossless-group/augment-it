/**
 * search-and-add — the provider palette, as executable claims.
 *
 * WRITTEN AGAINST THE MARKUP THAT SHIPS TODAY, before the refactor.
 *
 * This is the worst of the nine surfaces in the plan: `role="radiogroup"` whose
 * children are plain `<button>`s. Zero radios. The other eight promise a
 * keyboard and do not deliver one; this one describes a widget that does not
 * exist, and a screen reader announces it as structurally broken.
 *
 * THE ORGAN. Not radios: there is no form, no `name`, no submit, and the `auto`
 * entry is a behavioural default ("let the registry resolve free-tier-first")
 * rather than a value. A real `<input type="radio" name="…">` would also be a
 * hazard in a federated remote — two mounted copies of this member would share
 * one radio-group name and merge into one group. It has a selected state, so it
 * is a LISTBOX, drawn horizontally.
 *
 * Also shipping: selection carried by `class:active` alone and therefore
 * invisible to assistive tech; unavailable providers dimmed with `opacity:0.35`;
 * no roving tabindex; no arrow keys.
 *
 * `rows()` matches BOTH the shipping markup and the target markup so the
 * keyboard tests fail on "the key moved nothing" rather than on "the element
 * does not exist".
 *
 * These do NOT re-test Selector; packages/shared-ui/test/selector.test.ts owns
 * that contract. These test that search-and-add USES it.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount, tick } from 'svelte';
import ProviderPalette from '../src/ProviderPalette.svelte';

// tavily available · brave needs-env (so arrows must SKIP it) · serpapi
// available · a social-only connector that is not search-shaped and must not
// appear at all.
const CONNECTORS = [
  {
    id: 'tavily',
    display_name: 'Tavily',
    short_label: 'tavily',
    capabilities: ['search.web'],
    cost_tier: 'free-tier',
    requires_env: ['TAVILY_API_KEY'],
    status: 'available',
  },
  {
    id: 'brave',
    display_name: 'Brave Search',
    short_label: 'brave',
    capabilities: ['search.web'],
    cost_tier: 'free',
    requires_env: ['BRAVE_API_KEY'],
    status: 'needs-env',
  },
  {
    id: 'serpapi',
    display_name: 'SerpApi',
    short_label: 'serpapi',
    capabilities: ['search.web'],
    cost_tier: 'paid',
    requires_env: ['SERPAPI_KEY'],
    status: 'available',
  },
  {
    id: 'linkedin',
    display_name: 'LinkedIn',
    short_label: 'li',
    capabilities: ['social.profile'],
    cost_tier: 'paid',
    requires_env: [],
    status: 'available',
  },
];

let host: HTMLElement;

function render(selected: string | null = null) {
  mount(ProviderPalette, {
    target: host,
    props: { connectors: CONNECTORS, selected } as Record<string, unknown>,
  });
  return host.querySelector<HTMLElement>('.saa-palette')!;
}

/** One row per palette entry, in either markup. */
const rows = () =>
  Array.from(host.querySelectorAll<HTMLElement>('.saa-palette [role="option"], .saa-palette button'));

const key = async (el: Element, k: string) => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  await tick();
};

beforeEach(() => {
  document.body.innerHTML = '';
  host = document.createElement('div');
  document.body.appendChild(host);
});

describe('saa provider palette — no container role without its required children', () => {
  it('declares no radiogroup, because it declares no radios', async () => {
    render();
    // Today: one radiogroup, zero radios. A radiogroup whose required owned
    // elements are absent is not an incomplete widget, it is a broken one.
    expect({
      radiogroups: host.querySelectorAll('[role="radiogroup"]').length,
      radios: host.querySelectorAll('[role="radio"], input[type="radio"]').length,
    }).toEqual({ radiogroups: 0, radios: 0 });
  });

  it('is a listbox whose every child is an option', async () => {
    render();
    expect(host.querySelectorAll('[role="listbox"]')).toHaveLength(1);
    // auto + the three search-shaped connectors. The social-only connector is
    // filtered out and must not appear.
    expect(rows()).toHaveLength(4);
    expect(rows().map((r) => r.getAttribute('role'))).toEqual(rows().map(() => 'option'));
  });

  it('names the widget and declares it horizontal', async () => {
    const box = host;
    render();
    const lb = box.querySelector('[role="listbox"]');
    expect(lb?.getAttribute('aria-label')).toBe('Search provider');
    // It is a chip ROW. aria-orientation is how a screen reader knows which
    // arrows to promise.
    expect(lb?.getAttribute('aria-orientation')).toBe('horizontal');
  });
});

describe('saa provider palette — selection a screen reader can hear', () => {
  it('marks exactly one option selected, and it is auto by default', async () => {
    render(null);
    const sel = rows().filter((r) => r.getAttribute('aria-selected') === 'true');
    expect(sel).toHaveLength(1);
    expect(sel[0].textContent).toContain('auto');
  });

  it('moves aria-selected when a provider is chosen', async () => {
    render('serpapi');
    const sel = rows().filter((r) => r.getAttribute('aria-selected') === 'true');
    expect(sel).toHaveLength(1);
    expect(sel[0].textContent).toContain('serpapi');
  });

  it('marks an unavailable provider aria-disabled, not merely dimmed', async () => {
    render();
    expect(rows()[2].textContent).toContain('brave');
    expect(rows()[2].getAttribute('aria-disabled')).toBe('true');
  });
});

describe('saa provider palette — one tab stop, not four', () => {
  it('gives the selected option tabindex=0 and every other tabindex=-1', async () => {
    render(null);
    expect(rows().map((r) => r.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1']);
  });
});

describe('saa provider palette — the keyboard', () => {
  it('ArrowRight moves focus to the next provider', async () => {
    render(null);
    await key(rows()[0], 'ArrowRight');
    expect(document.activeElement).toBe(rows()[1]);
  });

  it('ArrowRight SKIPS a provider that cannot fire', async () => {
    render(null);
    await key(rows()[0], 'ArrowRight');
    await key(rows()[1], 'ArrowRight');
    // brave is needs-env, so the next reachable provider is serpapi.
    expect(document.activeElement).toBe(rows()[3]);
  });

  it('End jumps to the last provider', async () => {
    render(null);
    await key(rows()[0], 'End');
    expect(document.activeElement).toBe(rows()[3]);
  });

  it('Enter on the active option selects it', async () => {
    render(null);
    await key(rows()[0], 'ArrowRight');
    await key(rows()[1], 'Enter');
    await tick();
    const sel = rows().filter((r) => r.getAttribute('aria-selected') === 'true');
    expect(sel).toHaveLength(1);
    expect(sel[0].textContent).toContain('tavily');
  });
});
