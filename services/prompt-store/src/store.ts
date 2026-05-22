// JSON-file prompt-template store. Structurally a sibling of row-store —
// the same load / persist / CRUD shape, a different domain entity.
//
// A PromptTemplate is a named, reusable body of text with {{token}}
// placeholders. The {{token}} names are NOT stored — they're derived from
// `content` at bind time so the template body stays the single source of
// truth. `output_column` names the column the LLM response will populate
// when this prompt is run by prompt-runner.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

// `tools` is the prompt's per-prompt capability list — server-side tools
// its LLM call needs. Walking-skeleton supports 'web_search'. prompt-runner
// honours it; prompt-store just stores it.
export type PromptTool = 'web_search';

export type PromptTemplate = {
  prompt_id: string;
  name: string;
  description: string;
  content: string;
  output_column: string;
  tools: PromptTool[];
  created_at: string;
  updated_at: string;
};

type Store = {
  prompts: Record<string, PromptTemplate>;
};

let data: Store = { prompts: {} };
let storePath = '';

export async function load(path: string): Promise<void> {
  storePath = path;
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw);
    const prompts: Record<string, PromptTemplate> = parsed.prompts ?? {};
    // Normalise prompts that predate the `tools` field.
    for (const p of Object.values(prompts)) {
      if (!Array.isArray(p.tools)) p.tools = [];
    }
    data = { prompts };
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      await mkdir(dirname(path), { recursive: true });
      data = { prompts: {} };
      await persist();
    } else {
      throw err;
    }
  }
}

async function persist(): Promise<void> {
  await writeFile(storePath, JSON.stringify(data, null, 2));
}

export function listPrompts(): PromptTemplate[] {
  return Object.values(data.prompts);
}

export function getPrompt(prompt_id: string): PromptTemplate | undefined {
  return data.prompts[prompt_id];
}

export async function createPrompt(params: {
  name: string;
  description?: string;
  content: string;
  output_column: string;
  tools?: PromptTool[];
}): Promise<PromptTemplate> {
  const prompt_id = `pt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  const prompt: PromptTemplate = {
    prompt_id,
    name: params.name,
    description: params.description ?? '',
    content: params.content,
    output_column: params.output_column,
    tools: params.tools ?? [],
    created_at: now,
    updated_at: now,
  };
  data.prompts[prompt_id] = prompt;
  await persist();
  return prompt;
}

export async function updatePrompt(
  prompt_id: string,
  patch: Partial<Pick<PromptTemplate, 'name' | 'description' | 'content' | 'output_column' | 'tools'>>,
): Promise<PromptTemplate> {
  const existing = data.prompts[prompt_id];
  if (!existing) throw new Error(`prompt not found: ${prompt_id}`);
  const next: PromptTemplate = {
    ...existing,
    ...patch,
    updated_at: new Date().toISOString(),
  };
  data.prompts[prompt_id] = next;
  await persist();
  return next;
}

export async function deletePrompt(
  prompt_id: string,
): Promise<{ deleted: boolean }> {
  if (!data.prompts[prompt_id]) return { deleted: false };
  delete data.prompts[prompt_id];
  await persist();
  return { deleted: true };
}
