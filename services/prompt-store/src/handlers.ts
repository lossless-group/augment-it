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

import { type NatsConnection } from '@nats-io/transport-node';
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

export function registerPromptStoreHandlers(nc: NatsConnection): void {
  // prompt.list.requested
  (async () => {
    const sub = nc.subscribe('prompt.list.requested');
    for await (const msg of sub) {
      if (msg.reply) msg.respond(JSON.stringify({ prompts: listPrompts() }));
    }
  })();

  // prompt.get.requested
  (async () => {
    const sub = nc.subscribe('prompt.get.requested');
    for await (const msg of sub) {
      const { prompt_id } = msg.json() as { prompt_id: string };
      if (msg.reply) msg.respond(JSON.stringify({ prompt: getPrompt(prompt_id) ?? null }));
    }
  })();

  // prompt.create.requested
  (async () => {
    const sub = nc.subscribe('prompt.create.requested');
    for await (const msg of sub) {
      const params = msg.json() as {
        name: string;
        description?: string;
        content: string;
        output_column: string;
        tools?: PromptTemplate['tools'];
      };
      const prompt = await createPrompt(params);
      if (msg.reply) msg.respond(JSON.stringify({ prompt }));
      nc.publish('prompt.created', JSON.stringify({ prompt_id: prompt.prompt_id, name: prompt.name }));
    }
  })();

  // prompt.update.requested
  (async () => {
    const sub = nc.subscribe('prompt.update.requested');
    for await (const msg of sub) {
      const { prompt_id, patch } = msg.json() as {
        prompt_id: string;
        patch: Partial<Pick<PromptTemplate, 'name' | 'description' | 'content' | 'output_column' | 'tools'>>;
      };
      try {
        const prompt = await updatePrompt(prompt_id, patch);
        if (msg.reply) msg.respond(JSON.stringify({ prompt }));
        nc.publish('prompt.updated', JSON.stringify({ prompt_id, name: prompt.name }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // prompt.delete.requested
  (async () => {
    const sub = nc.subscribe('prompt.delete.requested');
    for await (const msg of sub) {
      const { prompt_id } = msg.json() as { prompt_id: string };
      const result = await deletePrompt(prompt_id);
      if (msg.reply) msg.respond(JSON.stringify(result));
      if (result.deleted) {
        nc.publish('prompt.deleted', JSON.stringify({ prompt_id }));
      }
    }
  })();

  // prompt.draft.save.requested — save a freshly-drafted prompt.
  // The LLM call that produced `content` happens in prompt-runner; this
  // handler just persists the result with status='draft'.
  (async () => {
    const sub = nc.subscribe('prompt.draft.save.requested');
    for await (const msg of sub) {
      const params = msg.json() as {
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
        if (msg.reply) msg.respond(JSON.stringify({ prompt }));
        nc.publish('prompt.created', JSON.stringify({ prompt_id: prompt.prompt_id, name: prompt.name }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // prompt.draft.improve.save.requested — save a refined draft linked to
  // its parent via derived_from. Parent stays untouched.
  (async () => {
    const sub = nc.subscribe('prompt.draft.improve.save.requested');
    for await (const msg of sub) {
      const params = msg.json() as {
        parent_id: string;
        refined_content: string;
        feedback: string;
      };
      try {
        const prompt = await cloneAsDraft(params);
        if (msg.reply) msg.respond(JSON.stringify({ prompt }));
        nc.publish('prompt.created', JSON.stringify({ prompt_id: prompt.prompt_id, name: prompt.name }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // prompt.mark_applied.requested — flip status to 'applied' after a
  // successful prompt.apply run. Called by prompt-runner once postconditions
  // pass on the apply step.
  (async () => {
    const sub = nc.subscribe('prompt.mark_applied.requested');
    for await (const msg of sub) {
      const { prompt_id } = msg.json() as { prompt_id: string };
      try {
        const prompt = await markApplied(prompt_id);
        if (msg.reply) msg.respond(JSON.stringify({ prompt }));
        nc.publish('prompt.updated', JSON.stringify({ prompt_id, name: prompt.name }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();
}
