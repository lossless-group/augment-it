// Group I — End-to-end integration (no browser).
// Registry: context-v/specs/Corpora-Builder-Harmony-Test-Registry.md
//
// The whole backend chain as one system — workspace-service → NATS →
// record-surrealdb-resolver → in-memory SurrealDB, plus content-ingest
// writing corpus files — all against DISPOSABLE state, driven over the
// platform-native WebSocket (NOT the `ws` package). This is "E2E as the
// operator lives it" minus the rendered pixels; the manual browser-drive
// rung covers the pixels. The bug that started all this — corpora not
// loading, creations going missing — is exactly what this exercises.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
// @ts-expect-error — plain .mjs harness, no type decls
import { startBackend } from './harness.mjs';

let be: { stop: () => Promise<void>; wsUrl: string; client: string; clientsRoot: string };

beforeAll(async () => {
  be = await startBackend();
}, 90_000);

afterAll(async () => {
  await be?.stop();
});

type Frame = { kind: string; id?: string; ok?: boolean; result?: any; error?: string; [k: string]: unknown };

/** Open a native WebSocket, capture the session frame, run one invoke,
 *  resolve with { session, result }. Sends the invoke only AFTER the session
 *  frame — the server registers its message handler at the tail of the async
 *  connection setup, so the session frame is the readiness signal. */
function session(wsUrl: string, capability: string, args: unknown): Promise<{ session: Frame; result: any }> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl); // native global
    const id = `e2e_${capability}`;
    let sessionFrame: Frame | null = null;
    const to = setTimeout(() => { socket.close(); reject(new Error(`invoke ${capability} timed out`)); }, 20_000);
    socket.addEventListener('message', (e) => {
      const f = JSON.parse((e as MessageEvent).data as string) as Frame;
      if (f.kind === 'session') {
        sessionFrame = f;
        socket.send(JSON.stringify({ kind: 'invoke', id, capability, args }));
      } else if (f.kind === 'result' && f.id === id) {
        clearTimeout(to);
        socket.close();
        f.ok ? resolve({ session: sessionFrame!, result: f.result }) : reject(new Error(f.error));
      }
    });
    socket.addEventListener('error', () => { clearTimeout(to); reject(new Error('socket error')); });
  });
}

describe('Group I — end-to-end integration (no browser)', () => {
  test('the session frame declares the workspace’s tenancy at connect', async () => {
    const { session: s } = await session(be.wsUrl, 'domain.list', { type: 'thesis', client_slug: be.client });
    expect(s.didi_auth_mode).toBe('off');
    expect(s.allowed_clients).toContain(be.client);
    expect(s.active_client_id).toBe(be.client);
  });

  test('the workspace’s corpora load end-to-end — domain.list returns the seeded theses', async () => {
    const { result } = await session(be.wsUrl, 'domain.list', { type: 'thesis', client_slug: be.client });
    const slugs = (result.domains ?? []).map((d: { slug: string }) => d.slug).sort();
    expect(slugs).toContain('consumer-immunology');
    expect(slugs).toContain('specialized-foundation-models');
  });

  test('domain.list scoped to the workspace’s type returns only that type', async () => {
    // The humain-vc symptom as integration: asking for 'thesis' returns the
    // theses; asking for 'strategy' (the wrong type for this workspace)
    // returns nothing — indistinguishable-from-broken is now distinguishable.
    const thesis = await session(be.wsUrl, 'domain.list', { type: 'thesis', client_slug: be.client });
    const strategy = await session(be.wsUrl, 'domain.list', { type: 'strategy', client_slug: be.client });
    expect((thesis.result.domains ?? []).length).toBeGreaterThanOrEqual(2);
    expect((strategy.result.domains ?? []).length).toBe(0);
  });

  test('a corpus created through the chain is durable — create, re-list, and it is still there (with its index.md on disk)', async () => {
    // The lost-creations bug as integration: the create must round-trip the
    // whole chain — DB row (resolver → SurrealDB) AND file (resolver →
    // content-ingest → disk) — and survive a fresh re-list.
    const created = await session(be.wsUrl, 'domain.create', {
      type: 'thesis',
      slug: 'e2e-created-corpus',
      title: 'E2E Created Corpus',
      client_slug: be.client,
    });
    expect(created.result.domain?.slug).toBe('e2e-created-corpus');

    // Re-list on a FRESH connection — proves it persisted, not just echoed.
    const relisted = await session(be.wsUrl, 'domain.list', { type: 'thesis', client_slug: be.client });
    const slugs = (relisted.result.domains ?? []).map((d: { slug: string }) => d.slug);
    expect(slugs).toContain('e2e-created-corpus');

    // And the index.md landed on disk (theses/<slug>/index.md).
    const dir = join(be.clientsRoot, be.client, 'corpus', 'theses', 'e2e-created-corpus');
    const files = await readdir(dir);
    expect(files).toContain('index.md');
  });
});
