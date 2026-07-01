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

import { type NatsConnection } from '@nats-io/transport-node';
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
  setResponseStructured,
  type Candidate,
  type ResponseFilter,
  type ResponseFlag,
} from './store';

export function registerHandlers(nc: NatsConnection): void {
  // response.create.requested — fire-and-forget from prompt-runner
  (async () => {
    const sub = nc.subscribe('response.create.requested');
    for await (const msg of sub) {
      const params = msg.json() as Parameters<typeof createResponse>[0];
      try {
        const response = await createResponse(params);
        if (msg.reply) msg.respond(JSON.stringify({ response }));
        nc.publish(
          'response.created',
          JSON.stringify({
            response_id: response.response_id,
            run_id: response.run_id,
            record_set_id: response.record_set_id,
            row_id: response.row_id,
          }),
        );
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        console.error(JSON.stringify({ level: 'error', msg: 'response.create failed', error }));
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // response.list.requested
  (async () => {
    const sub = nc.subscribe('response.list.requested');
    for await (const msg of sub) {
      const filter = (msg.data.length > 0 ? msg.json() : {}) as ResponseFilter;
      if (msg.reply) msg.respond(JSON.stringify({ responses: listResponses(filter) }));
    }
  })();

  // response.get.requested
  (async () => {
    const sub = nc.subscribe('response.get.requested');
    for await (const msg of sub) {
      const { response_id } = msg.json() as { response_id: string };
      if (msg.reply) msg.respond(JSON.stringify({ response: getResponse(response_id) ?? null }));
    }
  })();

  // response.set_text.requested — autosave the human's in-progress edit to
  // the response's edited_text field. Broadcasts response.edited so any
  // other open window can refresh.
  (async () => {
    const sub = nc.subscribe('response.set_text.requested');
    for await (const msg of sub) {
      const { response_id, edited_text } = msg.json() as {
        response_id: string;
        edited_text: string;
      };
      try {
        const response = await setResponseEditedText(response_id, edited_text);
        if (msg.reply) msg.respond(JSON.stringify({ response }));
        nc.publish('response.edited', JSON.stringify({ response_id, edited_at: response.edited_at }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // response.set_structured.requested — patch the structured Candidate
  // payload on a pack response. Used by the by-record review surface when
  // the user corrects what Tavily returned (e.g. Wikipedia disambiguation
  // → actual entity page, deep-linked post → canonical profile URL). Only
  // patches the fields named in the request body; preserves the rest of
  // the Candidate. Broadcasts response.edited like the prose-edit path.
  (async () => {
    const sub = nc.subscribe('response.set_structured.requested');
    for await (const msg of sub) {
      const { response_id, patch } = msg.json() as {
        response_id: string;
        patch: Partial<Candidate>;
      };
      try {
        const response = await setResponseStructured(response_id, patch);
        if (msg.reply) msg.respond(JSON.stringify({ response }));
        nc.publish('response.edited', JSON.stringify({ response_id, edited_at: response.edited_at }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // response.flag.requested
  (async () => {
    const sub = nc.subscribe('response.flag.requested');
    for await (const msg of sub) {
      const { response_id, flag } = msg.json() as {
        response_id: string;
        flag: ResponseFlag;
      };
      try {
        const response = await flagResponse(response_id, flag);
        if (msg.reply) msg.respond(JSON.stringify({ response }));
        nc.publish('response.flagged', JSON.stringify({ response_id, flag }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // response.coverage.requested — which rows of this record set have already
  // been fired against this prompt? Reply { prompt_id, record_set_id,
  // covered_row_ids, needs_rerun_row_ids }.
  (async () => {
    const sub = nc.subscribe('response.coverage.requested');
    for await (const msg of sub) {
      const { prompt_id, record_set_id } = msg.json() as {
        prompt_id: string;
        record_set_id: string;
      };
      if (msg.reply) msg.respond(JSON.stringify(getCoverage(prompt_id, record_set_id)));
    }
  })();

  // response.delete.requested — drop one response. Broadcasts response.deleted
  // so any open Response Reviewer refreshes itself.
  (async () => {
    const sub = nc.subscribe('response.delete.requested');
    for await (const msg of sub) {
      const { response_id } = msg.json() as { response_id: string };
      try {
        const existed = await deleteResponse(response_id);
        if (msg.reply) msg.respond(JSON.stringify({ ok: true, deleted: existed }));
        if (existed) {
          nc.publish('response.deleted', JSON.stringify({ response_id }));
        }
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // response.delete_all.requested — drop every response matching the optional
  // filter (empty filter clears all). Reply carries the count removed.
  (async () => {
    const sub = nc.subscribe('response.delete_all.requested');
    for await (const msg of sub) {
      const filter = (msg.data.length > 0 ? msg.json() : {}) as ResponseFilter;
      try {
        const count = await deleteResponses(filter);
        if (msg.reply) msg.respond(JSON.stringify({ ok: true, deleted: count }));
        if (count > 0) {
          nc.publish('response.deleted', JSON.stringify({ bulk: true, count, filter }));
        }
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // response.accept.requested — mark accepted + write into the row.
  // Two write paths:
  //   - Pack responses (pack_id !== null, structured !== null) route to
  //     row.socials.add — the structured Candidate gets upserted into the
  //     row's `socials` array, replace-by-pack_id. Per
  //     context-v/blueprints/Packs-and-Bundles-Pattern.md §Row write-back.
  //   - Everything else (prompt-runner responses) keeps the legacy path:
  //     row.update against response.output_column.
  (async () => {
    const sub = nc.subscribe('response.accept.requested');
    for await (const msg of sub) {
      const { response_id, value } = msg.json() as {
        response_id: string;
        value?: string;
      };
      try {
        const { response, cell_value } = await acceptResponse(response_id, value);

        if (response.pack_id && response.structured) {
          // Pack write-back: upsert into row.fields.socials
          await nc.request(
            'row.socials.add.requested',
            JSON.stringify({
              row_id: response.row_id,
              pack_id: response.pack_id,
              url: response.structured.url,
              display_name: response.structured.display_name,
              confidence: response.structured.confidence,
              snippet: response.structured.snippet ?? '',
              source_metadata: response.structured.source_metadata ?? {},
              response_id: response.response_id,
            }),
            { timeout: 10_000 },
          );
        } else {
          // Legacy prompt-response path: write the cell value into the
          // output column.
          await nc.request(
            'row.update.requested',
            JSON.stringify({
              row_id: response.row_id,
              fields: { [response.output_column]: cell_value },
            }),
            { timeout: 10_000 },
          );
        }

        if (msg.reply) msg.respond(JSON.stringify({ response }));
        nc.publish(
          'response.flagged',
          JSON.stringify({ response_id, flag: 'good', accepted: true }),
        );
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        console.error(JSON.stringify({ level: 'error', msg: 'response.accept failed', error }));
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();
}
