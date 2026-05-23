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
import { JSONCodec, type Subscription } from 'nats';
import { isValid, mint } from './auth';
import { dispatch } from './capabilities';
import { getNats } from './nats';

const jc = JSONCodec();

const BROADCAST_SUBJECTS = [
  'record_set.created',
  'record_set.deleted',
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
];

type Session = {
  token: string;
  socket: WebSocket;
  seq: number;
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
        const payload = jc.decode(msg.data);
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

    const session: Session = { token, socket, seq: 0 };
    sessions.add(session);

    socket.send(JSON.stringify({ kind: 'session', token }));
    app.log.info({ token: token.slice(0, 8) + '…', sessions: sessions.size }, 'ws connect');

    socket.on('message', async (raw: Buffer) => {
      let frame: unknown;
      try {
        frame = JSON.parse(raw.toString('utf8'));
      } catch {
        app.log.warn('ws: invalid JSON frame');
        return;
      }
      const f = frame as { kind?: string; id?: string; capability?: string; args?: unknown };
      if (f.kind !== 'invoke' || !f.id || !f.capability) {
        app.log.warn({ frame: f }, 'ws: unexpected frame shape');
        return;
      }
      try {
        const result = await dispatch(f.capability, f.args ?? {});
        socket.send(
          JSON.stringify({
            kind: 'result',
            id: f.id,
            ok: true,
            result,
          }),
        );
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        socket.send(
          JSON.stringify({
            kind: 'result',
            id: f.id,
            ok: false,
            error,
          }),
        );
      }
    });

    socket.on('close', () => {
      sessions.delete(session);
      app.log.info({ token: token.slice(0, 8) + '…', sessions: sessions.size }, 'ws close');
    });
  });

  startBroadcastForwarder();
}
