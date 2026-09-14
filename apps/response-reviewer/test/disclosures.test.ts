/**
 * response-reviewer — the candidate-snippet disclosure, as executable claims.
 *
 * WRITTEN AGAINST THE MARKUP THAT SHIPS TODAY. The snippet toggle has two
 * defects, neither visible:
 *
 *   1. The chevron `▾` / `▸` is TEXT inside the button, so the accessible name
 *      is "▸ snippet". A screen reader reads a glyph it cannot pronounce as
 *      part of the control's name, and the glyph duplicates — in a second,
 *      unreliable encoding — the state aria-expanded already carries.
 *   2. No `aria-controls`, and `.candidate-snippet` has no id, so nothing
 *      associates the announced state with the region it governs.
 *
 * These do NOT re-test DisclosureRow — packages/shared-ui/test/disclosure.test.ts
 * owns that contract. These test that response-reviewer USES it.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount, tick } from 'svelte';
import App from '../src/App.svelte';
import { SNIPPET_TEXT } from './stubs/workspace';

let host: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  host = document.createElement('div');
  host.className = 'resp-app';
  document.body.appendChild(host);
});

/** Let the mount's four read capabilities resolve before asserting. */
async function settle() {
  for (let i = 0; i < 8; i++) {
    await tick();
    await Promise.resolve();
  }
}

async function render() {
  mount(App, { target: host });
  await settle();
}

/** The disclosure inside the candidate card — the one that reveals the snippet. */
const snippetToggle = () =>
  host.querySelector<HTMLButtonElement>('.candidate-card button[aria-expanded]')!;
const snippet = () => host.querySelector<HTMLElement>('.candidate-snippet');

/**
 * The accessible name as name-from-content computes it: aria-hidden subtrees do
 * not contribute. `textContent` is not this, and asserting on it would describe
 * the assertion rather than the member.
 */
function accName(el: HTMLElement): string {
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
  return (el.getAttribute('aria-label') ?? clone.textContent ?? '').trim();
}

describe('response-reviewer — the candidate snippet disclosure', () => {
  it('renders at all, on the fixture the stub serves', async () => {
    await render();
    expect(snippetToggle()).toBeTruthy();
  });

  it('keeps the chevron glyph out of its accessible name', async () => {
    await render();
    expect(accName(snippetToggle())).not.toMatch(/[▾▸▴▿]/);
  });

  it('carries no aria-pressed — a disclosure is not a toggle button', async () => {
    await render();
    expect(snippetToggle().hasAttribute('aria-pressed')).toBe(false);
  });

  it('associates itself with the snippet once open, and that region exists', async () => {
    await render();
    const t = snippetToggle();
    expect(t.getAttribute('aria-expanded')).toBe('false');
    expect(snippet()).toBeNull();
    t.click();
    await settle();
    expect(t.getAttribute('aria-expanded')).toBe('true');
    const id = t.getAttribute('aria-controls');
    expect(id).toBeTruthy();
    const target = document.getElementById(id!);
    expect(target).not.toBeNull();
    expect(target!.textContent).toContain(SNIPPET_TEXT);
  });

  it('does not dangle aria-controls while collapsed', async () => {
    await render();
    const id = snippetToggle().getAttribute('aria-controls');
    if (id !== null) expect(document.getElementById(id)).not.toBeNull();
  });
});
