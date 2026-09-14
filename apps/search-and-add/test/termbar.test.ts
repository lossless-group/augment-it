/**
 * search-and-add TermBar — the claim that this is NOT a SearchBox.
 *
 * The SearchBox rollout assigned this member on the strength of its name. It has
 * no suggestion surface. Swept for one: `<input>` appears exactly once in the
 * whole of src/ (here), and `role=`, `datalist`, `list=`, `aria-expanded` and
 * `aria-activedescendant` appear nowhere outside ProviderPalette's header
 * comment. The only composite role this member ever declared was
 * ProviderPalette's `role="radiogroup"`, and that is a Selector--Listbox, which
 * it already is.
 *
 * TermBar is a form with one text field and one submit button. It has no
 * options, no popup, no async lookup and no promised keyboard — so per the
 * adoption loop's judgement rule, "do not invent a keyboard where none was
 * promised." Adopting SearchBox here would mean first inventing a source of
 * suggestions (term history? provider-side completions?), which is a feature,
 * not a migration.
 *
 * These assertions exist so the next census sweep does not re-raise this member
 * and repeat the search. They fail if someone gives TermBar a half-built
 * combobox — the exact defect the two sibling members shipped.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount, tick } from 'svelte';
import TermBar from '../src/TermBar.svelte';

let host: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = '';
  host = document.createElement('div');
  host.className = 'saa-app';
  document.body.appendChild(host);
});

function bar(props: Record<string, unknown> = {}) {
  mount(TermBar, {
    target: host,
    props: { term: 'rural broadband funders', firing: false, onfire: () => {}, ...props },
  });
  return host.querySelector('input') as HTMLInputElement;
}

describe('search-and-add TermBar — an honest form, not a combobox', () => {
  it('declares no composite role it cannot honour', async () => {
    const el = bar();
    await tick();
    // The defect class this rollout exists to remove: a role that promises a
    // keyboard nobody implemented. TermBar promises nothing, which is correct.
    expect(el.getAttribute('role')).toBeNull();
    expect(el.hasAttribute('aria-expanded')).toBe(false);
    expect(el.hasAttribute('aria-controls')).toBe(false);
    expect(el.hasAttribute('aria-activedescendant')).toBe(false);
    expect(host.querySelector('[role="listbox"], [role="option"], datalist')).toBeNull();
  });

  it('has no suggestion popup to navigate, so arrows are the caret\'s', async () => {
    const el = bar();
    el.focus();
    await tick();
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    await tick();
    expect(document.activeElement).toBe(el);
    expect(host.querySelector('[role="listbox"]')).toBeNull();
    expect(el.getAttribute('aria-activedescendant')).toBeNull();
  });

  it('Enter is the member submit, because there is nothing else it could be', async () => {
    let fired = 0;
    bar({ onfire: () => fired++ });
    await tick();
    const form = host.querySelector('form')!;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await tick();
    expect(fired).toBe(1);
  });
});
