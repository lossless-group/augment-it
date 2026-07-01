// LLM-driven prompt-body generation for the in-app chat's draft → improve
// → apply triad. Two flows:
//
//   draftPrompt: takes a user goal + a column sample from a record set,
//     asks the model to produce a prompt-template body that, when bound
//     per-row at run time, populates one named output column. The body
//     uses {{column_name}} placeholders — the exact shape prompt-runner
//     already executes via run.ts.
//
//   improvePrompt: takes an existing draft + free-text user feedback,
//     asks the model for a refined version. Parent prompt stays untouched;
//     the refined version is persisted with derived_from = parent.
//
// Both flows call Anthropic via runPrompt — the same gateway prompt.run
// uses. Persistence happens via NATS calls into prompt-store. This file
// never touches the store directly.

import { type NatsConnection } from '@nats-io/transport-node';
import { runPrompt } from './anthropic';
import { buildRequest } from './request';

export type DraftArgs = {
  goal: string;
  record_set_id: string;
  output_column: string;
  tools?: string[];
};

export type ImproveArgs = {
  parent_id: string;
  feedback: string;
};

export type DraftResult = {
  prompt_id: string;
  content: string;
  output_column: string;
};

// The meta-prompts use the same {{var}} substitution syntax as runtime
// prompts; fillMeta replaces ONLY the keys it's given and leaves any
// other {{token}} intact. That way the {{column_name}} examples we want
// the model to learn from survive into its output.
const META_PROMPT_FOR_DRAFT = `You are an expert prompt engineer for tabular data enrichment.

The user has a record set with these columns:

{{columns}}

Here are sample rows from that set:

{{sample_rows}}

The user's goal for the new column "{{output_column}}":

{{goal}}

Write a prompt template that, when filled per-row with {{column_name}} placeholders for the row's existing columns, produces a single response that should populate the "{{output_column}}" cell for that row.

Constraints:
- Use {{column_name}} placeholders for the row's columns — they will be substituted at run time.
- Produce ONE response per row — a single string or JSON object, not multiple distinct values.
- Be specific. Tell the model what format to return.
- If the goal implies structured data (a JSON object with named fields), say so explicitly in the prompt.
- Do not include any preamble or commentary in your output. Output ONLY the prompt template body.

Prompt template body:`;

const META_PROMPT_FOR_IMPROVE = `You are an expert prompt engineer iterating on a prompt template.

Here is the current draft:

---
{{parent_content}}
---

The user's feedback on this draft:

{{feedback}}

Produce a refined version of the prompt template that addresses the feedback. Keep the same {{column_name}} placeholder convention for the row's columns. Output ONLY the refined prompt template body — no preamble, no commentary.

Refined prompt template body:`;

function fillMeta(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => (key in vars ? vars[key] : `{{${key}}}`));
}

type RecordSetReply = {
  record_set: { schema: { fields: { name: string }[] } } | null;
  rows?: { fields: Record<string, unknown> }[];
};

async function getColumnSample(
  nc: NatsConnection,
  record_set_id: string,
  sampleSize = 3,
): Promise<{ columns: string[]; rows: Record<string, unknown>[] }> {
  const reply = await nc.request('record_set.get.requested', JSON.stringify({ record_set_id }), {
    timeout: 5_000,
  });
  const decoded = reply.json() as RecordSetReply;
  if (!decoded.record_set) throw new Error(`record set not found: ${record_set_id}`);
  const columns = decoded.record_set.schema.fields.map((f) => f.name);
  const rows = (decoded.rows ?? []).slice(0, sampleSize).map((r) => r.fields);
  return { columns, rows };
}

export async function draftPrompt(
  nc: NatsConnection,
  args: DraftArgs,
  options?: { signal?: AbortSignal },
): Promise<DraftResult> {
  const { columns, rows } = await getColumnSample(nc, args.record_set_id);
  const filled = fillMeta(META_PROMPT_FOR_DRAFT, {
    columns: columns.map((c) => `- ${c}`).join('\n'),
    sample_rows: JSON.stringify(rows, null, 2),
    output_column: args.output_column,
    goal: args.goal,
  });
  const request = buildRequest(filled, { tools: [] });
  const content = await runPrompt(request, options);

  const saveReply = await nc.request(
    'prompt.draft.save.requested',
    JSON.stringify({
      goal: args.goal,
      content,
      output_column: args.output_column,
      record_set_context: {
        record_set_id: args.record_set_id,
        sample_size: rows.length,
        columns,
      },
      tools: args.tools ?? [],
    }),
    { timeout: 5_000 },
  );
  const saved = saveReply.json() as
    | { prompt: { prompt_id: string; output_column: string } }
    | { ok: false; error: string };
  if ('error' in saved) throw new Error(saved.error);
  return { prompt_id: saved.prompt.prompt_id, content, output_column: saved.prompt.output_column };
}

export async function improvePrompt(
  nc: NatsConnection,
  args: ImproveArgs,
  options?: { signal?: AbortSignal },
): Promise<DraftResult> {
  const parentReply = await nc.request(
    'prompt.get.requested',
    JSON.stringify({ prompt_id: args.parent_id }),
    { timeout: 5_000 },
  );
  const parentDecoded = parentReply.json() as {
    prompt: { content: string; output_column: string } | null;
  };
  if (!parentDecoded.prompt) throw new Error(`parent prompt not found: ${args.parent_id}`);
  const filled = fillMeta(META_PROMPT_FOR_IMPROVE, {
    parent_content: parentDecoded.prompt.content,
    feedback: args.feedback,
  });
  const request = buildRequest(filled, { tools: [] });
  const refined_content = await runPrompt(request, options);

  const saveReply = await nc.request(
    'prompt.draft.improve.save.requested',
    JSON.stringify({
      parent_id: args.parent_id,
      refined_content,
      feedback: args.feedback,
    }),
    { timeout: 5_000 },
  );
  const saved = saveReply.json() as
    | { prompt: { prompt_id: string; output_column: string } }
    | { ok: false; error: string };
  if ('error' in saved) throw new Error(saved.error);
  return {
    prompt_id: saved.prompt.prompt_id,
    content: refined_content,
    output_column: saved.prompt.output_column,
  };
}
