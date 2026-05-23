// The run orchestration: one prompt × N rows → one derived record set, plus
// one recorded response per row published to response-store.
//
// Flow:
//   1. fetch the prompt from prompt-store
//   2. fetch the parent record set + its rows from row-store
//   3. bind check — every {{token}} must be a column in the parent schema
//   4. pick target rows — explicit row_ids (single-record / subset), else
//      the first row_limit rows (batch)
//   5. per row: buildRequest, send, collect; publish response.create.requested
//      and prompt.run.progress
//   6. build a derived record set (parent rows + the new output column)
//   7. create it via record_set.create.requested (row-store)
//
// Per-row failures don't abort the run: the failed cell gets "[error: ...]",
// the response is still recorded, and the run completes with partial results.

import { JSONCodec, type NatsConnection } from 'nats';
import { runPrompt, describeError } from './anthropic';
import { buildRequest } from './request';
import { extractTokens, fillTemplate } from './template';

const jc = JSONCodec();

const DEFAULT_ROW_LIMIT = 25;
const PER_ROW_TIMEOUT_MS = 90_000;

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
  | { ok: true; record_set: RecordSet; row_count: number; cancelled?: boolean }
  | { ok: false; error: string; unbound_tokens?: string[] };

async function request<T>(nc: NatsConnection, subject: string, body: unknown, timeout = 10_000): Promise<T> {
  const reply = await nc.request(subject, jc.encode(body), { timeout });
  return jc.decode(reply.data) as T;
}

export async function runPromptAgainstRecordSet(
  nc: NatsConnection,
  args: {
    prompt_id: string;
    record_set_id: string;
    row_limit?: number;
    row_ids?: string[];
    model?: string;
    max_tokens?: number;
  },
  options?: { runSignal?: AbortSignal },
): Promise<RunResult> {
  const runSignal = options?.runSignal;
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

  // 4. target rows — explicit row_ids (single-record / subset, in
  //    record-set order) or the first row_limit rows (batch).
  let targetRows: Row[];
  if (args.row_ids && args.row_ids.length > 0) {
    const wanted = new Set(args.row_ids);
    targetRows = rsReply.rows.filter((r) => wanted.has(r.row_id));
    if (targetRows.length === 0) {
      return { ok: false, error: `none of the requested row_ids are in "${parent.name}"` };
    }
  } else {
    const limit = Math.max(1, Math.min(args.row_limit ?? DEFAULT_ROW_LIMIT, rsReply.rows.length));
    targetRows = rsReply.rows.slice(0, limit);
  }

  // 5. per-row LLM calls
  const run_id = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const total = targetRows.length;
  const enrichedRows: { fields: Record<string, unknown> }[] = [];
  let cancelled = false;

  for (let i = 0; i < targetRows.length; i++) {
    if (runSignal?.aborted) {
      cancelled = true;
      console.log(JSON.stringify({ level: 'info', msg: 'run cancelled — skipping remaining rows', row: i, remaining: targetRows.length - i }));
      break;
    }
    const row = targetRows[i];
    const filled = fillTemplate(prompt.content, row.fields);
    // The exact request — built once, sent by runPrompt, recorded on the
    // response. buildRequest is the same assembler prompt.preview uses.
    const reqBody = buildRequest(filled, {
      model: args.model,
      maxTokens: args.max_tokens,
      tools: prompt.tools ?? [],
    });

    // Per-row AbortController: aborts on (a) the 90s row timeout or (b) the
    // run-level cancel signal. Either source triggers the same abort path so
    // the Anthropic SDK actually closes the in-flight HTTP request rather
    // than us just walking away from the promise.
    const rowController = new AbortController();
    const timeoutId = setTimeout(
      () => rowController.abort(new Error(`row timed out after ${PER_ROW_TIMEOUT_MS}ms`)),
      PER_ROW_TIMEOUT_MS,
    );
    const onRunAbort = () => rowController.abort(new Error('run cancelled'));
    runSignal?.addEventListener('abort', onRunAbort, { once: true });

    const rowStartedAt = Date.now();
    console.log(JSON.stringify({ level: 'info', msg: 'row started', run_id, row: i + 1, total, row_id: row.row_id }));

    let value: string;
    try {
      value = await runPrompt(reqBody, { signal: rowController.signal });
      const elapsed_ms = Date.now() - rowStartedAt;
      console.log(JSON.stringify({ level: 'info', msg: 'row completed', run_id, row: i + 1, total, row_id: row.row_id, elapsed_ms, chars: value.length }));
    } catch (err) {
      const elapsed_ms = Date.now() - rowStartedAt;
      value = `[error: ${describeError(err)}]`;
      console.error(JSON.stringify({ level: 'error', msg: 'row failed', run_id, row: i + 1, total, row_id: row.row_id, elapsed_ms, error: describeError(err) }));
      // If the failure came from the run-level cancel, stop the loop after
      // recording this row's error (so its response still lands in the store).
      if (runSignal?.aborted) cancelled = true;
    } finally {
      clearTimeout(timeoutId);
      runSignal?.removeEventListener('abort', onRunAbort);
    }
    enrichedRows.push({ fields: { ...row.fields, [prompt.output_column]: value } });

    // Record the response post-flight — fire-and-forget to response-store.
    // If response-store is down the publish is simply dropped; the run is
    // unaffected (the spec's additive guarantee).
    nc.publish(
      'response.create.requested',
      jc.encode({
        run_id,
        prompt_id: prompt.prompt_id,
        row_id: row.row_id,
        record_set_id: args.record_set_id,
        output_column: prompt.output_column,
        model: reqBody.model,
        request_body: reqBody,
        response_text: value,
      }),
    );

    nc.publish(
      'prompt.run.progress',
      jc.encode({ prompt_id: prompt.prompt_id, record_set_id: args.record_set_id, done: i + 1, total }),
    );
  }

  // If the run was cancelled before any row completed, don't synthesize an
  // empty derived record set — there's nothing to record. The per-row
  // responses (if any) are already in response-store.
  if (cancelled && enrichedRows.length === 0) {
    return { ok: false, error: 'run cancelled before any row completed' };
  }

  // 6. derived schema — append the output column unless it already exists
  const hasOutputColumn = columnNames.has(prompt.output_column);
  const derivedFields: ColumnField[] = hasOutputColumn
    ? parent.schema.fields
    : [
        ...parent.schema.fields,
        { name: prompt.output_column, order: parent.schema.fields.length },
      ];

  // 7. create the derived record set
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

  return {
    ok: true,
    record_set: created.record_set,
    row_count: enrichedRows.length,
    ...(cancelled ? { cancelled: true } : {}),
  };
}
