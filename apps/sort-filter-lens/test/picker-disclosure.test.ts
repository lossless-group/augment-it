/**
 * sort-filter-lens — the record-set picker's DISCLOSURE contract.
 *
 * Companion to record-set-picker.test.ts, which owns the listbox keyboard.
 * This file owns what the TRIGGER announces, and is written against the markup
 * that ships today.
 *
 * THE PICKER IS NOT A DisclosureRow, and the finding is that conclusion rather
 * than a refactor. It is a popup trigger: `.picker-popover` is
 * `position: absolute` above the flow, and the widget it opens is a listbox
 * with a selected value. DisclosureRow is a full-bleed row that expands an
 * inline region; adopting it here would take rung-4 overrides for display,
 * inline-size and padding, which is negating the base recipe rather than
 * adjusting it. The loop's own words: that makes it a different organ.
 *
 * What DOES ship broken, and is fixed rather than raised, because it is the same
 * defect class the sweep exists to remove:
 *
 *   1. `aria-expanded` with NO `aria-haspopup`. A screen reader is told the
 *      control is expanded and never told that what expanded is a listbox
 *      popup. shell/src/WorkspaceSwitcher.svelte — the same shape, a popdown
 *      over record-set-like values — declares `aria-haspopup="listbox"`, so
 *      this is an inconsistency INSIDE the federation, not a judgement call.
 *   2. No `aria-controls`: nothing associates the trigger with the listbox.
 *   3. The caret glyph `▴` / `▾` is TEXT inside the button, so it lands in the
 *      accessible name — "investors-2026 400 rows · 12 cols ▾".
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount, tick } from 'svelte';
import App from '../src/App.svelte';

const ACTIVE_KEY = 'augment-it:active-record-set';
let host: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  host = document.createElement('div');
  document.body.appendChild(host);
});

/**
 * The accessible name, as name-from-content computes it: aria-hidden subtrees
 * are excluded. `textContent` is NOT this — it happily returns the glyph inside
 * an aria-hidden span, which is what the first draft of these tests asserted on.
 * That made the caret test fail after the fix, describing the assertion rather
 * than the member.
 */
function accName(el: HTMLElement): string {
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
  return (el.getAttribute('aria-label') ?? clone.textContent ?? '').trim();
}

async function mountLens(selected: string | null = 'rs_alpha') {
  if (selected) localStorage.setItem(ACTIVE_KEY, selected);
  mount(App, { target: host });
  await tick();
  await Promise.resolve();
  await tick();
  return host.querySelector<HTMLButtonElement>('.record-set-picker button')!;
}

describe('sort-filter-lens picker trigger — what it announces', () => {
  it('says what kind of thing it opens, not merely that something opened', async () => {
    const trigger = await mountLens();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.getAttribute('aria-haspopup')).toBe('listbox');
  });

  it('associates itself with the listbox once open, and that listbox exists', async () => {
    const trigger = await mountLens();
    expect(trigger.getAttribute('aria-controls')).toBeNull();
    trigger.click();
    await tick();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const id = trigger.getAttribute('aria-controls');
    expect(id).toBeTruthy();
    const target = document.getElementById(id!);
    expect(target).not.toBeNull();
    expect(target!.getAttribute('role')).toBe('listbox');
  });

  it('keeps the caret glyph out of its accessible name', async () => {
    const trigger = await mountLens();
    expect(accName(trigger)).not.toMatch(/[▾▸▴▿]/);
    // and the glyph is still DRAWN — hiding it from the name must not delete it
    expect(trigger.querySelector('.picker-caret')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('the empty-state trigger announces the same contract as the selected one', async () => {
    const trigger = await mountLens(null);
    expect(trigger.getAttribute('aria-haspopup')).toBe('listbox');
    expect(accName(trigger)).not.toMatch(/[▾▸▴▿]/);
  });
});
