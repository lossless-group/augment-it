/**
 * Selector — the keyboard contract, as executable claims.
 *
 * WRITTEN BEFORE THE COMPONENT, on purpose. Nine surfaces in this federation
 * declare role="menu" / "listbox" / "radiogroup" and none implements arrow-key
 * navigation. Every previous sweep measured AFTER the change and inferred the
 * defect; these state it first, so "the nine were genuinely broken" is a claim
 * anyone can run rather than a claim anyone has to trust.
 *
 * Each test is one line of the WAI-ARIA authoring practices for composite
 * widgets. They fail until the component exists.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount, tick } from 'svelte';
import SelectorListbox from '../src/Selector--Listbox.svelte';

const OPTIONS = [
  { id: 'alpha', label: 'Alpha' },
  { id: 'bravo', label: 'Bravo' },
  { id: 'charlie', label: 'Charlie' },
];

let host: HTMLElement;
let app: Record<string, unknown> | undefined;

function render(props: Record<string, unknown> = {}) {
  app = mount(SelectorListbox, {
    target: host,
    props: { options: OPTIONS, label: 'Test selector', ...props },
  });
  return host.querySelector('[role="listbox"]') as HTMLElement;
}

const opts = () => Array.from(host.querySelectorAll<HTMLElement>('[role="option"]'));
// Focus moves synchronously with the keypress; the tabindex ATTRIBUTE follows on
// Svelte's next flush. So assertions about focus need no await and assertions
// about attributes do — which is a fact about the framework, not a weaker claim.
const key = async (el: Element, k: string) => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  await tick();
};

beforeEach(() => {
  document.body.innerHTML = '';
  host = document.createElement('div');
  document.body.appendChild(host);
  app = undefined;
});

describe('Selector--Listbox — the role triad', () => {
  it('declares listbox with option children, never a container role with wrong children', async () => {
    render();
    expect(host.querySelectorAll('[role="listbox"]')).toHaveLength(1);
    expect(opts()).toHaveLength(3);
    // The defect all nine shipped: a container role whose children do not match.
    for (const o of opts()) expect(o.getAttribute('role')).toBe('option');
  });

  it('names the widget', async () => {
    const box = render();
    expect(box.getAttribute('aria-label')).toBe('Test selector');
  });

  it('marks exactly one option selected', async () => {
    render({ value: 'bravo' });
    const sel = opts().filter((o) => o.getAttribute('aria-selected') === 'true');
    expect(sel).toHaveLength(1);
    expect(sel[0].textContent).toContain('Bravo');
  });
});

describe('Selector--Listbox — one tab stop, not N', () => {
  it('gives the active option tabindex=0 and every other tabindex=-1', async () => {
    render({ value: 'bravo' });
    const t = opts().map((o) => o.getAttribute('tabindex'));
    expect(t).toEqual(['-1', '0', '-1']);
  });

  it('falls back to the first option when nothing is selected', async () => {
    render();
    expect(opts().map((o) => o.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
  });
});

describe('Selector--Listbox — arrow keys move the active option', () => {
  it('ArrowDown advances', async () => {
    render({ value: 'alpha' });
    await key(opts()[0], 'ArrowDown');
    expect(opts().map((o) => o.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
    expect(document.activeElement).toBe(opts()[1]);
  });

  it('ArrowUp retreats', async () => {
    render({ value: 'charlie' });
    await key(opts()[2], 'ArrowUp');
    expect(document.activeElement).toBe(opts()[1]);
  });

  it('wraps at the end — a decision, made once, the same everywhere', async () => {
    render({ value: 'charlie' });
    await key(opts()[2], 'ArrowDown');
    expect(document.activeElement).toBe(opts()[0]);
  });

  it('wraps at the start', async () => {
    render({ value: 'alpha' });
    await key(opts()[0], 'ArrowUp');
    expect(document.activeElement).toBe(opts()[2]);
  });
});

describe('Selector--Listbox — Home, End, typeahead', () => {
  it('Home jumps to first', async () => {
    render({ value: 'charlie' });
    await key(opts()[2], 'Home');
    expect(document.activeElement).toBe(opts()[0]);
  });

  it('End jumps to last', async () => {
    render({ value: 'alpha' });
    await key(opts()[0], 'End');
    expect(document.activeElement).toBe(opts()[2]);
  });

  it('a printable character jumps to the next option starting with it', async () => {
    render({ value: 'alpha' });
    await key(opts()[0], 'c');
    expect(document.activeElement).toBe(opts()[2]);
  });
});

describe('Selector--Listbox — activation', () => {
  it('Enter selects the active option', async () => {
    let picked: string | undefined;
    render({ value: 'alpha', onselect: (id: string) => (picked = id) });
    await key(opts()[0], 'ArrowDown');
    await key(opts()[1], 'Enter');
    expect(picked).toBe('bravo');
  });

  it('Space selects too', async () => {
    let picked: string | undefined;
    render({ value: 'alpha', onselect: (id: string) => (picked = id) });
    await key(opts()[0], ' ');
    expect(picked).toBe('alpha');
  });

  it('a click selects, because a keyboard widget is still a pointer widget', async () => {
    let picked: string | undefined;
    render({ onselect: (id: string) => (picked = id) });
    opts()[2].click();
    expect(picked).toBe('charlie');
  });
});

describe('Selector--Listbox — disabled options', () => {
  it('skips a disabled option when arrowing', async () => {
    render({
      options: [OPTIONS[0], { ...OPTIONS[1], disabled: true }, OPTIONS[2]],
      value: 'alpha',
    });
    await key(opts()[0], 'ArrowDown');
    expect(document.activeElement).toBe(opts()[2]);
  });

  it('never makes a disabled option the tab stop', async () => {
    render({
      options: [{ ...OPTIONS[0], disabled: true }, OPTIONS[1], OPTIONS[2]],
    });
    expect(opts()[0].getAttribute('tabindex')).toBe('-1');
    expect(opts()[1].getAttribute('tabindex')).toBe('0');
  });
});

describe('Selector--Listbox — swap compatibility with Button', () => {
  const OPTS = [{ id: 'a', label: 'A' }];

  it('truncates by default, so replacing a Button row is not a silent layout change', () => {
    const src = readFileSync(resolve('src/Selector--Listbox.svelte'), 'utf8');
    const rule = src.match(/\.ui-listbox:not\(\[data-wrap\]\)\s+\.ui-listbox__option\s*\{[^}]*\}/)![0];
    expect(rule).toMatch(/white-space:\s*nowrap/);
  });

  it('wrapOptions opts out, and is off unless asked', () => {
    render({ options: OPTS });
    expect(host.querySelector('[role="listbox"]')!.hasAttribute('data-wrap')).toBe(false);
    host.innerHTML = '';
    mount(SelectorListbox, {
      target: host,
      props: { options: OPTS, label: 'L', wrapOptions: true },
    });
    expect(host.querySelector('[role="listbox"]')!.hasAttribute('data-wrap')).toBe(true);
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
