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

export type ResponseFlag = 'good' | 'partial' | 'wrong' | 'needs-rerun' | 'needs-human';

// Lifecycle of a response across the packs-and-bundles pipeline.
// Pre-pack responses (today's prompt-runner) backfill to 'found' when
// response_text is non-empty, 'pending' otherwise.
// Spec: context-v/blueprints/Packs-and-Bundles-Pattern.md
export type Outcome = 'found' | 'not_found' | 'error' | 'skipped' | 'pending';

// The sibling structured payload a pack produces. Present iff
// outcome === 'found' for a pack response; null for free-form prose responses.
export type Candidate = {
  url: string;
  display_name: string;
  confidence: number; // 0-100
  snippet?: string;
  source_metadata?: Record<string, unknown>;
};

export type ResponseRecord = {
  response_id: string;
  run_id: string; // groups the N responses of one prompt.run
  prompt_id: string;
  row_id: string;
  record_set_id: string;
  output_column: string; // the column an accepted value writes to
  model: string; // the model that actually ran
  request_body: unknown; // the exact messages.create() body that fired
  response_text: string; // the verbose model output, as the LLM returned it
  edited_text: string | null; // autosaved human edit; null = never edited
  flag: ResponseFlag | null; // null until a human triages it
  accepted: boolean; // a value from this response reached a cell
  created_at: string;
  reviewed_at: string | null;
  edited_at: string | null;
  // Packs-and-bundles extension (2026-05-25).
  outcome: Outcome;
  structured: Candidate | null;
  archival_markdown: string | null;
  pack_id: string | null;
  bundle_id: string | null;
  pass: 1 | 2 | null;
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
    // Backfill — older response records pre-date later fields, so coerce
    // them to the current shape so consumers can rely on every field.
    for (const r of Object.values(data.responses)) {
      const rec = r as ResponseRecord;
      if (!('edited_text' in r)) rec.edited_text = null;
      if (!('edited_at' in r)) rec.edited_at = null;
      // Packs-and-bundles fields (2026-05-25). Older records have no
      // structured payload; outcome defaults to 'found' if there's prose,
      // 'pending' if not.
      if (!('outcome' in r)) {
        rec.outcome = rec.response_text && rec.response_text.length > 0 ? 'found' : 'pending';
      }
      if (!('structured' in r)) rec.structured = null;
      if (!('archival_markdown' in r)) rec.archival_markdown = null;
      if (!('pack_id' in r)) rec.pack_id = null;
      if (!('bundle_id' in r)) rec.bundle_id = null;
      if (!('pass' in r)) rec.pass = null;
    }
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
  // Optional packs-and-bundles fields. Default to legacy prose-response shape
  // when not supplied so the prompt-runner continues to work unchanged.
  outcome?: Outcome;
  structured?: Candidate | null;
  archival_markdown?: string | null;
  pack_id?: string | null;
  bundle_id?: string | null;
  pass?: 1 | 2 | null;
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
    edited_text: null,
    flag: null,
    accepted: false,
    created_at: new Date().toISOString(),
    reviewed_at: null,
    edited_at: null,
    outcome:
      params.outcome ??
      (params.response_text && params.response_text.length > 0 ? 'found' : 'pending'),
    structured: params.structured ?? null,
    archival_markdown: params.archival_markdown ?? null,
    pack_id: params.pack_id ?? null,
    bundle_id: params.bundle_id ?? null,
    pass: params.pass ?? null,
  };
  data.responses[response_id] = record;
  await persist();
  return record;
}

/**
 * Save an in-progress human edit to the response without accepting it.
 * Preserves response_text (the original LLM output) for audit; the cell
 * write that `acceptResponse` performs picks the latest of edited_text /
 * response_text. Passing the same text the response already has is a no-op.
 */
export async function setResponseEditedText(
  response_id: string,
  edited_text: string,
): Promise<ResponseRecord> {
  const existing = data.responses[response_id];
  if (!existing) throw new Error(`response not found: ${response_id}`);
  // No-op if the autosave fires with no actual change
  if (existing.edited_text === edited_text) return existing;
  if (existing.edited_text === null && existing.response_text === edited_text) return existing;
  const next: ResponseRecord = {
    ...existing,
    edited_text,
    edited_at: new Date().toISOString(),
  };
  data.responses[response_id] = next;
  await persist();
  return next;
}

/**
 * Patch fields on a response's `structured` payload — OR create a structured
 * payload from scratch when none exists. Two distinct flows ride the same
 * subject:
 *   (a) Correction. structured already exists (pack returned 'found'); the
 *       human fixes url / display_name / etc. Fields not in `patch` are
 *       preserved from the original Candidate.
 *   (b) Human supply. structured is null (pack returned 'not_found' or
 *       'error'); the human knows the answer and types it in. We mint a
 *       new Candidate from the patch + sensible defaults, AND flip the
 *       response's outcome from 'not_found' to 'found' since the data is
 *       no longer absent. Confidence defaults to 100 (human-verified,
 *       max trust); display_name falls back to the URL hostname so the
 *       UI has something to render. source_metadata gets a `human_entered:
 *       true` marker so audit can tell algorithmic results from human
 *       overrides.
 *
 * Bumps edited_at for audit so the row-card UI can show "saved 12s ago"
 * the same way the prose edit does.
 */
export async function setResponseStructured(
  response_id: string,
  patch: Partial<Candidate>,
): Promise<ResponseRecord> {
  const existing = data.responses[response_id];
  if (!existing) throw new Error(`response not found: ${response_id}`);

  let nextStructured: Candidate;
  let nextOutcome = existing.outcome;

  if (existing.structured) {
    // (a) Correction path — merge patch into the existing Candidate.
    // Special case: when the URL changes but display_name and snippet
    // weren't also touched, both stale. The OLD title ("Post by
    // @womenmovingmillions") doesn't belong to the NEW URL
    // ("bsky.app/profile/bridgespan"). Without a fetcher we can't re-pull
    // the real page title, so we derive a default from the new URL's
    // hostname; the user can override it via the display_name input.
    // Snippet gets cleared since it referenced the old page.
    const urlChanged = patch.url !== undefined && patch.url !== existing.structured.url;
    let derivedDisplayName: string | undefined;
    let clearedSnippet: string | undefined;
    const humanEditedMarker: Record<string, unknown> = {};
    if (urlChanged && patch.display_name === undefined) {
      try {
        derivedDisplayName = new URL(patch.url!).hostname.replace(/^www\./, '');
      } catch {
        derivedDisplayName = patch.url!;
      }
    }
    if (urlChanged && patch.snippet === undefined) {
      clearedSnippet = '';
    }
    if (urlChanged) {
      humanEditedMarker.url_human_edited = true;
    }

    nextStructured = {
      ...existing.structured,
      ...(patch.url !== undefined ? { url: patch.url } : {}),
      ...(patch.display_name !== undefined
        ? { display_name: patch.display_name }
        : derivedDisplayName !== undefined
          ? { display_name: derivedDisplayName }
          : {}),
      ...(patch.confidence !== undefined ? { confidence: patch.confidence } : {}),
      ...(patch.snippet !== undefined
        ? { snippet: patch.snippet }
        : clearedSnippet !== undefined
          ? { snippet: clearedSnippet }
          : {}),
      source_metadata: {
        ...existing.structured.source_metadata,
        ...humanEditedMarker,
        ...(patch.source_metadata ?? {}),
      },
    };
  } else {
    // (b) Human-supply path — require a URL; mint a new Candidate.
    if (!patch.url || patch.url.trim().length === 0) {
      throw new Error(`response ${response_id} has no structured payload; patch must include a url`);
    }
    let hostname = '';
    try {
      hostname = new URL(patch.url).hostname.replace(/^www\./, '');
    } catch {
      /* malformed URL — display_name fallback uses the raw url */
    }
    nextStructured = {
      url: patch.url,
      display_name: patch.display_name ?? hostname ?? patch.url,
      confidence: patch.confidence ?? 100,
      snippet: patch.snippet ?? '',
      source_metadata: { human_entered: true, ...(patch.source_metadata ?? {}) },
    };
    // Outcome was 'not_found' / 'error' / 'pending' / 'skipped' → if the
    // human just supplied an answer, the response is now 'found'. Audit
    // trail of the original outcome lives in the run-level Run entity
    // (per [[Run-as-First-Class-Operation]]) — at the response level we
    // record the final state.
    if (nextOutcome !== 'found') nextOutcome = 'found';
  }

  const next: ResponseRecord = {
    ...existing,
    structured: nextStructured,
    outcome: nextOutcome,
    edited_at: new Date().toISOString(),
  };
  data.responses[response_id] = next;
  await persist();
  return next;
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
export type Coverage = {
  prompt_id: string;
  record_set_id: string;
  covered_row_ids: string[];
  needs_rerun_row_ids: string[];
};

/**
 * Which rows of a record set have already been fired against a given prompt?
 * A row is `covered` if it has at least one response that is NOT flagged
 * `needs-rerun` (i.e. we'll treat the row as done unless explicitly re-queued).
 * A row is in `needs_rerun_row_ids` if every response for that row is flagged
 * needs-rerun — the human asked to re-fire it.
 *
 * Rows of the record set that have NO response at all are not represented
 * here: response-store doesn't know the row universe; the caller subtracts
 * these two sets from the parent record set's row_ids.
 */
export function getCoverage(prompt_id: string, record_set_id: string): Coverage {
  const covered = new Set<string>();
  const seenNeedsRerunOnly = new Map<string, boolean>();
  for (const r of Object.values(data.responses)) {
    if (r.prompt_id !== prompt_id || r.record_set_id !== record_set_id) continue;
    if (r.flag === 'needs-rerun') {
      // remember the row, but only count it as needs-rerun if no non-rerun
      // response shows up later in the iteration.
      if (!seenNeedsRerunOnly.has(r.row_id)) seenNeedsRerunOnly.set(r.row_id, true);
    } else {
      covered.add(r.row_id);
      seenNeedsRerunOnly.set(r.row_id, false);
    }
  }
  const needsRerun: string[] = [];
  for (const [row_id, isStillRerunOnly] of seenNeedsRerunOnly) {
    if (isStillRerunOnly && !covered.has(row_id)) needsRerun.push(row_id);
  }
  return {
    prompt_id,
    record_set_id,
    covered_row_ids: [...covered],
    needs_rerun_row_ids: needsRerun,
  };
}

/** Delete one response. Returns true if it existed, false if already gone. */
export async function deleteResponse(response_id: string): Promise<boolean> {
  if (!data.responses[response_id]) return false;
  delete data.responses[response_id];
  await persist();
  return true;
}

/**
 * Delete every response matching the filter (an empty filter clears all).
 * Returns the count actually removed so the caller can confirm.
 */
export async function deleteResponses(filter: ResponseFilter = {}): Promise<number> {
  const targets = listResponses(filter);
  if (targets.length === 0) return 0;
  for (const r of targets) delete data.responses[r.response_id];
  await persist();
  return targets.length;
}

export async function acceptResponse(
  response_id: string,
  value?: string,
): Promise<{ response: ResponseRecord; cell_value: string }> {
  const existing = data.responses[response_id];
  if (!existing) throw new Error(`response not found: ${response_id}`);
  // Precedence for what hits the cell:
  //   1. explicit value passed by accept() (e.g. last-second edits)
  //   2. the autosaved edited_text (the human's working copy)
  //   3. the original LLM response_text (the v0 behaviour)
  const cell_value = value ?? existing.edited_text ?? existing.response_text;
  const next: ResponseRecord = {
    ...existing,
    // If the caller passed a value, fold it into edited_text so the response
    // record reflects what was accepted to the cell.
    ...(value !== undefined ? { edited_text: value, edited_at: new Date().toISOString() } : {}),
    flag: 'good',
    accepted: true,
    reviewed_at: new Date().toISOString(),
  };
  data.responses[response_id] = next;
  await persist();
  return { response: next, cell_value };
}
