// The model registry — the single source of truth for which models the
// request-reviewer model toggle offers.
//
// NOTE: this lives in @augment-it/workspace, not packages/config. The spec
// named packages/config, but that is a bare stub and prompt-runner (a
// standalone Docker service) cannot consume a workspace package across its
// build context anyway. prompt-runner does not need the registry — it
// accepts whatever model string is passed and lets the Anthropic API
// validate it. The registry is a frontend concern: the list the toggle
// renders. @augment-it/workspace is already imported by every remote, so it
// is the lowest-friction home.
//
// Spec: context-v/specs/Request-Reviewer-Pre-Flight-Surface.md

export type ModelId =
  | 'claude-opus-4-7'
  | 'claude-sonnet-4-6'
  | 'claude-haiku-4-5-20251001';

export type ModelEntry = {
  id: ModelId;
  label: string;
  note: string;
};

export const MODELS: ModelEntry[] = [
  {
    id: 'claude-opus-4-7',
    label: 'Opus 4.7',
    note: 'Most capable. Default. Judgment-class enrichment.',
  },
  {
    id: 'claude-sonnet-4-6',
    label: 'Sonnet 4.6',
    note: 'Cost-sensible for large per-row batches.',
  },
  {
    id: 'claude-haiku-4-5-20251001',
    label: 'Haiku 4.5',
    note: 'Cheapest, fastest. Simple lookup-class enrichment.',
  },
];

/** The model request-reviewer defaults its toggle to. */
export const DEFAULT_MODEL: ModelId = 'claude-opus-4-7';

/** The initial value of request-reviewer's free max_tokens field. */
export const DEFAULT_MAX_TOKENS = 4096;
