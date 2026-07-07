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
import { dispatch } from './capabilities';
import { dispatchChatTurn } from './chat';
import { getNats } from './nats';

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
];

type Session = {
  token: string;
  socket: WebSocket;
  seq: number;
  /** didi.sh identity, when a valid didi_session cookie rode the upgrade. */
  didi?: DidiIdentity;
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
        for (const session of sessions) {
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

    const session: Session = { token, socket, seq: 0, didi };
    sessions.add(session);

    socket.send(
      JSON.stringify({ kind: 'session', token, didi_id: didi?.didi_id ?? null }),
    );
    app.log.info(
      {
        token: token.slice(0, 8) + '…',
        didi_id: didi?.didi_id ?? null,
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
        message?: string;
        thread_id?: string;
        context?: { focused_prompt_id?: string; record_set_id?: string; client_id?: string };
        thread?: { role: 'user' | 'assistant'; content: string }[];
        suggestions?: { capability: string; hint: string }[];
      };

      // --- invoke frame: existing capability dispatch path. ---
      if (f.kind === 'invoke' && f.id && f.capability) {
        try {
          const result = await dispatch(f.capability, f.args ?? {});
          socket.send(JSON.stringify({ kind: 'result', id: f.id, ok: true, result }));
        } catch (err: unknown) {
          const error = err instanceof Error ? err.message : String(err);
          socket.send(JSON.stringify({ kind: 'result', id: f.id, ok: false, error }));
        }
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
