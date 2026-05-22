// The single Anthropic request-body assembler.
//
// Both code paths that produce a request go through buildRequest: the real
// fire (run.ts → anthropic.ts) and the no-send preview (preview.ts). Because
// preview and fire share this one function, the request request-reviewer
// shows the user is byte-identical to the request that actually fires.
//
// Spec: context-v/specs/Request-Reviewer-Pre-Flight-Surface.md

import type Anthropic from '@anthropic-ai/sdk';

// Defaults. A request that names no model / max_tokens falls back to these,
// so existing prompt.run callers that pass neither behave exactly as before.
// LLM_MODEL is also what docker-compose threads in from augment-it/.env.
export const DEFAULT_MODEL = process.env.LLM_MODEL ?? 'claude-opus-4-7';
export const DEFAULT_MAX_TOKENS = Number(process.env.LLM_MAX_TOKENS ?? 4096);

// Anthropic's server-side web search tool. A prompt whose `tools` list
// includes 'web_search' gets this block added to its request.
//
// The installed SDK (0.69) types only know web_search_20250305; this
// runner has always targeted web_search_20260209 (see the prior
// anthropic.ts). Phase 1 preserves that exact wire value — the previewed
// request must equal the fired request — so the tool is cast through
// ToolUnion rather than down-versioned here. Reconciling the web-search
// tool version against the SDK is a separate decision.
const WEB_SEARCH_TOOL = {
  type: 'web_search_20260209',
  name: 'web_search',
} as unknown as Anthropic.ToolUnion;

export type BuildRequestOptions = {
  model?: string;
  maxTokens?: number;
  tools?: string[];
};

/**
 * Assemble the exact messages.create() request body for one filled prompt.
 * Pure — no network, no SDK client. `tools` is the prompt's capability list;
 * 'web_search' adds Anthropic's server-side web search tool.
 */
export function buildRequest(
  filledPrompt: string,
  options: BuildRequestOptions = {},
): Anthropic.MessageCreateParamsNonStreaming {
  const useWebSearch = (options.tools ?? []).includes('web_search');
  return {
    model: options.model ?? DEFAULT_MODEL,
    max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
    messages: [{ role: 'user', content: filledPrompt }],
    ...(useWebSearch ? { tools: [WEB_SEARCH_TOOL] } : {}),
  };
}
