// NATS subject handlers for prompt-store. Subjects:
//   prompt.list.requested             → reply { prompts }
//   prompt.get.requested              → reply { prompt | null }
//   prompt.create.requested           → reply { prompt }; broadcast prompt.created
//   prompt.update.requested           → reply { prompt }; broadcast prompt.updated
//   prompt.delete.requested           → reply { deleted }; broadcast prompt.deleted
//
// Draft-versioning subjects (used by prompt-runner when handling the
// chat's draft → improve → apply triad):
//   prompt.draft.save.requested       → reply { prompt }; broadcast prompt.created
//   prompt.draft.improve.save.requested → reply { prompt }; broadcast prompt.created
//   prompt.mark_applied.requested     → reply { prompt }; broadcast prompt.updated

import { JSONCodec, type NatsConnection } from 'nats';
import {
  cloneAsDraft,
  createDraft,
  createPrompt,
  deletePrompt,
  getPrompt,
  listPrompts,
  markApplied,
  updatePrompt,
  type PromptTemplate,
  type RecordSetContext,
} from './store';

const jc = JSONCodec();

export function registerHandlers(nc: NatsConnection): void {
  // prompt.list.requested
  (async () => {
    const sub = nc.subscribe('prompt.list.requested');
    for await (const msg of sub) {
      if (msg.reply) msg.respond(jc.encode({ prompts: listPrompts() }));
    }
  })();

  // prompt.get.requested
  (async () => {
    const sub = nc.subscribe('prompt.get.requested');
    for await (const msg of sub) {
      const { prompt_id } = jc.decode(msg.data) as { prompt_id: string };
      if (msg.reply) msg.respond(jc.encode({ prompt: getPrompt(prompt_id) ?? null }));
    }
  })();

  // prompt.create.requested
  (async () => {
    const sub = nc.subscribe('prompt.create.requested');
    for await (const msg of sub) {
      const params = jc.decode(msg.data) as {
        name: string;
        description?: string;
        content: string;
        output_column: string;
        tools?: PromptTemplate['tools'];
      };
      const prompt = await createPrompt(params);
      if (msg.reply) msg.respond(jc.encode({ prompt }));
      nc.publish('prompt.created', jc.encode({ prompt_id: prompt.prompt_id, name: prompt.name }));
    }
  })();

  // prompt.update.requested
  (async () => {
    const sub = nc.subscribe('prompt.update.requested');
    for await (const msg of sub) {
      const { prompt_id, patch } = jc.decode(msg.data) as {
        prompt_id: string;
        patch: Partial<Pick<PromptTemplate, 'name' | 'description' | 'content' | 'output_column' | 'tools'>>;
      };
      try {
        const prompt = await updatePrompt(prompt_id, patch);
        if (msg.reply) msg.respond(jc.encode({ prompt }));
        nc.publish('prompt.updated', jc.encode({ prompt_id, name: prompt.name }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(jc.encode({ ok: false, error }));
      }
    }
  })();

  // prompt.delete.requested
  (async () => {
    const sub = nc.subscribe('prompt.delete.requested');
    for await (const msg of sub) {
      const { prompt_id } = jc.decode(msg.data) as { prompt_id: string };
      const result = await deletePrompt(prompt_id);
      if (msg.reply) msg.respond(jc.encode(result));
      if (result.deleted) {
        nc.publish('prompt.deleted', jc.encode({ prompt_id }));
      }
    }
  })();

  // prompt.draft.save.requested — save a freshly-drafted prompt.
  // The LLM call that produced `content` happens in prompt-runner; this
  // handler just persists the result with status='draft'.
  (async () => {
    const sub = nc.subscribe('prompt.draft.save.requested');
    for await (const msg of sub) {
      const params = jc.decode(msg.data) as {
        goal: string;
        content: string;
        output_column: string;
        record_set_context: RecordSetContext;
        tools?: PromptTemplate['tools'];
        name?: string;
        description?: string;
      };
      try {
        const prompt = await createDraft(params);
        if (msg.reply) msg.respond(jc.encode({ prompt }));
        nc.publish('prompt.created', jc.encode({ prompt_id: prompt.prompt_id, name: prompt.name }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(jc.encode({ ok: false, error }));
      }
    }
  })();

  // prompt.draft.improve.save.requested — save a refined draft linked to
  // its parent via derived_from. Parent stays untouched.
  (async () => {
    const sub = nc.subscribe('prompt.draft.improve.save.requested');
    for await (const msg of sub) {
      const params = jc.decode(msg.data) as {
        parent_id: string;
        refined_content: string;
        feedback: string;
      };
      try {
        const prompt = await cloneAsDraft(params);
        if (msg.reply) msg.respond(jc.encode({ prompt }));
        nc.publish('prompt.created', jc.encode({ prompt_id: prompt.prompt_id, name: prompt.name }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(jc.encode({ ok: false, error }));
      }
    }
  })();

  // prompt.mark_applied.requested — flip status to 'applied' after a
  // successful prompt.apply run. Called by prompt-runner once postconditions
  // pass on the apply step.
  (async () => {
    const sub = nc.subscribe('prompt.mark_applied.requested');
    for await (const msg of sub) {
      const { prompt_id } = jc.decode(msg.data) as { prompt_id: string };
      try {
        const prompt = await markApplied(prompt_id);
        if (msg.reply) msg.respond(jc.encode({ prompt }));
        nc.publish('prompt.updated', jc.encode({ prompt_id, name: prompt.name }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(jc.encode({ ok: false, error }));
      }
    }
  })();
}
