// prompt-runner — the only container in augment-it that sends LLM requests.
// Three subjects:
//   prompt.run.requested        — run a prompt per-row, produce a derived set,
//                                 and record each fired response to response-store
//   prompt.run.cancel.requested — abort an in-flight run (key: record_set_id)
//   prompt.preview.requested    — build the request for one row WITHOUT sending

import { connect, JSONCodec } from 'nats';
import { modelName } from './anthropic';
import { applyPrompt } from './apply';
import { registerChatTurnHandler } from './chat-turn';
import { draftPrompt, improvePrompt } from './drafter';
import { previewRequest } from './preview';
import { runPromptAgainstRecordSet } from './run';

const NATS_URL = process.env.NATS_URL ?? 'nats://localhost:4222';

const jc = JSONCodec();

// One AbortController per active run, keyed by record_set_id. Cancellation
// over the wire arrives as `prompt.run.cancel.requested { record_set_id }`.
// One run per record set at a time — firing a new run while one is active
// silently replaces the controller; the older run will see signal.aborted
// when its current row finishes (or when its 90s row timeout fires).
const activeRuns = new Map<string, AbortController>();

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

      const controller = new AbortController();
      // If a previous run was still active for this record set, mark it
      // superseded — its row loop will exit on the next row boundary.
      const existing = activeRuns.get(args.record_set_id);
      if (existing) existing.abort(new Error('superseded by a new run'));
      activeRuns.set(args.record_set_id, controller);

      try {
        const result = await runPromptAgainstRecordSet(nc, args, { runSignal: controller.signal });
        if (msg.reply) msg.respond(jc.encode(result));
        if (result.ok) {
          nc.publish(
            'prompt.run.completed',
            jc.encode({
              prompt_id: args.prompt_id,
              parent_record_set_id: args.record_set_id,
              record_set_id: result.record_set.record_set_id,
              row_count: result.row_count,
              cancelled: result.cancelled === true,
            }),
          );
          console.log(JSON.stringify({
            level: 'info',
            msg: result.cancelled ? 'run cancelled (partial)' : 'run completed',
            record_set_id: result.record_set.record_set_id,
            row_count: result.row_count,
          }));
        } else {
          console.log(JSON.stringify({ level: 'warn', msg: 'run rejected', error: result.error }));
        }
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        console.error(JSON.stringify({ level: 'error', msg: 'run failed', error }));
        if (msg.reply) msg.respond(jc.encode({ ok: false, error }));
      } finally {
        // Only clear if still pointing at our controller — a superseding run
        // may have replaced us already.
        if (activeRuns.get(args.record_set_id) === controller) {
          activeRuns.delete(args.record_set_id);
        }
      }
    }
  })();

  // prompt.run.cancel.requested — abort an in-flight run by record_set_id.
  // Replies { ok, cancelled } so the caller knows whether a run was actually
  // running. Idempotent: a no-op if nothing is active for this record set.
  (async () => {
    const sub = nc.subscribe('prompt.run.cancel.requested');
    for await (const msg of sub) {
      const { record_set_id } = jc.decode(msg.data) as { record_set_id: string };
      const controller = activeRuns.get(record_set_id);
      if (controller) {
        controller.abort(new Error('cancelled by user'));
        console.log(JSON.stringify({ level: 'info', msg: 'run cancel requested', record_set_id }));
        if (msg.reply) msg.respond(jc.encode({ ok: true, cancelled: true }));
      } else {
        if (msg.reply) msg.respond(jc.encode({ ok: true, cancelled: false }));
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

  // prompt.draft.requested — chat-driven prompt drafting. One LLM call
  // produces the prompt body; the result is persisted via prompt-store's
  // prompt.draft.save.requested. See ./drafter.ts.
  (async () => {
    const sub = nc.subscribe('prompt.draft.requested');
    for await (const msg of sub) {
      const args = jc.decode(msg.data) as {
        goal: string;
        record_set_id: string;
        output_column: string;
        tools?: string[];
      };
      console.log(JSON.stringify({ level: 'info', msg: 'draft started', ...args }));
      try {
        const result = await draftPrompt(nc, args);
        if (msg.reply) msg.respond(jc.encode({ ok: true, ...result }));
        console.log(JSON.stringify({ level: 'info', msg: 'draft completed', prompt_id: result.prompt_id }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        console.error(JSON.stringify({ level: 'error', msg: 'draft failed', error }));
        if (msg.reply) msg.respond(jc.encode({ ok: false, error }));
      }
    }
  })();

  // prompt.improve.requested — refine an existing draft from user feedback.
  // Parent prompt stays untouched; result is persisted as a new prompt with
  // derived_from set. See ./drafter.ts.
  (async () => {
    const sub = nc.subscribe('prompt.improve.requested');
    for await (const msg of sub) {
      const args = jc.decode(msg.data) as { parent_id: string; feedback: string };
      console.log(JSON.stringify({ level: 'info', msg: 'improve started', ...args }));
      try {
        const result = await improvePrompt(nc, args);
        if (msg.reply) msg.respond(jc.encode({ ok: true, ...result }));
        console.log(JSON.stringify({ level: 'info', msg: 'improve completed', prompt_id: result.prompt_id }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        console.error(JSON.stringify({ level: 'error', msg: 'improve failed', error }));
        if (msg.reply) msg.respond(jc.encode({ ok: false, error }));
      }
    }
  })();

  // prompt.apply.requested — chat-driven apply. Wraps runPromptAgainstRecordSet
  // with postcondition checks and flips the prompt's status to 'applied' on
  // a clean pass. See ./apply.ts.
  (async () => {
    const sub = nc.subscribe('prompt.apply.requested');
    for await (const msg of sub) {
      const args = jc.decode(msg.data) as {
        prompt_id: string;
        record_set_id: string;
        row_limit?: number;
        row_ids?: string[];
        model?: string;
        max_tokens?: number;
      };
      console.log(JSON.stringify({ level: 'info', msg: 'apply started', ...args }));
      const controller = new AbortController();
      const existing = activeRuns.get(args.record_set_id);
      if (existing) existing.abort(new Error('superseded by a new apply'));
      activeRuns.set(args.record_set_id, controller);
      try {
        const result = await applyPrompt(nc, args, { runSignal: controller.signal });
        if (msg.reply) msg.respond(jc.encode(result));
        if (result.ok) {
          nc.publish(
            'prompt.apply.completed',
            jc.encode({
              prompt_id: args.prompt_id,
              parent_record_set_id: args.record_set_id,
              record_set_id: result.derived_record_set_id,
              quality_violations: result.quality_violations.length,
            }),
          );
          console.log(JSON.stringify({
            level: result.quality_violations.length === 0 ? 'info' : 'warn',
            msg: 'apply completed',
            prompt_id: args.prompt_id,
            quality_violations: result.quality_violations.length,
          }));
        }
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        console.error(JSON.stringify({ level: 'error', msg: 'apply failed', error }));
        if (msg.reply) msg.respond(jc.encode({ ok: false, error }));
      } finally {
        if (activeRuns.get(args.record_set_id) === controller) {
          activeRuns.delete(args.record_set_id);
        }
      }
    }
  })();

  // chat.turn.requested — verb-routing LLM call for the in-app chat.
  // Workspace assembles the four-slab prompt + tools; this handler makes
  // the SDK call and returns the tool_use block. See ./chat-turn.ts.
  registerChatTurnHandler(nc);

  console.log(JSON.stringify({ level: 'info', msg: 'prompt-runner-service ready' }));
}

main().catch((err) => {
  console.error('prompt-runner-service failed to boot', err);
  process.exit(1);
});
