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

import type {
  ChatErrorFrame,
  ChatProposal,
  ChatResponseFrame,
  ChatResponseMode,
  ChatToolCall,
  ChatTurnFrame,
  ClientFrame,
  InvokeFrame,
  ResultFrame,
  ServerFrame,
} from './types';

export type TransportConfig = {
  url: string;                              // e.g. 'ws://localhost:3001/ws'
  getToken: () => string | null;
  saveToken: (token: string) => void;
  onFrame: (frame: ServerFrame) => void;    // called for event/session/result frames
  onStatus?: (status: 'connecting' | 'open' | 'closed' | 'error' | 'auth_required') => void;
  /**
   * Called once per auth-death episode (WS close 4401/4403) before falling
   * back to the glacial retry — the id-plane's /api/session/refresh
   * contract re-mints an EXPIRED JWT as long as the 30-day session row is
   * live, so a mid-flight expiry can heal invisibly. Return true when the
   * cookie was refreshed (reconnect immediately), false when the session
   * is truly dead (sign-in required). See
   * [[Session-Expiry-Turns-The-App-Into-A-Zombie]].
   */
  refreshSession?: () => Promise<boolean>;
};

export type ChatTurnReply = {
  mode: ChatResponseMode;
  text: string;
  proposals?: ChatProposal[];
  tool_call?: ChatToolCall;
};

export type ChatTurnRequest = Omit<ChatTurnFrame, 'kind' | 'id'>;

export type Transport = {
  invoke: (capability: string, args: unknown, via?: string) => Promise<unknown>;
  chatTurn: (req: ChatTurnRequest) => Promise<ChatTurnReply>;
  close: () => void;
};

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
};

const RECONNECT_INITIAL_MS = 250;
const RECONNECT_MAX_MS = 10_000;
// Auth-death retry cadence. Deliberately glacial: a 4401/4403 close means
// the SESSION is rejected, not the network — hammering at normal backoff
// produced a ~2/sec reject storm in production logs while telling the
// operator nothing. 30s keeps every surface self-healing (a sign-in or a
// sibling surface's cookie refresh is picked up within one tick) without
// the storm.
const AUTH_RECONNECT_MS = 30_000;

export function createTransport(config: TransportConfig): Transport {
  let ws: WebSocket | null = null;
  let backoff = RECONNECT_INITIAL_MS;
  let closing = false;
  let authDead = false;
  let authRefreshTried = false;

  const authError = () =>
    new Error('session expired — sign in again to continue (the workspace rejected this session)');
  const pending = new Map<string, Pending>();
  const chatPending = new Map<string, { resolve: (v: ChatTurnReply) => void; reject: (e: Error) => void }>();
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
      authDead = false;
      authRefreshTried = false;
      config.onStatus?.('open');
      // Frames still in the queue were never delivered — flush re-sends
      // them as ordinary invokes. Pending entries NOT in the queue were
      // delivered before a drop: re-attach to their (possibly finished)
      // server-side work with claim frames (gh #41). The server answers a
      // claim with the normal result frame — same id, same resolution path
      // — or an explicit not-found error if it restarted meanwhile.
      const queuedIds = new Set(
        sendQueue.filter((fr) => fr.kind === 'invoke').map((fr) => fr.id),
      );
      flushSendQueue();
      for (const id of pending.keys()) {
        if (!queuedIds.has(id)) {
          ws!.send(JSON.stringify({ kind: 'claim', id }));
        }
      }
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
      } else if (frame.kind === 'chat_response') {
        const p = chatPending.get(frame.id);
        if (p) {
          chatPending.delete(frame.id);
          p.resolve({
            mode: frame.mode,
            text: frame.text,
            proposals: frame.proposals,
            tool_call: frame.tool_call,
          });
        }
      } else if (frame.kind === 'chat_error') {
        const p = chatPending.get(frame.id);
        if (p) {
          chatPending.delete(frame.id);
          p.reject(new Error(frame.error));
        }
      }

      // forward every frame so the workspace can react (e.g. ingestEvent)
      config.onFrame(frame);
    });

    ws.addEventListener('close', (evt: CloseEvent) => {
      // Auth-death (4401 no/expired didi session, 4403 membership refused)
      // is NOT a transient drop: the queue-and-reconnect machinery below
      // would wait on a socket that can never open, and its 120s deadline
      // blames the server ("the workspace did not reply"). Fail everything
      // fast with an auth-shaped error, surface auth_required so the shell
      // can re-wall, try one silent cookie refresh, then retry glacially.
      if (!closing && (evt.code === 4401 || evt.code === 4403)) {
        authDead = true;
        config.onStatus?.('auth_required');
        const err = authError();
        for (const [, p] of pending) p.reject(err);
        pending.clear();
        for (const [, p] of chatPending) p.reject(err);
        chatPending.clear();
        sendQueue.length = 0;
        if (config.refreshSession && !authRefreshTried) {
          authRefreshTried = true;
          void config
            .refreshSession()
            .then((ok) => {
              if (closing) return;
              if (ok) connect();
              else scheduleAuthReconnect();
            })
            .catch(() => {
              if (!closing) scheduleAuthReconnect();
            });
        } else {
          scheduleAuthReconnect();
        }
        return;
      }
      config.onStatus?.('closed');
      // In-flight INVOKES survive the drop (gh #41): their pending entries
      // stay put and the next 'open' re-attaches via claim frames — the
      // server holds results for invokes whose socket died. Long-running
      // work (didi crawls run minutes) no longer strands an eternal
      // spinner because a container rebuild or network blip severed the
      // socket. Chat turns stay fail-fast: cheap to resend, and the rail
      // shows the error inline.
      if (closing) {
        for (const [, p] of pending) p.reject(new Error('socket closed'));
        pending.clear();
      }
      for (const [, p] of chatPending) p.reject(new Error('socket closed'));
      chatPending.clear();
      // Keep undelivered invoke frames for re-send on reconnect; drop
      // queued chat frames (their pending entries were just rejected).
      const keep = sendQueue.filter((fr) => fr.kind === 'invoke' && pending.has(fr.id));
      sendQueue.length = 0;
      sendQueue.push(...keep);
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

  function scheduleAuthReconnect(): void {
    setTimeout(() => {
      if (closing) return;
      connect();
    }, AUTH_RECONNECT_MS);
  }

  // Default client deadline (gh #58 probe 4): a lost invoke previously hung
  // its pane FOREVER — no timeout anywhere client-side. Crawl/scan-shaped
  // capabilities get the server dispatch ceiling (600s) plus headroom;
  // everything else fails loud at 120s with the capability named, so the
  // operator sees an error and can retry instead of a frozen spinner.
  const DEADLINE_DEFAULT_MS = 120_000;
  const DEADLINE_LONG_MS = 660_000;
  const deadlineFor = (capability: string): number =>
    /crawl|scan|pack\./.test(capability) ? DEADLINE_LONG_MS : DEADLINE_DEFAULT_MS;

  async function invoke(capability: string, args: unknown, via?: string): Promise<unknown> {
    // While auth-dead, queueing would just feed the deadline timer a frame
    // that can never send — fail fast with the honest error instead.
    if (authDead) return Promise.reject(authError());
    const id = genId();
    const frame: InvokeFrame = { kind: 'invoke', id, capability, args, ...(via ? { via } : {}) };
    const promise = new Promise<unknown>((resolve, reject) => {
      const ms = deadlineFor(capability);
      const timer = setTimeout(() => {
        if (!pending.has(id)) return;
        pending.delete(id);
        // Drop any still-queued copy so a later flush doesn't resend a
        // frame whose caller already gave up.
        const qi = sendQueue.findIndex((fr) => fr.kind === 'invoke' && fr.id === id);
        if (qi >= 0) sendQueue.splice(qi, 1);
        console.warn(`[workspace] invoke deadline (${ms}ms): ${capability} (${id})`);
        reject(new Error(`${capability} timed out after ${Math.round(ms / 1000)}s — the workspace did not reply; retry the action`));
      }, ms);
      pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
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

  async function chatTurn(req: ChatTurnRequest): Promise<ChatTurnReply> {
    if (authDead) return Promise.reject(authError());
    const id = `chat_${Date.now().toString(36)}_${(++nextId).toString(36)}`;
    const frame: ChatTurnFrame = { kind: 'chat_turn', id, ...req };
    const promise = new Promise<ChatTurnReply>((resolve, reject) => {
      chatPending.set(id, { resolve, reject });
    });
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(frame));
    } else {
      sendQueue.push(frame);
    }
    return promise;
  }

  connect();

  return {
    invoke,
    chatTurn,
    close: () => {
      closing = true;
      ws?.close();
    },
  };
}

// Marker export so callers can also satisfy ResultFrame type locally.
export type { ResultFrame };
