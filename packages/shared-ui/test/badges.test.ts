/**
 * CountBadge and StatusIndicator — the claims their headers make.
 *
 * Both are appearance components, so unlike Selector these were written after
 * the implementation. What they assert is the part that ISN'T visual: the
 * accessible name, the tone mapping, and the colour-alone rule.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import CountBadge from '../src/CountBadge.svelte';
import StatusIndicator from '../src/StatusIndicator.svelte';

let host: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '';
  host = document.createElement('div');
  document.body.appendChild(host);
});
const render = (C: never, props: Record<string, unknown>) =>
  mount(C, { target: host, props }) && (host.firstElementChild as HTMLElement);

describe('CountBadge', () => {
  it('inherits the host control colour by default — that is what makes it not a Chip', () => {
    const el = render(CountBadge as never, { count: 3 });
    expect(el.getAttribute('data-tone')).toBe('inherit');
  });

  it('caps a large count but keeps the true number reachable', () => {
    const el = render(CountBadge as never, { count: 1982, label: 'Responses' });
    expect(el.textContent).toBe('999+');
    expect(el.getAttribute('title')).toBe('1982');
    expect(el.getAttribute('aria-label')).toBe('Responses: 1982');
  });

  it('defaults to md, and sm exists so it can sit in a small row', () => {
    const a = render(CountBadge as never, { count: 1 });
    expect(a.getAttribute('data-size')).toBe('md');
    host.innerHTML = '';
    const b = render(CountBadge as never, { count: 1, size: 'sm' });
    expect(b.getAttribute('data-size')).toBe('sm');
  });

  it('inherit uses a RING, never a fill — a fill costs the host its text contrast', () => {
    const src = readFileSync(resolve('src/CountBadge.svelte'), 'utf8');
    const rule = src.match(/\[data-tone='inherit'\]\s*\{[^}]*\}/)![0];
    expect(rule).toMatch(/background:\s*transparent/);
    expect(rule).not.toMatch(/color-mix/);
  });

  it('does not cap when it does not need to', () => {
    const el = render(CountBadge as never, { count: 12 });
    expect(el.textContent).toBe('12');
    expect(el.hasAttribute('title')).toBe(false);
  });
});

describe('StatusIndicator — the mapping IS the component', () => {
  const cases: Array<[string, string]> = [
    ['open', 'ok'],
    ['connecting', 'info'],
    ['auth_required', 'warn'],
    ['closed', 'error'],
    ['error', 'error'],
    ['idle', 'neutral'],
  ];

  for (const [state, tone] of cases) {
    it(`${state} → ${tone}`, () => {
      const el = render(StatusIndicator as never, { state });
      expect(el.getAttribute('data-tone')).toBe(tone);
    });
  }

  it('gives connecting and auth_required DIFFERENT tones — the distinction every member lost', () => {
    const a = render(StatusIndicator as never, { state: 'connecting' });
    host.innerHTML = '';
    const b = render(StatusIndicator as never, { state: 'auth_required' });
    expect(a.getAttribute('data-tone')).not.toBe(b.getAttribute('data-tone'));
  });

  it('gives closed and connecting different tones too', () => {
    const a = render(StatusIndicator as never, { state: 'closed' });
    host.innerHTML = '';
    const b = render(StatusIndicator as never, { state: 'connecting' });
    expect(a.getAttribute('data-tone')).not.toBe(b.getAttribute('data-tone'));
  });

  it('never encodes state by colour alone — the word always renders', () => {
    for (const [state] of cases) {
      host.innerHTML = '';
      const el = render(StatusIndicator as never, { state });
      const word = el.querySelector('.ui-status__word')!;
      expect(word.textContent!.trim().length).toBeGreaterThan(0);
    }
  });

  it('hides the dot from assistive tech, because the word carries the meaning', () => {
    const el = render(StatusIndicator as never, { state: 'open' });
    expect(el.querySelector('.ui-status__dot')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('every state renders a DISTINCT word', () => {
    const words = new Set<string>();
    for (const [state] of cases) {
      host.innerHTML = '';
      const el = render(StatusIndicator as never, { state });
      words.add(el.querySelector('.ui-status__word')!.textContent!.trim());
    }
    expect(words.size).toBe(cases.length);
  });
});

describe('the connection vocabulary is importable, not re-declared sixteen times', () => {
  it('ships as a real module a member can reach through the exports map', async () => {
    const { CONNECTION_STATES } = await import('../src/status.js');
    expect(CONNECTION_STATES).toHaveLength(6);
  });

  it('the exported list and the component agree — nothing silently drifts', () => {
    const { CONNECTION_STATES } = require('../src/status.ts') as {
      CONNECTION_STATES: readonly string[];
    };
    const src = readFileSync(resolve('src/StatusIndicator.svelte'), 'utf8');
    const tone = src.match(/const TONE[^=]*=\s*\{([^}]*)\}/)![1];
    const word = src.match(/const WORD[^=]*=\s*\{([^}]*)\}/)![1];
    for (const s of CONNECTION_STATES) {
      expect(tone).toContain(s);
      expect(word).toContain(s);
    }
  });

  it('package.json exports it, or no member can import it', () => {
    const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
    expect(pkg.exports['./status.js']).toBeTruthy();
  });
});
