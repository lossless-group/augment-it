/**
 * chat — the slash-commands popover, as executable claims.
 *
 * WRITTEN AGAINST THE MARKUP THAT SHIPS TODAY, before the refactor, so that
 * "this surface was genuinely broken" is something anyone can run rather than
 * something anyone has to trust. Every previous sweep in this federation
 * measured after the change and inferred the defect.
 *
 * The four defects `.commands-popover` ships:
 *   1. role="menu" whose ELEMENT children are a headless <div> and a <ul> of
 *      <li> — `listitem`, not `menuitem`. The menuitems are one level too deep.
 *   2. no roving tabindex — five native <button>s, so five tab stops.
 *   3. no arrow-key handler — ArrowDown moves nothing.
 *   4. Escape closes from a document-level handler and drops focus to <body>
 *      instead of returning it to the trigger.
 *
 * These do NOT re-test Selector; packages/shared-ui/test/selector*.test.ts owns
 * that contract. These test that chat USES it.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount, tick } from 'svelte';
import ChatSurface from '../src/ChatSurface.svelte';

let host: HTMLElement;

async function open() {
  mount(ChatSurface, { target: host });
  await tick();
  const trigger = host.querySelector<HTMLButtonElement>('.commands-bar button')!;
  trigger.click();
  await tick();
  return trigger;
}

const menu = () => host.querySelector<HTMLElement>('[role="menu"]')!;
const items = () => Array.from(host.querySelectorAll<HTMLElement>('[role="menuitem"]'));

const key = async (el: Element, k: string) => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  await tick();
};

beforeEach(() => {
  document.body.innerHTML = '';
  host = document.createElement('div');
  host.className = 'chat-app';
  document.body.appendChild(host);
});

describe('chat commands popover — the role triad', () => {
  it('every element child of role="menu" is a menuitem', async () => {
    await open();
    const kids = Array.from(menu().children);
    expect(kids.length).toBeGreaterThan(0);
    // The shipping defect: a <div class="commands-popover-head"> with no role,
    // and a <ul> whose <li> children are listitems. A menu's required owned
    // elements are menuitem / menuitemradio / menuitemcheckbox / group /
    // separator — nothing else.
    expect(kids.map((k) => k.getAttribute('role'))).toEqual(kids.map(() => 'menuitem'));
  });

  it('exposes one menuitem per slash command', async () => {
    await open();
    expect(items()).toHaveLength(5);
  });
});

describe('chat commands popover — one tab stop, not five', () => {
  it('gives the first menuitem tabindex=0 and every other tabindex=-1', async () => {
    await open();
    expect(items().map((i) => i.getAttribute('tabindex'))).toEqual([
      '0', '-1', '-1', '-1', '-1',
    ]);
  });
});

describe('chat commands popover — the keyboard', () => {
  it('ArrowDown moves focus to the next command', async () => {
    await open();
    items()[0].focus();
    await key(menu(), 'ArrowDown');
    expect(document.activeElement).toBe(items()[1]);
  });

  it('ArrowUp from the first command wraps to the last', async () => {
    await open();
    items()[0].focus();
    await key(menu(), 'ArrowUp');
    expect(document.activeElement).toBe(items()[4]);
  });

  it('End jumps to the last command', async () => {
    await open();
    items()[0].focus();
    await key(menu(), 'End');
    expect(document.activeElement).toBe(items()[4]);
  });

  it('Escape closes the menu AND returns focus to the trigger', async () => {
    const trigger = await open();
    items()[0].focus();
    await key(menu(), 'Escape');
    expect(host.querySelector('[role="menu"]')).toBeNull();
    // A popup that closes and drops focus to <body> is worse than one that
    // never opened: the user's place in the document is gone.
    expect(document.activeElement).toBe(trigger);
  });
});
