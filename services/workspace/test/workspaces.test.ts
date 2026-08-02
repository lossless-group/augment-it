// Group D — Workspace registry & per-client config.
// Registry: context-v/specs/Corpora-Builder-Harmony-Test-Registry.md
//
// Test names are the registry's ✓-phrases, verbatim. Each test builds a
// throwaway clients/ root on disk and loads src/workspaces.ts fresh via
// dynamic import, because WORKSPACE_ORG_MAP is parsed once at module
// load — the env fallback can only be exercised with module isolation.

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let clientsRoot: string;

async function seedWorkspace(
  slug: string,
  opts: { env?: string; workspaceJson?: object } = {},
): Promise<void> {
  const dir = join(clientsRoot, slug);
  await mkdir(dir, { recursive: true });
  if (opts.env !== undefined) await writeFile(join(dir, '.env'), opts.env);
  if (opts.workspaceJson !== undefined) {
    await writeFile(join(dir, 'workspace.json'), JSON.stringify(opts.workspaceJson));
  }
}

/** Load a FRESH copy of the module, optionally with env vars set first. */
async function loadWorkspacesModule(env: Record<string, string> = {}) {
  vi.resetModules();
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(env)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }
  try {
    const mod = await import('../src/workspaces');
    await mod.initWorkspaces({ clients_root: clientsRoot });
    return mod;
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

beforeEach(async () => {
  clientsRoot = await mkdtemp(join(tmpdir(), 'augment-it-workspaces-test-'));
});

afterEach(async () => {
  await rm(clientsRoot, { recursive: true, force: true });
});

describe('Group D — workspace registry & per-client config', () => {
  test('a workspace with DEFAULT_DOMAIN_TYPE=thesis reports default_domain_type "thesis"; one without reports "strategy"', async () => {
    await seedWorkspace('humain-vc', { env: 'DEFAULT_DOMAIN_TYPE=thesis\n' });
    await seedWorkspace('reach-edu', { env: 'SOME_OTHER_KEY=value\n' });
    const workspaces = await loadWorkspacesModule();

    expect(workspaces.buildSummary('humain-vc').default_domain_type).toBe('thesis');
    expect(workspaces.buildSummary('reach-edu').default_domain_type).toBe('strategy');
  });

  test('workspace.json org_id wins over the WORKSPACE_ORG_MAP env fallback; either alone suffices', async () => {
    // file + env disagree → file wins
    await seedWorkspace('humain-vc', {
      env: 'DEFAULT_DOMAIN_TYPE=thesis\n',
      workspaceJson: { org_id: 'humain.vc' },
    });
    // env only → env fallback carries it
    await seedWorkspace('reach-edu', { env: 'DEFAULT_DOMAIN_TYPE=strategy\n' });
    const workspaces = await loadWorkspacesModule({
      WORKSPACE_ORG_MAP: 'humain-vc=wrong.example,reach-edu=reach.edu',
    });

    expect(workspaces.getWorkspaceOrgId('humain-vc')).toBe('humain.vc'); // file, not wrong.example
    expect(workspaces.getWorkspaceOrgId('reach-edu')).toBe('reach.edu'); // env fallback alone

    // file only, no env map at all
    const fileOnly = await loadWorkspacesModule();
    expect(fileOnly.getWorkspaceOrgId('humain-vc')).toBe('humain.vc');
    expect(fileOnly.getWorkspaceOrgId('reach-edu')).toBeNull();
  });

  test('a workspace directory with no .env still lists, flagged has_env false', async () => {
    await seedWorkspace('half-seeded-client', {}); // directory only, no .env
    await seedWorkspace('humain-vc', { env: 'DEFAULT_DOMAIN_TYPE=thesis\n' });
    const workspaces = await loadWorkspacesModule();

    const summaries = await workspaces.listWorkspaces();
    const halfSeeded = summaries.find((w) => w.client_id === 'half-seeded-client');
    expect(halfSeeded).toBeDefined();
    expect(halfSeeded!.has_env).toBe(false);
    expect(halfSeeded!.default_domain_type).toBe('strategy'); // the visible fallback
    expect(summaries.find((w) => w.client_id === 'humain-vc')!.has_env).toBe(true);
  });
});
