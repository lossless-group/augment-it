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
  // curation.svelte.ts calls this at module scope (gh #93 centralised the WS
  // endpoint here). Omitting it makes the import throw, which collects as
  // "no tests" rather than a failure — so the suite sat dead and green-looking.
  resolveWsUrl: () => 'ws://localhost:3001/ws',
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
const routedInvoke = (domains: Array<{ slug: string; title: string; tags: string[]; type?: string }>) =>
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
  curation.activeType = null;
  curation.sources = [];
  curation.sourcesStatus = 'idle';
  curation.lastError = null;
  ws.workspaces = [];
  ws.active_client_id = null;
  ws.invoke = vi.fn(async () => ({ domains: [] }));
  ws.activateWorkspace = vi.fn(async () => {});
  localStorage.clear();
});

describe('Group G — curator surface state', () => {
  test('bootstrap resolves the workspace’s preferred vocabulary, and lists corpora without filtering on it', async () => {
    ws.active_client_id = 'humain-vc';
    ws.workspaces = [wsSummary('humain-vc', 'thesis')];
    const invoke = vi.fn(async () => ({ domains: [] }));
    ws.invoke = invoke;

    await curation.bootstrap();

    // The preference still resolves — it is the create form's default.
    expect(curation.domainType).toBe('thesis');
    // But it is NOT a filter. domain.list asks for the whole workspace.
    expect(invoke).toHaveBeenCalledWith('domain.list', { client_slug: 'humain-vc' });
  });

  // Regression — gh #88. The reported failure: humain-vc saw "No corpora yet"
  // while holding theses, because workspace.list had not arrived, the type
  // guess fell back to 'strategy', and the list was filtered by it.
  test('a workspace whose summary never arrived still sees every corpus it owns', async () => {
    ws.active_client_id = 'humain-vc';
    ws.workspaces = []; // the failure condition: workspace.list timed out
    const invoke = routedInvoke([
      { slug: 'consumer-immunology', type: 'thesis', title: 'Consumer Immunology', tags: [] },
      { slug: 'ai-infra-for-bioscience', type: 'thesis', title: 'AI Infrastructure for Bioscience', tags: [] },
    ]);
    ws.invoke = invoke;

    await curation.bootstrap();

    // The guess is wrong — nothing can be done about that with no summary.
    expect(curation.domainType).toBe('strategy');
    // It no longer costs anything: the theses are all here.
    expect(curation.strategies).toHaveLength(2);
    expect(invoke).toHaveBeenCalledWith('domain.list', { client_slug: 'humain-vc' });
  });

  test('the type sent with a corpus-scoped call comes from that corpus, not the ambient preference', async () => {
    curation.clientSlug = 'humain-vc';
    curation.domainType = 'strategy'; // deliberately the wrong guess
    const invoke = routedInvoke([{ slug: 'consumer-immunology', type: 'thesis', title: 'CI', tags: [] }]);
    ws.invoke = invoke;

    await curation.loadStrategies();
    await curation.select('consumer-immunology', 'thesis');

    expect(invoke).toHaveBeenCalledWith('domain.assemble', {
      type: 'thesis',
      slug: 'consumer-immunology',
      client_slug: 'humain-vc',
    });
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
    expect(curation.activeType).toBeNull();
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

  // (type, slug) is the real key — "apprenticeship" can be a strategy AND a
  // topic — so the persisted selection carries both since gh #88.
  test('a restored selection disambiguates two corpora that share a slug', async () => {
    curation.clientSlug = 'reach-edu';
    localStorage.setItem('augment-it:active-strategy', 'topic:apprenticeship');
    ws.invoke = routedInvoke([
      { slug: 'apprenticeship', type: 'strategy', title: 'Apprenticeship (strategy)', tags: [] },
      { slug: 'apprenticeship', type: 'topic', title: 'Apprenticeship (topic)', tags: [] },
    ]);

    await curation.loadStrategies();
    await settle();

    expect(curation.activeSlug).toBe('apprenticeship');
    expect(curation.activeType).toBe('topic');
    expect(curation.active?.title).toBe('Apprenticeship (topic)');
  });
});

// Group G2 — gh #95. The reported failure: three corpora in a row showed the
// SAME three sources, each under its own name and its own "3 sources" count.
// SurrealDB was correct and correctly scoped; the resolver query was correct.
// The socket had dropped, select() had already moved the header, and the
// assignment that replaces `sources` sat behind an await that never resolved.
//
// The fix has two halves and both are tested here: clear before the await, and
// refuse a reply that answers a question we are no longer asking.
describe('Group G2 — a corpus never shows another corpus’s sources', () => {
  const aSource = (title: string) => ({ source_uuid: `u-${title}`, title, url: `https://example.test/${title}` });

  /** invoke that answers domain.assemble with a caller-supplied reply. */
  const assembleWith = (reply: unknown) =>
    vi.fn(async (cap: string) => {
      if (cap === 'domain.assemble') return reply;
      if (cap === 'tag.suggest') return { tags: [] };
      if (cap === 'domain.list') return { domains: [] };
      return {};
    });

  test('a reply carrying a different slug is refused, not rendered', async () => {
    curation.clientSlug = 'humain-vc';
    // The resolver answers for ai-infrastructure-for-bioscience while the
    // operator is looking at consumer-immunology — the production symptom.
    ws.invoke = assembleWith({
      type: 'thesis',
      slug: 'ai-infrastructure-for-bioscience',
      sources: [aSource('Imaging Flow Cytometry')],
    });

    await curation.select('consumer-immunology', 'thesis');
    await settle();

    expect(curation.sources).toEqual([]);
    expect(curation.sourcesStatus).toBe('error');
  });

  test('switching corpora clears the previous sources before the reply arrives', async () => {
    curation.clientSlug = 'humain-vc';
    ws.invoke = assembleWith({ type: 'thesis', slug: 'a', sources: [aSource('A-only')] });
    await curation.select('a', 'thesis');
    await settle();
    expect(curation.sources).toHaveLength(1);

    // Now a corpus whose reply never comes — the dead-socket case.
    ws.invoke = vi.fn((cap: string) =>
      cap === 'domain.assemble' ? new Promise(() => {}) : Promise.resolve({}),
    ) as typeof ws.invoke;
    void curation.select('b', 'thesis');

    // No await: the clear must happen before the first suspension point, or
    // corpus A's rows sit under corpus B's name for as long as B takes.
    expect(curation.sources).toEqual([]);
    expect(curation.sourcesStatus).toBe('loading');
  });

  test('a superseded selection does not overwrite the corpus that replaced it', async () => {
    curation.clientSlug = 'humain-vc';
    // 'slow' resolves after 'fast', simulating out-of-order replies.
    ws.invoke = vi.fn(async (cap: string, args: unknown) => {
      if (cap !== 'domain.assemble') return cap === 'tag.suggest' ? { tags: [] } : {};
      const slug = (args as { slug: string }).slug;
      const delay = slug === 'slow' ? 40 : 1;
      await new Promise((r) => setTimeout(r, delay));
      return { type: 'thesis', slug, sources: [aSource(slug)] };
    }) as typeof ws.invoke;

    const first = curation.select('slow', 'thesis');
    const second = curation.select('fast', 'thesis');
    await Promise.all([first, second]);
    await settle();

    expect(curation.activeSlug).toBe('fast');
    expect(curation.sources.map((x) => x.title)).toEqual(['fast']);
  });

  test('a resolver that does not echo (type, slug) is still trusted', async () => {
    // Deployment ordering: the resolver and this remote ship independently. An
    // old resolver sends no echo, and rejecting that would blank the surface —
    // trading a subtle bug for a total outage.
    curation.clientSlug = 'humain-vc';
    ws.invoke = assembleWith({ sources: [aSource('legacy-reply')] });

    await curation.select('consumer-immunology', 'thesis');
    await settle();

    expect(curation.sources).toHaveLength(1);
    expect(curation.sourcesStatus).toBe('ready');
  });
});
