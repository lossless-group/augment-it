// NATS subject handlers for response-store. Subjects:
//   response.create.requested  → store a fired response; broadcast response.created
//   response.list.requested    → reply { responses }
//   response.get.requested     → reply { response | null }
//   response.flag.requested    → reply { response }; broadcast response.flagged
//   response.accept.requested  → accept the value into the row's cell via
//                                row.update.requested; broadcast response.flagged
//
// response.create.requested is published fire-and-forget by prompt-runner —
// there is no reply to send. The rest are request/reply capabilities routed
// through the workspace service.
//
// Spec: context-v/specs/Response-Reviewer-and-Response-Store.md

import { JSONCodec, type NatsConnection } from 'nats';
import {
  acceptResponse,
  createResponse,
  flagResponse,
  getResponse,
  listResponses,
  type ResponseFilter,
  type ResponseFlag,
} from './store';

const jc = JSONCodec();

export function registerHandlers(nc: NatsConnection): void {
  // response.create.requested — fire-and-forget from prompt-runner
  (async () => {
    const sub = nc.subscribe('response.create.requested');
    for await (const msg of sub) {
      const params = jc.decode(msg.data) as Parameters<typeof createResponse>[0];
      try {
        const response = await createResponse(params);
        if (msg.reply) msg.respond(jc.encode({ response }));
        nc.publish(
          'response.created',
          jc.encode({
            response_id: response.response_id,
            run_id: response.run_id,
            record_set_id: response.record_set_id,
            row_id: response.row_id,
          }),
        );
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        console.error(JSON.stringify({ level: 'error', msg: 'response.create failed', error }));
        if (msg.reply) msg.respond(jc.encode({ ok: false, error }));
      }
    }
  })();

  // response.list.requested
  (async () => {
    const sub = nc.subscribe('response.list.requested');
    for await (const msg of sub) {
      const filter = (msg.data.length > 0 ? jc.decode(msg.data) : {}) as ResponseFilter;
      if (msg.reply) msg.respond(jc.encode({ responses: listResponses(filter) }));
    }
  })();

  // response.get.requested
  (async () => {
    const sub = nc.subscribe('response.get.requested');
    for await (const msg of sub) {
      const { response_id } = jc.decode(msg.data) as { response_id: string };
      if (msg.reply) msg.respond(jc.encode({ response: getResponse(response_id) ?? null }));
    }
  })();

  // response.flag.requested
  (async () => {
    const sub = nc.subscribe('response.flag.requested');
    for await (const msg of sub) {
      const { response_id, flag } = jc.decode(msg.data) as {
        response_id: string;
        flag: ResponseFlag;
      };
      try {
        const response = await flagResponse(response_id, flag);
        if (msg.reply) msg.respond(jc.encode({ response }));
        nc.publish('response.flagged', jc.encode({ response_id, flag }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(jc.encode({ ok: false, error }));
      }
    }
  })();

  // response.accept.requested — mark accepted + write the value into the
  // row's output-column cell via row-store.
  (async () => {
    const sub = nc.subscribe('response.accept.requested');
    for await (const msg of sub) {
      const { response_id, value } = jc.decode(msg.data) as {
        response_id: string;
        value?: string;
      };
      try {
        const { response, cell_value } = await acceptResponse(response_id, value);
        await nc.request(
          'row.update.requested',
          jc.encode({
            row_id: response.row_id,
            fields: { [response.output_column]: cell_value },
          }),
          { timeout: 10_000 },
        );
        if (msg.reply) msg.respond(jc.encode({ response }));
        nc.publish(
          'response.flagged',
          jc.encode({ response_id, flag: 'good', accepted: true }),
        );
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        console.error(JSON.stringify({ level: 'error', msg: 'response.accept failed', error }));
        if (msg.reply) msg.respond(jc.encode({ ok: false, error }));
      }
    }
  })();
}
