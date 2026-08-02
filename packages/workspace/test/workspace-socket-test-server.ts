// A scripted stand-in for services/workspace's WebSocket endpoint, for
// transport tests — WebSocket protocol (RFC 6455) hand-rolled over
// node:http so the test harness adds ZERO runtime dependencies (the `ws`
// package was deliberately removed from this repo; we don't reintroduce
// it for tests). The client side is Node 22's native WebSocket — the
// same API the transport uses in the browser.
//
// The invoke/claim contract mirrors services/workspace/src/frame-router.ts exactly:
//   - invoke → result frame (ok or error), same id
//   - a result whose socket died is STASHED and handed over on `claim`
//   - a claim with no stashed/in-flight work → explicit not-found error
// When to reply, when to drop the socket, and when to close with an auth
// code are scriptable per test.

import { createServer, type Server } from 'node:http';
import { createHash } from 'node:crypto';
import type { Socket } from 'node:net';
import type { AddressInfo } from 'node:net';

const WEBSOCKET_HANDSHAKE_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const OPCODE_TEXT = 0x1;
const OPCODE_CLOSE = 0x8;
const OPCODE_PING = 0x9;

function encodeFrame(opcode: number, payload: Buffer): Buffer {
  const length = payload.length;
  let header: Buffer;
  if (length < 126) {
    header = Buffer.from([0x80 | opcode, length]);
  } else if (length < 65_536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  return Buffer.concat([header, payload]);
}

function encodeTextFrame(text: string): Buffer {
  return encodeFrame(OPCODE_TEXT, Buffer.from(text, 'utf8'));
}

function encodeCloseFrame(code?: number, reason = ''): Buffer {
  if (!code) return encodeFrame(OPCODE_CLOSE, Buffer.alloc(0));
  const payload = Buffer.alloc(2 + Buffer.byteLength(reason));
  payload.writeUInt16BE(code, 0);
  payload.write(reason, 2);
  return encodeFrame(OPCODE_CLOSE, payload);
}

/** One accepted browser/transport connection, with WebSocket framing. */
export class AcceptedWorkspaceSocket {
  private receiveBuffer: Buffer = Buffer.alloc(0);
  private closeFrameSent = false;
  onTextMessage: (text: string) => void = () => {};

  constructor(private readonly tcpSocket: Socket) {
    tcpSocket.on('data', (chunk: Buffer) => this.consume(chunk));
    tcpSocket.on('error', () => {});
  }

  /** Parse as many complete frames as the buffer holds; keep the remainder. */
  private consume(chunk: Buffer): void {
    this.receiveBuffer = Buffer.concat([this.receiveBuffer, chunk]);
    for (;;) {
      const buf = this.receiveBuffer;
      if (buf.length < 2) return;
      const opcode = buf[0] & 0x0f;
      const isMasked = (buf[1] & 0x80) !== 0;
      let payloadLength = buf[1] & 0x7f;
      let offset = 2;
      if (payloadLength === 126) {
        if (buf.length < 4) return;
        payloadLength = buf.readUInt16BE(2);
        offset = 4;
      } else if (payloadLength === 127) {
        if (buf.length < 10) return;
        payloadLength = Number(buf.readBigUInt64BE(2));
        offset = 10;
      }
      let maskKey: Buffer | null = null;
      if (isMasked) {
        if (buf.length < offset + 4) return;
        maskKey = buf.subarray(offset, offset + 4);
        offset += 4;
      }
      const frameEnd = offset + payloadLength;
      if (buf.length < frameEnd) return;
      const payload = Buffer.from(buf.subarray(offset, frameEnd));
      if (maskKey) {
        for (let i = 0; i < payload.length; i += 1) payload[i] ^= maskKey[i % 4];
      }
      this.receiveBuffer = buf.subarray(frameEnd);

      if (opcode === OPCODE_TEXT) {
        this.onTextMessage(payload.toString('utf8'));
      } else if (opcode === OPCODE_CLOSE) {
        // Close handshake: echo unless we initiated, then drop the TCP leg.
        if (!this.closeFrameSent) {
          this.closeFrameSent = true;
          this.tcpSocket.write(encodeFrame(OPCODE_CLOSE, payload));
        }
        this.tcpSocket.destroy();
      } else if (opcode === OPCODE_PING) {
        this.tcpSocket.write(encodeFrame(0xa, payload));
      }
    }
  }

  sendText(text: string): void {
    this.tcpSocket.write(encodeTextFrame(text));
  }

  /** Clean close with an explicit code (e.g. 4401 = auth-death). The code
   *  reaches the client's close event only via the close handshake, so we
   *  wait for the echo (consume() destroys) with a fallback destroy. */
  close(code?: number, reason?: string): void {
    if (this.closeFrameSent) return;
    this.closeFrameSent = true;
    this.tcpSocket.write(encodeCloseFrame(code, reason));
    setTimeout(() => this.tcpSocket.destroy(), 500).unref();
  }

  /** Abnormal drop — the client sees close code 1006, the shape a real
   *  network cut or container kill produces. */
  terminate(): void {
    this.tcpSocket.destroy();
  }
}

type InvokeFrame = { kind: 'invoke'; id: string; capability: string; args: unknown };

export type InvokeScript = (
  frame: InvokeFrame,
  socket: AcceptedWorkspaceSocket,
  server: WorkspaceSocketTestServer,
) =>
  | 'reply' // send the result frame immediately
  | 'stash-and-drop' // pretend the socket died mid-work: stash result, terminate socket
  | 'silent'; // never reply (the caller's deadline is the only way out)

export class WorkspaceSocketTestServer {
  private httpServer: Server | null = null;
  private port = 0;
  private readonly openSockets = new Set<AcceptedWorkspaceSocket>();
  /** How many times each invoke id was DELIVERED to the server. */
  readonly deliveries = new Map<string, number>();
  /** Stashed result frames awaiting a claim, by invoke id. */
  readonly stashed = new Map<string, string>();
  /** Total accepted connections since construction. */
  connections = 0;
  invokeScript: InvokeScript = () => 'reply';
  /** Result payload builder — what a successful invoke resolves to. */
  resultFor: (frame: InvokeFrame) => unknown = (f) => ({ echo: f.args, capability: f.capability });

  get url(): string {
    return `ws://127.0.0.1:${this.port}/ws`;
  }

  /** Start listening. Reuses the port across stop()/start() when known. */
  async start(port?: number): Promise<void> {
    this.httpServer = createServer();
    this.httpServer.on('upgrade', (request, tcpSocket) => {
      const key = request.headers['sec-websocket-key'];
      if (typeof key !== 'string') {
        tcpSocket.destroy();
        return;
      }
      const accept = createHash('sha1').update(key + WEBSOCKET_HANDSHAKE_GUID).digest('base64');
      tcpSocket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
          'Upgrade: websocket\r\n' +
          'Connection: Upgrade\r\n' +
          `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
      );
      const socket = new AcceptedWorkspaceSocket(tcpSocket as Socket);
      this.openSockets.add(socket);
      tcpSocket.on('close', () => this.openSockets.delete(socket));
      this.connections += 1;
      socket.sendText(JSON.stringify({ kind: 'session', token: `tok_${this.connections}` }));
      socket.onTextMessage = (text) => this.handleFrame(JSON.parse(text), socket);
    });
    await new Promise<void>((resolve) => this.httpServer!.listen(port ?? this.port ?? 0, resolve));
    this.port = (this.httpServer.address() as AddressInfo).port;
  }

  private handleFrame(
    f: { kind: string; id?: string; capability?: string; args?: unknown },
    socket: AcceptedWorkspaceSocket,
  ): void {
    if (f.kind === 'invoke' && f.id && f.capability) {
      const frame = { kind: 'invoke', id: f.id, capability: f.capability, args: f.args } as InvokeFrame;
      this.deliveries.set(frame.id, (this.deliveries.get(frame.id) ?? 0) + 1);
      const action = this.invokeScript(frame, socket, this);
      const resultFrame = JSON.stringify({ kind: 'result', id: frame.id, ok: true, result: this.resultFor(frame) });
      if (action === 'reply') {
        socket.sendText(resultFrame);
      } else if (action === 'stash-and-drop') {
        this.stashed.set(frame.id, resultFrame);
        socket.terminate();
      } // 'silent': do nothing
      return;
    }
    if (f.kind === 'claim' && f.id) {
      const done = this.stashed.get(f.id);
      if (done) {
        this.stashed.delete(f.id);
        socket.sendText(done);
        return;
      }
      socket.sendText(
        JSON.stringify({
          kind: 'result',
          id: f.id,
          ok: false,
          error: 'invoke not found — the workspace service restarted while it was in flight; retry the action',
        }),
      );
    }
  }

  /** Close every open socket. With a code (e.g. 4401 = auth-death) a clean
   *  close handshake carries it; with none, sockets terminate abnormally. */
  closeAllSockets(code?: number): void {
    for (const socket of this.openSockets) {
      if (code) socket.close(code);
      else socket.terminate();
    }
  }

  /** Stop accepting connections and drop all sockets. Keeps this.port so a
   *  later start() listens on the same address. */
  async stop(): Promise<void> {
    if (!this.httpServer) return;
    this.closeAllSockets();
    await new Promise<void>((resolve) => this.httpServer!.close(() => resolve()));
    this.httpServer = null;
  }

  /** Simulate a full restart: sockets dropped, stashes lost, same port. */
  async restartWithAmnesia(): Promise<void> {
    await this.stop();
    this.stashed.clear();
    await this.start(this.port);
  }
}
