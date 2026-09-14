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
 * ── WHY THE DEFECTS ARE STILL HERE ─────────────────────────────────────────
 *
 * THE ADOPTION IS BLOCKED, and the eight claims below are marked `it.fails`
 * rather than deleted or silenced. `it.fails` PASSES while the defect is
 * present and FAILS the moment it is fixed, so each one is a live tripwire: the
 * engineer who adopts SearchBox here cannot land it without coming back to this
 * file.
 *
 * The blocker, measured with a throwaway probe and not inferred:
 * `SearchBox--Autocomplete` keeps its query in a PRIVATE `let query = $state('')`
 * and never exposes it. `value` passed as a prop is swallowed — the probe
 * mounted it with `value: 'Institute for Humane Studies'` and read back
 * `input.value === ''`.
 *
 * This member cannot live with that. `affiliation.completeName` ARRIVES
 * POPULATED: the card renders "✓ Pre-filled — matched email domain" over a name
 * auto-detected from the person's email domain or carried over from a previous
 * affiliation. Adopting today would render that field empty and silently drop a
 * value the operator was shown and expected to edit. That is a worse regression
 * than every defect below combined.
 *
 * What unblocks it, in packages/ and therefore NOT done here:
 *   `value = $bindable('')` on SearchBox--Autocomplete, forwarded to the core's
 *   existing `bind:value`. SearchBoxCore ALREADY has it; only the variant does
 *   not pass it through.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, tick, flushSync } from 'svelte';
import AffiliationCard from '../src/pulse-dimensions/AffiliationCard.svelte';
import { affiliationFixture, ORGS } from './fixtures.svelte';
import type { OrgSuggestion } from '../src/lib/types';

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

function card(lookup: (q: string) => Promise<OrgSuggestion[]>): Mounted {
  const affiliation = affiliationFixture();
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
      onPickOrg: (o: OrgSuggestion) => picks.push(o),
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
  it.fails('the org-name field is the combobox', async () => {
    const m = card(all);
    expect(m.input().getAttribute('role')).toBe('combobox');
  });

  it.fails('announces whether the popup is open, and names one that exists', async () => {
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

  it.fails('the suggestions are options in a listbox', async () => {
    const m = card(all);
    await type(m, 'inst');
    await settle(DEBOUNCE_WAIT);
    expect(listbox()).not.toBeNull();
    expect(options().length).toBe(ORGS.length);
  });
});

describe('person-enrichment AffiliationCard — the input keeps focus', () => {
  it.fails('ArrowDown moves the ACTIVE OPTION and leaves the caret in the field', async () => {
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

  it.fails('the SECOND suggestion is reachable from the keyboard', async () => {
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

  it.fails('no suggestion is a tab stop — the popup adds none', async () => {
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

  it.fails('Enter with NO active option is the MEMBER submit, not a hidden pick of row 1', async () => {
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
  it.fails('reports a failed lookup instead of pretending there are no matches', async () => {
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
