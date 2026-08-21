// Guard — the workspace WS endpoint is decided in exactly one place.
//
// Regression test for the defect where sixteen remotes each declared
// `const WS_URL = 'ws://localhost:3001/ws'` and never read the environment,
// so augment.didi.sh opened data sockets against the *visitor's* laptop and
// every Augment-from-DB surface rendered empty behind a `closed` badge.
// Local dev hid it completely, because the operator's machine really does
// run workspace-service on :3001.
//
// The unit assertions cover the resolver; the source sweep is what actually
// stops the regression, because the original bug was never a logic error —
// it was copy-paste into a new remote.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, test } from 'vitest';
import { DEFAULT_WS_URL, resolveHttpBase, resolveWsUrl } from '../src/ws-url';

const REPO_ROOT = join(import.meta.dirname, '../../..');
/** The one file allowed to name the dev endpoint: the fallback itself. */
const ALLOWED = ['packages/workspace/src/ws-url.ts'];

function sourceFiles(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    // Tests legitimately name endpoints (fixtures, assertions, this file).
    if (e === 'node_modules' || e === 'dist' || e === '.git' || e === 'test') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.(ts|svelte)$/.test(e) && !/\.(test|spec)\.ts$/.test(e)) out.push(p);
  }
  return out;
}

describe('resolveWsUrl', () => {
  test('falls back to the local dev endpoint when PUBLIC_WS_URL is unset', () => {
    // rsbuild inlines the var at build time; under vitest it is simply absent.
    expect(resolveWsUrl()).toBe(DEFAULT_WS_URL);
  });

  test('derives the plain-HTTP origin from a ws endpoint', () => {
    expect(resolveHttpBase('ws://localhost:3001/ws')).toBe('http://localhost:3001');
    expect(resolveHttpBase('wss://ws.augment.didi.sh/ws')).toBe('https://ws.augment.didi.sh');
  });
});

describe('no surface hardcodes the workspace endpoint', () => {
  test('ws://localhost:3001 appears only in the shared fallback', () => {
    const roots = ['apps', 'shell', 'packages'].map((d) => join(REPO_ROOT, d));
    const offenders: string[] = [];

    for (const root of roots) {
      for (const file of sourceFiles(root)) {
        const rel = relative(REPO_ROOT, file);
        if (ALLOWED.includes(rel)) continue;
        if (readFileSync(file, 'utf8').includes('ws://localhost:3001')) offenders.push(rel);
      }
    }

    expect(
      offenders,
      `These files name the dev WS endpoint directly. Import resolveWsUrl() from ` +
        `@augment-it/workspace instead — a literal here is invisible on localhost ` +
        `and breaks every deployed surface.\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });
});
