/**
 * Selector--Menu + MenuItem — the keyboard contract for a list of ACTIONS.
 *
 * Written before the components, same as the listbox. The difference that
 * matters: a menu has no selected state. `aria-selected` on a menuitem is the
 * error two members already ship — a container role with children that carry the
 * wrong semantics.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount, tick } from 'svelte';
import SelectorMenu from '../src/Selector--Menu.svelte';

const ITEMS = [
  { id: 'open', label: 'Open' },
  { id: 'rename', label: 'Rename' },
  { id: 'delete', label: 'Delete', danger: true },
];

let host: HTMLElement;

function render(props: Record<string, unknown> = {}) {
  mount(SelectorMenu, { target: host, props: { items: ITEMS, label: 'Actions', ...props } });
  return host.querySelector('[role="menu"]') as HTMLElement;
}
const items = () => Array.from(host.querySelectorAll<HTMLElement>('[role="menuitem"]'));
const key = async (el: Element, k: string) => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  await tick();
};

beforeEach(() => {
  document.body.innerHTML = '';
  host = document.createElement('div');
  document.body.appendChild(host);
});

describe('Selector--Menu — the role triad', () => {
  it('declares menu with menuitem children', async () => {
    render();
    expect(host.querySelectorAll('[role="menu"]')).toHaveLength(1);
    expect(items()).toHaveLength(3);
  });

  it('carries NO selected state — a menu is actions, not choices', async () => {
    render();
    for (const i of items()) {
      expect(i.hasAttribute('aria-selected')).toBe(false);
      expect(i.hasAttribute('aria-checked')).toBe(false);
    }
  });

  it('names the widget', async () => {
    expect(render().getAttribute('aria-label')).toBe('Actions');
  });
});

describe('Selector--Menu — one tab stop', () => {
  it('first item is the tab stop, the rest are -1', async () => {
    render();
    expect(items().map((i) => i.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
  });
});

describe('Selector--Menu — keyboard', () => {
  it('ArrowDown advances and focus follows', async () => {
    render();
    await key(items()[0], 'ArrowDown');
    expect(document.activeElement).toBe(items()[1]);
  });

  it('wraps at the end', async () => {
    render();
    await key(items()[0], 'ArrowUp');
    expect(document.activeElement).toBe(items()[2]);
  });

  it('Home and End', async () => {
    render();
    await key(items()[0], 'End');
    expect(document.activeElement).toBe(items()[2]);
    await key(items()[2], 'Home');
    expect(document.activeElement).toBe(items()[0]);
  });

  it('typeahead jumps to the next item starting with the character', async () => {
    render();
    await key(items()[0], 'd');
    expect(document.activeElement).toBe(items()[2]);
  });

  it('Enter activates the focused item', async () => {
    let fired: string | undefined;
    render({ onselect: (id: string) => (fired = id) });
    await key(items()[0], 'ArrowDown');
    await key(items()[1], 'Enter');
    expect(fired).toBe('rename');
  });

  it('a click activates too', async () => {
    let fired: string | undefined;
    render({ onselect: (id: string) => (fired = id) });
    items()[2].click();
    expect(fired).toBe('delete');
  });
});

describe('Selector--Menu — Escape returns focus to the trigger', () => {
  it('calls onclose, and focus lands back on the trigger element', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Open menu';
    document.body.appendChild(trigger);
    let closed = false;
    render({ trigger, onclose: () => (closed = true) });
    await key(items()[0], 'Escape');
    expect(closed).toBe(true);
    expect(document.activeElement).toBe(trigger);
  });

  it('returns focus even when onclose clears the member\'s anchor', async () => {
    // THE REALISTIC CALL SITE. Both of the first two adopters nulled their menu
    // anchor inside onclose, and `trigger` is a live getter — so the component
    // read `undefined` one line later and focus went to <body>. The original
    // fixture used a local const the member could not touch, so this suite
    // passed while every real adopter was broken.
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    let anchor: HTMLElement | undefined = trigger;
    render({
      get trigger() { return anchor; },
      onclose: () => { anchor = undefined; },
    });
    await key(items()[0], 'Escape');
    expect(document.activeElement).toBe(trigger);
    expect(document.activeElement).not.toBe(document.body);
  });
});

describe('Selector--Menu — disabled items', () => {
  it('skips a disabled item when arrowing', async () => {
    render({ items: [ITEMS[0], { ...ITEMS[1], disabled: true }, ITEMS[2]] });
    await key(items()[0], 'ArrowDown');
    expect(document.activeElement).toBe(items()[2]);
  });

  it('does not activate a disabled item', async () => {
    let fired: string | undefined;
    render({
      items: [{ ...ITEMS[0], disabled: true }, ITEMS[1]],
      onselect: (id: string) => (fired = id),
    });
    items()[0].click();
    expect(fired).toBeUndefined();
  });
});

describe('MenuItem — appearance', () => {
  it('marks a danger item so it is not distinguished by colour alone downstream', async () => {
    render();
    expect(items()[2].getAttribute('data-danger')).toBe('true');
    expect(items()[0].hasAttribute('data-danger')).toBe(false);
  });
});
