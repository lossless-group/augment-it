// Group I — disposable backend chain for end-to-end tests.
// Registry: context-v/specs/Corpora-Builder-Harmony-Test-Registry.md
//
// Stands up the REAL backend chain against DISPOSABLE state — never the
// shared cloud, never the dev NATS:
//   throwaway NATS (docker, :4223) ← workspace-service (anonymous mode)
//                                   ← record-surrealdb-resolver → in-mem SurrealDB
// plus a temp CLIENTS_ROOT with one seeded workspace. Everything is torn
// down in stop(). No `ws` package — readiness is polled over HTTP / native
// WebSocket / process stdout.

import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Surreal } from 'surrealdb';

const DEBUG = process.env.E2E_DEBUG === '1';
function tee(proc, name) {
  if (!DEBUG) return;
  const s = createWriteStream(`/tmp/augment-e2e-${name}.log`);
  proc.stdout?.pipe(s);
  proc.stderr?.pipe(s);
}

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)));
const NATS_PORT = 4223;
const NATS_CONTAINER = 'augment-e2e-nats';
const SURREAL_PORT = 18711;
const WS_PORT = 3199;
export const CLIENT = 'e2e-client';
export const WS_URL = `ws://localhost:${WS_PORT}/ws`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sh(cmd, args, opts = {}) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, opts);
    let out = '';
    p.stdout?.on('data', (d) => (out += d));
    p.stderr?.on('data', (d) => (out += d));
    p.on('close', (code) => (code === 0 ? res(out) : rej(new Error(`${cmd} ${args.join(' ')} exited ${code}: ${out}`))));
  });
}

async function waitHttp(url, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (r.ok) return;
    } catch {}
    await sleep(150);
  }
  throw new Error(`timed out waiting for ${label} (${url})`);
}

/** Wait until a spawned process prints a readiness marker on stdout/stderr. */
function waitForLog(proc, marker, timeoutMs, label) {
  return new Promise((res, rej) => {
    let buf = '';
    const to = setTimeout(() => rej(new Error(`timed out waiting for ${label}: ${buf.slice(-400)}`)), timeoutMs);
    const onData = (d) => {
      buf += d;
      if (buf.includes(marker)) {
        clearTimeout(to);
        proc.stdout?.off('data', onData);
        proc.stderr?.off('data', onData);
        res();
      }
    };
    proc.stdout?.on('data', onData);
    proc.stderr?.on('data', onData);
  });
}

export async function startBackend({ log = () => {} } = {}) {
  const procs = [];
  const cleanups = [];

  // 1) throwaway NATS (idempotent — reuse if already running from a prior run)
  await sh('docker', ['rm', '-f', NATS_CONTAINER]).catch(() => {});
  await sh('docker', ['run', '-d', '--rm', '--name', NATS_CONTAINER, '-p', `${NATS_PORT}:4222`, 'nats:2.10-alpine']);
  cleanups.push(() => sh('docker', ['rm', '-f', NATS_CONTAINER]).catch(() => {}));
  await sleep(800);
  log('nats up');

  // 2) in-memory SurrealDB + seed the workspace's corpora
  const surreal = spawn('surreal', ['start', '--user', 'root', '--pass', 'root', '--bind', `127.0.0.1:${SURREAL_PORT}`, 'memory'], { stdio: 'ignore' });
  procs.push(surreal);
  await waitHttp(`http://127.0.0.1:${SURREAL_PORT}/health`, 15000, 'surreal');
  const db = new Surreal();
  await db.connect(`ws://127.0.0.1:${SURREAL_PORT}/rpc`);
  await db.signin({ username: 'root', password: 'root' });
  await db.use({ namespace: 'main', database: 'main' });
  await db.query('DEFINE TABLE IF NOT EXISTS domains SCHEMALESS; DEFINE INDEX IF NOT EXISTS domain_type_slug ON domains FIELDS type, slug UNIQUE;');
  for (const [slug, title] of [
    ['consumer-immunology', 'Consumer Immunology'],
    ['specialized-foundation-models', 'Specialized Foundation Models'],
  ]) {
    await db.query(
      `CREATE domains SET id = rand::uuid::v7(), type='thesis', slug=$slug, title=$title, client_slugs=[$c], tags=[], created_at=time::now();`,
      { slug, title, c: CLIENT },
    );
  }
  await db.close();
  log('surreal seeded (2 thesis corpora)');

  // 3) temp CLIENTS_ROOT with one seeded workspace
  const clientsRoot = await mkdtemp(join(tmpdir(), 'augment-e2e-clients-'));
  const dataDir = await mkdtemp(join(tmpdir(), 'augment-e2e-data-'));
  await mkdir(join(clientsRoot, CLIENT), { recursive: true });
  await writeFile(join(clientsRoot, CLIENT, '.env'), 'DEFAULT_DOMAIN_TYPE=thesis\n');
  cleanups.push(() => rm(clientsRoot, { recursive: true, force: true }));
  cleanups.push(() => rm(dataDir, { recursive: true, force: true }));

  const natsUrl = `nats://localhost:${NATS_PORT}`;
  const surrealEnv = {
    SURREAL_URL: `ws://127.0.0.1:${SURREAL_PORT}/rpc`,
    SURREAL_NS: 'main',
    SURREAL_DB: 'main',
    SURREAL_USER: 'root',
    SURREAL_PASS: 'root',
  };

  // 4) resolver — spawn `node --import tsx` directly (NOT via pnpm exec, whose
  // grandchild survives a kill of the wrapper) and in its own process group
  // (detached) so stop() reaps the whole tree.
  const resolver = spawn('pnpm', ['exec', 'tsx', 'src/server.ts'], {
    cwd: join(REPO, 'services/record-surrealdb-resolver'),
    env: { ...process.env, NATS_URL: natsUrl, ...surrealEnv },
    detached: true,
  });
  procs.push(resolver); tee(resolver, "resolver");
  await waitForLog(resolver, 'nats connected', 20000, 'resolver');
  log('resolver up');

  // 5) workspace-service in anonymous mode (DIDI_AUTH=off)
  const workspace = spawn('pnpm', ['exec', 'tsx', 'src/server.ts'], {
    cwd: join(REPO, 'services/workspace'),
    detached: true,
    env: {
      ...process.env,
      NATS_URL: natsUrl,
      DIDI_AUTH: 'off',
      CLIENTS_ROOT: clientsRoot,
      ACTIVE_CLIENT_ID: CLIENT,
      PORT: String(WS_PORT),
      SESSION_STORE_PATH: join(dataDir, 'sessions.json'),
      SEARCH_STORE_PATH: join(dataDir, 'searches.json'),
    },
  });
  procs.push(workspace); tee(workspace, "workspace");
  await waitForLog(workspace, 'workspace-service ready', 20000, 'workspace-service');
  log('workspace-service up (anonymous)');

  // 6) content-ingest — writes corpus files under the SAME CLIENTS_ROOT, so
  // domain.create (which cross-calls corpus.domain.write_index) completes and
  // the DB row + index.md land together (the full write chain).
  const contentIngest = spawn('pnpm', ['exec', 'tsx', 'src/server.ts'], {
    cwd: join(REPO, 'services/content-ingest'),
    detached: true,
    env: { ...process.env, NATS_URL: natsUrl, CLIENTS_ROOT: clientsRoot },
  });
  procs.push(contentIngest); tee(contentIngest, 'content-ingest');
  await waitForLog(contentIngest, 'content-ingest-service ready', 20000, 'content-ingest');
  log('content-ingest up');

  const stop = async () => {
    for (const p of procs) {
      // Detached children own a process group (pgid === pid) — kill the whole
      // group so `node --import tsx` leaves no port-holding orphan.
      try { process.kill(-p.pid, 'SIGKILL'); } catch { try { p.kill('SIGKILL'); } catch {} }
    }
    for (const c of cleanups) await c();
  };
  return { stop, wsUrl: WS_URL, wsPort: WS_PORT, client: CLIENT, clientsRoot };
}
