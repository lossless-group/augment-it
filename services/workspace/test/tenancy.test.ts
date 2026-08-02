// Group B — Session admission & tenancy.
// Registry: context-v/specs/Corpora-Builder-Harmony-Test-Registry.md
//
// The security-critical layer, tested as PURE decisions — no WebSocket, no
// service boot, no NATS (the sid-scoped publish fails closed-and-quiet
// without a bus). The end-to-end persona proof once lived in the now-broken
// scripts/prove-session-tenancy.mjs (it depended on the removed `ws`); this
// isolates the actual allow/refuse logic that mattered in it.

import { beforeAll, describe, expect, test } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ANONYMOUS_TENANT,
  activateTenant,
  allowedClients,
  getTenantActive,
  isClientAllowed,
  type TenantCtx,
} from '../src/tenancy';
import { enforceTenant } from '../src/capabilities';
import { initWorkspaces, setActiveClientId } from '../src/workspaces';

// Real workspaces module, seeded from a temp clients root so knownClientIds
// = [humain-vc, reach-edu] and the global-active leg has something to point at.
beforeAll(async () => {
  const root = await mkdtemp(join(tmpdir(), 'augment-it-tenancy-test-'));
  for (const [slug, type] of [
    ['humain-vc', 'thesis'],
    ['reach-edu', 'strategy'],
  ]) {
    await mkdir(join(root, slug), { recursive: true });
    await writeFile(join(root, slug, '.env'), `DEFAULT_DOMAIN_TYPE=${type}\n`);
  }
  await initWorkspaces({ clients_root: root });
});

const restricted = (clients: string[], sid = 'sess-1'): TenantCtx => ({ sid, superuser: false, allowed: clients });
const superuser = (sid = 'root-1'): TenantCtx => ({ sid, superuser: true, allowed: 'all' });

describe('Group B — session admission & tenancy', () => {
  test('a member of one org is admitted and sees only that org’s workspaces', () => {
    const alice = restricted(['humain-vc']);
    expect(isClientAllowed(alice, 'humain-vc')).toBe(true);
    expect(isClientAllowed(alice, 'reach-edu')).toBe(false);
    expect(allowedClients(alice)).toEqual(['humain-vc']);

    // Superuser resolves 'all' to every known workspace.
    expect(allowedClients(superuser()).sort()).toEqual(['humain-vc', 'reach-edu']);
    expect(isClientAllowed(superuser(), 'reach-edu')).toBe(true);
  });

  test('a session’s workspace switch moves that session only — other users’ sockets see nothing', () => {
    const alice = restricted(['humain-vc', 'reach-edu'], 'alice');
    const bob = restricted(['humain-vc', 'reach-edu'], 'bob');

    activateTenant(alice, 'reach-edu');
    expect(getTenantActive(alice)).toBe('reach-edu'); // alice moved
    expect(getTenantActive(bob)).not.toBe('reach-edu'); // bob's sid derives its own default, untouched by alice

    // Switching to a workspace outside the allowed set is refused, not remapped.
    expect(() => activateTenant(restricted(['humain-vc'], 'carol'), 'reach-edu')).toThrow(/not available to this session/);
  });

  test('a capability frame naming a workspace outside the session’s allowed set is refused, not remapped', () => {
    const alice = restricted(['humain-vc']);
    // Every client-key spelling the services use is checked.
    for (const key of ['client', 'client_id', 'client_slug']) {
      expect(() => enforceTenant('organization.detail', { [key]: 'reach-edu' }, alice)).toThrow(/not available to this session/);
      expect(() => enforceTenant('organization.detail', { [key]: 'humain-vc' }, alice)).not.toThrow();
    }
    // Refusal, not silent remap: the call throws rather than swapping the slug.
  });

  test('superuser and anonymous sessions bypass the gate', () => {
    // Superuser: any client arg passes.
    expect(() => enforceTenant('organization.detail', { client_slug: 'reach-edu' }, superuser())).not.toThrow();
    // Anonymous/legacy: allowed === 'all', same bypass.
    expect(() => enforceTenant('organization.detail', { client_slug: 'anything' }, ANONYMOUS_TENANT)).not.toThrow();
  });

  test('the records family is served only while the operator-active workspace is in the session’s allowed set', () => {
    // row.* / record_set.* carry no per-frame tenant — they follow the
    // instance's global active, so a restricted session may touch them only
    // when that global active is one it's allowed.
    setActiveClientId('humain-vc');

    const humainOnly = restricted(['humain-vc']);
    const reachOnly = restricted(['reach-edu']);

    expect(() => enforceTenant('row.list', {}, humainOnly)).not.toThrow(); // global active humain-vc ∈ allowed
    expect(() => enforceTenant('row.list', {}, reachOnly)).toThrow(/scoped to this instance's operator-active workspace/);
  });
});
