// WebSocket transport for @augment-it/workspace.
//
// Uses the platform-native WebSocket API (available on browsers and on
// Node 22+). No Svelte deps; safe to import from any environment.
//
// Responsibilities:
//   - open ws://<workspace-service>/ws (?token=<saved> if we have one)
//   - first server frame is SessionFrame → persist token via config.saveToken
//   - InvokeFrame out → matching ResultFrame back (resolved by frame.id)
//   - EventFrame → routed to config.onFrame for the workspace singleton to
//     ingestEvent
//   - reconnect with backoff on close
//   - invoke() called BEFORE the socket is open gets QUEUED and flushed
//     when the socket reaches OPEN state. Callers don't have to think
//     about WS timing; the first-call-on-page-load is the common case.

import type { ClientFrame, InvokeFrame, ResultFrame, ServerFrame } from './types';

export type TransportConfig = {
  url: string;                              // e.g. 'ws://localhost:3001/ws'
  getToken: () => string | null;
  saveToken: (token: string) => void;
  onFrame: (frame: ServerFrame) => void;    // called for event/session/result frames
  onStatus?: (status: 'connecting' | 'open' | 'closed' | 'error') => void;
};

export type Transport = {
  invoke: (capability: string, args: unknown) => Promise<unknown>;
  close: () => void;
};

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
};

const RECONNECT_INITIAL_MS = 250;
const RECONNECT_MAX_MS = 10_000;

export function createTransport(config: TransportConfig): Transport {
  let ws: WebSocket | null = null;
  let backoff = RECONNECT_INITIAL_MS;
  let closing = false;
  const pending = new Map<string, Pending>();
  const sendQueue: ClientFrame[] = [];
  let nextId = 0;

  function genId(): string {
    nextId += 1;
    return `inv_${Date.now().toString(36)}_${nextId.toString(36)}`;
  }

  function flushSendQueue(): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    while (sendQueue.length > 0) {
      const frame = sendQueue.shift()!;
      ws.send(JSON.stringify(frame));
    }
  }

  function connect(): void {
    const token = config.getToken();
    const url = token
      ? `${config.url}?token=${encodeURIComponent(token)}`
      : config.url;

    config.onStatus?.('connecting');
    ws = new WebSocket(url);

    ws.addEventListener('open', () => {
      backoff = RECONNECT_INITIAL_MS;
      config.onStatus?.('open');
      flushSendQueue();
    });

    ws.addEventListener('message', (evt: MessageEvent) => {
      let frame: ServerFrame;
      try {
        frame = JSON.parse(typeof evt.data === 'string' ? evt.data : '') as ServerFrame;
      } catch {
        return;
      }

      if (frame.kind === 'session') {
        config.saveToken(frame.token);
      } else if (frame.kind === 'result') {
        const p = pending.get(frame.id);
        if (p) {
          pending.delete(frame.id);
          if (frame.ok) p.resolve(frame.result);
          else p.reject(new Error(frame.error ?? 'unknown error'));
        }
      }

      // forward every frame so the workspace can react (e.g. ingestEvent)
      config.onFrame(frame);
    });

    ws.addEventListener('close', () => {
      config.onStatus?.('closed');
      // Reject any in-flight invokes (already on the wire or still
      // queued) — callers will receive a clean 'socket closed' and can
      // retry. Clearing the sendQueue too keeps pending and queue in
      // lockstep; a stray queued frame surviving a reconnect would
      // produce a server reply that no longer has a pending entry to
      // resolve, wasting server work.
      for (const [, p] of pending) p.reject(new Error('socket closed'));
      pending.clear();
      sendQueue.length = 0;
      if (!closing) scheduleReconnect();
    });

    ws.addEventListener('error', () => {
      config.onStatus?.('error');
    });
  }

  function scheduleReconnect(): void {
    setTimeout(() => {
      if (closing) return;
      backoff = Math.min(backoff * 2, RECONNECT_MAX_MS);
      connect();
    }, backoff);
  }

  async function invoke(capability: string, args: unknown): Promise<unknown> {
    const id = genId();
    const frame: InvokeFrame = { kind: 'invoke', id, capability, args };
    const promise = new Promise<unknown>((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(frame));
    } else {
      // Not open yet (either before first open, or during reconnect).
      // Queue; flushSendQueue() drains on the next 'open' event.
      sendQueue.push(frame);
    }
    return promise;
  }

  connect();

  return {
    invoke,
    close: () => {
      closing = true;
      ws?.close();
    },
  };
}

// Marker export so callers can also satisfy ResultFrame type locally.
export type { ResultFrame };
