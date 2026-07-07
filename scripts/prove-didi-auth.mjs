#!/usr/bin/env node
// ============================================================================
// prove-didi-auth.mjs — spec increment 2's acceptance proof (dev mode).
//
// Proves the didi.sh identity plane works against LOCAL augment-it dev:
//   1. magic-link issue + redeem against the local id service (:4000)
//      → didi_session cookie (EdDSA JWT)
//   2. WS upgrade to workspace-service (:3001) WITH the cookie
//      → session frame carries didi_id (verified locally via JWKS)
//   3. WS upgrade WITHOUT the cookie
//      → still connects (DIDI_AUTH=optional), didi_id null
//
// Prereqs:
//   - id service:      cd ../id-didi-sh && mix phx.server   (user seeded)
//   - augment-it:      docker compose up --build -d workspace-service
//
// Usage: node scripts/prove-didi-auth.mjs [email]
// ============================================================================

import { createRequire } from 'node:module';
const require = createRequire(
  new URL('../services/workspace/package.json', import.meta.url),
);
const WebSocket = require('ws');

const ID_BASE = process.env.ID_BASE ?? 'http://localhost:4000';
const WS_URL = process.env.WS_URL ?? 'ws://localhost:3001/ws';
const EMAIL = process.argv[2] ?? 'alice@example.com';

const fail = (msg) => {
  console.error(`\x1b[31mFAIL: ${msg}\x1b[0m`);
  process.exit(1);
};
const step = (msg) => console.log(`\n\x1b[1m== ${msg}\x1b[0m`);

// ── GATE MODE (build-order step 3) — runs ONLY the gate tests ──────────────
// The base steps below assume DIDI_AUTH=optional; gate mode assumes the
// container is running with:
//   DIDI_AUTH=required REQUIRED_ORG_ID=humain.vc docker compose up -d workspace-service
if (process.env.GATE === '1') {
  step('GATE 1. no cookie → rejected 4401');
  await expectClose(WS_URL, {}, 4401);
  console.log('anonymous rejected ✓');

  step('GATE 2. superuser (michael, lossless.group) → admitted');
  const su = await signInAs('mpstaton@gmail.com');
  const suFrame = await firstFrame(WS_URL, { Cookie: `didi_session=${su}` });
  if (!suFrame.didi_id) fail('superuser should be admitted with identity');
  console.log('superuser admitted ✓');

  step('GATE 3. signed-in NON-member (alice) → rejected 4403');
  const alice = await signInAs('alice@example.com');
  await expectClose(WS_URL, { Cookie: `didi_session=${alice}` }, 4403);
  console.log('non-member rejected ✓');

  console.log('\n\x1b[32mMEMBERSHIP GATE PROVEN\x1b[0m');
  process.exit(0);
}

// ── 1. magic link → didi_session cookie ────────────────────────────────────
step('1. issue + redeem magic link against local id service');
const issue = await fetch(`${ID_BASE}/api/magic-links`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, app: 'augment-it' }),
}).then((r) => r.json());
if (!issue.dev_token) fail('no dev_token — is the user seeded and the id service in dev mode?');

const redeem = await fetch(`${ID_BASE}/api/magic-links/redeem`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ token: issue.dev_token }),
});
const setCookie = redeem.headers.get('set-cookie') ?? '';
const jwt = /didi_session=([^;]+)/.exec(setCookie)?.[1];
if (!jwt) fail('redeem did not set didi_session');
const { didi_id } = await redeem.json();
console.log(`didi_session minted for didi_id=${didi_id}`);

// ── 2. WS upgrade WITH the cookie → identity attached ─────────────────────
step('2. workspace WS upgrade WITH didi_session cookie');
const withCookie = await firstFrame(WS_URL, { Cookie: `didi_session=${jwt}` });
console.log('session frame:', JSON.stringify(withCookie));
if (withCookie.kind !== 'session') fail('expected a session frame');
if (withCookie.didi_id !== didi_id) {
  fail(
    `workspace did not verify the identity — expected didi_id=${didi_id}, got ${withCookie.didi_id}. ` +
      'Is the container rebuilt with ID_JWKS_URL set, and can it reach host.docker.internal:4000?',
  );
}
console.log('identity verified by workspace via JWKS ✓');

// ── 3. WS upgrade WITHOUT the cookie → legacy flow, no identity ───────────
step('3. workspace WS upgrade WITHOUT cookie (DIDI_AUTH=optional)');
const bare = await firstFrame(WS_URL, {});
if (bare.kind !== 'session') fail('expected a session frame');
if (bare.didi_id !== null && bare.didi_id !== undefined) {
  fail('expected no identity without a cookie');
}
console.log('legacy continuity flow intact, didi_id null ✓');

// ── 4. tampered cookie → treated as absent ─────────────────────────────────
step('4. WS upgrade with a TAMPERED cookie → no identity');
const [h, p] = jwt.split('.');
const forged = `${h}.${p}.AAAA`;
const tampered = await firstFrame(WS_URL, { Cookie: `didi_session=${forged}` });
if (tampered.didi_id) fail('tampered token must not verify');
console.log('tampered token rejected ✓');

console.log('\n\x1b[32mDIDI AUTH PROVEN AGAINST LOCAL DEV\x1b[0m');
process.exit(0);

async function signInAs(addr) {
  const issue = await fetch(`${ID_BASE}/api/magic-links`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: addr, app: 'gate-test' }),
  }).then((r) => r.json());
  if (!issue.dev_token) fail(`no dev_token for ${addr} — seeded?`);
  const redeem = await fetch(`${ID_BASE}/api/magic-links/redeem`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: issue.dev_token }),
  });
  const cookie = /didi_session=([^;]+)/.exec(redeem.headers.get('set-cookie') ?? '')?.[1];
  if (!cookie) fail(`no cookie for ${addr}`);
  return cookie;
}

function expectClose(url, headers, wantCode) {
  return new Promise((resolve) => {
    const ws = new WebSocket(url, { headers });
    const timer = setTimeout(() => {
      ws.terminate();
      fail(`expected close ${wantCode}, got timeout`);
    }, 8000);
    ws.on('message', () => {
      clearTimeout(timer);
      fail(`expected close ${wantCode}, but got a frame (admitted)`);
    });
    ws.on('close', (code) => {
      clearTimeout(timer);
      if (code !== wantCode) fail(`expected close ${wantCode}, got ${code}`);
      resolve(undefined);
    });
    ws.on('error', () => {});
  });
}

function firstFrame(url, headers) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { headers });
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error('timeout waiting for session frame'));
    }, 8000);
    ws.on('message', (raw) => {
      clearTimeout(timer);
      ws.close();
      resolve(JSON.parse(raw.toString('utf8')));
    });
    ws.on('close', (code, reason) => {
      clearTimeout(timer);
      reject(new Error(`ws closed: ${code} ${reason}`));
    });
    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  }).catch((err) => fail(err.message));
}
