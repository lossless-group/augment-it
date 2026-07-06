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
