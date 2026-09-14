/**
 * shell / WorkspaceSwitcher — THE KEYBOARD, NOT THE PIXELS.
 *
 * Written BEFORE the refactor and run RED against the markup the member ships
 * today. The defect this describes, stated as an executable claim:
 *
 *   `.menu` declares `role="listbox"` over `<li>`s whose children are shared
 *   `Button`s carrying `role="option"` and `aria-selected`. The triad reads
 *   correctly and NOTHING BEHIND IT IS TRUE. There is no keydown handler on the
 *   listbox: ArrowDown moves nothing. Every option is a real `<button>`, so the
 *   widget is N tab stops rather than one — Tab walks the workspaces instead of
 *   leaving the widget, which is the exact opposite of what `role="listbox"`
 *   promises a screen-reader user. The only Escape handler is a `document`
 *   listener that sets `open = false`; the focused button is unmounted with the
 *   list and focus lands on `<body>`.
 *
 * This surface is also the federation's own REFERENCE for the trigger half: its
 * trigger already carries `aria-haspopup="listbox"`, which sort-filter-lens was
 * measured as lacking. That half is asserted here as a guard so it cannot be
 * lost in the migration.
 *
 * MENU OR LISTBOX: this picks the CURRENT workspace and marks it. A thing with a
 * selected state is a listbox even when it is drawn as a popdown, so it stays a
 * listbox — `Selector--Listbox`, not `Selector--Menu`.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount, tick } from 'svelte';
import WorkspaceSwitcher from '../src/WorkspaceSwitcher.svelte';
import { workspace, activated, resetStub, resolveWsUrl, STUB_WS_URL } from './stubs/workspace';

let host: HTMLElement;

function render() {
  mount(WorkspaceSwitcher, { target: host, props: {} });
}

const trigger = () => host.querySelector<HTMLElement>('button')!;
const listbox = () => host.querySelector<HTMLElement>('[role="listbox"]');
/**
 * Spelled so the SAME selector works before and after: today the options are
 * `<Button role="option">`, afterwards `<div role="option">`.
 */
const options = () => Array.from(listbox()?.querySelectorAll<HTMLElement>('[role="option"]') ?? []);

const press = async (el: Element, key: string, init: KeyboardEventInit = {}) => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));
  await tick();
};

async function openList() {
  trigger().focus();
  trigger().click();
  await tick();
}

beforeEach(() => {
  document.body.innerHTML = '';
  resetStub();
  host = document.createElement('div');
  document.body.appendChild(host);
});

// ─── the sandbox, asserted ────────────────────────────────────────────────────
describe('the workspace stub is in play', () => {
  it('resolveWsUrl() is the sentinel and no socket is ever opened', () => {
    expect(resolveWsUrl()).toBe(STUB_WS_URL);
  });

  it('every write verb throws — this member is the host singleton', async () => {
    await expect(workspace.invoke('corpus.add')).rejects.toThrow('refusing');
  });
});

// ─── harness sanity — green in both worlds ────────────────────────────────────
describe('WorkspaceSwitcher — the popdown opens (sanity)', () => {
  it('clicking the trigger opens a named listbox carrying every workspace', async () => {
    render();
    expect(listbox()).toBeNull();
    await openList();
    expect(listbox()).not.toBeNull();
    expect(listbox()!.getAttribute('aria-label')).toBe('Workspaces');
    expect(listbox()!.textContent).toContain('Alpha Co');
    expect(listbox()!.textContent).toContain('Charlie Trust');
  });
});

// ─── guard: the trigger half, which this member is the reference for ──────────
describe('WorkspaceSwitcher — the trigger declares the popup it owns', () => {
  it('aria-haspopup="listbox" and aria-expanded track the open state', async () => {
    render();
    expect(trigger().getAttribute('aria-haspopup')).toBe('listbox');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    await openList();
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
  });
});

// ─── guard: the role triad and the selected state ─────────────────────────────
describe('WorkspaceSwitcher — role="listbox" over real options', () => {
  it('renders one role="option" per workspace', async () => {
    render();
    await openList();
    expect(options()).toHaveLength(3);
  });

  it('a listbox is CHOICES — the active workspace is the one aria-selected', async () => {
    render();
    await openList();
    const selected = options().filter((o) => o.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
    expect(selected[0].textContent).toContain('Alpha Co');
  });
});

// ─── RED: one tab stop ────────────────────────────────────────────────────────
describe('WorkspaceSwitcher — the popdown is ONE tab stop, not N', () => {
  it('exactly one option is reachable by Tab; the rest are tabindex="-1"', async () => {
    render();
    await openList();
    const tabbable = listbox()!.querySelectorAll(
      'button:not([disabled]):not([tabindex="-1"]), [tabindex="0"], a[href]',
    );
    expect(tabbable).toHaveLength(1);
  });

  it('the single tab stop rests on the SELECTED workspace, not on the first', async () => {
    workspace.active_client_id = 'bravo-fund';
    render();
    await openList();
    const stop = listbox()!.querySelector<HTMLElement>('[role="option"][tabindex="0"]');
    expect(stop).not.toBeNull();
    expect(stop!.textContent).toContain('Bravo Fund');
  });
});

// ─── RED: the arrows ──────────────────────────────────────────────────────────
describe('WorkspaceSwitcher — arrow keys move the active option, and focus follows', () => {
  it('ArrowDown advances one option', async () => {
    render();
    await openList();
    options()[0].focus();
    await press(document.activeElement!, 'ArrowDown');
    expect(document.activeElement).toBe(options()[1]);
  });

  it('ArrowUp from the first option wraps to the last, and stays inside the listbox', async () => {
    render();
    await openList();
    options()[0].focus();
    await press(document.activeElement!, 'ArrowUp');
    expect(document.activeElement).toBe(options()[2]);
    expect(listbox()!.contains(document.activeElement)).toBe(true);
  });

  it('arrowing to an option and pressing Enter activates THAT workspace', async () => {
    render();
    await openList();
    options()[0].focus();
    await press(document.activeElement!, 'ArrowDown');
    await press(document.activeElement!, 'Enter');
    await tick();
    expect(activated).toEqual(['bravo-fund']);
  });
});

// ─── RED: Escape ──────────────────────────────────────────────────────────────
describe('WorkspaceSwitcher — Escape closes and returns focus to the trigger', () => {
  it('Escape closes the list', async () => {
    render();
    await openList();
    options()[0].focus();
    await press(document.activeElement!, 'Escape');
    expect(listbox()).toBeNull();
  });

  it('focus lands back on the trigger that opened it — never on <body>', async () => {
    render();
    await openList();
    const t = trigger();
    options()[0].focus();
    await press(document.activeElement!, 'Escape');
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(t);
  });
});

// ─── RED: the keyboard is reachable at all ────────────────────────────────────
describe('WorkspaceSwitcher — opening puts focus IN the widget', () => {
  it('the opened list focuses its active option, so arrows work without a mouse', async () => {
    render();
    await openList();
    expect(listbox()!.contains(document.activeElement)).toBe(true);
    expect(document.activeElement!.getAttribute('aria-selected')).toBe('true');
  });
});

// ─── guard: the mouse path must not regress ───────────────────────────────────
describe('WorkspaceSwitcher — clicking an option still switches (guard)', () => {
  it('a click activates that workspace and closes the list', async () => {
    render();
    await openList();
    options()[2].click();
    await tick();
    await tick();
    expect(activated).toEqual(['charlie-trust']);
    expect(listbox()).toBeNull();
  });

  it('clicking the ALREADY-active workspace closes without re-activating', async () => {
    render();
    await openList();
    options()[0].click();
    await tick();
    expect(activated).toEqual([]);
    expect(listbox()).toBeNull();
  });
});

// ─── guard: the empty / disconnected states stay as they were ─────────────────
describe('WorkspaceSwitcher — degraded states (guard)', () => {
  it('no workspaces means a disabled trigger and no popdown', async () => {
    workspace.workspaces = [];
    render();
    expect(trigger().hasAttribute('disabled')).toBe(true);
    trigger().click();
    await tick();
    expect(listbox()).toBeNull();
  });

  it('a closed socket shows the StatusIndicator instead of the workspace name', async () => {
    workspace.connection_status = 'closed';
    render();
    expect(trigger().querySelector('.ui-status')).not.toBeNull();
  });
});
