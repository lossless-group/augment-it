/**
 * person-enrichment AffiliationCard — the org-name autocomplete, as executable
 * claims.
 *
 * WRITTEN AGAINST THE MARKUP THAT SHIPS TODAY. Unlike org-workbench this member
 * never even declared a composite role, so nothing here *lies* — it is simply a
 * <ul> of buttons under a text input, with a keyboard that goes exactly one
 * place:
 *
 *   1. No role="combobox" on the input, no aria-expanded, no aria-controls, no
 *      aria-activedescendant. A screen-reader user is told a popup appeared by
 *      nothing at all.
 *   2. The suggestions are real <button>s inside <SelectWrapper--ClickBody>, so
 *      they are tab stops. The first Tab takes the caret out of the field the
 *      operator is still typing an organisation name into.
 *   3. THERE ARE NO ARROW KEYS. `onKey` handles Enter and Escape only, and Enter
 *      hard-picks `suggestions[0]`. The second suggestion is unreachable from
 *      the keyboard, and — worse — while any suggestion is on screen the
 *      operator CANNOT commit the name they typed, because Enter is taken. The
 *      surface's own hint says "keep typing to create new", and keeping typing
 *      is the only way.
 *   4. A failed lookup is swallowed: `catch { suggestions = []; }`. An offline
 *      resolver is indistinguishable from an org that does not exist, which is
 *      the difference between "create it" and "try again".
 *
 * AND ONE THING THIS MEMBER GOT RIGHT, asserted here so the refactor cannot
 * lose it: the hand-rolled `if (seq !== lookupSeq) return` guard is complete —
 * it covers the rejection path too, which org-workbench's `term === q.trim()`
 * twin does not.
 *
 * These do NOT re-test the component. packages/shared-ui/test/searchbox.test.ts
 * owns the SearchBox contract; these test that person-enrichment USES it.
 *
 * ── THESE EIGHT WERE `it.fails` FOR ONE COMMIT ─────────────────────────────
 *
 * The adoption was blocked and they were marked `it.fails` rather than deleted
 * or silenced, because `it.fails` PASSES while a defect is present and FAILS
 * the moment it is fixed — a live tripwire rather than a muted test.
 *
 * The blocker was measured, not inferred: SearchBox--Autocomplete kept its
 * query in a private `let query = $state('')` and swallowed a `value` prop. A
 * throwaway probe mounted it with `value: 'Institute for Humane Studies'` and
 * read back `input.value === ''`. This member cannot live with that, because
 * `affiliation.completeName` ARRIVES POPULATED — the card renders "✓ Pre-filled
 * — matched email domain" over a name auto-detected from the person's email
 * domain or carried from a previous affiliation, and adopting would have
 * rendered that field empty and silently dropped a value the operator was shown.
 *
 * `value` is `$bindable` on both variants now, so the tripwire fired and these
 * are ordinary `it()` again. The history is kept because it is the argument for
 * the marker: not one of these eight was re-derived by hand after the fix.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, tick, flushSync } from 'svelte';
import AffiliationCard from '../src/pulse-dimensions/AffiliationCard.svelte';
import { affiliationFixture, ORGS } from './fixtures.svelte';
import type { AffiliationState, OrgSuggestion } from '../src/lib/types';

let host: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = '';
  host = document.createElement('div');
  host.className = 'pe-app';
  document.body.appendChild(host);
});

const settle = async (ms = 0) => {
  if (ms) await new Promise((r) => setTimeout(r, ms));
  flushSync();
  await tick();
  await Promise.resolve();
  await tick();
};

/** The debounce is 180ms and the component owns the number. Outlast it. */
const DEBOUNCE_WAIT = 300;

type Mounted = {
  input: () => HTMLInputElement;
  saved: () => number;
  picked: () => OrgSuggestion[];
};

function card(
  lookup: (q: string) => Promise<OrgSuggestion[]>,
  opts: { prefill?: string; onPick?: (a: AffiliationState, o: OrgSuggestion) => void } = {},
): Mounted {
  const affiliation = affiliationFixture(
    opts.prefill === undefined
      ? {}
      : { completeName: opts.prefill, autoDetectedFrom: 'email_domain' },
  );
  let saves = 0;
  const picks: OrgSuggestion[] = [];
  mount(AffiliationCard, {
    target: host,
    props: {
      affiliation,
      onSaveOrgName: async () => {
        saves++;
      },
      onAppendOrgLink: async () => {},
      onAppendOrgCorpus: async () => {},
      onAppendOrgDomain: async () => {},
      onLookupOrgs: lookup,
      onPickOrg: (o: OrgSuggestion) => {
        picks.push(o);
        opts.onPick?.(affiliation, o);
      },
      onRemove: () => {},
    },
  });
  return {
    // The complete_name field specifically — the card has three text inputs and
    // only this one drives the autocomplete.
    input: () => host.querySelector<HTMLInputElement>('#aff_complete_fixture-1')!,
    saved: () => saves,
    picked: () => picks,
  };
}

const listbox = () => host.querySelector('[role="listbox"]');
const options = () => Array.from(host.querySelectorAll<HTMLElement>('[role="option"]'));
/**
 * The popup's text, read WITHOUT assuming role="option" exists — so a staleness
 * assertion can only fail for one reason (the wrong term is on screen) instead
 * of failing because the role it queried has not been adopted yet.
 */
const popupText = () =>
  host.querySelector<HTMLElement>('[role="listbox"], .pe-org-suggest')?.textContent ?? '';

async function type(m: Mounted, text: string) {
  const el = m.input();
  el.value = text;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
}

async function key(m: Mounted, k: string) {
  m.input().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  await settle();
}

const all = async () => ORGS;

describe('person-enrichment AffiliationCard — the role triad', () => {
  it('the org-name field is the combobox', async () => {
    const m = card(all);
    expect(m.input().getAttribute('role')).toBe('combobox');
  });

  it('announces whether the popup is open, and names one that exists', async () => {
    const m = card(all);
    await settle();
    expect(m.input().getAttribute('aria-expanded')).toBe('false');
    expect(m.input().getAttribute('aria-controls')).toBeNull();
    await type(m, 'inst');
    await settle(DEBOUNCE_WAIT);
    expect(m.input().getAttribute('aria-expanded')).toBe('true');
    const id = m.input().getAttribute('aria-controls');
    expect(id).toBeTruthy();
    expect(document.getElementById(id!)).not.toBeNull();
  });

  it('the suggestions are options in a listbox', async () => {
    const m = card(all);
    await type(m, 'inst');
    await settle(DEBOUNCE_WAIT);
    expect(listbox()).not.toBeNull();
    expect(options().length).toBe(ORGS.length);
  });
});

describe('person-enrichment AffiliationCard — the input keeps focus', () => {
  it('ArrowDown moves the ACTIVE OPTION and leaves the caret in the field', async () => {
    const m = card(all);
    m.input().focus();
    await type(m, 'inst');
    await settle(DEBOUNCE_WAIT);
    await key(m, 'ArrowDown');
    expect(document.activeElement).toBe(m.input());
    const active = m.input().getAttribute('aria-activedescendant');
    expect(active).not.toBeNull();
    expect(document.getElementById(active!)).not.toBeNull();
    expect(options()[0].id).toBe(active);
    expect(options()[0].getAttribute('aria-selected')).toBe('true');
  });

  it('the SECOND suggestion is reachable from the keyboard', async () => {
    // Today it is not reachable at all: Enter hard-picks suggestions[0] and
    // there is no arrow handler, so row 2 can only be had with a mouse.
    const m = card(all);
    m.input().focus();
    await type(m, 'inst');
    await settle(DEBOUNCE_WAIT);
    await key(m, 'ArrowDown');
    await key(m, 'ArrowDown');
    await key(m, 'Enter');
    expect(m.picked().map((o) => String(o.id))).toEqual(['organizations:ihf']);
    expect(document.activeElement).toBe(m.input());
  });

  it('no suggestion is a tab stop — the popup adds none', async () => {
    const m = card(all);
    await type(m, 'inst');
    await settle(DEBOUNCE_WAIT);
    const popup = host.querySelector<HTMLElement>('[role="listbox"], .pe-org-suggest');
    expect(popup).not.toBeNull();
    const focusable = Array.from(
      popup!.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])'),
    ).filter((e) => !e.hasAttribute('disabled'));
    expect(focusable).toHaveLength(0);
  });

  it('Enter with NO active option is the MEMBER submit, not a hidden pick of row 1', async () => {
    // The WAI-ARIA contract, and a real capability the surface does not have
    // today: while suggestions are showing, the name the operator typed cannot
    // be committed, because Enter always belongs to suggestions[0].
    const m = card(all);
    m.input().focus();
    await type(m, 'Institute for Humane Studies of Nowhere');
    await settle(DEBOUNCE_WAIT);
    await key(m, 'Enter');
    expect(m.picked()).toHaveLength(0);
    expect(m.saved()).toBe(1);
  });

  it('Escape closes the popup without moving focus', async () => {
    // Asserted role-agnostically and OPEN-FIRST. Reading `[role="listbox"]`
    // alone made this pass vacuously today — there is no listbox to be null,
    // so "Escape closed it" and "it never opened" are the same assertion. This
    // member's Escape handling is genuinely correct, and that is only worth
    // recording if the test could have caught it being wrong.
    const m = card(all);
    m.input().focus();
    await type(m, 'inst');
    await settle(DEBOUNCE_WAIT);
    expect(popupText()).toContain('Institute');
    await key(m, 'Escape');
    expect(popupText()).toBe('');
    expect(listbox()).toBeNull();
    expect(document.activeElement).toBe(m.input());
  });
});

describe('person-enrichment AffiliationCard — the async states', () => {
  it('reports a failed lookup instead of pretending there are no matches', async () => {
    const m = card(async () => {
      throw new Error('resolver offline');
    });
    await type(m, 'inst');
    await settle(DEBOUNCE_WAIT);
    expect(host.querySelector('[data-state="error"]')).not.toBeNull();
  });

  it('does not query below two characters', async () => {
    const lookup = vi.fn(all);
    const m = card(lookup);
    await type(m, 'i');
    await settle(DEBOUNCE_WAIT);
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe('person-enrichment AffiliationCard — the hand-rolled stale guard', () => {
  // BOTH of these are expected GREEN before the refactor. This member's
  // `if (seq !== lookupSeq) return` is a COMPLETE guard — unlike org-workbench's
  // `term === q.trim()`, it is present in the catch block too. They are here so
  // the refactor cannot quietly lose a property the member already had.
  const slowThenFast = (q: string): Promise<OrgSuggestion[]> =>
    q.startsWith('inst')
      ? new Promise((r) => setTimeout(() => r([ORGS[0]]), 200))
      : Promise.resolve([ORGS[2]]);

  it('drops a stale SUCCESS', async () => {
    const m = card(slowThenFast);
    await type(m, 'inst');
    await settle(DEBOUNCE_WAIT);
    await type(m, 'bedrock');
    await settle(DEBOUNCE_WAIT + 250);
    expect(popupText()).toContain('Bedrock');
    expect(popupText()).not.toContain('Institute for Humane Studies');
  });

  it('drops a stale FAILURE', async () => {
    const m = card((q) =>
      q.startsWith('inst')
        ? new Promise((_r, reject) => setTimeout(() => reject(new Error('offline')), 200))
        : Promise.resolve([ORGS[2]]),
    );
    await type(m, 'inst');
    await settle(DEBOUNCE_WAIT);
    await type(m, 'bedrock');
    await settle(DEBOUNCE_WAIT + 250);
    expect(popupText()).toContain('Bedrock');
    expect(host.querySelector('[data-state="error"]')).toBeNull();
  });
});

describe('person-enrichment AffiliationCard — the value round-trip', () => {
  // THE BLOCKER, as a test. This is the one that kept the adoption parked: the
  // widget swallowed a `value` prop, and this field ARRIVES POPULATED from
  // email-domain detection or a previous affiliation. Rendering it empty would
  // have silently dropped a name the operator was shown and told to edit.
  it('renders a name that was pre-filled before the operator ever typed', async () => {
    const m = card(all, { prefill: 'Institute for Humane Studies' });
    await settle();
    expect(m.input().value).toBe('Institute for Humane Studies');
    // And the pre-fill banner the value belongs to is on screen with it.
    expect(host.textContent).toContain('Pre-filled');
  });

  it('a pick writes the chosen name INTO the box — bind:value both ways', async () => {
    // App.svelte's pickOrg() writes complete_name and conventional_name back
    // onto the affiliation. The box has to show that, which only works because
    // `value` is bindable rather than merely settable-once.
    const m = card(all, {
      onPick: (a, o) => {
        a.completeName = String(o.complete_name);
      },
    });
    m.input().focus();
    await type(m, 'inst');
    await settle(DEBOUNCE_WAIT);
    await key(m, 'ArrowDown');
    await key(m, 'Enter');
    await settle();
    expect(m.input().value).toBe('Institute for Humane Studies');
  });

  it('does NOT clear on select — this field is a value, not a search term', async () => {
    // `clearOnSelect` is deliberately OFF here. It exists for surfaces that PICK
    // (add a tag, leave the box empty for the next one); this box holds the
    // organisation name being saved, so emptying it would discard the answer.
    const m = card(all);
    m.input().focus();
    await type(m, 'inst');
    await settle(DEBOUNCE_WAIT);
    await key(m, 'ArrowDown');
    await key(m, 'Enter');
    await settle();
    expect(m.picked()).toHaveLength(1);
    expect(m.input().value).toBe('inst');
  });

  it('passes the widget no key it refuses — no console.error from shared-ui', async () => {
    // `oninput`, `onkeydown` and `value` belong to the keyboard contract and are
    // refused OUT LOUD. This card needs two of those keystrokes for its own
    // dissociate-on-edit and save-on-Enter, and takes them on a WRAPPER. If
    // someone moves them back onto the component, this catches it.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const m = card(all);
    m.input().focus();
    await type(m, 'inst');
    await settle(DEBOUNCE_WAIT);
    await key(m, 'ArrowDown');
    const refusals = spy.mock.calls
      .map((c) => String(c[0]))
      .filter((line) => line.includes('<SearchBox>'));
    spy.mockRestore();
    expect(refusals).toEqual([]);
  });
});
