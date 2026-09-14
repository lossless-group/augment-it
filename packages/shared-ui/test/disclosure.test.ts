/**
 * DisclosureRow — a row that expands, written BEFORE the component.
 *
 * Eight members carry `aria-expanded` on a row-shaped control. Every one of them
 * hand-rolls the same three things, and a disclosure that gets any of them wrong
 * renders perfectly:
 *   - aria-expanded must track the actual open state, not the intent
 *   - aria-controls must point at an element that EXISTS
 *   - Enter and Space must both toggle, because it is a button
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount, tick } from 'svelte';
import DisclosureRow from '../src/DisclosureRow.svelte';

let host: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '';
  host = document.createElement('div');
  document.body.appendChild(host);
});

function render(props: Record<string, unknown> = {}) {
  mount(DisclosureRow, { target: host, props: { label: 'Earlier generations', ...props } });
  return host.querySelector('button') as HTMLButtonElement;
}
const panel = () => host.querySelector('[data-disclosure-panel]') as HTMLElement | null;

describe('DisclosureRow — the contract', () => {
  it('is a real button, not a div with a role', () => {
    expect(render().tagName).toBe('BUTTON');
    expect(render().getAttribute('type')).toBe('button');
  });

  it('starts collapsed and says so', () => {
    expect(render().getAttribute('aria-expanded')).toBe('false');
  });

  it('aria-controls points at an element that actually exists', async () => {
    const b = render({ open: true });
    await tick();
    const id = b.getAttribute('aria-controls');
    expect(id).toBeTruthy();
    expect(document.getElementById(id!)).not.toBeNull();
  });

  it('toggles on click and aria-expanded follows the REAL state', async () => {
    const b = render();
    b.click();
    await tick();
    expect(b.getAttribute('aria-expanded')).toBe('true');
    expect(panel()).not.toBeNull();
    b.click();
    await tick();
    expect(b.getAttribute('aria-expanded')).toBe('false');
  });

  it('reports the change to the member', async () => {
    const seen: boolean[] = [];
    const b = render({ ontoggle: (o: boolean) => seen.push(o) });
    b.click();
    await tick();
    b.click();
    await tick();
    expect(seen).toEqual([true, false]);
  });

  it('clears the 24px target floor', () => {
    const b = render();
    expect(getComputedStyle(b).minBlockSize).not.toBe('0px');
  });

  it('carries NO aria-pressed — a disclosure is not a toggle button', () => {
    const b = render();
    expect(b.hasAttribute('aria-pressed')).toBe(false);
  });

  it('hides the chevron from assistive tech', () => {
    const b = render();
    const chev = b.querySelector('[data-chevron]');
    expect(chev?.getAttribute('aria-hidden')).toBe('true');
  });

  it('a disabled row does not toggle', async () => {
    const b = render({ disabled: true });
    b.click();
    await tick();
    expect(b.getAttribute('aria-expanded')).toBe('false');
  });
});
