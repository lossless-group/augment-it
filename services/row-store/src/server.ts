// row-store-service — workspace-scoped record/row persistence.
//
// Per [[Workspaces-as-Tenant-Primitive]] the row-store JSON lives at
// <CLIENTS_ROOT>/<client_id>/rows.json so the workspace is self-contained
// on disk. On boot, the service asks workspace-service which slug is
// active and loads that file; on workspace.active.changed it swaps to
// the new tenant's file (after persisting any pending mutations to the
// previous one).
//
// Migration: if the legacy /data/rows.json from pre-workspace-scoping
// exists AND the initial active workspace doesn't yet have its own
// rows.json, copy the legacy file in once so the operator doesn't lose
// their existing record sets. One-shot, idempotent — runs only when
// the target file doesn't exist.

import { copyFile, mkdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { connect, JSONCodec, type NatsConnection } from 'nats';
import { load, swap } from './store';
import { registerHandlers } from './handlers';

const jc = JSONCodec();

const NATS_URL = process.env.NATS_URL ?? 'nats://localhost:4222';
// /clients in docker, ../../clients for local dev. Same convention as
// workspace-service.
const CLIENTS_ROOT = resolve(process.env.CLIENTS_ROOT ?? '../../clients');
// Legacy single-tenant path. Migrated into clients/<slug>/rows.json once
// on first boot. Override or unset if no migration is needed.
const LEGACY_STORE_PATH = process.env.LEGACY_ROW_STORE_PATH ?? '/data/rows.json';

function pathForClient(client_id: string): string {
  return join(CLIENTS_ROOT, client_id, 'rows.json');
}

async function fileExists(path: string): Promise<boolean> {
  return stat(path)
    .then(() => true)
    .catch(() => false);
}

/**
 * One-shot migration: copy the legacy global rows.json into the active
 * workspace's per-tenant file when the per-tenant file doesn't exist yet.
 * Idempotent — subsequent boots find the per-tenant file and skip the copy.
 */
async function migrateLegacyIfNeeded(active_client_id: string): Promise<void> {
  const target = pathForClient(active_client_id);
  if (await fileExists(target)) return;
  if (!(await fileExists(LEGACY_STORE_PATH))) return;
  console.log(
    JSON.stringify({
      level: 'info',
      msg: 'migrating legacy rows.json',
      from: LEGACY_STORE_PATH,
      to: target,
    }),
  );
  await mkdir(dirname(target), { recursive: true });
  await copyFile(LEGACY_STORE_PATH, target);
}

async function queryActiveClientId(nc: NatsConnection): Promise<string | null> {
  try {
    const reply = await nc.request('workspace.active.requested', jc.encode({}), {
      timeout: 5_000,
    });
    const decoded = jc.decode(reply.data) as { active_client_id: string | null };
    return decoded.active_client_id;
  } catch (err) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        msg: 'workspace.active.requested failed; falling back to first client dir',
        err: err instanceof Error ? err.message : String(err),
      }),
    );
    return null;
  }
}

function subscribeToWorkspaceChanges(nc: NatsConnection): void {
  (async () => {
    const sub = nc.subscribe('workspace.active.changed');
    for await (const msg of sub) {
      try {
        const { client_id } = jc.decode(msg.data) as { client_id: string; previous?: string };
        const next = pathForClient(client_id);
        console.log(JSON.stringify({ level: 'info', msg: 'workspace switch', to: client_id, path: next }));
        await swap(next);
      } catch (err) {
        console.error('row-store: workspace.active.changed handler failed', err);
      }
    }
  })().catch((err) => {
    console.error('row-store: workspace.active.changed subscriber crashed', err);
  });
}

async function main(): Promise<void> {
  const nc = await connect({ servers: NATS_URL, name: 'row-store-service' });
  console.log(JSON.stringify({ level: 'info', msg: 'nats connected', url: NATS_URL }));

  const queried = await queryActiveClientId(nc);
  // If the query failed and we have no signal at all, default the path
  // to a sentinel under CLIENTS_ROOT. The first workspace switch will
  // swap to the real tenant; until then capabilities serve empty.
  const active_client_id = queried ?? 'default';
  const initialPath = pathForClient(active_client_id);
  await migrateLegacyIfNeeded(active_client_id);
  await load(initialPath);
  console.log(
    JSON.stringify({
      level: 'info',
      msg: 'store loaded',
      client_id: active_client_id,
      path: initialPath,
    }),
  );

  subscribeToWorkspaceChanges(nc);

  registerHandlers(nc);
  console.log(JSON.stringify({ level: 'info', msg: 'row-store-service ready' }));
}

main().catch((err) => {
  console.error('row-store-service failed to boot', err);
  process.exit(1);
});
