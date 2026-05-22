// NATS subject handlers for prompt-store. Subjects:
//   prompt.list.requested    → reply { prompts }
//   prompt.get.requested     → reply { prompt | null }
//   prompt.create.requested  → reply { prompt }; broadcast prompt.created
//   prompt.update.requested  → reply { prompt }; broadcast prompt.updated
//   prompt.delete.requested  → reply { deleted }; broadcast prompt.deleted

import { JSONCodec, type NatsConnection } from 'nats';
import {
  createPrompt,
  deletePrompt,
  getPrompt,
  listPrompts,
  updatePrompt,
  type PromptTemplate,
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
}
