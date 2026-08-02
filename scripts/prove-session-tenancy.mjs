#!/usr/bin/env node
// ============================================================================
// prove-session-tenancy.mjs — the multi-tenant contamination proof
// (plan: context-v/plans/Open-Augment-Didi-Sh-To-Reach-Edu.md, ticket #66).
//
// Self-contained: mints its own EdDSA keypair, serves a fake id-plane
// (JWKS + /api/me) on a local port, boots a SCRATCH workspace-service
// (own port, own clients root, own session/search stores) against it, and
// connects real WebSocket sessions with signed cookies. Nothing here
// touches the dev instance's workspaces — and the script performs NO
// global-active moves (the sid-broadcast test uses a two-org CLIENT user,
// whose switches are per-sid only), so a row-store listening on the shared
// dev NATS is never flipped as a side effect.
//
// Personas:
//   alice     — org humain.vc, role member   → allowed [humain-vc]
//   stephenie — org reach.edu, role editor   → allowed [reach-edu]
//   bob       — BOTH orgs, role member       → allowed [both], not super
//   root      — role superuser               → allowed all
//
// Asserts:
//   1. no cookie → upgrade rejected (4401)
//   2. per-session allowed_clients + active on the session frame
//   3. workspace.list filtered per session; single-workspace ⇒ pinned
//   4. workspace.activate outside the allowed set → refused
//   5. cross-client frame args (client / client_id / client_slug) → refused
//   6. records-family capability (row.list) → refused for a session not
//      allowed on the instance's operator-active workspace
//   7. superuser sees every workspace
//   8. bob's per-sid switch reaches HIS other socket, not alice's
//
// Prereq: a NATS server reachable at NATS_URL (dev default localhost:4222).
// Usage:  node scripts/prove-session-tenancy.mjs
// ============================================================================

import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const requireWs = createRequire(new URL('../services/workspace/package.json', import.meta.url));
const { generateKeyPair, exportJWK, SignJWT } = requireWs('jose');
const WebSocket = requireWs('ws');

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ID_PORT = 4199;
const WS_PORT = 3199;
const ISSUER = `http://127.0.0.1:${ID_PORT}`;

let failures = 0;
const ok = (cond, msg) => {
  if (cond) console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
  else { failures += 1; console.log(`  \x1b[31m✗ ${msg}\x1b[0m`); }
};
const step = (msg) => console.log(`\n\x1b[1m== ${msg}\x1b[0m`);

// ── fake id-plane ──────────────────────────────────────────────────────────
step('mint keypair + boot fake id-plane (JWKS + /api/me)');
const { publicKey, privateKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
const jwk = { ...(await exportJWK(publicKey)), kid: 'proof-key', alg: 'EdDSA', use: 'sig' };

const PERSONAS = {
  alice: [{ org_id: 'humain.vc', role: 'member' }],
  stephenie: [{ org_id: 'reach.edu', role: 'editor' }],
  bob: [
    { org_id: 'humain.vc', role: 'member' },
    { org_id: 'reach.edu', role: 'member' },
  ],
  root: [{ org_id: 'humain.vc', role: 'superuser' }],
};

const signCookie = (sub) =>
  new SignJWT({ sid: `sid-${sub}` })
    .setProtectedHeader({ alg: 'EdDSA', kid: 'proof-key' })
    .setIssuer(ISSUER)
    .setSubject(sub)
    .setExpirationTime('10m')
    .sign(privateKey);

const idServer = createServer((req, res) => {
  if (req.url === '/.well-known/jwks.json') {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ keys: [jwk] }));
    return;
  }
  if (req.url === '/api/me') {
    const cookie = req.headers.cookie ?? '';
    const m = cookie.match(/didi_session=([^;]+)/);
    let sub = null;
    if (m) {
      try {
        sub = JSON.parse(Buffer.from(m[1].split('.')[1], 'base64url').toString()).sub;
      } catch { /* fall through to 401 */ }
    }
    if (!sub || !PERSONAS[sub]) { res.statusCode = 401; res.end('{}'); return; }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ didi_id: sub, memberships: PERSONAS[sub] }));
    return;
  }
  res.statusCode = 404;
  res.end();
});
await new Promise((r) => idServer.listen(ID_PORT, '127.0.0.1', r));
console.log(`  id-plane on :${ID_PORT}`);

// ── scratch workspace-service ──────────────────────────────────────────────
step('boot scratch workspace-service (required mode, org-mapped workspaces)');
const scratch = mkdtempSync(join(tmpdir(), 'prove-tenancy-'));
for (const [slug, org] of [['humain-vc', 'humain.vc'], ['reach-edu', 'reach.edu']]) {
  mkdirSync(join(scratch, 'clients', slug), { recursive: true });
  writeFileSync(join(scratch, 'clients', slug, 'workspace.json'), JSON.stringify({ org_id: org }));
}
mkdirSync(join(scratch, 'data'), { recursive: true });

const svc = spawn('pnpm', ['exec', 'tsx', 'src/server.ts'], {
  cwd: join(ROOT, 'services/workspace'),
  env: {
    ...process.env,
    PORT: String(WS_PORT),
    CLIENTS_ROOT: join(scratch, 'clients'),
    SESSION_STORE_PATH: join(scratch, 'data', 'sessions.json'),
    SEARCH_STORE_PATH: join(scratch, 'data', 'searches.json'),
    ACTIVE_CLIENT_ID: 'humain-vc', // the operator-active pin; row-family gate tests hang off it
    DIDI_AUTH: 'required',
    ID_JWKS_URL: `${ISSUER}/.well-known/jwks.json`,
    ID_ISSUER: ISSUER,
    ID_BASE: ISSUER,
    NATS_URL: process.env.NATS_URL ?? 'nats://localhost:4222',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let svcLog = '';
svc.stdout.on('data', (d) => { svcLog += d; });
svc.stderr.on('data', (d) => { svcLog += d; });

const deadline = Date.now() + 30_000;
let ready = false;
while (Date.now() < deadline) {
  try {
    const res = await fetch(`http://127.0.0.1:${WS_PORT}/health`);
    if (res.ok) { ready = true; break; }
  } catch { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 300));
}
if (!ready) {
  console.error('workspace-service did not become healthy; log tail:\n' + svcLog.slice(-2000));
  cleanup(1);
}
console.log(`  workspace-service on :${WS_PORT}`);

// ── WS helpers ─────────────────────────────────────────────────────────────
function connect(cookie) {
  return new Promise((resolve, reject) => {
    const sock = new WebSocket(`ws://127.0.0.1:${WS_PORT}/ws`, {
      headers: cookie ? { Cookie: `didi_session=${cookie}` } : {},
    });
    const events = [];
    let sessionFrame = null;
    const pending = new Map();
    sock.on('message', (raw) => {
      const f = JSON.parse(raw.toString());
      if (f.kind === 'session') { sessionFrame = f; resolve(api); }
      else if (f.kind === 'result' && pending.has(f.id)) { pending.get(f.id)(f); pending.delete(f.id); }
      else if (f.kind === 'event') events.push(f);
    });
    sock.on('close', (code) => reject(Object.assign(new Error(`closed ${code}`), { code })));
    sock.on('error', () => { /* close handler reports */ });
    let n = 0;
    const api = {
      session: () => sessionFrame,
      events,
      invoke: (capability, args) =>
        new Promise((res2) => {
          const id = `inv-${++n}-${Math.random().toString(36).slice(2, 8)}`;
          pending.set(id, res2);
          sock.send(JSON.stringify({ kind: 'invoke', id, capability, args }));
        }),
      close: () => sock.close(),
    };
  });
}

// ── the assertions ─────────────────────────────────────────────────────────
try {
  step('1. no cookie → rejected');
  const rejected = await connect(null).then(() => null, (err) => err);
  ok(rejected && rejected.code === 4401, `anonymous upgrade rejected with 4401 (got ${rejected?.code})`);

  step('2. per-session tenancy on the session frame');
  const alice = await connect(await signCookie('alice'));
  const steph = await connect(await signCookie('stephenie'));
  const root = await connect(await signCookie('root'));
  ok(JSON.stringify(alice.session().allowed_clients) === '["humain-vc"]', `alice allowed [humain-vc] (got ${JSON.stringify(alice.session().allowed_clients)})`);
  ok(alice.session().active_client_id === 'humain-vc', 'alice active humain-vc');
  ok(JSON.stringify(steph.session().allowed_clients) === '["reach-edu"]', `stephenie allowed [reach-edu] (got ${JSON.stringify(steph.session().allowed_clients)})`);
  ok(steph.session().active_client_id === 'reach-edu', 'stephenie active reach-edu (global humain-vc NOT inherited)');
  ok(root.session().superuser === true, 'root flagged superuser');

  step('3. workspace.list filtered per session');
  const aliceList = await alice.invoke('workspace.list', {});
  const stephList = await steph.invoke('workspace.list', {});
  ok(aliceList.ok && aliceList.result.workspaces.map((w) => w.client_id).join() === 'humain-vc', 'alice lists only humain-vc');
  ok(stephList.ok && stephList.result.workspaces.map((w) => w.client_id).join() === 'reach-edu', 'stephenie lists only reach-edu');
  ok(stephList.result.pinned === true, 'single-workspace session reads as pinned (switcher hidden)');

  step('4. activate outside the allowed set → refused');
  const badActivate = await steph.invoke('workspace.activate', { client_id: 'humain-vc' });
  ok(!badActivate.ok && /not available/.test(badActivate.error), `stephenie cannot activate humain-vc (${badActivate.error})`);

  step('5. cross-client frame args → refused, all three spellings');
  for (const [cap, args] of [
    ['organization.detail', { slug: 'anything', client: 'humain-vc' }],
    ['client.brief.get', { client_id: 'humain-vc' }],
    ['domain.list', { client_slug: 'humain-vc' }],
  ]) {
    const r = await steph.invoke(cap, args);
    ok(!r.ok && /not available to this session/.test(r.error), `${cap} with ${JSON.stringify(args)} refused`);
  }

  step('6. records family gated to the operator-active workspace');
  const rowsSteph = await steph.invoke('row.list', {});
  ok(!rowsSteph.ok && /operator-active workspace/.test(rowsSteph.error), `stephenie refused row.list (${rowsSteph.error})`);
  const rowsAlice = await alice.invoke('row.list', {});
  ok(!(rowsAlice.ok === false && /operator-active workspace/.test(rowsAlice.error)), 'alice (allowed on humain-vc) passes the gate — any failure is downstream, not tenancy');

  step('7. superuser sees everything');
  const rootList = await root.invoke('workspace.list', {});
  const rootSlugs = rootList.result.workspaces.map((w) => w.client_id).sort().join();
  ok(rootList.ok && rootSlugs === 'humain-vc,reach-edu', `root lists both (got ${rootSlugs})`);

  step("8. per-sid switch reaches the same user's other socket only");
  const bobA = await connect(await signCookie('bob'));
  const bobB = await connect(await signCookie('bob'));
  const act = await bobA.invoke('workspace.activate', { client_id: 'reach-edu' });
  ok(act.ok, `bob (two orgs, not super) activates reach-edu per-session (${act.ok ? 'ok' : act.error})`);
  await new Promise((r) => setTimeout(r, 600));
  const bobBGot = bobB.events.some((e) => e.subject === 'workspace.active.changed' && e.payload?.sid === 'sid-bob');
  const aliceGot = alice.events.some((e) => e.subject === 'workspace.active.changed');
  ok(bobBGot, "bob's second socket received his sid-scoped switch");
  ok(!aliceGot, "alice's socket saw no workspace.active.changed at all");
  const bobActive = await bobB.invoke('workspace.active', {});
  ok(bobActive.result?.active_client_id === 'reach-edu', "bob's other socket reads the switched active");
  const aliceActive = await alice.invoke('workspace.active', {});
  ok(aliceActive.result?.active_client_id === 'humain-vc', "alice's active untouched by bob's switch");

  for (const s of [alice, steph, root, bobA, bobB]) s.close();
} catch (err) {
  failures += 1;
  console.error('\x1b[31mproof crashed:\x1b[0m', err);
}

step(failures === 0 ? 'ALL GREEN' : `${failures} FAILURE(S)`);
cleanup(failures === 0 ? 0 : 1);

function cleanup(code) {
  try { svc.kill('SIGTERM'); } catch { /* already gone */ }
  try { idServer.close(); } catch { /* already gone */ }
  try { rmSync(scratch, { recursive: true, force: true }); } catch { /* scratch leak is harmless */ }
  process.exit(code);
}
