// Session tenancy — the org ↔ workspace mapping the id-didi-sh spec
// designed, resolved per USER session (didi `sid`), not per process.
//
// Keying by sid rather than per-socket matters: the shell and every remote
// each open their own WS connection, but they all ride the same
// didi_session cookie — so all of one user's sockets/tabs share one tenant
// state, while two different users never do. Anonymous sessions (DIDI_AUTH
// off/optional without a cookie — dev) fall back to the legacy
// process-global active in workspaces.ts, preserving pre-tenancy behavior.
//
// The global active survives with a narrower meaning: it is the row-store
// family's scope (row-store loads exactly one clients/<active>/rows.json —
// see the plan's caveat) and the anonymous default. A superuser's activate
// moves BOTH their per-sid active and the global; a client user's activate
// moves only their own session.
//
// Plan: [[Open-Augment-Didi-Sh-To-Reach-Edu]] · spec:
// ai-labs/context-v/specs/Id-Didi-Sh-Identity-Service.md ("org-roles
// mapped onto workspaces").

import { getMemberships, isSuperuser, type DidiIdentity } from './didi';
import { getNats } from './nats';
import {
  buildSummary,
  getActiveClientId,
  isPinned,
  knownClientIds,
  setActiveClientId,
  workspacesForOrgs,
  WORKSPACE_ACTIVE_CHANGED_SUBJECT,
  type WorkspaceSummary,
} from './workspaces';

export type TenantCtx = {
  /** didi session id; null = anonymous/legacy session. */
  sid: string | null;
  superuser: boolean;
  /** 'all' (superuser / anonymous) or the org-mapped workspace slugs. */
  allowed: 'all' | string[];
};

export const ANONYMOUS_TENANT: TenantCtx = { sid: null, superuser: false, allowed: 'all' };

// Per-sid active workspace. In-memory and session-scoped by design — a
// service restart just re-derives the default on the next connect.
const activeBySid = new Map<string, string | null>();

/**
 * Build the tenant context for a verified identity. One /api/me fetch
 * (cached in didi.ts) serves both admission and this. A null memberships
 * fetch degrades to an empty allowed set — fail closed, matching
 * checkMembership.
 */
export async function resolveTenantCtx(
  didi: DidiIdentity | undefined,
  cookieHeader: string | string[] | undefined,
): Promise<TenantCtx> {
  if (!didi) return ANONYMOUS_TENANT;
  const memberships = await getMemberships(didi, cookieHeader);
  if (memberships === null) return { sid: didi.session_id, superuser: false, allowed: [] };
  if (isSuperuser(memberships)) return { sid: didi.session_id, superuser: true, allowed: 'all' };
  return {
    sid: didi.session_id,
    superuser: false,
    allowed: workspacesForOrgs(memberships.map((m) => m.org_id)),
  };
}

/** The concrete slugs this session may touch (resolves 'all' at read time
 *  so freshly-added workspaces appear without a reconnect). */
export function allowedClients(ctx: TenantCtx): string[] {
  return ctx.allowed === 'all' ? knownClientIds() : ctx.allowed;
}

export function isClientAllowed(ctx: TenantCtx, client_id: string): boolean {
  return ctx.allowed === 'all' ? knownClientIds().includes(client_id) : ctx.allowed.includes(client_id);
}

/**
 * This session's active workspace. Anonymous → the legacy global. A didi
 * session's first read derives a default: the global active when allowed,
 * else the first allowed slug, else null (no workspace for this user's
 * orgs — admission normally prevents this in required mode).
 */
export function getTenantActive(ctx: TenantCtx): string | null {
  if (ctx.sid === null) return getActiveClientId();
  if (activeBySid.has(ctx.sid)) return activeBySid.get(ctx.sid) ?? null;
  const allowed = allowedClients(ctx);
  const global = getActiveClientId();
  const derived = global && allowed.includes(global) ? global : (allowed[0] ?? null);
  activeBySid.set(ctx.sid, derived);
  return derived;
}

/**
 * Switch this session's active workspace, validated against the allowed
 * set. Superuser (and anonymous/legacy) switches also move the global
 * active — the row-store scope follows the operator, as before. Per-sid
 * switches broadcast workspace.active.changed WITH the sid so only the
 * same user's other tabs/remotes react (row-store ignores sid-scoped
 * events; frame-router.ts forwards them only to matching sessions).
 */
export function activateTenant(ctx: TenantCtx, client_id: string): WorkspaceSummary {
  if (!isClientAllowed(ctx, client_id)) {
    throw new Error(`workspace not available to this session: ${client_id}`);
  }
  if (ctx.sid === null || ctx.superuser) {
    // Moves the global + publishes the legacy (sid-less) change event.
    const summary = setActiveClientId(client_id);
    if (ctx.sid !== null) {
      activeBySid.set(ctx.sid, client_id);
      publishSidScopedChange(ctx.sid, client_id);
    }
    return summary;
  }
  const prev = activeBySid.get(ctx.sid) ?? null;
  activeBySid.set(ctx.sid, client_id);
  if (prev !== client_id) publishSidScopedChange(ctx.sid, client_id);
  // Same summary shape the global path returns, without touching globals.
  return buildSummary(client_id);
}

function publishSidScopedChange(sid: string, client_id: string): void {
  try {
    getNats().publish(WORKSPACE_ACTIVE_CHANGED_SUBJECT, JSON.stringify({ client_id, sid }));
  } catch (err) {
    console.warn('[tenancy] could not publish sid-scoped workspace.active.changed', err);
  }
}

/** Whether the switcher should even show for this session: instance pin
 *  (legacy) or a single-workspace allowed set both mean "nothing to
 *  switch." */
export function isEffectivelyPinned(ctx: TenantCtx): boolean {
  if (ctx.sid === null || ctx.superuser) return isPinned();
  return isPinned() || allowedClients(ctx).length <= 1;
}
