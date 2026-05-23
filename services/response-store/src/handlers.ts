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
  deleteResponse,
  deleteResponses,
  flagResponse,
  getCoverage,
  getResponse,
  listResponses,
  setResponseEditedText,
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

  // response.set_text.requested — autosave the human's in-progress edit to
  // the response's edited_text field. Broadcasts response.edited so any
  // other open window can refresh.
  (async () => {
    const sub = nc.subscribe('response.set_text.requested');
    for await (const msg of sub) {
      const { response_id, edited_text } = jc.decode(msg.data) as {
        response_id: string;
        edited_text: string;
      };
      try {
        const response = await setResponseEditedText(response_id, edited_text);
        if (msg.reply) msg.respond(jc.encode({ response }));
        nc.publish('response.edited', jc.encode({ response_id, edited_at: response.edited_at }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(jc.encode({ ok: false, error }));
      }
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

  // response.coverage.requested — which rows of this record set have already
  // been fired against this prompt? Reply { prompt_id, record_set_id,
  // covered_row_ids, needs_rerun_row_ids }.
  (async () => {
    const sub = nc.subscribe('response.coverage.requested');
    for await (const msg of sub) {
      const { prompt_id, record_set_id } = jc.decode(msg.data) as {
        prompt_id: string;
        record_set_id: string;
      };
      if (msg.reply) msg.respond(jc.encode(getCoverage(prompt_id, record_set_id)));
    }
  })();

  // response.delete.requested — drop one response. Broadcasts response.deleted
  // so any open Response Reviewer refreshes itself.
  (async () => {
    const sub = nc.subscribe('response.delete.requested');
    for await (const msg of sub) {
      const { response_id } = jc.decode(msg.data) as { response_id: string };
      try {
        const existed = await deleteResponse(response_id);
        if (msg.reply) msg.respond(jc.encode({ ok: true, deleted: existed }));
        if (existed) {
          nc.publish('response.deleted', jc.encode({ response_id }));
        }
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(jc.encode({ ok: false, error }));
      }
    }
  })();

  // response.delete_all.requested — drop every response matching the optional
  // filter (empty filter clears all). Reply carries the count removed.
  (async () => {
    const sub = nc.subscribe('response.delete_all.requested');
    for await (const msg of sub) {
      const filter = (msg.data.length > 0 ? jc.decode(msg.data) : {}) as ResponseFilter;
      try {
        const count = await deleteResponses(filter);
        if (msg.reply) msg.respond(jc.encode({ ok: true, deleted: count }));
        if (count > 0) {
          nc.publish('response.deleted', jc.encode({ bulk: true, count, filter }));
        }
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
