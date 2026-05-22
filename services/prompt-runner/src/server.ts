// prompt-runner — subscribes to prompt.run.requested, runs a prompt per-row
// against a record set, produces a derived record set. The only container
// in augment-it that calls the Anthropic API.

import { connect, JSONCodec } from 'nats';
import { modelName } from './anthropic';
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
  console.log(JSON.stringify({ level: 'info', msg: 'model', model: modelName() }));

  const sub = nc.subscribe('prompt.run.requested');
  console.log(JSON.stringify({ level: 'info', msg: 'prompt-runner-service ready' }));

  for await (const msg of sub) {
    const args = jc.decode(msg.data) as {
      prompt_id: string;
      record_set_id: string;
      row_limit?: number;
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
}

main().catch((err) => {
  console.error('prompt-runner-service failed to boot', err);
  process.exit(1);
});
