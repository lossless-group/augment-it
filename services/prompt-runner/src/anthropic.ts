// Anthropic API wrapper. This is the ONLY file in augment-it that sends an
// LLM request. The API key lives in this container's environment and nowhere
// else.
//
// The request body is assembled by buildRequest (./request) — the same
// function the no-send preview uses — so what request-reviewer previews is
// exactly what runPrompt sends. This file's job is purely: send, handle the
// server-side web-search pause loop, extract the answer text.

import Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_MODEL } from './request';

const MAX_PAUSE_CONTINUATIONS = 5;

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
  client = new Anthropic({ apiKey });
  return client;
}

/** The default model — used only for the startup log line. */
export function modelName(): string {
  return DEFAULT_MODEL;
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
 * Send one pre-built request (see buildRequest) to the model and return the
 * trimmed text answer. Handles the server-side web-search 'pause_turn' loop:
 * 'pause_turn' means the search loop hit its iteration cap, so we re-send
 * with the assistant turn appended to let it resume.
 *
 * Throws on API errors — run.ts decides whether that aborts the run or just
 * marks the one cell.
 */
export async function runPrompt(
  request: Anthropic.MessageCreateParamsNonStreaming,
): Promise<string> {
  let messages: Anthropic.MessageParam[] = request.messages;
  let response = await getClient().messages.create(request);

  let continuations = 0;
  while (response.stop_reason === 'pause_turn' && continuations < MAX_PAUSE_CONTINUATIONS) {
    continuations += 1;
    messages = [...messages, { role: 'assistant', content: response.content }];
    response = await getClient().messages.create({ ...request, messages });
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
