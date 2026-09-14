/**
 * Group G — the tag suggestion surface is a combobox, or it is nothing.
 *
 * Both of this member's tag inputs (TagBar, CorpusPicker) render a popup of
 * suggestions under a text input. The popup has always been a stack of plain
 * <button> elements with no combobox semantics on the input at all — app.css
 * says so in as many words: "the organ it wants is a combobox listbox option,
 * which nobody has built."
 *
 * That is not a cosmetic gap. Three things ship broken today and none of them
 * are visible in a screenshot:
 *
 *   1. The input carries no role="combobox", so a screen reader announces a
 *      plain text field and never mentions that suggestions appeared.
 *   2. ArrowDown does nothing — there is no keydown handler for it, so the
 *      suggestions are unreachable from the keyboard except by Tab.
 *   3. Tabbing out of the input lands on the FIRST SUGGESTION, because each
 *      option is a <button> and therefore a native tab stop. The caret leaves
 *      the input mid-word. With twelve suggestions the widget is thirteen tab
 *      stops.
 *
 * These assert the member USES the shared organ's contract. The component's own
 * contract is already covered by packages/shared-ui/test/searchbox.test.ts and
 * is deliberately not restated here.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { mount, tick } from 'svelte';

const ws = {
  workspaces: [] as unknown[],
  active_client_id: null as string | null,
  connect: vi.fn(),
  loadWorkspaces: vi.fn(async () => {}),
  activateWorkspace: vi.fn(async (_id: string) => {}),
  invoke: vi.fn(async (_cap: string, _args: unknown) => ({}) as unknown),
};

vi.mock('@augment-it/workspace', () => ({
  workspace: ws,
  WORKSPACE_CHANGED_EVENT: 'workspace-changed',
  resolveWsUrl: () => 'ws://localhost:3001/ws',
}));

const { curation } = await import('../src/curation.svelte.ts');
const TagBar = (await import('../src/TagBar.svelte')).default;
const CorpusPicker = (await import('../src/CorpusPicker.svelte')).default;

const VOCAB = ['Employer-Partnerships', 'Employment-Outcomes', 'Rural-Access'];

let host: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '';
  host = document.createElement('div');
  document.body.appendChild(host);
  curation.tagVocab = [...VOCAB];
  curation.strategies = [];
  // TagBar writes through `curation.applyTag`, which needs a focused source —
  // without one it returns before calling any capability, and a test asserting
  // on the capability would have gone green for the wrong reason.
  curation.sources = [{ source_uuid: 'src-1', url: 'https://example.org/a', tags: [] }];
  curation.focusIdx = 0;
  ws.invoke.mockClear();
});

/** The tag input — the one whose placeholder is the member's own wording. */
const tagInput = () =>
  Array.from(host.querySelectorAll('input')).find(
    (el) => el.getAttribute('placeholder') === 'add a tag…',
  ) as HTMLInputElement;

const options = () => Array.from(host.querySelectorAll<HTMLElement>('[role="option"]'));

async function type(el: HTMLInputElement, text: string) {
  el.value = text;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  await tick();
}
async function key(el: HTMLInputElement, k: string) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  await tick();
}

describe('TagBar — the tag input is a combobox', () => {
  test('the input declares role=combobox', async () => {
    mount(TagBar, { target: host });
    expect(tagInput().getAttribute('role')).toBe('combobox');
  });

  test('ArrowDown activates a suggestion and the caret stays in the input', async () => {
    mount(TagBar, { target: host });
    const el = tagInput();
    el.focus();
    await type(el, 'Emp');
    await key(el, 'ArrowDown');

    // The whole reason this organ is not a Selector: focus never moves.
    expect(document.activeElement).toBe(el);
    const activeId = el.getAttribute('aria-activedescendant');
    expect(activeId).toBeTruthy();
    expect(document.getElementById(activeId!)).not.toBeNull();
    expect(options()[0].getAttribute('aria-selected')).toBe('true');
  });

  test('no suggestion is a tab stop — the popup contains nothing focusable', async () => {
    mount(TagBar, { target: host });
    const el = tagInput();
    await type(el, 'Emp');
    const popup = host.querySelector('[role="listbox"]') ?? host.querySelector('.cc-tag-suggest');
    expect(popup).not.toBeNull();
    const focusable = popup!.querySelectorAll('button, a[href], input, [tabindex="0"]');
    expect(Array.from(focusable).map((n) => n.textContent)).toEqual([]);
  });

  test('aria-expanded tracks the real popup state', async () => {
    mount(TagBar, { target: host });
    const el = tagInput();
    expect(el.getAttribute('aria-expanded')).toBe('false');
    await type(el, 'Emp');
    expect(el.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('CorpusPicker — the same input, the same contract', () => {
  test('the pending-tag input declares role=combobox', async () => {
    mount(CorpusPicker, { target: host });
    expect(tagInput().getAttribute('role')).toBe('combobox');
  });

  test('ArrowDown activates a suggestion and the caret stays in the input', async () => {
    mount(CorpusPicker, { target: host });
    const el = tagInput();
    el.focus();
    await type(el, 'Emp');
    await key(el, 'ArrowDown');
    expect(document.activeElement).toBe(el);
    expect(el.getAttribute('aria-activedescendant')).toBeTruthy();
  });
});

/**
 * What the member owns, now that the widget owns the keyboard.
 *
 * Two behaviours survived the adoption and neither is the component's: a tag
 * that matches NOTHING is still a valid tag, and the box must empty after a
 * pick because tags are added in runs. The spec puts free text on the member
 * explicitly; the emptying is a deviation the member had to build, and these
 * guard both.
 */
describe('TagBar — the behaviours the member kept', () => {
  test('Enter with no active option adds the typed tag, matched or not', async () => {
    mount(TagBar, { target: host });
    const el = tagInput();
    el.focus();
    await type(el, 'Nothing-Matches-This');
    // A REAL Enter, with no ArrowDown first. Nothing is active, so SearchBoxCore
    // does not preventDefault, the event bubbles, and the member's delegated
    // handler picks it up. If the widget ever starts swallowing a no-active
    // Enter, this goes red.
    await key(el, 'Enter');
    await tick();
    expect(ws.invoke).toHaveBeenCalledWith(
      'tag.apply',
      expect.objectContaining({ tag: 'Nothing-Matches-This', op: 'add' }),
    );
  });

  test('picking a suggestion empties the box and leaves the caret in it', async () => {
    mount(TagBar, { target: host });
    const el = tagInput();
    el.focus();
    await type(el, 'Emp');
    await key(el, 'ArrowDown');
    await key(el, 'Enter');
    await tick();
    await tick();
    const after = tagInput();
    expect(after.value).toBe('');
    expect(document.activeElement).toBe(after);
    expect(host.querySelector('[role="listbox"]')).toBeNull();
  });

  test('Enter ON AN ACTIVE OPTION adds the option, not the typed fragment', async () => {
    // The whole load of `defaultPrevented`. If the member's delegated handler
    // ignored it, typing "Emp" and pressing Enter on the highlighted
    // "Employer-Partnerships" would add BOTH — the real tag and the fragment
    // "Emp" — and the fragment would enter the workspace vocabulary for good.
    mount(TagBar, { target: host });
    const el = tagInput();
    el.focus();
    await type(el, 'Emp');
    await key(el, 'ArrowDown');
    await key(el, 'Enter');
    await tick();
    const tags = ws.invoke.mock.calls
      .filter((c) => c[0] === 'tag.apply')
      .map((c) => (c[1] as { tag: string }).tag);
    expect(tags).toEqual(['Employer-Partnerships']);
  });
});
