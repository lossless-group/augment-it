/**
 * org-workbench — the three disclosures, as executable claims.
 *
 * WRITTEN AGAINST THE MARKUP THAT SHIPS TODAY, before the refactor. Every
 * defect below renders perfectly; none is visible in a screenshot.
 *
 *   1. PeopleReveal's header button carries `aria-controls="ow-people-list"`
 *      UNCONDITIONALLY. That id belongs to the ListContainer inside `{#if open}`
 *      — and inside a further `{#if people.length > 0}`. Collapsed, the button
 *      points a screen reader at an element that is not in the document.
 *   2. BriefPanel's trigger has the same shape: `aria-controls="ow-brief-panel"`
 *      against a panel that only exists when open.
 *   3. The person row passes `aria-expanded` into SelectWrapper--ClickBody,
 *      which HARD-RENDERS `aria-pressed`. The row therefore announces a
 *      toggle-button contract AND a disclosure contract at once. A disclosure
 *      is not a toggle button; DisclosureRow's own header names this as the
 *      wrong contract.
 *
 * These do NOT re-test DisclosureRow — packages/shared-ui/test/disclosure.test.ts
 * owns that contract. These test that org-workbench USES it.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount, tick, flushSync } from 'svelte';
import PeopleReveal from '../src/PeopleReveal.svelte';
import BriefPanel from '../src/BriefPanel.svelte';

let host: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = '';
  host = document.createElement('div');
  host.className = 'ow-app';
  document.body.appendChild(host);
});

const settle = async () => {
  flushSync();
  await tick();
  await Promise.resolve();
  await tick();
};

function people() {
  mount(PeopleReveal, {
    target: host,
    props: { org_slug: 'acme-foundation', orgName: 'Acme Foundation', client: 'test-client' },
  });
  // The section's disclosure trigger, found by its role-defining attribute
  // rather than by a member class, so the test survives the refactor it drives.
  return host.querySelector<HTMLButtonElement>('button[aria-expanded]')!;
}

describe('org-workbench PeopleReveal — the section header', () => {
  it('does not point aria-controls at an element that is not in the document', async () => {
    const trigger = people();
    await settle();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    const id = trigger.getAttribute('aria-controls');
    // Either the attribute is absent while collapsed, or its target exists.
    // Today it is present and its target does not exist.
    if (id !== null) expect(document.getElementById(id)).not.toBeNull();
  });

  it('aria-expanded tracks the panel that is actually on screen', async () => {
    const trigger = people();
    await settle();
    trigger.click();
    await settle();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const id = trigger.getAttribute('aria-controls');
    expect(id).toBeTruthy();
    expect(document.getElementById(id!)).not.toBeNull();
  });

  it('carries no aria-pressed — the header discloses, it does not select', async () => {
    const trigger = people();
    await settle();
    expect(trigger.hasAttribute('aria-pressed')).toBe(false);
  });

  it('does not read the chevron glyph out as part of its accessible name', async () => {
    const trigger = people();
    await settle();
    // It used to render `{open ? '▾' : '▸'} People 2` INSIDE the button, so the
    // accessible name was "▾ People 2". A chevron is decoration; it belongs to
    // aria-hidden, not to the name.
    expect(trigger.textContent ?? '').not.toMatch(/[▾▸▴▿]/);
    const chevron = trigger.querySelector('[data-chevron]');
    expect(chevron?.getAttribute('aria-hidden')).toBe('true');
  });

  it('declares a target-size floor rather than inheriting one by luck', async () => {
    const trigger = people();
    await settle();
    expect(getComputedStyle(trigger).minBlockSize).not.toBe('0px');
  });
});

describe('org-workbench PeopleReveal — the person rows', () => {
  it('a person row never carries BOTH aria-pressed and aria-expanded', async () => {
    const trigger = people();
    await settle();
    trigger.click();
    await settle();
    const rows = Array.from(host.querySelectorAll<HTMLElement>('.ow-person button'));
    expect(rows.length).toBeGreaterThan(0);
    const confused = rows.filter((r) => r.hasAttribute('aria-pressed') && r.hasAttribute('aria-expanded'));
    expect(confused).toHaveLength(0);
  });

  it('a person row announces exactly one contract, and it is the one its wrapper renders', async () => {
    const trigger = people();
    await settle();
    trigger.click();
    await settle();
    const row = host.querySelector<HTMLButtonElement>('.ow-person button')!;
    // SelectWrapper--ClickBody hard-renders aria-pressed BEFORE its {...rest}, so
    // a member cannot swap the contract without fighting the component. The row
    // therefore keeps the toggle-button contract, coherently, and the missing
    // organ — a CARD ROW THAT DISCLOSES — is raised rather than invented here.
    expect(row.hasAttribute('aria-pressed')).toBe(true);
    expect(row.hasAttribute('aria-expanded')).toBe(false);
  });
});

describe('org-workbench BriefPanel — the trigger', () => {
  it('does not point aria-controls at an element that is not in the document', async () => {
    mount(BriefPanel, { target: host, props: { client: 'test-client' } });
    await settle();
    const trigger = host.querySelector<HTMLButtonElement>('.ow-brief button')!;
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    const id = trigger.getAttribute('aria-controls');
    if (id !== null) expect(document.getElementById(id)).not.toBeNull();
  });
});
