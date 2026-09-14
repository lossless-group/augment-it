/**
 * SearchBox — the combobox keyboard contract, written before the components.
 *
 * The claim that separates this from every other selection organ here: THE INPUT
 * KEEPS FOCUS. Selector moves focus to the option; this cannot, because the user
 * is still typing. So the assertions below check activeElement stays put while
 * aria-activedescendant moves.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, tick } from 'svelte';
import LiveFilter from '../src/SearchBox--LiveFilter.svelte';
import Autocomplete from '../src/SearchBox--Autocomplete.svelte';

const OPTIONS = [
  { id: 'apple', label: 'Apple' },
  { id: 'apricot', label: 'Apricot' },
  { id: 'banana', label: 'Banana' },
];

let host: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '';
  host = document.createElement('div');
  document.body.appendChild(host);
});

const input = () => host.querySelector('input') as HTMLInputElement;
const opts = () => Array.from(host.querySelectorAll<HTMLElement>('[role="option"]'));
const listbox = () => host.querySelector('[role="listbox"]');

async function type(text: string) {
  const el = input();
  el.value = text;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  await tick();
}
async function key(k: string) {
  input().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  await tick();
}

describe('SearchBox--LiveFilter — the role triad', () => {
  it('the input is the combobox', async () => {
    mount(LiveFilter, { target: host, props: { options: OPTIONS, label: 'Fruit' } });
    expect(input().getAttribute('role')).toBe('combobox');
    expect(input().getAttribute('aria-label')).toBe('Fruit');
  });

  it('starts closed and says so', async () => {
    mount(LiveFilter, { target: host, props: { options: OPTIONS, label: 'Fruit' } });
    expect(input().getAttribute('aria-expanded')).toBe('false');
    expect(listbox()).toBeNull();
  });

  it('aria-controls names a listbox that EXISTS once open', async () => {
    mount(LiveFilter, { target: host, props: { options: OPTIONS, label: 'Fruit' } });
    await type('ap');
    const id = input().getAttribute('aria-controls');
    expect(id).toBeTruthy();
    expect(document.getElementById(id!)).not.toBeNull();
  });
});

describe('SearchBox--LiveFilter — the input keeps focus', () => {
  it('ArrowDown moves the ACTIVE OPTION, never focus', async () => {
    mount(LiveFilter, { target: host, props: { options: OPTIONS, label: 'Fruit' } });
    input().focus();
    await type('ap');
    await key('ArrowDown');
    expect(document.activeElement).toBe(input());
    expect(input().getAttribute('aria-activedescendant')).toBe(opts()[0].id);
    expect(opts()[0].getAttribute('aria-selected')).toBe('true');
  });

  it('no option is ever a tab stop', async () => {
    mount(LiveFilter, { target: host, props: { options: OPTIONS, label: 'Fruit' } });
    await type('ap');
    await key('ArrowDown');
    for (const o of opts()) expect(o.getAttribute('tabindex')).not.toBe('0');
  });

  it('ArrowDown advances, and wraps', async () => {
    mount(LiveFilter, { target: host, props: { options: OPTIONS, label: 'Fruit' } });
    input().focus();
    await type('ap');
    await key('ArrowDown');
    await key('ArrowDown');
    expect(input().getAttribute('aria-activedescendant')).toBe(opts()[1].id);
    await key('ArrowDown');
    expect(input().getAttribute('aria-activedescendant')).toBe(opts()[0].id);
    expect(document.activeElement).toBe(input());
  });
});

describe('SearchBox--LiveFilter — filtering and picking', () => {
  it('narrows the list as you type', async () => {
    mount(LiveFilter, { target: host, props: { options: OPTIONS, label: 'Fruit' } });
    await type('ap');
    expect(opts()).toHaveLength(2);
    await type('apr');
    expect(opts()).toHaveLength(1);
  });

  it('Enter picks the active option', async () => {
    let picked: string | undefined;
    mount(LiveFilter, {
      target: host,
      props: { options: OPTIONS, label: 'Fruit', onselect: (id: string) => (picked = id) },
    });
    await type('ap');
    await key('ArrowDown');
    await key('Enter');
    expect(picked).toBe('apple');
  });

  it('Enter with NO active option does not pick — that is the member submit', async () => {
    let picked: string | undefined;
    mount(LiveFilter, {
      target: host,
      props: { options: OPTIONS, label: 'Fruit', onselect: (id: string) => (picked = id) },
    });
    await type('ap');
    await key('Enter');
    expect(picked).toBeUndefined();
  });

  it('Escape closes, and focus never left so nothing is returned', async () => {
    mount(LiveFilter, { target: host, props: { options: OPTIONS, label: 'Fruit' } });
    input().focus();
    await type('ap');
    await key('Escape');
    expect(listbox()).toBeNull();
    expect(document.activeElement).toBe(input());
  });
});

describe('SearchBox--Autocomplete — the states LiveFilter does not have', () => {
  it('does not query below the minimum length', async () => {
    const lookup = vi.fn(async () => OPTIONS);
    mount(Autocomplete, { target: host, props: { lookup, label: 'Orgs', minLength: 2, debounceMs: 0 } });
    await type('a');
    await new Promise((r) => setTimeout(r, 10));
    expect(lookup).not.toHaveBeenCalled();
  });

  it('queries once the minimum is met, and shows what comes back', async () => {
    const lookup = vi.fn(async () => OPTIONS);
    mount(Autocomplete, { target: host, props: { lookup, label: 'Orgs', minLength: 2, debounceMs: 0 } });
    await type('ap');
    await new Promise((r) => setTimeout(r, 20));
    await tick();
    expect(lookup).toHaveBeenCalledWith('ap');
    expect(opts()).toHaveLength(3);
  });

  it('DROPS A STALE RESPONSE — the guard two members hand-rolled', async () => {
    // "aa" resolves slowly; "aardvark" resolves fast. Without a sequence guard
    // the slow one lands last and replaces correct results with stale ones.
    const lookup = vi.fn((term: string) =>
      term === 'aa'
        ? new Promise<typeof OPTIONS>((r) => setTimeout(() => r([OPTIONS[0]]), 40))
        : Promise.resolve([OPTIONS[2]]),
    );
    mount(Autocomplete, { target: host, props: { lookup, label: 'Orgs', minLength: 2, debounceMs: 0 } });
    await type('aa');
    await type('aardvark');
    await new Promise((r) => setTimeout(r, 80));
    await tick();
    expect(opts()).toHaveLength(1);
    expect(opts()[0].textContent).toContain('Banana');
  });

  it('reports a failed lookup instead of pretending there are no results', async () => {
    const lookup = vi.fn(async () => { throw new Error('offline'); });
    mount(Autocomplete, { target: host, props: { lookup, label: 'Orgs', minLength: 2, debounceMs: 0 } });
    await type('ap');
    await new Promise((r) => setTimeout(r, 20));
    await tick();
    expect(host.querySelector('[data-state="error"]')).not.toBeNull();
  });

  it('distinguishes not-yet-searched from no-results', async () => {
    const lookup = vi.fn(async () => []);
    mount(Autocomplete, { target: host, props: { lookup, label: 'Orgs', minLength: 2, debounceMs: 0 } });
    await type('a');
    await new Promise((r) => setTimeout(r, 20));
    expect(host.querySelector('[data-state="empty"]')).toBeNull();
    await type('ap');
    await new Promise((r) => setTimeout(r, 20));
    await tick();
    expect(host.querySelector('[data-state="empty"]')).not.toBeNull();
  });
});

describe('SearchBox — the seams two adoptions were blocked on', () => {
  it('Autocomplete accepts an initial value — a field that ARRIVES populated', async () => {
    mount(Autocomplete, {
      target: host,
      props: { lookup: async () => [], label: 'Orgs', value: 'Institute for Humane Studies' },
    });
    await tick();
    expect(input().value).toBe('Institute for Humane Studies');
  });

  it('LiveFilter accepts an initial value too', async () => {
    mount(LiveFilter, { target: host, props: { options: OPTIONS, label: 'Fruit', value: 'ap' } });
    await tick();
    expect(input().value).toBe('ap');
  });

  it('clearOnSelect empties the box for surfaces that PICK rather than search', async () => {
    mount(LiveFilter, {
      target: host,
      props: { options: OPTIONS, label: 'Fruit', clearOnSelect: true, onselect: () => {} },
    });
    await type('ap');
    await key('ArrowDown');
    await key('Enter');
    expect(input().value).toBe('');
  });

  it('without clearOnSelect the text stays — you picked "Acme", the box says "acme"', async () => {
    mount(LiveFilter, {
      target: host,
      props: { options: OPTIONS, label: 'Fruit', onselect: () => {} },
    });
    await type('ap');
    await key('ArrowDown');
    await key('Enter');
    expect(input().value).toBe('ap');
  });

  it('refuses onkeydown rather than letting it REPLACE the keyboard contract', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    mount(LiveFilter, {
      target: host,
      props: { options: OPTIONS, label: 'Fruit', onkeydown: () => {} },
    });
    await tick();
    expect(err).toHaveBeenCalled();
    expect(String(err.mock.calls[0][0])).toContain('onkeydown');
    err.mockRestore();
  });

  it('and the contract still works when a member tried to pass one', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mount(LiveFilter, {
      target: host,
      props: { options: OPTIONS, label: 'Fruit', onkeydown: () => {} },
    });
    input().focus();
    await type('ap');
    await key('ArrowDown');
    expect(input().getAttribute('aria-activedescendant')).toBe(opts()[0].id);
    vi.restoreAllMocks();
  });
});

describe('SearchBox — the two seams the third adoption lost', () => {
  it('inputClass reaches the INPUT, not the wrapper', async () => {
    mount(LiveFilter, {
      target: host,
      props: { options: OPTIONS, label: 'Fruit', inputClass: 'pd-flash', class: 'wrap' },
    });
    await tick();
    expect(input().className).toContain('pd-flash');
    expect(host.querySelector('.ui-searchbox')!.className).toContain('wrap');
    expect(host.querySelector('.ui-searchbox')!.className).not.toContain('pd-flash');
  });

  it('a programmatic clear dispatches a real input event, so a wrapper listener sees it', async () => {
    let seen: string[] = [];
    mount(LiveFilter, { target: host, props: { options: OPTIONS, label: 'Fruit' } });
    // The delegation recipe: the member listens on a wrapper, not the component.
    host.addEventListener('input', (e) => seen.push((e.target as HTMLInputElement).value));
    input().focus();
    await type('ap');
    await key('Escape');   // closes
    await key('Escape');   // clears
    await new Promise((r) => queueMicrotask(r as never));
    expect(input().value).toBe('');
    expect(seen.at(-1)).toBe('');
  });
});
