// Group G — Curator surface state.
// Registry: context-v/specs/Corpora-Builder-Harmony-Test-Registry.md
//
// Test names are the registry's ✓-phrases, verbatim. The curator is a
// Svelte 5 runes singleton; tests run it under the svelte plugin + jsdom
// with @augment-it/workspace mocked, and reset the singleton's state per
// test. This is the client half of the humain-vc "wrong domain type" bug.

import { beforeEach, describe, expect, test, vi } from 'vitest';

// A mutable stand-in for the workspace singleton — tests reconfigure its
// fields and its invoke spy per case.
const ws = {
  workspaces: [] as Array<{ client_id: string; default_domain_type: string; display_name: string; has_env: boolean; org_id: string | null }>,
  active_client_id: null as string | null,
  connect: vi.fn(),
  loadWorkspaces: vi.fn(async () => {}),
  activateWorkspace: vi.fn(async (_id: string) => {}),
  invoke: vi.fn(async (_cap: string, _args: unknown) => ({}) as unknown),
};

vi.mock('@augment-it/workspace', () => ({
  workspace: ws,
  WORKSPACE_CHANGED_EVENT: 'workspace-changed',
}));

// Imported once; the constructor registers the cross-remote window listener.
const { curation } = await import('../src/curation.svelte.ts');

const wsSummary = (client_id: string, default_domain_type: string) => ({
  client_id,
  default_domain_type,
  display_name: client_id,
  has_env: true,
  org_id: null,
});

/** Route invoke by capability so select()'s domain.assemble + tag.suggest
 *  don't blow up while a test focuses on domain.list. */
const routedInvoke = (domains: Array<{ slug: string; title: string; tags: string[] }>) =>
  vi.fn(async (cap: string) => {
    if (cap === 'domain.list') return { domains };
    if (cap === 'domain.assemble') return { sources: [] };
    if (cap === 'tag.suggest') return { tags: [] };
    return {};
  });

const settle = () => new Promise((r) => setTimeout(r, 25));

beforeEach(() => {
  curation.clientSlug = null;
  curation.domainType = 'strategy';
  curation.strategies = [];
  curation.activeSlug = null;
  curation.sources = [];
  curation.lastError = null;
  ws.workspaces = [];
  ws.active_client_id = null;
  ws.invoke = vi.fn(async () => ({ domains: [] }));
  ws.activateWorkspace = vi.fn(async () => {});
  localStorage.clear();
});

describe('Group G — curator surface state', () => {
  test('bootstrap resolves the active workspace’s default domain type before the first domain.list fires', async () => {
    ws.active_client_id = 'humain-vc';
    ws.workspaces = [wsSummary('humain-vc', 'thesis')];
    const invoke = vi.fn(async () => ({ domains: [] }));
    ws.invoke = invoke;

    await curation.bootstrap();

    // The humain-vc bug in one assertion: the FIRST query must ask for
    // thesis, not the flat 'strategy' fallback.
    expect(curation.domainType).toBe('thesis');
    expect(invoke).toHaveBeenCalledWith('domain.list', { type: 'thesis', client_slug: 'humain-vc' });
  });

  test('switching workspaces resets the list, the active corpus, and the domain type to the new workspace’s default', async () => {
    // Start in humain-vc/thesis with loaded state.
    curation.clientSlug = 'humain-vc';
    curation.domainType = 'thesis';
    curation.strategies = [{ slug: 'x', title: 'X', tags: [] }] as never;
    curation.sources = [{}] as never;
    curation.activeSlug = 'x';
    ws.workspaces = [wsSummary('reach-edu', 'strategy')];
    ws.invoke = routedInvoke([]);
    // The real package dispatches WORKSPACE_CHANGED_EVENT on activate.
    ws.activateWorkspace = vi.fn(async (id: string) => {
      window.dispatchEvent(new CustomEvent('workspace-changed', { detail: { client_id: id } }));
    });

    await curation.switchWorkspace('reach-edu');
    await settle();

    expect(curation.clientSlug).toBe('reach-edu');
    expect(curation.domainType).toBe('strategy'); // reach-edu's default, not humain-vc's thesis
    expect(curation.activeSlug).toBeNull();
    expect(curation.sources).toEqual([]);
  });

  test('a workspace change broadcast from another remote re-scopes this surface too', async () => {
    curation.clientSlug = 'humain-vc';
    curation.domainType = 'thesis';
    ws.workspaces = [wsSummary('reach-edu', 'strategy')];
    ws.invoke = routedInvoke([]);

    // No switchWorkspace call here — a sibling remote flipped the workspace
    // and only the cross-remote event bridges to us.
    window.dispatchEvent(new CustomEvent('workspace-changed', { detail: { client_id: 'reach-edu' } }));
    await settle();

    expect(curation.clientSlug).toBe('reach-edu');
    expect(curation.domainType).toBe('strategy');
  });

  test('a handler error reply surfaces as a visible error, never as an empty rail', async () => {
    curation.clientSlug = 'humain-vc';
    curation.domainType = 'thesis';
    ws.invoke = vi.fn(async () => ({ ok: false, error: 'resolver down' }));

    await curation.loadStrategies();

    // "broken" is distinguishable from "empty": empty rail AND a set error.
    expect(curation.strategies).toEqual([]);
    expect(curation.lastError).toMatch(/domain\.list/);
    expect(curation.lastError).toMatch(/resolver down/);
  });

  test('a saved corpus selection is restored only if it exists in the freshly loaded list', async () => {
    curation.clientSlug = 'humain-vc';
    curation.domainType = 'thesis';

    // Saved slug IS in the loaded list → restored.
    localStorage.setItem('augment-it:active-strategy', 'consumer-immunology');
    ws.invoke = routedInvoke([{ slug: 'consumer-immunology', title: 'Consumer Immunology', tags: [] }]);
    await curation.loadStrategies();
    await settle();
    expect(curation.activeSlug).toBe('consumer-immunology');

    // Saved slug is stale (not in the new list) → NOT restored.
    curation.activeSlug = null;
    localStorage.setItem('augment-it:active-strategy', 'ghost-from-another-workspace');
    ws.invoke = routedInvoke([{ slug: 'consumer-immunology', title: 'Consumer Immunology', tags: [] }]);
    await curation.loadStrategies();
    await settle();
    expect(curation.activeSlug).toBeNull();
  });
});
