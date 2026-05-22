// The run orchestration: one prompt × N rows → one derived record set.
//
// Flow:
//   1. fetch the prompt from prompt-store
//   2. fetch the parent record set + its rows from row-store
//   3. bind check — every {{token}} must be a column in the parent schema
//   4. for each row (capped at row_limit): fill template, call Anthropic,
//      collect the result; publish prompt.run.progress
//   5. build a derived record set (parent rows + the new output column)
//   6. create it via record_set.create.requested (row-store)
//
// Per-row failures don't abort the run: the failed cell gets
// "[error: ...]" and the run completes with partial results.

import { JSONCodec, type NatsConnection } from 'nats';
import { runPrompt, describeError } from './anthropic';
import { extractTokens, fillTemplate } from './template';

const jc = JSONCodec();

const DEFAULT_ROW_LIMIT = 25;

type PromptTemplate = {
  prompt_id: string;
  name: string;
  description: string;
  content: string;
  output_column: string;
  tools?: string[];
};

type ColumnField = { name: string; order: number };

type RecordSet = {
  record_set_id: string;
  name: string;
  schema: { fields: ColumnField[]; source: unknown };
  row_ids: string[];
};

type Row = { row_id: string; record_set_id: string; fields: Record<string, unknown> };

export type RunResult =
  | { ok: true; record_set: RecordSet; row_count: number }
  | { ok: false; error: string; unbound_tokens?: string[] };

async function request<T>(nc: NatsConnection, subject: string, body: unknown, timeout = 10_000): Promise<T> {
  const reply = await nc.request(subject, jc.encode(body), { timeout });
  return jc.decode(reply.data) as T;
}

export async function runPromptAgainstRecordSet(
  nc: NatsConnection,
  args: { prompt_id: string; record_set_id: string; row_limit?: number },
): Promise<RunResult> {
  // 1. prompt
  const promptReply = await request<{ prompt: PromptTemplate | null }>(
    nc,
    'prompt.get.requested',
    { prompt_id: args.prompt_id },
  );
  const prompt = promptReply.prompt;
  if (!prompt) return { ok: false, error: `prompt not found: ${args.prompt_id}` };

  // 2. parent record set + rows
  const rsReply = await request<{ record_set: RecordSet | null; rows: Row[] }>(
    nc,
    'record_set.get.requested',
    { record_set_id: args.record_set_id },
  );
  const parent = rsReply.record_set;
  if (!parent) return { ok: false, error: `record set not found: ${args.record_set_id}` };

  // 3. bind check
  const tokens = extractTokens(prompt.content);
  const columnNames = new Set(parent.schema.fields.map((f) => f.name));
  const unbound = tokens.filter((t) => !columnNames.has(t));
  if (unbound.length > 0) {
    return {
      ok: false,
      error: `prompt references columns not in "${parent.name}": ${unbound.join(', ')}`,
      unbound_tokens: unbound,
    };
  }

  // 4. per-row LLM calls
  const limit = Math.max(1, Math.min(args.row_limit ?? DEFAULT_ROW_LIMIT, rsReply.rows.length));
  const targetRows = rsReply.rows.slice(0, limit);
  const enrichedRows: { fields: Record<string, unknown> }[] = [];

  for (let i = 0; i < targetRows.length; i++) {
    const row = targetRows[i];
    const filled = fillTemplate(prompt.content, row.fields);
    let value: string;
    try {
      value = await runPrompt(filled, prompt.tools ?? []);
    } catch (err) {
      value = `[error: ${describeError(err)}]`;
      console.error(JSON.stringify({ level: 'error', msg: 'row failed', row: i, error: describeError(err) }));
    }
    enrichedRows.push({ fields: { ...row.fields, [prompt.output_column]: value } });
    nc.publish(
      'prompt.run.progress',
      jc.encode({ prompt_id: prompt.prompt_id, record_set_id: args.record_set_id, done: i + 1, total: limit }),
    );
  }

  // 5. derived schema — append the output column unless it already exists
  const hasOutputColumn = columnNames.has(prompt.output_column);
  const derivedFields: ColumnField[] = hasOutputColumn
    ? parent.schema.fields
    : [
        ...parent.schema.fields,
        { name: prompt.output_column, order: parent.schema.fields.length },
      ];

  // 6. create the derived record set
  const created = await request<{ record_set: RecordSet }>(
    nc,
    'record_set.create.requested',
    {
      name: `${parent.name} + ${prompt.output_column}`,
      schema: {
        fields: derivedFields,
        source: {
          kind: 'derivation',
          prompt_id: prompt.prompt_id,
          prompt_name: prompt.name,
          parent_record_set_id: parent.record_set_id,
          derived_at: new Date().toISOString(),
        },
      },
      rows: enrichedRows,
      derived_from: {
        record_set_id: parent.record_set_id,
        prompt_id: prompt.prompt_id,
        added_columns: hasOutputColumn ? [] : [prompt.output_column],
      },
    },
    30_000,
  );

  return { ok: true, record_set: created.record_set, row_count: enrichedRows.length };
}
