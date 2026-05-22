// prompt-runner — the only container in augment-it that sends LLM requests.
// Two subjects:
//   prompt.run.requested     — run a prompt per-row, produce a derived set,
//                              and record each fired response to response-store
//   prompt.preview.requested — build the request for one row WITHOUT sending

import { connect, JSONCodec } from 'nats';
import { modelName } from './anthropic';
import { previewRequest } from './preview';
import { runPromptAgainstRecordSet } from './run';

const NATS_URL = process.env.NATS_URL ?? 'nats://localhost:4222';

const jc = JSONCodec();

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('prompt-runner: ANTHROPIC_API_KEY is not set — refusing to start');
    process.exit(1);
  }

  const nc = await connect({ servers: NATS_URL, name: 'prompt-runner-service' });
  console.log(JSON.stringify({ level: 'info', msg: 'nats connected', url: NATS_URL }));
  console.log(JSON.stringify({ level: 'info', msg: 'default model', model: modelName() }));

  // prompt.run.requested — runs N LLM calls, produces a derived record set.
  (async () => {
    const sub = nc.subscribe('prompt.run.requested');
    for await (const msg of sub) {
      const args = jc.decode(msg.data) as {
        prompt_id: string;
        record_set_id: string;
        row_limit?: number;
        row_ids?: string[];
        model?: string;
        max_tokens?: number;
      };
      console.log(JSON.stringify({ level: 'info', msg: 'run started', ...args }));

      try {
        const result = await runPromptAgainstRecordSet(nc, args);
        if (msg.reply) msg.respond(jc.encode(result));
        if (result.ok) {
          nc.publish(
            'prompt.run.completed',
            jc.encode({
              prompt_id: args.prompt_id,
              parent_record_set_id: args.record_set_id,
              record_set_id: result.record_set.record_set_id,
              row_count: result.row_count,
            }),
          );
          console.log(JSON.stringify({ level: 'info', msg: 'run completed', record_set_id: result.record_set.record_set_id }));
        } else {
          console.log(JSON.stringify({ level: 'warn', msg: 'run rejected', error: result.error }));
        }
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        console.error(JSON.stringify({ level: 'error', msg: 'run failed', error }));
        if (msg.reply) msg.respond(jc.encode({ ok: false, error }));
      }
    }
  })();

  // prompt.preview.requested — no LLM call; builds the request and replies.
  (async () => {
    const sub = nc.subscribe('prompt.preview.requested');
    for await (const msg of sub) {
      const args = jc.decode(msg.data) as {
        prompt_id: string;
        record_set_id: string;
        row_id: string;
        model?: string;
        max_tokens?: number;
      };
      try {
        const result = await previewRequest(nc, args);
        if (msg.reply) msg.respond(jc.encode(result));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        console.error(JSON.stringify({ level: 'error', msg: 'preview failed', error }));
        if (msg.reply) msg.respond(jc.encode({ ok: false, error }));
      }
    }
  })();

  console.log(JSON.stringify({ level: 'info', msg: 'prompt-runner-service ready' }));
}

main().catch((err) => {
  console.error('prompt-runner-service failed to boot', err);
  process.exit(1);
});
