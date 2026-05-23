// Anticipation map — the workspace's answer to "what's likely next?"
//
// A flat lookup keyed on (activeView.kind, last_capability) returning 0–3
// suggested capability invocations. The chat surface reads this on every
// turn and offers the suggestions as `propose` (Pattern 4 in
// [[Chat-As-Verb-Surface-Patterns]]). Sub-millisecond cost; no LLM call;
// no learning loop.
//
// Adding entries: keep them keyed on existing ActiveView kinds in
// ./types.ts. When the map grows past ~40 entries split per
// `activeView.kind` into separate files.

import type { ActiveView } from './types';

export type Suggestion = {
  /** Capability name, dotted entity.verb form — e.g. 'prompt.improve'. */
  capability: string;
  /** One-line natural-language framing the chat surface shows to the user. */
  hint: string;
  /** Pre-filled args the user can edit before confirming. */
  prefill?: Record<string, unknown>;
};

type AnticipationKey = `${ActiveView['kind']}::${string | 'none'}`;

// v0.0.1 — the prompt-drafting triad against a record set.
// The four record_set entries form the demo arc: open a set, draft a
// prompt for one column, refine it, apply it, see the result.
const ANTICIPATION: Record<AnticipationKey, Suggestion[]> = {
  // Empty starting state — user hasn't done anything yet.
  'record_set::none': [
    {
      capability: 'prompt.draft',
      hint: 'Draft a prompt to enrich these records with a new column.',
    },
  ],

  // After a draft lands, the next thing is almost always either refining or running.
  'record_set::prompt.draft': [
    { capability: 'prompt.improve', hint: 'Refine the draft with feedback.' },
    { capability: 'prompt.apply', hint: 'Run this prompt against the record set.' },
  ],

  // After a refinement, same shape — refine again or run.
  'record_set::prompt.improve': [
    { capability: 'prompt.improve', hint: 'Refine further.' },
    { capability: 'prompt.apply', hint: 'Run this version against the record set.' },
  ],

  // After an apply, the next step is looking at the enriched output, or
  // drafting another prompt for a different column.
  'record_set::prompt.apply': [
    { capability: 'prompt.draft', hint: 'Draft another prompt for a different column.' },
  ],

  // Idle states default to empty — the chat suggests nothing rather than
  // bluffing at zero context.
  'idle::none': [],
  'record_set_list::none': [],
  'row_detail::none': [],
};

/**
 * Look up suggestions for the current workspace state. Returns at most
 * three suggestions; returns an empty array when no entry exists for the
 * (kind, last_capability) tuple — that's the correct "nothing to suggest"
 * shape, not a missing-entry error.
 */
export function suggest(activeView: ActiveView, lastCapability: string | null): Suggestion[] {
  const key = `${activeView.kind}::${lastCapability ?? 'none'}` as AnticipationKey;
  return ANTICIPATION[key] ?? [];
}
