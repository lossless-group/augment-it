// Chat dispatch.
//
// Receives chat_turn frames from the WebSocket, assembles the four-slab
// system prompt + the v0.0.1 chat tool definitions, publishes the assembled
// payload to prompt-runner via NATS, returns the chat_response frame to
// the WebSocket.
//
// LLM-gateway invariant: this file does NOT call Anthropic. It publishes
// chat.turn.requested onto NATS; prompt-runner is the sole holder of the
// Anthropic API key.
//
// See context-v/blueprints/Chat-As-Verb-Surface-Patterns.md (ai-labs) for
// the five patterns this implements: capability adapters, lifecycle events,
// anticipation, three response modes, four cache-eligible slabs.

import { JSONCodec } from 'nats';
import { getNats } from './nats';

const jc = JSONCodec();

// --- Pattern 5: the four cache-eligible slabs. ---
//
// Slab 1 — static spine. Pinned to package version; changes only on
// release. Cache hits across every session.
const STATIC_SPINE = `You are augment-it, an in-app assistant for tabular data enrichment.

The user is building a fundraising / outreach pipeline by enriching record sets (uploaded CSVs of companies, contacts, deals) with LLM-generated columns. Your job is to help them author and run the prompts that produce those enrichments.

You have exactly three response modes. Pick one per turn, by calling exactly one of the three tools below:

- chat_answer — text only, no capability invoked. Use for conversational questions or when no concrete action is implied.
- chat_propose — suggest one or more capabilities the user might invoke. Use when the user's intent is plausible but not explicit. This is the default for any ambiguity.
- chat_invoke — directly invoke a capability without proposing first. Use ONLY when the user named the specific verb explicitly OR previously accepted a proposal.

The chat is in STRICT alignment mode for v0.0.1. Prefer chat_propose over chat_invoke for anything ambiguous. The user can always click an affordance to accept a proposal — that's the gating discipline.

CRITICAL DISCIPLINE:
- prompt.improve is for refining an existing draft from user feedback. It does NOT run the prompt against records. Do not chain it into prompt.apply in the same turn.
- prompt.apply is the only verb that mutates records. Always prefer chat_propose for prompt.apply unless the user has just accepted a draft they want to run.
- prompt.draft creates a draft. The result is editable; do not assume the user will run the first draft as-is.
`;

// Slab 2 — capability schemas. The three v0.0.1 chat verbs that the model
// can route to. Each carries an args shape the model fills in.
//
// Hardcoded here rather than derived from CAPABILITY_TO_SUBJECT because
// augment-it's capability dispatch map doesn't yet carry args schemas
// per capability. v0.0.2 generalizes this; v0.0.1 is the hand-wired
// version for the four verbs that ship.
const V001_CHAT_VERBS = `Available capabilities (use these as the \`capability\` field in chat_propose / chat_invoke):

prompt.draft — Draft a prompt template against a record set, targeting one new output column.
  args: { goal: string, record_set_id: string, output_column: string }

prompt.improve — Refine an existing draft with feedback. Returns a new draft linked to its parent.
  args: { parent_id: string, feedback: string }

prompt.apply — Bind a draft prompt to a record set and run it. Flips status to 'applied' on success.
  args: { prompt_id: string, record_set_id: string, row_limit?: number }
`;

// Slab 3 — active skills. Empty in v0.0.1; cache breakpoint reserved.
const ACTIVE_SKILLS = '';

// Slab 4 — per-org reminders. Empty in v0.0.1; cache breakpoint reserved.
const PER_ORG_REMINDERS = '';

// --- The chat tool definitions the model picks among. ---
// These mirror the three response modes from STATIC_SPINE. The SDK returns
// a tool_use block naming one of these names + an input matching the
// declared schema; we translate to ChatResponseFrame.

export const CHAT_TOOLS = [
  {
    name: 'chat_answer',
    description: 'Reply to the user with text. No capability is invoked.',
    input_schema: {
      type: 'object',
      required: ['text'],
      properties: {
        text: { type: 'string', description: 'The conversational reply.' },
      },
    },
  },
  {
    name: 'chat_propose',
    description: 'Suggest one to three capability invocations the user might want. Strict alignment default; use this for any ambiguity.',
    input_schema: {
      type: 'object',
      required: ['text', 'proposals'],
      properties: {
        text: { type: 'string', description: 'A short framing sentence the chat shows above the proposal cards.' },
        proposals: {
          type: 'array',
          minItems: 1,
          maxItems: 3,
          items: {
            type: 'object',
            required: ['capability', 'hint', 'args'],
            properties: {
              capability: {
                type: 'string',
                enum: ['prompt.draft', 'prompt.improve', 'prompt.apply'],
              },
              hint: { type: 'string', description: 'One-line label for the affordance button.' },
              args: {
                type: 'object',
                description: 'Prefilled args. The user can edit before confirming.',
              },
            },
          },
        },
      },
    },
  },
  {
    name: 'chat_invoke',
    description: 'Directly invoke a capability without proposing. Use only when the user named the verb explicitly or accepted a prior proposal.',
    input_schema: {
      type: 'object',
      required: ['text', 'capability', 'args'],
      properties: {
        text: { type: 'string', description: 'A short narration of what the capability is doing.' },
        capability: { type: 'string', enum: ['prompt.draft', 'prompt.improve', 'prompt.apply'] },
        args: { type: 'object' },
      },
    },
  },
];

// --- Assemble + dispatch. ---

export type ChatTurnInput = {
  message: string;
  thread?: { role: 'user' | 'assistant'; content: string }[];
  context?: { focused_prompt_id?: string; record_set_id?: string };
  suggestions?: { capability: string; hint: string }[];
};

// The shape prompt-runner returns. One of the three tool calls, or an
// error envelope.
export type ChatTurnResult =
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

function suggestedVerbsSlab(suggestions?: { capability: string; hint: string }[]): string {
  if (!suggestions || suggestions.length === 0) return '';
  const lines = suggestions.map((s) => `- ${s.capability} — ${s.hint}`).join('\n');
  return `Suggested next verbs (based on the user's current screen and most-recent action):\n${lines}\n`;
}

function contextSlab(ctx?: ChatTurnInput['context']): string {
  if (!ctx) return '';
  const parts: string[] = [];
  if (ctx.focused_prompt_id) parts.push(`The user is currently looking at prompt: ${ctx.focused_prompt_id}`);
  if (ctx.record_set_id) parts.push(`The user is currently in record set: ${ctx.record_set_id}`);
  return parts.length === 0 ? '' : parts.join('\n') + '\n';
}

/**
 * Build the full message array Anthropic will receive. The four cacheable
 * slabs become one combined system string with cache_control breakpoints
 * applied where the prompt-runner converts to the SDK call (the SDK
 * accepts a system: Array<{type, text, cache_control?}> form).
 *
 * For v0.0.1, slabs 3 and 4 are empty strings but the assembly path is in
 * place so v0.0.2 can drop content in without restructuring.
 */
function assembleSystemSlabs(input: ChatTurnInput): { text: string; cache_control?: { type: 'ephemeral' } }[] {
  const slabs: { text: string; cache_control?: { type: 'ephemeral' } }[] = [
    { text: STATIC_SPINE, cache_control: { type: 'ephemeral' } },
    { text: V001_CHAT_VERBS, cache_control: { type: 'ephemeral' } },
  ];
  // Only include non-empty optional slabs so the SDK doesn't reject empties.
  if (ACTIVE_SKILLS) slabs.push({ text: ACTIVE_SKILLS, cache_control: { type: 'ephemeral' } });
  if (PER_ORG_REMINDERS) slabs.push({ text: PER_ORG_REMINDERS, cache_control: { type: 'ephemeral' } });
  // Volatile slabs (no cache_control). Order: context → suggestions.
  const ctx = contextSlab(input.context);
  const sug = suggestedVerbsSlab(input.suggestions);
  if (ctx) slabs.push({ text: ctx });
  if (sug) slabs.push({ text: sug });
  return slabs;
}

function assembleMessages(input: ChatTurnInput): { role: 'user' | 'assistant'; content: string }[] {
  const msgs: { role: 'user' | 'assistant'; content: string }[] = [];
  if (input.thread) msgs.push(...input.thread);
  msgs.push({ role: 'user', content: input.message });
  return msgs;
}

/**
 * Publish a chat-turn request to prompt-runner and return its reply.
 *
 * Timeout 60s — Sonnet at typical-ish latency lands ~3-15s for a single
 * tool-use response; 60s is generous for the slowest case.
 */
export async function dispatchChatTurn(input: ChatTurnInput): Promise<ChatTurnResult> {
  const reply = await getNats().request(
    'chat.turn.requested',
    jc.encode({
      system: assembleSystemSlabs(input),
      messages: assembleMessages(input),
      tools: CHAT_TOOLS,
    }),
    { timeout: 60_000 },
  );
  return jc.decode(reply.data) as ChatTurnResult;
}
