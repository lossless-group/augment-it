// Hardened NATS request/reply consumer.
//
// Replaces the idiom that lost `domain.list` for an entire process lifetime:
//
//   void (async () => {
//     const sub = nc.subscribe(subject);
//     for await (const msg of sub) {
//       const args = msg.json();          // throws OUTSIDE the try
//       try { ...await... } catch { respond({ok:false}) }
//     }
//   })();
//
// Three defects, all of which this module closes. See
// context-v/issues/One-Stuck-Message-Kills-A-NATS-Subject-Until-Restart.md
//
//  1. `for await` is strictly SEQUENTIAL. One awaited call that never settles
//     halts the queue permanently — later messages are delivered by NATS and
//     dropped on the floor, silently, until the process restarts. Every
//     message now runs under a deadline, so a stuck request costs one timeout
//     instead of the subject.
//
//  2. `msg.json()` outside the try. One malformed payload throws out of the
//     loop, and because the loop is a bare `void (async () => {})()` with no
//     catch, the consumer dies as an unhandled rejection while the NATS
//     subscription stays registered — so monitoring still shows the subject as
//     subscribed and healthy. Parsing now happens inside the guarded region.
//
//  3. Nothing observed the consumer's own death. If the loop ever does exit,
//     it now says so on the way out.
//
// Deliberately still sequential. Processing messages concurrently would fix
// head-of-line blocking too, but it would also reorder writes on subjects like
// domain.create.requested, and that is a semantic change this fix does not
// need. Bounded-sequential turns "dead forever" into "one slow message",
// which is the actual bug.

/** The slice of a NATS Msg this module needs — keeps it testable without a broker. */
export type ReplyableMsg = {
  json(): unknown;
  reply?: string;
  respond(data: string): boolean;
};

export type ServeOptions = {
  /** Per-message ceiling. Should sit UNDER the caller's capability timeout. */
  timeoutMs?: number;
  /** Injected for tests; defaults to console. */
  log?: (line: string) => void;
};

/** Reject if `p` has not settled within `ms`. The rejection is the point: it
 *  lets the caller's catch answer {ok:false} instead of awaiting forever. */
export function withDeadline<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms`)), ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/**
 * Consume `messages`, answering every request exactly once and never letting a
 * single message take the subject down with it.
 *
 * Resolves only when the iterable is exhausted (i.e. the subscription closed).
 */
export async function serveSubject<T>(
  subject: string,
  messages: AsyncIterable<ReplyableMsg>,
  handler: (args: T) => Promise<unknown>,
  opts: ServeOptions = {},
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 25_000;
  const log = opts.log ?? ((line: string) => console.warn(line));

  try {
    for await (const msg of messages) {
      // Everything that can throw lives in here — including the parse.
      try {
        const args = msg.json() as T;
        const result = await withDeadline(
          Promise.resolve(handler(args)),
          timeoutMs,
          `${subject} handler`,
        );
        if (msg.reply) msg.respond(JSON.stringify({ ok: true, ...(result as object) }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        log(JSON.stringify({ level: 'error', subject, msg: 'handler failed', error }));
        // A request with no reply subject (a fire-and-forget publish) has
        // nobody to tell; the log line above is the only trace, by design.
        if (msg.reply) {
          try {
            msg.respond(JSON.stringify({ ok: false, error }));
          } catch (respondErr) {
            log(JSON.stringify({ level: 'error', subject, msg: 'respond failed', error: String(respondErr) }));
          }
        }
      }
    }
    log(JSON.stringify({ level: 'warn', subject, msg: 'subscription closed — no longer serving' }));
  } catch (err: unknown) {
    // Only reachable if the ITERATOR itself throws. Previously this vanished
    // into an unhandled rejection and the subject went quiet with no trace.
    log(JSON.stringify({ level: 'error', subject, msg: 'consumer died', error: String(err) }));
    throw err;
  }
}
