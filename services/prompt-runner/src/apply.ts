// prompt.apply — the chat-driven apply step in the draft → improve → apply
// triad. A thin wrapper over runPromptAgainstRecordSet (the same machinery
// prompt.run uses) that adds two things:
//
//   1. Postcondition evaluation. After the run returns, check the run was
//      successful, at least one row was enriched, and the run wasn't
//      cancelled. Failed postconditions don't fail the apply — they're
//      surfaced in the result as a quality_violations array so the chat
//      can narrate them honestly. The user asked for "monitor quality of
//      the command execution and output" — this is that hook, applied at
//      the run-result layer (not at a shell layer; augment-it's services
//      are NATS-addressable).
//
//   2. Status flip. On successful runs (postconditions pass), publish
//      prompt.mark_applied.requested so prompt-store flips status='applied'.
//      On a failed or partial run, status stays 'draft' — the user can
//      iterate the prompt and try again without leaving a misleading
//      "applied" marker on a broken prompt.

import { type NatsConnection } from '@nats-io/transport-node';
import { runPromptAgainstRecordSet, type RunResult } from './run';

export type ApplyArgs = {
  prompt_id: string;
  record_set_id: string;
  row_limit?: number;
  row_ids?: string[];
  model?: string;
  max_tokens?: number;
};

export type PostconditionStatus = {
  kind: string;
  description: string;
  passed: boolean;
  actual?: unknown;
};

export type ApplyResult =
  | {
      ok: true;
      run: RunResult;
      postconditions: PostconditionStatus[];
      quality_violations: PostconditionStatus[];
      derived_record_set_id?: string;
      display_hint?: { mount: string; props?: Record<string, unknown>; layout?: 'inline' | 'panel' | 'full' };
    }
  | { ok: false; error: string };

function evaluatePostconditions(run: RunResult): PostconditionStatus[] {
  return [
    {
      kind: 'run_ok',
      description: 'The run completed without a top-level failure.',
      passed: run.ok === true,
      actual: run.ok === false ? { error: run.error } : undefined,
    },
    {
      kind: 'rows_enriched_ge_1',
      description: 'At least one row was enriched.',
      passed: run.ok === true && run.row_count >= 1,
      actual: run.ok === true ? { row_count: run.row_count } : undefined,
    },
    {
      kind: 'not_cancelled',
      description: 'The run was not cancelled mid-flight.',
      passed: run.ok === true && run.cancelled !== true,
      actual: run.ok === true ? { cancelled: run.cancelled === true } : undefined,
    },
  ];
}

export async function applyPrompt(
  nc: NatsConnection,
  args: ApplyArgs,
  options: { runSignal: AbortSignal },
): Promise<ApplyResult> {
  const run = await runPromptAgainstRecordSet(nc, args, options);
  const postconditions = evaluatePostconditions(run);
  const quality_violations = postconditions.filter((p) => !p.passed);

  // Status flip only on full pass. A run that completed but enriched zero
  // rows leaves status='draft' so the user can fix the prompt and retry.
  if (quality_violations.length === 0) {
    try {
      await nc.request(
        'prompt.mark_applied.requested',
        JSON.stringify({ prompt_id: args.prompt_id }),
        { timeout: 5_000 },
      );
    } catch (err: unknown) {
      // Status-flip failure isn't fatal — the run succeeded. Log it as a
      // soft violation so the chat surface notices.
      const error = err instanceof Error ? err.message : String(err);
      quality_violations.push({
        kind: 'status_flip',
        description: 'Marking the prompt as applied failed (storage write error).',
        passed: false,
        actual: { error },
      });
    }
  }

  if (!run.ok) {
    return { ok: false, error: run.error };
  }

  return {
    ok: true,
    run,
    postconditions,
    quality_violations,
    derived_record_set_id: run.record_set.record_set_id,
    // The natural next thing after an apply is to see the enriched records.
    // mount: 'record_set' matches the existing ActiveView kind in the
    // workspace package.
    display_hint: {
      mount: 'record_set',
      props: { record_set_id: run.record_set.record_set_id },
      layout: 'full',
    },
  };
}
