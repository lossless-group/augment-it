// prompt.preview.requested handler — builds the exact request for ONE row
// without sending it. The no-send twin of run.ts: same prompt fetch, same
// fillTemplate, same buildRequest — it just stops before the API call.
//
// Spec: context-v/specs/Request-Reviewer-Pre-Flight-Surface.md

import { type NatsConnection } from '@nats-io/transport-node';
import { buildRequest } from './request';
import { extractTokens, fillTemplate } from './template';

type PromptTemplate = {
  prompt_id: string;
  content: string;
  output_column: string;
  tools?: string[];
};
type ColumnField = { name: string; order: number };
type RecordSet = {
  record_set_id: string;
  name: string;
  schema: { fields: ColumnField[] };
};
type Row = { row_id: string; record_set_id: string; fields: Record<string, unknown> };

export type TokenBinding = {
  token: string;
  value: string | null; // the row's value, stringified; null when unbound
  bound: boolean; // false → no matching column in the record set
};

export type PreviewResult =
  | {
      ok: true;
      filled_prompt: string;
      request_body: unknown;
      bind: TokenBinding[];
      unbound_tokens: string[];
    }
  | { ok: false; error: string };

async function request<T>(
  nc: NatsConnection,
  subject: string,
  body: unknown,
  timeout = 10_000,
): Promise<T> {
  const reply = await nc.request(subject, JSON.stringify(body), { timeout });
  return reply.json() as T;
}

export async function previewRequest(
  nc: NatsConnection,
  args: {
    prompt_id: string;
    record_set_id: string;
    row_id: string;
    model?: string;
    max_tokens?: number;
  },
): Promise<PreviewResult> {
  // 1. prompt
  const promptReply = await request<{ prompt: PromptTemplate | null }>(
    nc,
    'prompt.get.requested',
    { prompt_id: args.prompt_id },
  );
  const prompt = promptReply.prompt;
  if (!prompt) return { ok: false, error: `prompt not found: ${args.prompt_id}` };

  // 2. record set + rows
  const rsReply = await request<{ record_set: RecordSet | null; rows: Row[] }>(
    nc,
    'record_set.get.requested',
    { record_set_id: args.record_set_id },
  );
  const recordSet = rsReply.record_set;
  if (!recordSet) return { ok: false, error: `record set not found: ${args.record_set_id}` };

  const row = rsReply.rows.find((r) => r.row_id === args.row_id);
  if (!row) return { ok: false, error: `row not found in "${recordSet.name}": ${args.row_id}` };

  // 3. bind every {{token}} against the record set's columns and this row
  const tokens = extractTokens(prompt.content);
  const columnNames = new Set(recordSet.schema.fields.map((f) => f.name));
  const bind: TokenBinding[] = tokens.map((token) => {
    if (!columnNames.has(token)) return { token, value: null, bound: false };
    const raw = row.fields[token];
    return {
      token,
      value: raw === null || raw === undefined ? '' : String(raw),
      bound: true,
    };
  });
  const unbound_tokens = bind.filter((b) => !b.bound).map((b) => b.token);

  // 4. the resolved request — fillTemplate + buildRequest, exactly as run.ts
  //    does it, then NOT sent.
  const filled_prompt = fillTemplate(prompt.content, row.fields);
  const request_body = buildRequest(filled_prompt, {
    model: args.model,
    maxTokens: args.max_tokens,
    tools: prompt.tools ?? [],
  });

  return { ok: true, filled_prompt, request_body, bind, unbound_tokens };
}
