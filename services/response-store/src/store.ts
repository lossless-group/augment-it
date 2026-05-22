// JSON-file response store. Structurally a sibling of prompt-store and
// row-store — the same load / persist / CRUD shape, a different domain entity.
//
// A ResponseRecord is one fired LLM response: the request that produced it,
// the model, the verbose response text, and the human triage flag. It is the
// post-flight review log — complementary to the derived record set, which
// holds the cell values. Named ResponseRecord (not Response) to avoid the
// Fetch API global.
//
// Spec: context-v/specs/Response-Reviewer-and-Response-Store.md

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export type ResponseFlag = 'good' | 'partial' | 'wrong' | 'needs-rerun';

export type ResponseRecord = {
  response_id: string;
  run_id: string; // groups the N responses of one prompt.run
  prompt_id: string;
  row_id: string;
  record_set_id: string;
  output_column: string; // the column an accepted value writes to
  model: string; // the model that actually ran
  request_body: unknown; // the exact messages.create() body that fired
  response_text: string; // the verbose model output, as returned
  flag: ResponseFlag | null; // null until a human triages it
  accepted: boolean; // a value from this response reached a cell
  created_at: string;
  reviewed_at: string | null;
};

type Store = {
  responses: Record<string, ResponseRecord>;
};

let data: Store = { responses: {} };
let storePath = '';

export async function load(path: string): Promise<void> {
  storePath = path;
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw);
    data = { responses: parsed.responses ?? {} };
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      await mkdir(dirname(path), { recursive: true });
      data = { responses: {} };
      await persist();
    } else {
      throw err;
    }
  }
}

async function persist(): Promise<void> {
  await writeFile(storePath, JSON.stringify(data, null, 2));
}

export type ResponseFilter = {
  run_id?: string;
  record_set_id?: string;
  prompt_id?: string;
  flag?: ResponseFlag;
};

export function listResponses(filter: ResponseFilter = {}): ResponseRecord[] {
  let rows = Object.values(data.responses);
  if (filter.run_id) rows = rows.filter((r) => r.run_id === filter.run_id);
  if (filter.record_set_id) rows = rows.filter((r) => r.record_set_id === filter.record_set_id);
  if (filter.prompt_id) rows = rows.filter((r) => r.prompt_id === filter.prompt_id);
  if (filter.flag) rows = rows.filter((r) => r.flag === filter.flag);
  return rows;
}

export function getResponse(response_id: string): ResponseRecord | undefined {
  return data.responses[response_id];
}

export async function createResponse(params: {
  run_id: string;
  prompt_id: string;
  row_id: string;
  record_set_id: string;
  output_column: string;
  model: string;
  request_body: unknown;
  response_text: string;
}): Promise<ResponseRecord> {
  const response_id = `rsp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const record: ResponseRecord = {
    response_id,
    run_id: params.run_id,
    prompt_id: params.prompt_id,
    row_id: params.row_id,
    record_set_id: params.record_set_id,
    output_column: params.output_column,
    model: params.model,
    request_body: params.request_body,
    response_text: params.response_text,
    flag: null,
    accepted: false,
    created_at: new Date().toISOString(),
    reviewed_at: null,
  };
  data.responses[response_id] = record;
  await persist();
  return record;
}

export async function flagResponse(
  response_id: string,
  flag: ResponseFlag,
): Promise<ResponseRecord> {
  const existing = data.responses[response_id];
  if (!existing) throw new Error(`response not found: ${response_id}`);
  const next: ResponseRecord = {
    ...existing,
    flag,
    reviewed_at: new Date().toISOString(),
  };
  data.responses[response_id] = next;
  await persist();
  return next;
}

/**
 * Mark a response accepted — flag it `good`, set `accepted` — and return the
 * value to write into the row's cell. `value` is the (possibly edited) text
 * the reviewer chose; absent, the raw response_text is used. The handler
 * issues the actual row.update.
 */
export async function acceptResponse(
  response_id: string,
  value?: string,
): Promise<{ response: ResponseRecord; cell_value: string }> {
  const existing = data.responses[response_id];
  if (!existing) throw new Error(`response not found: ${response_id}`);
  const cell_value = value ?? existing.response_text;
  const next: ResponseRecord = {
    ...existing,
    flag: 'good',
    accepted: true,
    reviewed_at: new Date().toISOString(),
  };
  data.responses[response_id] = next;
  await persist();
  return { response: next, cell_value };
}
