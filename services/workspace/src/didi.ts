// didi.ts — the didi.sh identity verify adapter (spec increment 2).
//
// Verifies the `didi_session` cookie presented on the WS upgrade against
// the id.didi.sh JWKS: EdDSA signature + exp + issuer, checked LOCALLY —
// no per-request call to the identity service (the JWKS is fetched once
// and cached by jose; re-fetched on unknown `kid`, which is the key-
// rotation contract).
//
// Modes (DIDI_AUTH env):
//   off      — adapter inert; legacy continuity tokens only.
//   optional — verify when the cookie is present; legacy flow still works.
//              (dev default while the shell's access panel is built)
//   required — upgrades without a valid didi_session are rejected.
//              (the posture once invites exist and operators are didi users)
//
// Spec of record: ai-labs/context-v/specs/Id-Didi-Sh-Identity-Service.md.
// Local dev: run the id service on localhost:4000 (`mix phx.server`) —
// host-only localhost cookies ignore ports, so a cookie set by :4000 rides
// every localhost WS upgrade, the same-host analog of `.didi.sh`.

import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS_URL = process.env.ID_JWKS_URL;
const ISSUER = process.env.ID_ISSUER ?? 'https://id.didi.sh';
const MODE = (process.env.DIDI_AUTH ?? 'off') as 'off' | 'optional' | 'required';

export type DidiIdentity = {
  didi_id: string;
  session_id: string;
};

export function didiMode(): 'off' | 'optional' | 'required' {
  // No JWKS endpoint configured → the adapter cannot verify anything;
  // fall back to off regardless of the requested mode.
  return JWKS_URL ? MODE : 'off';
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

/**
 * Verify the didi_session cookie from a raw Cookie header.
 * Returns the identity on success, null on absent/invalid — the CALLER
 * decides whether null is fatal (required mode) or fine (optional).
 */
export async function verifyDidiCookie(
  cookieHeader: string | string[] | undefined,
): Promise<DidiIdentity | null> {
  if (didiMode() === 'off') return null;
  const token = readCookie(cookieHeader, 'didi_session');
  if (!token) return null;

  try {
    jwks ??= createRemoteJWKSet(new URL(JWKS_URL as string));
    const { payload } = await jwtVerify(token, jwks, {
      issuer: ISSUER,
      algorithms: ['EdDSA'],
    });
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
      return null;
    }
    return { didi_id: payload.sub, session_id: payload.sid };
  } catch {
    return null;
  }
}

// ── Membership gate (build-order step 3) ────────────────────────────────
// In 'required' mode, verified identity is necessary but not sufficient:
// the didi_id must hold a membership in the instance's org
// (REQUIRED_ORG_ID env — e.g. humain.vc for the single-tenant deploy) or
// the superuser role anywhere. Checked once per WS upgrade via /api/me
// with the cookie forwarded; cached briefly so reconnect storms don't
// hammer the id service.

const ID_BASE = process.env.ID_BASE ?? deriveIdBase();
const REQUIRED_ORG_ID = process.env.REQUIRED_ORG_ID;

function deriveIdBase(): string | undefined {
  // Convenience: ID_JWKS_URL is .../.well-known/jwks.json on the same host.
  if (!JWKS_URL) return undefined;
  try {
    return new URL(JWKS_URL).origin;
  } catch {
    return undefined;
  }
}

type Membership = { org_id: string; role: string };
const membershipCache = new Map<string, { at: number; ok: boolean }>();
const MEMBERSHIP_CACHE_MS = 60_000;

/**
 * Does this identity clear the instance's org requirement?
 * - No REQUIRED_ORG_ID configured → gate is open (identity alone suffices).
 * - Membership in REQUIRED_ORG_ID, any role → admitted.
 * - Role 'superuser' in ANY org → admitted (the operating-team fast path).
 */
export async function checkMembership(
  identity: DidiIdentity,
  cookieHeader: string | string[] | undefined,
): Promise<boolean> {
  if (!REQUIRED_ORG_ID) return true;
  if (!ID_BASE) return false;

  const cached = membershipCache.get(identity.session_id);
  if (cached && Date.now() - cached.at < MEMBERSHIP_CACHE_MS) return cached.ok;

  try {
    const raw = Array.isArray(cookieHeader) ? cookieHeader.join('; ') : (cookieHeader ?? '');
    const res = await fetch(`${ID_BASE}/api/me`, { headers: { cookie: raw } });
    if (!res.ok) {
      membershipCache.set(identity.session_id, { at: Date.now(), ok: false });
      return false;
    }
    const me = (await res.json()) as { memberships?: Membership[] };
    const memberships = me.memberships ?? [];
    const ok =
      memberships.some((m) => m.org_id === REQUIRED_ORG_ID) ||
      memberships.some((m) => m.role === 'superuser');
    membershipCache.set(identity.session_id, { at: Date.now(), ok });
    return ok;
  } catch {
    // id service unreachable: fail CLOSED in required mode — an identity
    // instance outage should not silently open the tenant's door.
    return false;
  }
}

function readCookie(
  header: string | string[] | undefined,
  name: string,
): string | null {
  if (!header) return null;
  const raw = Array.isArray(header) ? header.join('; ') : header;
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return part.slice(eq + 1).trim();
    }
  }
  return null;
}
