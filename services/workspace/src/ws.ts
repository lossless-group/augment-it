// WebSocket frame router.
//
// Per session:
//   - On upgrade, accept ?token=xxx or mint a fresh token; first server
//     frame is {kind: 'session', token}.
//   - Client sends InvokeFrame; we route capability → NATS via dispatch()
//     and reply with ResultFrame keyed by the same id.
//   - Broadcast NATS events (record_set.created, row.updated) are forwarded
//     to every connected session as EventFrames with per-session seq.
//
// Frame contract: packages/workspace/src/types.ts is the source of truth.

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import { type Subscription } from '@nats-io/transport-node';
import { isValid, mint } from './auth';
import { verifyDidiCookie, didiMode, checkMembership, type DidiIdentity } from './didi';
import { allowedClients, getTenantActive, resolveTenantCtx, type TenantCtx } from './tenancy';
import { dispatch } from './capabilities';
import { dispatchChatTurn } from './chat';
import { getNats } from './nats';

// Invoke durability across reconnects (gh #41). Results for invokes whose
// socket died before delivery are stashed here, keyed by invoke id, and
// handed over when the reconnected client sends a `claim` frame. In-flight
// dispatches are tracked so a claim can attach to work still running.
// Process-local by design — a workspace restart loses both maps, and the
// claim then fails fast with an explicit retry message instead of hanging.
const inflightInvokes = new Map<string, Promise<string>>();
const completedInvokes = new Map<string, { frame: string; expires: number }>();
const INVOKE_RESULT_TTL_MS = 15 * 60_000;

function stashResult(id: string, frame: string): void {
  completedInvokes.set(id, { frame, expires: Date.now() + INVOKE_RESULT_TTL_MS });
}

setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of completedInvokes) {
    if (entry.expires < now) completedInvokes.delete(id);
  }
}, 60_000).unref();

const BROADCAST_SUBJECTS = [
  'record_set.created',
  'record_set.deleted',
  'record_set.archived',
  'row.updated',
  'prompt.created',
  'prompt.updated',
  'prompt.deleted',
  'prompt.run.progress',
  'prompt.run.completed',
  'response.created',
  'response.flagged',
  'response.deleted',
  'response.edited',
  // Workspace switch — emitted by workspace-service when the operator
  // toggles workspaces. Browsers receive the event and clear their cached
  // record_sets / rows so remotes refetch against the new tenant. See
  // [[Workspaces-as-Tenant-Primitive]] § "Tenant-aware envelope".
  'workspace.active.changed',
  // Curator liveness — emitted by record-surrealdb-resolver's domain/source
  // handlers (domains.ts) after a mutation commits. Two people in the same
  // tenant see each other's edits without a refresh — see the Build-Order
  // plan's Step 6.
  'domain.created',
  'domain.retyped',
  'source.added',
  'source.updated',
  'source.removed',
  'extract.added',
  // Search-results queue — the registry (searches.ts) publishes on submit,
  // start, settle, and dismiss; the search-results rail refetches the
  // registry on every event instead of polling (spec D3).
  'search.updated',
];

type Session = {
  token: string;
  socket: WebSocket;
  seq: number;
  /** didi.sh identity, when a valid didi_session cookie rode the upgrade. */
  didi?: DidiIdentity;
  /** Session tenancy — allowed workspaces + per-sid active. Resolved once
   *  at upgrade from /api/me memberships (see tenancy.ts). */
  tenant: TenantCtx;
};

const sessions = new Set<Session>();
let natsSubs: Subscription[] = [];

function startBroadcastForwarder(): void {
  if (natsSubs.length > 0) return;
  const nc = getNats();
  for (const subject of BROADCAST_SUBJECTS) {
    const sub = nc.subscribe(subject);
    natsSubs.push(sub);
    (async () => {
      for await (const msg of sub) {
        const payload = msg.json();
        // workspace.active.changed carries tenancy scope: a sid-stamped
        // event is one user's per-session switch — deliver it only to that
        // user's sessions. A sid-less event is the legacy global switch —
        // deliver it only to sessions without a didi identity (didi'd
        // sessions are per-sid scoped and must not follow the operator's
        // global moves). All other subjects broadcast to everyone.
        const sid =
          subject === 'workspace.active.changed' &&
          payload &&
          typeof payload === 'object' &&
          'sid' in payload
            ? String((payload as { sid: unknown }).sid)
            : null;
        for (const session of sessions) {
          if (subject === 'workspace.active.changed') {
            const sessionSid = session.didi?.session_id ?? null;
            if (sid !== null ? sessionSid !== sid : sessionSid !== null) continue;
          }
          session.seq += 1;
          const frame = {
            kind: 'event' as const,
            seq: session.seq,
            subject,
            payload,
          };
          try {
            session.socket.send(JSON.stringify(frame));
          } catch {
            // socket likely closing — cleanup happens on 'close' handler
          }
        }
      }
    })();
  }
}

export async function registerWebsocket(app: FastifyInstance): Promise<void> {
  app.get('/ws', { websocket: true }, async (socket, req: FastifyRequest) => {
    const url = new URL(req.url, 'http://placeholder');
    const presented = url.searchParams.get('token');
    const token =
      presented && isValid(presented) ? presented : await mint();

    // didi.sh identity — verified locally (JWKS + EdDSA), per the spec's
    // increment 2. In 'required' mode an upgrade without a valid cookie is
    // rejected; in 'optional' mode the legacy continuity token still works
    // and identity rides along when present.
    const didi = (await verifyDidiCookie(req.headers.cookie)) ?? undefined;
    if (didiMode() === 'required') {
      if (!didi) {
        app.log.warn('ws reject: didi auth required, no valid didi_session');
        socket.close(4401, 'didi auth required');
        return;
      }
      // Step 3's gate: identity must also clear the instance's org
      // requirement (membership in REQUIRED_ORG_ID, or superuser anywhere).
      if (!(await checkMembership(didi, req.headers.cookie))) {
        app.log.warn({ didi_id: didi.didi_id }, 'ws reject: membership required');
        socket.close(4403, 'membership required');
        return;
      }
    }

    // Tenancy rides the same /api/me fetch admission used (cached).
    const tenant = await resolveTenantCtx(didi, req.headers.cookie);

    const session: Session = { token, socket, seq: 0, didi, tenant };
    sessions.add(session);

    socket.send(
      JSON.stringify({
        kind: 'session',
        token,
        didi_id: didi?.didi_id ?? null,
        didi_auth_mode: didiMode(),
        // The shell learns its tenancy at connect instead of a follow-up
        // workspace.list round-trip. allowed_clients resolves 'all' to the
        // concrete slugs so the wire shape is uniform.
        allowed_clients: allowedClients(tenant),
        active_client_id: getTenantActive(tenant),
        superuser: tenant.superuser,
      }),
    );
    app.log.info(
      {
        token: token.slice(0, 8) + '…',
        didi_id: didi?.didi_id ?? null,
        allowed_clients: tenant.allowed === 'all' ? 'all' : tenant.allowed,
        active_client: getTenantActive(tenant),
        sessions: sessions.size,
      },
      'ws connect',
    );

    socket.on('message', async (raw: Buffer) => {
      let frame: unknown;
      try {
        frame = JSON.parse(raw.toString('utf8'));
      } catch {
        app.log.warn('ws: invalid JSON frame');
        return;
      }
      const f = frame as {
        kind?: string;
        id?: string;
        capability?: string;
        args?: unknown;
        // Set by the shell when replaying a capability the chat surface
        // proposed/invoked, so attribution can tell "didi did this on the
        // operator's behalf" apart from a direct UI click. Client-supplied,
        // low-stakes provenance — never used for gating.
        via?: string;
        message?: string;
        thread_id?: string;
        context?: {
          focused_prompt_id?: string;
          record_set_id?: string;
          client_id?: string;
          focused_org_slug?: string;
          focused_org_name?: string;
        };
        thread?: { role: 'user' | 'assistant'; content: string }[];
        suggestions?: { capability: string; hint: string }[];
      };

      // --- invoke frame: existing capability dispatch path. ---
      // Long dispatches (didi crawls run minutes) must survive the caller's
      // socket dropping mid-flight: the serialized result frame is tracked
      // in-flight and, if the socket is gone when it lands, stashed for a
      // post-reconnect `claim` frame (gh #41). A workspace restart still
      // loses both maps — the claim then fails fast and explicit instead of
      // hanging the caller forever.
      if (f.kind === 'invoke' && f.id && f.capability) {
        const invokeId = f.id;
        // Receipt log (gh #58 probe 2): "the frame never reached ws.ts" is
        // now fact, not inference — grep for invoke_received.
        app.log.info({ capability: f.capability, invoke_id: invokeId }, 'invoke_received');
        // Actor attribution envelope (build-order step 4) — the verified
        // didi.sh identity rides beside the args into dispatch(), never
        // client-asserted. See [[Workspaces-as-Tenant-Primitive]] §
        // "Tenant-aware envelope" for the sibling client_id pattern.
        const actor = session.didi
          ? { didi_id: session.didi.didi_id, ...(f.via ? { via: f.via } : {}) }
          : undefined;
        const resultPromise = (async () => {
          try {
            const result = await dispatch(f.capability as string, f.args ?? {}, actor, session.tenant);
            return JSON.stringify({ kind: 'result', id: invokeId, ok: true, result });
          } catch (err: unknown) {
            const error = err instanceof Error ? err.message : String(err);
            return JSON.stringify({ kind: 'result', id: invokeId, ok: false, error });
          }
        })();
        inflightInvokes.set(invokeId, resultPromise);
        const resultFrame = await resultPromise;
        inflightInvokes.delete(invokeId);
        if (socket.readyState === 1 /* OPEN */) {
          try {
            socket.send(resultFrame);
            app.log.info({ capability: f.capability, invoke_id: invokeId }, 'invoke_result_sent');
          } catch {
            stashResult(invokeId, resultFrame);
            app.log.warn({ capability: f.capability, invoke_id: invokeId }, 'invoke_result_stashed (send threw)');
          }
        } else {
          stashResult(invokeId, resultFrame);
          app.log.warn({ capability: f.capability, invoke_id: invokeId, readyState: socket.readyState }, 'invoke_result_stashed (socket not open)');
        }
        return;
      }

      // --- claim frame: re-attach to an invoke after a reconnect. ---
      if (f.kind === 'claim' && f.id) {
        const claimId = f.id;
        const done = completedInvokes.get(claimId);
        if (done) {
          completedInvokes.delete(claimId);
          socket.send(done.frame);
          return;
        }
        const inflight = inflightInvokes.get(claimId);
        if (inflight) {
          const resultFrame = await inflight;
          // The original waiter may have stashed it between our lookup and
          // resolution — drop any duplicate stash and deliver here.
          completedInvokes.delete(claimId);
          try {
            socket.send(resultFrame);
          } catch {
            stashResult(claimId, resultFrame);
          }
          return;
        }
        socket.send(
          JSON.stringify({
            kind: 'result',
            id: claimId,
            ok: false,
            error:
              'invoke not found — the workspace service restarted while it was in flight; retry the action',
          }),
        );
        return;
      }

      // --- chat_turn frame: route through chat dispatch. ---
      if (f.kind === 'chat_turn' && f.id && f.message) {
        try {
          const result = await dispatchChatTurn({
            message: f.message,
            thread: f.thread,
            context: f.context,
            suggestions: f.suggestions,
          });
          if (!result.ok) {
            socket.send(JSON.stringify({ kind: 'chat_error', id: f.id, error: result.error }));
            return;
          }
          if (result.tool_name === 'chat_answer') {
            socket.send(JSON.stringify({ kind: 'chat_response', id: f.id, mode: 'answer', text: result.input.text }));
          } else if (result.tool_name === 'chat_propose') {
            socket.send(JSON.stringify({
              kind: 'chat_response',
              id: f.id,
              mode: 'propose',
              text: result.input.text,
              proposals: result.input.proposals,
            }));
          } else {
            socket.send(JSON.stringify({
              kind: 'chat_response',
              id: f.id,
              mode: 'invoke',
              text: result.input.text,
              tool_call: { capability: result.input.capability, args: result.input.args },
            }));
          }
        } catch (err: unknown) {
          const error = err instanceof Error ? err.message : String(err);
          socket.send(JSON.stringify({ kind: 'chat_error', id: f.id, error }));
        }
        return;
      }

      app.log.warn({ frame: f }, 'ws: unexpected frame shape');
    });

    socket.on('close', () => {
      sessions.delete(session);
      app.log.info({ token: token.slice(0, 8) + '…', sessions: sessions.size }, 'ws close');
    });
  });

  startBroadcastForwarder();
}
