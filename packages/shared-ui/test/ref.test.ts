/**
 * Button forwards its node, and Selector--Listbox does the popdown job.
 *
 * Both of these exist because adopters hand-rolled the same workaround twice —
 * the threshold this codebase uses for promoting anything.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount, tick } from 'svelte';
import Button from '../src/Button.svelte';
import SelectorListbox from '../src/Selector--Listbox.svelte';

let host: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '';
  host = document.createElement('div');
  document.body.appendChild(host);
});

describe('Button — ref', () => {
  it('hands the member the real <button> node', async () => {
    let node: HTMLButtonElement | undefined;
    mount(Button, { target: host, props: { ref: (el: HTMLButtonElement) => (node = el) } });
    await tick();
    expect(node).toBeInstanceOf(HTMLButtonElement);
    expect(node).toBe(host.querySelector('button'));
  });

  it('does not leak `ref` onto the element as an attribute', async () => {
    mount(Button, { target: host, props: { ref: () => {} } });
    await tick();
    expect(host.querySelector('button')!.hasAttribute('ref')).toBe(false);
  });
});

describe('Selector--Listbox — orientation', () => {
  const OPTIONS = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }];

  it('is vertical by default and says so to assistive tech', async () => {
    mount(SelectorListbox, { target: host, props: { options: OPTIONS, label: 'L' } });
    const box = host.querySelector('[role="listbox"]')!;
    expect(box.getAttribute('aria-orientation')).toBe('vertical');
  });

  it('draws horizontal AND announces it — one prop, both jobs', async () => {
    mount(SelectorListbox, {
      target: host,
      props: { options: OPTIONS, label: 'L', orientation: 'horizontal' },
    });
    const box = host.querySelector('[role="listbox"]') as HTMLElement;
    expect(box.getAttribute('aria-orientation')).toBe('horizontal');
    expect(getComputedStyle(box).flexDirection).toBe('row');
  });
});

describe('Selector--Listbox — the popdown job its header promised', () => {
  const OPTIONS = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }];

  it('Escape returns focus to the trigger, even when onclose clears it', async () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    let anchor: HTMLElement | undefined = trigger;
    let closed = false;
    mount(SelectorListbox, {
      target: host,
      props: {
        options: OPTIONS,
        label: 'L',
        get trigger() { return anchor; },
        onclose: () => { closed = true; anchor = undefined; },
      },
    });
    const opt = host.querySelector('[role="option"]')!;
    opt.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick();
    expect(closed).toBe(true);
    expect(document.activeElement).toBe(trigger);
  });

  it('autofocus is OFF by default — a listbox is often always-present', async () => {
    mount(SelectorListbox, { target: host, props: { options: OPTIONS, label: 'L' } });
    await tick();
    expect(document.activeElement).toBe(document.body);
  });

  it('autofocus moves focus to the active option when asked', async () => {
    mount(SelectorListbox, {
      target: host,
      props: { options: OPTIONS, label: 'L', value: 'b', autofocus: true },
    });
    await tick();
    expect(document.activeElement).toBe(host.querySelectorAll('[role="option"]')[1]);
  });
});
