// JSON-file prompt-template store. Structurally a sibling of row-store —
// the same load / persist / CRUD shape, a different domain entity.
//
// A PromptTemplate is a named, reusable body of text with {{token}}
// placeholders. The {{token}} names are NOT stored — they're derived from
// `content` at bind time so the template body stays the single source of
// truth. `output_column` names the column the LLM response will populate
// when this prompt is run by prompt-runner.
//
// Draft-versioning fields (status, goal, derived_from, derivation_feedback,
// record_set_context) were added when the in-app chat's draft → improve →
// apply triad landed. They are OPTIONAL — prompts authored through the
// prompt-template-manager UI leave them undefined. Prompts authored
// conversationally by the chat populate them as part of the iteration
// history. See `context-v/blueprints/Chat-As-Verb-Surface-Patterns.md` in
// the ai-labs parent for the pattern.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

// `tools` is the prompt's per-prompt capability list — server-side tools
// its LLM call needs. Walking-skeleton supports 'web_search'. prompt-runner
// honours it; prompt-store just stores it.
export type PromptTool = 'web_search';

export type PromptStatus = 'draft' | 'applied' | 'archived';

export type RecordSetContext = {
  record_set_id: string;
  sample_size: number;
  columns: string[];
};

export type PromptTemplate = {
  prompt_id: string;
  name: string;
  description: string;
  content: string;
  output_column: string;
  tools: PromptTool[];
  created_at: string;
  updated_at: string;
  // Draft-versioning fields — optional, populated by chat-authored prompts.
  status?: PromptStatus;
  goal?: string;
  derived_from?: string;
  derivation_feedback?: string;
  record_set_context?: RecordSetContext;
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
      // Backfill: prompts created before draft-versioning landed are
      // treated as already-applied (they were never drafts).
      if (p.status === undefined) p.status = 'applied';
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

// Draft-versioning helpers — used by the chat-driven prompt-drafting triad.
//
// createDraft saves a freshly drafted prompt with status='draft'. Distinct
// from createPrompt because chat-authored drafts always carry goal +
// record_set_context, and the name/description default to chat-friendly
// placeholders the user can edit later.
export async function createDraft(params: {
  goal: string;
  content: string;
  output_column: string;
  record_set_context: RecordSetContext;
  tools?: PromptTool[];
  name?: string;
  description?: string;
}): Promise<PromptTemplate> {
  const prompt_id = `pt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  const prompt: PromptTemplate = {
    prompt_id,
    name: params.name ?? `Draft: ${params.output_column}`,
    description: params.description ?? params.goal,
    content: params.content,
    output_column: params.output_column,
    tools: params.tools ?? [],
    created_at: now,
    updated_at: now,
    status: 'draft',
    goal: params.goal,
    record_set_context: params.record_set_context,
  };
  data.prompts[prompt_id] = prompt;
  await persist();
  return prompt;
}

// cloneAsDraft creates a refined version linked to its parent via
// derived_from. The parent is left untouched so the iteration history
// stays intact. The chat's `prompt.improve` capability uses this.
export async function cloneAsDraft(params: {
  parent_id: string;
  refined_content: string;
  feedback: string;
}): Promise<PromptTemplate> {
  const parent = data.prompts[params.parent_id];
  if (!parent) throw new Error(`parent prompt not found: ${params.parent_id}`);
  const prompt_id = `pt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  const refined: PromptTemplate = {
    prompt_id,
    name: `${parent.name} (refined)`,
    description: parent.description,
    content: params.refined_content,
    output_column: parent.output_column,
    tools: [...parent.tools],
    created_at: now,
    updated_at: now,
    status: 'draft',
    goal: parent.goal,
    derived_from: parent.prompt_id,
    derivation_feedback: params.feedback,
    record_set_context: parent.record_set_context,
  };
  data.prompts[prompt_id] = refined;
  await persist();
  return refined;
}

// markApplied flips a draft to applied status. Called by `prompt.apply`
// after a successful run + postcondition check.
export async function markApplied(prompt_id: string): Promise<PromptTemplate> {
  const existing = data.prompts[prompt_id];
  if (!existing) throw new Error(`prompt not found: ${prompt_id}`);
  const next: PromptTemplate = {
    ...existing,
    status: 'applied',
    updated_at: new Date().toISOString(),
  };
  data.prompts[prompt_id] = next;
  await persist();
  return next;
}
