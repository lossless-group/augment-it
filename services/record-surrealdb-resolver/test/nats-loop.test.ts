// Regression tests for the three defects that took `domain.list` out of
// service for a whole process lifetime.
// Issue: context-v/issues/One-Stuck-Message-Kills-A-NATS-Subject-Until-Restart.md
//
// No broker and no database — serveSubject takes an AsyncIterable of anything
// reply-shaped, which is exactly what makes the failure modes testable. The
// production bug was unreachable by the existing suite because every test went
// through a real SurrealDB and never exercised the loop itself.

import { describe, expect, test, vi } from 'vitest';
import { serveSubject, withDeadline, type ReplyableMsg } from '../src/nats-loop';

/** A fake NATS message that records what it replied. */
function makeMsg(payload: string, opts: { reply?: string } = {}): ReplyableMsg & { replied: string[] } {
  const replied: string[] = [];
  return {
    replied,
    reply: opts.reply ?? 'inbox.1',
    json() {
      return JSON.parse(payload) as unknown;
    },
    respond(data: string) {
      replied.push(data);
      return true;
    },
  };
}

/** Yields the given messages, then completes — as a closing subscription would. */
async function* stream(msgs: ReplyableMsg[]): AsyncIterable<ReplyableMsg> {
  for (const m of msgs) yield m;
}

const never = () => new Promise<never>(() => {});

describe('serveSubject — the domain.list timeout regressions', () => {
  test('a malformed payload answers with an error instead of killing the consumer', async () => {
    // Defect 2. Previously msg.json() threw OUTSIDE the try, the loop exited as
    // an unhandled rejection, and every later message on the subject was
    // dropped — while the NATS subscription stayed registered and monitoring
    // still reported the subject healthy.
    const bad = makeMsg('this is not json{{');
    const good = makeMsg('{"client_slug":"reach-edu"}');
    const handler = vi.fn().mockResolvedValue({ domains: ['rural-income-boosts'] });

    await serveSubject('domain.list.requested', stream([bad, good]), handler, { log: () => {} });

    // The bad message was answered, not swallowed.
    expect(bad.replied).toHaveLength(1);
    expect(JSON.parse(bad.replied[0]).ok).toBe(false);

    // And crucially the loop SURVIVED to serve the next one.
    expect(handler).toHaveBeenCalledTimes(1);
    expect(JSON.parse(good.replied[0])).toMatchObject({ ok: true, domains: ['rural-income-boosts'] });
  });

  test('a handler that never settles cannot block the messages behind it', async () => {
    // Defect 1, the actual production failure: `for await` is sequential, so
    // one unsettled await halted the subject permanently. Now it costs one
    // timeout and the queue keeps moving.
    const stuck = makeMsg('{"client_slug":"reach-edu"}');
    const after = makeMsg('{"client_slug":"humain-vc"}');
    const handler = vi
      .fn()
      .mockImplementationOnce(never)                       // hangs forever
      .mockResolvedValueOnce({ domains: ['upward-mobility'] });

    await serveSubject('domain.list.requested', stream([stuck, after]), handler, {
      timeoutMs: 40,
      log: () => {},
    });

    const stuckReply = JSON.parse(stuck.replied[0]);
    expect(stuckReply.ok).toBe(false);
    expect(stuckReply.error).toMatch(/exceeded 40ms/);

    // The message behind the stuck one was still served.
    expect(JSON.parse(after.replied[0])).toMatchObject({ ok: true, domains: ['upward-mobility'] });
  });

  test('every request gets exactly one reply, success or failure', async () => {
    const ok = makeMsg('{"a":1}');
    const boom = makeMsg('{"a":2}');
    const handler = vi
      .fn()
      .mockResolvedValueOnce({ domains: [] })
      .mockRejectedValueOnce(new Error('surreal connect exceeded 10000ms'));

    await serveSubject('domain.list.requested', stream([ok, boom]), handler, { log: () => {} });

    expect(ok.replied).toHaveLength(1);
    expect(boom.replied).toHaveLength(1);
    expect(JSON.parse(boom.replied[0])).toMatchObject({
      ok: false,
      error: 'surreal connect exceeded 10000ms',
    });
  });

  test('a fire-and-forget message with no reply subject is not answered, and does not throw', async () => {
    const noReply = makeMsg('{"a":1}', { reply: undefined });
    noReply.reply = undefined;
    const handler = vi.fn().mockRejectedValue(new Error('nope'));

    await expect(
      serveSubject('domain.list.requested', stream([noReply]), handler, { log: () => {} }),
    ).resolves.toBeUndefined();
    expect(noReply.replied).toHaveLength(0);
  });

  test('a dying consumer logs instead of vanishing', async () => {
    // Defect 3. The old loop was `void (async () => {...})()` with no catch, so
    // an iterator failure disappeared into an unhandled rejection and the
    // subject went quiet with nothing in the logs.
    const lines: string[] = [];
    async function* exploding(): AsyncIterable<ReplyableMsg> {
      yield makeMsg('{"a":1}');
      throw new Error('subscription torn down');
    }
    const handler = vi.fn().mockResolvedValue({});

    await expect(
      serveSubject('domain.list.requested', exploding(), handler, { log: (l) => lines.push(l) }),
    ).rejects.toThrow('subscription torn down');

    expect(lines.some((l) => l.includes('consumer died'))).toBe(true);
  });

  test('a closing subscription is reported rather than passing silently', async () => {
    const lines: string[] = [];
    await serveSubject('domain.list.requested', stream([]), vi.fn(), { log: (l) => lines.push(l) });
    expect(lines.some((l) => l.includes('no longer serving'))).toBe(true);
  });
});

describe('withDeadline — the getDb() hang guard', () => {
  test('rejects a promise that never settles, so the caller can answer', async () => {
    // surrealdb's connect() against a WSS endpoint has no deadline of its own.
    // An unbounded one is what left `db` unassigned and the loop parked.
    await expect(withDeadline(never(), 30, 'surreal connect')).rejects.toThrow(
      'surreal connect exceeded 30ms',
    );
  });

  test('passes a value through untouched when it settles in time', async () => {
    await expect(withDeadline(Promise.resolve('ok'), 1_000, 'x')).resolves.toBe('ok');
  });

  test('propagates the original error rather than masking it as a timeout', async () => {
    await expect(
      withDeadline(Promise.reject(new Error('auth refused')), 1_000, 'x'),
    ).rejects.toThrow('auth refused');
  });
});
