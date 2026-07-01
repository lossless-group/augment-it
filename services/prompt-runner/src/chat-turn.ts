// chat.turn.requested — the LLM call that routes a user's free-text message
// to one of three response modes (answer / propose / invoke). Caller
// (workspace's chat.ts) hands us the assembled four-slab system prompt,
// the thread, and the three tool definitions; we make ONE Anthropic call
// and return the tool_use block as a structured result.
//
// This is part of the LLM-gateway invariant: every LLM call in augment-it
// goes through this container. The workspace assembled the prompt; this
// file is the one that hits the SDK.

import Anthropic from '@anthropic-ai/sdk';
import type { NatsConnection } from '@nats-io/transport-node';
import { DEFAULT_MAX_TOKENS } from './request';

// Sonnet is the right model for v0.0.1 chat — fast enough for the
// drafting-loop UX, cheap enough to be defensible per-turn. Opus is
// reserved for prompt.run (the actual per-row enrichment work).
const CHAT_MODEL = process.env.CHAT_MODEL ?? 'claude-sonnet-4-6';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
  client = new Anthropic({ apiKey });
  return client;
}

type SystemSlab = { text: string; cache_control?: { type: 'ephemeral' } };
type ThreadMessage = { role: 'user' | 'assistant'; content: string };

type ChatTurnRequestPayload = {
  system: SystemSlab[];
  messages: ThreadMessage[];
  tools: unknown[]; // shape validated upstream
};

type ChatTurnReply =
  | { ok: true; tool_name: 'chat_answer'; input: { text: string } }
  | {
      ok: true;
      tool_name: 'chat_propose';
      input: { text: string; proposals: { capability: string; hint: string; args: unknown }[] };
    }
  | {
      ok: true;
      tool_name: 'chat_invoke';
      input: { text: string; capability: string; args: unknown };
    }
  | { ok: false; error: string };

export function registerChatTurnHandler(nc: NatsConnection): void {
  (async () => {
    const sub = nc.subscribe('chat.turn.requested');
    for await (const msg of sub) {
      const payload = msg.json() as ChatTurnRequestPayload;
      const result = await handleChatTurn(payload);
      if (msg.reply) msg.respond(JSON.stringify(result));
      if (!result.ok) {
        console.error(JSON.stringify({ level: 'error', msg: 'chat turn failed', error: result.error }));
      } else {
        console.log(JSON.stringify({ level: 'info', msg: 'chat turn ok', tool: result.tool_name }));
      }
    }
  })();
}

async function handleChatTurn(payload: ChatTurnRequestPayload): Promise<ChatTurnReply> {
  try {
    const response = await getClient().messages.create({
      model: CHAT_MODEL,
      max_tokens: DEFAULT_MAX_TOKENS,
      // The system slabs become a structured system array — each entry
      // can carry cache_control independently. The SDK accepts the array
      // form natively.
      system: payload.system.map((s) => ({
        type: 'text' as const,
        text: s.text,
        ...(s.cache_control ? { cache_control: s.cache_control } : {}),
      })),
      messages: payload.messages.map((m) => ({ role: m.role, content: m.content })),
      tools: payload.tools as Anthropic.ToolUnion[],
      // Force the model to call one of the three chat tools — no plain-text
      // replies. The three response modes ARE the surface.
      tool_choice: { type: 'any' },
    });

    // Find the tool_use block. With tool_choice: 'any' we're guaranteed one.
    const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    if (!toolUse) {
      return { ok: false, error: 'model returned no tool_use block despite tool_choice=any' };
    }

    if (toolUse.name === 'chat_answer') {
      return {
        ok: true,
        tool_name: 'chat_answer',
        input: { text: String((toolUse.input as { text?: string }).text ?? '') },
      };
    }
    if (toolUse.name === 'chat_propose') {
      const input = toolUse.input as { text?: string; proposals?: unknown[] };
      return {
        ok: true,
        tool_name: 'chat_propose',
        input: {
          text: String(input.text ?? ''),
          proposals: (input.proposals ?? []) as { capability: string; hint: string; args: unknown }[],
        },
      };
    }
    if (toolUse.name === 'chat_invoke') {
      const input = toolUse.input as { text?: string; capability?: string; args?: unknown };
      return {
        ok: true,
        tool_name: 'chat_invoke',
        input: {
          text: String(input.text ?? ''),
          capability: String(input.capability ?? ''),
          args: input.args ?? {},
        },
      };
    }
    return { ok: false, error: `unknown tool name from model: ${toolUse.name}` };
  } catch (err: unknown) {
    if (err instanceof Anthropic.APIError) {
      return { ok: false, error: `${err.status ?? '?'} ${err.name}: ${err.message}` };
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
