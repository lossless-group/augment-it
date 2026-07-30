// Group C — Client transport resilience.
// Registry: context-v/specs/Corpora-Builder-Harmony-Test-Registry.md
//
// Test names are the registry's ✓-phrases, verbatim. The scripted test
// server mirrors services/workspace/src/ws.ts's invoke/claim contract;
// the transport's timing seam shrinks minutes-scale deadlines to test
// scale.

import { afterEach, describe, expect, test } from 'vitest';
import { createTransport, type Transport, type TransportConfig } from '../src/transport';
import { WorkspaceSocketTestServer } from './workspace-socket-test-server';

const openTransports: Transport[] = [];
const servers: WorkspaceSocketTestServer[] = [];

function makeTransport(
  url: string,
  overrides: Partial<TransportConfig> = {},
): { transport: Transport; statuses: string[] } {
  const statuses: string[] = [];
  let token: string | null = null;
  const transport = createTransport({
    url,
    getToken: () => token,
    saveToken: (t) => {
      token = t;
    },
    onFrame: () => {},
    onStatus: (s) => statuses.push(s),
    timing: {
      reconnectInitialMs: 30,
      authReconnectMs: 250,
      invokeDeadlineMs: 1_500,
      longInvokeDeadlineMs: 1_500,
    },
    ...overrides,
  });
  openTransports.push(transport);
  return { transport, statuses };
}

async function makeServer(): Promise<WorkspaceSocketTestServer> {
  const server = new WorkspaceSocketTestServer();
  await server.start();
  servers.push(server);
  return server;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(cond: () => boolean, ms = 3_000, label = 'condition'): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${label}`);
    await sleep(10);
  }
}

afterEach(async () => {
  for (const t of openTransports.splice(0)) t.close();
  for (const s of servers.splice(0)) await s.stop();
});

describe('Group C — client transport resilience', () => {
  test('an invoke fired before the socket opens is delivered exactly once after open', async () => {
    const server = await makeServer();
    const { transport } = makeTransport(server.url);
    // Fired synchronously after createTransport — the socket cannot be
    // open yet, so this frame MUST ride the pre-open queue.
    const result = (await transport.invoke('domain.list', { client_slug: 'humain-vc' })) as {
      capability: string;
    };
    expect(result.capability).toBe('domain.list');
    expect(server.deliveries.size).toBe(1);
    const [count] = [...server.deliveries.values()];
    expect(count).toBe(1);
  });

  test('no invoke silently vanishes — every invoke resolves or rejects within its deadline, across every socket-churn scenario', async () => {
    // Scenario 1: the server isn't even listening yet when the invoke
    // fires — first connect fails, backoff retries, late server start.
    const lateServer = await makeServer();
    const port = Number(new URL(lateServer.url).port);
    await lateServer.stop();
    const late = makeTransport(`ws://127.0.0.1:${port}/ws`);
    const invokeAgainstDownServer = late.transport.invoke('domain.list', {});
    await sleep(120); // let a few failed connect attempts happen
    await lateServer.start(port);

    // Scenario 2: the socket dies mid-work; the server stashes the result
    // and hands it over on the post-reconnect claim.
    const stashServer = await makeServer();
    stashServer.invokeScript = () => 'stash-and-drop';
    const stashT = makeTransport(stashServer.url);
    const invokeSurvivingDrop = stashT.transport.invoke('domain.create', { slug: 'x' });

    // Scenario 3: the server restarts with amnesia while the invoke is in
    // flight — the claim must FAIL FAST with the explicit not-found error,
    // never hang.
    const amnesiaServer = await makeServer();
    amnesiaServer.invokeScript = () => 'silent';
    const amnesiaT = makeTransport(amnesiaServer.url);
    const invokeLostToRestart = amnesiaT.transport.invoke('domain.create', { slug: 'y' });
    await waitFor(() => amnesiaServer.deliveries.size === 1, 2_000, 'amnesia delivery');
    await amnesiaServer.restartWithAmnesia();

    // The property: EVERYTHING settles. The watchdog is the assertion —
    // if any promise is still pending past deadline + margin, an invoke
    // silently vanished and the test fails.
    const all = [invokeAgainstDownServer, invokeSurvivingDrop, invokeLostToRestart];
    const watchdog = sleep(4_000).then(() => {
      throw new Error('an invoke silently vanished — still unsettled past every deadline');
    });
    const settled = (await Promise.race([Promise.allSettled(all), watchdog])) as PromiseSettledResult<unknown>[];

    expect(settled[0].status).toBe('fulfilled'); // delivered after late start
    expect(settled[1].status).toBe('fulfilled'); // claimed the stashed result
    expect(settled[2].status).toBe('rejected'); // explicit not-found, not a hang
    expect(((settled[2] as PromiseRejectedResult).reason as Error).message).toMatch(/restarted|not found/);
  });

  test('on close 4401 the transport fails all pending work immediately with "session expired"', async () => {
    const server = await makeServer();
    server.invokeScript = () => 'silent';
    const { transport, statuses } = makeTransport(server.url);
    const hung = transport.invoke('domain.list', {});
    await waitFor(() => server.deliveries.size === 1, 2_000, 'invoke delivery');

    const before = Date.now();
    server.closeAllSockets(4401);
    await expect(hung).rejects.toThrow(/session expired/);
    // Immediately: well inside the 1.5s test deadline, not at it.
    expect(Date.now() - before).toBeLessThan(500);
    expect(statuses).toContain('auth_required');
    // And while auth-dead, new work fails fast instead of queueing.
    await expect(transport.invoke('domain.list', {})).rejects.toThrow(/session expired/);
  });

  test('after auth-death the transport tries one silent refresh-then-reconnect, then retries at 30 seconds — never a storm', async () => {
    // Phase 1: refresh succeeds → immediate reconnect, exactly one refresh.
    const healServer = await makeServer();
    let healCalls = 0;
    const heal = makeTransport(healServer.url, {
      refreshSession: async () => {
        healCalls += 1;
        return true;
      },
    });
    await waitFor(() => healServer.connections === 1, 2_000, 'first connection');
    healServer.closeAllSockets(4401);
    await waitFor(() => healServer.connections === 2, 2_000, 'healed reconnect');
    expect(healCalls).toBe(1);
    heal.transport.close();

    // Phase 2: refresh fails → NO reconnect until the glacial tick
    // (authReconnectMs = 250 in tests standing in for 30s), and no storm
    // of attempts in between.
    const deadServer = await makeServer();
    let deadCalls = 0;
    makeTransport(deadServer.url, {
      refreshSession: async () => {
        deadCalls += 1;
        return false;
      },
    });
    await waitFor(() => deadServer.connections === 1, 2_000, 'first connection');
    deadServer.closeAllSockets(4401);
    await sleep(180); // inside the glacial window
    expect(deadCalls).toBe(1);
    expect(deadServer.connections).toBe(1); // zero retries yet — no storm
    await waitFor(() => deadServer.connections === 2, 2_000, 'glacial retry');
  });
});
