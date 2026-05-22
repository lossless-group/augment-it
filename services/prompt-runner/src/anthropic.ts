// Anthropic API wrapper. This is the ONLY file in augment-it that calls an
// LLM. The API key lives in this container's environment and nowhere else.
//
// Model: claude-opus-4-7 by default (the claude-api skill's guidance —
// default to the most capable model, never downgrade for cost without an
// explicit decision). Set LLM_MODEL=claude-sonnet-4-6 in the environment
// for the cost-sensible default on large per-row batches.
//
// Web search is per-prompt, not runner-wide: a prompt whose `tools` list
// includes 'web_search' gets Anthropic's server-side web_search tool added
// to its call; every other prompt makes a plain completion call. The
// server runs the search loop; when it hits its iteration cap it returns
// stop_reason 'pause_turn' and we re-send to let it continue.

import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.LLM_MODEL ?? 'claude-opus-4-7';
const MAX_TOKENS = Number(process.env.LLM_MAX_TOKENS ?? 4096);
const MAX_PAUSE_CONTINUATIONS = 5;

const WEB_SEARCH_TOOL = { type: 'web_search_20260209' as const, name: 'web_search' as const };

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
  client = new Anthropic({ apiKey });
  return client;
}

export function modelName(): string {
  return MODEL;
}

function extractText(content: Anthropic.ContentBlock[]): string {
  // With web search, the response interleaves the model's running
  // narration ("I'll search for…") with server_tool_use / tool_result
  // blocks. The actual answer is the text AFTER the last non-text block.
  // For a plain completion (no tools) there are no non-text blocks, so
  // this returns the whole concatenated text — unchanged behaviour.
  let lastNonText = -1;
  content.forEach((block, i) => {
    if (block.type !== 'text') lastNonText = i;
  });
  return content
    .slice(lastNonText + 1)
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
}

/**
 * Run one filled prompt against the model. `tools` is the prompt's
 * per-prompt capability list — if it includes 'web_search', the call gets
 * Anthropic's server-side web search. Returns the trimmed text response.
 * Throws on API errors — run.ts decides whether a single-row failure
 * aborts the run or just marks that cell.
 */
export async function runPrompt(filledPrompt: string, tools: string[] = []): Promise<string> {
  const useWebSearch = tools.includes('web_search');
  const requestTools = useWebSearch ? [WEB_SEARCH_TOOL] : undefined;

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: filledPrompt }];

  let response = await getClient().messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages,
    ...(requestTools ? { tools: requestTools } : {}),
  });

  // Server-side tool loop: 'pause_turn' means the server-side search loop
  // hit its iteration cap. Re-send (assistant turn appended, no extra user
  // message) to let it resume. Guard against an unbounded loop.
  let continuations = 0;
  while (response.stop_reason === 'pause_turn' && continuations < MAX_PAUSE_CONTINUATIONS) {
    continuations += 1;
    messages.push({ role: 'assistant', content: response.content });
    response = await getClient().messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages,
      ...(requestTools ? { tools: requestTools } : {}),
    });
  }

  return extractText(response.content);
}

/** Describe an error for logs — distinguishes Anthropic API errors. */
export function describeError(err: unknown): string {
  if (err instanceof Anthropic.APIError) {
    return `${err.status ?? '?'} ${err.name}: ${err.message}`;
  }
  return err instanceof Error ? err.message : String(err);
}
